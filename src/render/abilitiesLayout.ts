// STORY-14 (Variant D) — PURE, measurer-injected layout for the structured abilities
// block. Renders up to three abilities, each a BOLD name prefix ("Name: ") followed by
// the regular-weight body, wrapping INLINE across mixed-weight runs. Kept canvas-free
// (all width queries go through the injected `measure`) so wrapping, mixed-weight
// measuring, paragraph gaps, whole-line clipping, and the dormant shrink-to-fit
// fallback are all unit-testable without a real canvas. `drawAbilities` (STORY-9) feeds
// `ctx.measureText` as the measurer and draws the returned segments verbatim.
import type { Measure } from './layoutTitle';
import type { Ability } from '../config/editableLayers';

/** One drawable text segment positioned on a line (own font = own weight/size). */
export interface AbilitySegment {
  text: string;
  /** Canvas font shorthand (already at the scaled size) for measure + draw. */
  font: string;
  /** Absolute x to draw at (baseline top, left-aligned). */
  x: number;
}

/** A positioned, drawable line = a sequence of same-line segments at a shared y. */
export interface AbilityLine {
  y: number;
  segments: AbilitySegment[];
}

/** The fully-resolved layout of the whole abilities block. */
export interface AbilitiesLayout {
  /** Font-size multiplier applied to the whole block (<= 1; >= minScale). */
  scale: number;
  /** Scaled font size in px. */
  fontSize: number;
  /** Scaled line height in px. */
  lineHeight: number;
  /** All drawable lines (already clipped to the box bottom). */
  lines: AbilityLine[];
  /** True if any whole line had to be dropped to fit the box bottom. */
  clipped: boolean;
  /**
   * When `clipped`, the 0-based index (into the NON-EMPTY abilities) of the first ability
   * that could not be fully placed — so the batch CLI can report exactly which ability
   * overflowed. Undefined when nothing was clipped.
   */
  clippedAbilityIndex?: number;
}

/** Inputs for laying out the abilities block. */
export interface AbilitiesLayoutOptions {
  /** Left x of the text area. */
  x: number;
  /** Top y of the first line (reclaimed text-top, e.g. 780). */
  textTop: number;
  /** Wrap width in px. */
  maxWidth: number;
  /** Bottom y limit; a line is dropped if `y + lineHeight` exceeds it. */
  textBottom: number;
  /** Base (native) font size in px. */
  fontSize: number;
  /** Base (native) line height in px. */
  lineHeight: number;
  /** Vertical gap in px inserted between consecutive abilities (scaled with the font). */
  paragraphGap: number;
  /** Bold font family for the ability NAME prefix. */
  boldFamily: string;
  /** Regular font family for the ability BODY. */
  romanFamily: string;
  /** Readability floor for the shrink-to-fit fallback (e.g. 0.7). */
  minScale: number;
  /** Injected width measurer. */
  measure: Measure;
}

/** Build a canvas font shorthand for a size + family. */
function fontString(size: number, family: string): string {
  return `${size}px "${family}"`;
}

/** A word tagged with the font it must be measured/drawn in (bold name vs regular body). */
interface StyledWord {
  text: string;
  font: string;
}

/**
 * Turn one ability into a flat word stream tagged by weight, at a given scaled size:
 *   - a non-empty NAME becomes bold words with a trailing ':' on the last name word,
 *   - a non-empty BODY becomes regular words.
 * Either part may be absent (name-only or body-only); a fully-empty ability yields [].
 */
function abilityWords(a: Ability, fs: number, boldFamily: string, romanFamily: string): StyledWord[] {
  const words: StyledWord[] = [];
  const name = a.name.trim();
  const body = a.body.trim();
  if (name) {
    // The colon binds to the name so it renders bold immediately after it.
    const nameWords = `${name}:`.split(/\s+/).filter((w) => w.length > 0);
    for (const w of nameWords) words.push({ text: w, font: fontString(fs, boldFamily) });
  }
  if (body) {
    const bodyWords = body.split(/\s+/).filter((w) => w.length > 0);
    for (const w of bodyWords) words.push({ text: w, font: fontString(fs, romanFamily) });
  }
  return words;
}

/**
 * Hard-break a single word wider than `maxWidth` into chunks that each fit, so a
 * pathological unbreakable token can never overflow or infinite-loop.
 */
