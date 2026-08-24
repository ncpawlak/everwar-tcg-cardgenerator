// STORY-8 — Abilities word-wrap + clip as a PURE function (injected measurer). Greedy
// word wrap within a padded width; lines whose baseline box would extend past the
// content-box bottom are CLIPPED (not emitted), so text never renders below the
// abilities box (spec §4.3). A single over-long word is hard-broken so wrapping can
// never infinite-loop. STORY-9 supplies `ctx.measureText` as the measurer.
import type { Measure } from './layoutTitle';

/** One positioned wrapped line ready to draw with `fillText`. */
export interface WrappedLine {
  text: string;
  x: number;
  y: number;
}

/** Wrapping parameters. */
export interface WrapOptions {
  /** Left x of the text area. */
  x: number;
  /** Top y (baseline top) of the first line. */
  y: number;
  /** Maximum line width in px (padded text-area width). */
  maxWidth: number;
  /** Vertical advance per line in px. */
  lineHeight: number;
  /** Content-box bottom in px; a line is dropped if `y + lineHeight` exceeds it. */
  maxBottom: number;
  /** Canvas font shorthand used for measuring. */
  font: string;
  /** Injected width measurer. */
  measure: Measure;
}

/**
 * Hard-break a single word that is wider than `maxWidth` into chunks that each fit.
 * Guarantees progress (never returns an empty leading chunk) so callers can't loop
 * forever on an unbreakable token.
 */
function breakLongWord(word: string, maxWidth: number, font: string, measure: Measure): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const ch of word) {
    const test = current + ch;
    if (current && measure(test, font) > maxWidth) {
      chunks.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Greedily wrap `text` into positioned lines, clipping any line that would fall below
 * the content box. Returns `[]` for empty/whitespace-only input.
 */
export function wrapText(text: string, opts: WrapOptions): WrappedLine[] {
  const { x, y, maxWidth, lineHeight, maxBottom, font, measure } = opts;
  if (text.trim().length === 0) return [];

  // First, build the flat list of wrapped line strings (greedy word wrap).
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lineStrings: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, font) > maxWidth) {
      // Current line is full — commit it and start a new line with `word`.
      lineStrings.push(line);
      line = word;
    } else {
      line = candidate;
    }
    // If the (now single) word itself overflows, hard-break it.
    if (measure(line, font) > maxWidth && line === word) {
      const chunks = breakLongWord(word, maxWidth, font, measure);
      // All but the last chunk are full lines; keep the last as the running line.
      for (let i = 0; i < chunks.length - 1; i++) lineStrings.push(chunks[i]);
      line = chunks[chunks.length - 1] ?? '';
    }
  }
  if (line) lineStrings.push(line);

  // Position lines and clip any that would extend past the box bottom.
  const out: WrappedLine[] = [];
  let cursorY = y;
  for (const ln of lineStrings) {
    if (cursorY + lineHeight > maxBottom) break; // clip — do not emit below the box
    out.push({ text: ln, x, y: cursorY });
    cursorY += lineHeight;
  }
  return out;
}