function breakLongWord(word: StyledWord, maxWidth: number, measure: Measure): StyledWord[] {
  const chunks: StyledWord[] = [];
  let current = '';
  for (const ch of word.text) {
    const test = current + ch;
    if (current && measure(test, word.font) > maxWidth) {
      chunks.push({ text: current, font: word.font });
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) chunks.push({ text: current, font: word.font });
  return chunks;
}

/**
 * Greedily wrap a mixed-weight word stream into lines of positioned segments. Spaces
 * are measured with `spaceFont` (the regular body font) and only ADVANCE x — they are
 * never drawn — so inter-word gaps are consistent across the weight boundary. Each word
 * keeps its own font, so a line can carry a bold prefix followed by regular words.
 */
function wrapWords(
  words: StyledWord[],
  x: number,
  maxWidth: number,
  spaceFont: string,
  measure: Measure,
): AbilitySegment[][] {
  const spaceW = measure(' ', spaceFont);
  const lines: AbilitySegment[][] = [];
  let line: AbilitySegment[] = [];
  let cursorX = x; // next x to place at
  let used = 0; // width consumed on the current line (from x)

  /** Commit the current line (if any) and reset for a new one. */
  const commit = (): void => {
    if (line.length > 0) lines.push(line);
    line = [];
    cursorX = x;
    used = 0;
  };

  for (const word of words) {
    const wWidth = measure(word.text, word.font);

    // A single word too wide for the line: flush, then hard-break it across lines.
    if (wWidth > maxWidth) {
      commit();
      const chunks = breakLongWord(word, maxWidth, measure);
      for (let i = 0; i < chunks.length; i++) {
        const cWidth = measure(chunks[i].text, chunks[i].font);
        line.push({ text: chunks[i].text, font: chunks[i].font, x });
        used = cWidth;
        cursorX = x + cWidth;
        // All but the last chunk are complete lines on their own.
        if (i < chunks.length - 1) commit();
      }
      continue;
    }

    const needsSpace = line.length > 0;
    const advance = (needsSpace ? spaceW : 0) + wWidth;
    if (needsSpace && used + advance > maxWidth) {
      // Doesn't fit — wrap to a new line, no leading space.
      commit();
      line.push({ text: word.text, font: word.font, x });
      cursorX = x + wWidth;
      used = wWidth;
    } else {
      const placeX = cursorX + (needsSpace ? spaceW : 0);
      line.push({ text: word.text, font: word.font, x: placeX });
      cursorX = placeX + wWidth;
      used += advance;
    }
  }
  commit();
  return lines;
}

/** Wrap every non-empty ability at a given scale; returns per-ability line groups. */
function wrapAllAbilities(
  nonEmpty: Ability[],
  scale: number,
  opts: AbilitiesLayoutOptions,
): { paras: AbilitySegment[][][]; fs: number; lh: number; gap: number; consumed: number } {
  const fs = opts.fontSize * scale;
  const lh = opts.lineHeight * scale;
  const gap = opts.paragraphGap * scale;
  const spaceFont = fontString(fs, opts.romanFamily);
  const paras = nonEmpty.map((a) =>
    wrapWords(
      abilityWords(a, fs, opts.boldFamily, opts.romanFamily),
      opts.x,
      opts.maxWidth,
      spaceFont,
      opts.measure,
    ),
  );
  const totalLines = paras.reduce((n, p) => n + p.length, 0);
  // Consumed height = every line's advance + one gap between each adjacent ability.
  const consumed = totalLines * lh + Math.max(paras.length - 1, 0) * gap;
  return { paras, fs, lh, gap, consumed };
}

/**
 * Lay out the abilities block. Native scale (1.0) is used unless the block exceeds the
 * usable height (textBottom − textTop), in which case the font + line-height + gap are
 * scaled DOWN together (stepping toward `minScale`) until it fits or the floor is hit.
 * Whole lines past the box bottom are clipped (never drawn mid-word). PURE.
 */
export function layoutAbilities(
  abilities: Ability[],
  opts: AbilitiesLayoutOptions,
): AbilitiesLayout {
  // Skip abilities whose name AND body are both blank.
  const nonEmpty = abilities.filter((a) => a.name.trim().length > 0 || a.body.trim().length > 0);
  if (nonEmpty.length === 0) {
    return { scale: 1, fontSize: opts.fontSize, lineHeight: opts.lineHeight, lines: [], clipped: false };
  }

  const usable = opts.textBottom - opts.textTop;

  // Find the largest scale in [minScale, 1] (0.02 steps) whose block fits the usable
  // height. If nothing fits, fall through to minScale (then whole-line clip guards it).
  let scale = 1;
  let wrapped = wrapAllAbilities(nonEmpty, scale, opts);
  while (wrapped.consumed > usable && scale > opts.minScale) {
    scale = Math.max(opts.minScale, Number((scale - 0.02).toFixed(2)));
    wrapped = wrapAllAbilities(nonEmpty, scale, opts);
  }

  // Assign absolute y per line (with paragraph gaps) and clip at the box bottom.
  const lines: AbilityLine[] = [];
  let cursorY = opts.textTop;
  let clipped = false;
  let clippedAbilityIndex: number | undefined;
  for (let pi = 0; pi < wrapped.paras.length; pi++) {
    for (const segments of wrapped.paras[pi]) {
      // Drop a whole line that would extend past the bottom (never mid-word).
      if (cursorY + wrapped.lh > opts.textBottom + 0.5) {
        clipped = true;
        // Record the first ability that couldn't be fully placed (for batch reporting).
        clippedAbilityIndex = pi;
        break;
      }
      lines.push({ y: cursorY, segments });
      cursorY += wrapped.lh;
    }
    if (clipped) break;
    if (pi < wrapped.paras.length - 1) cursorY += wrapped.gap;
  }

  return { scale, fontSize: wrapped.fs, lineHeight: wrapped.lh, lines, clipped, clippedAbilityIndex };
}
