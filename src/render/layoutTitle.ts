// STORY-7 — Title layout (faux small-caps) as a PURE function. Given the title, its
// per-run styleRuns, the font family, a baseline anchor, and an injected measurer,
// return positioned draw ops — each run advanced by the measured width of the runs
// before it. Reproduces the spike learning: per-run sizing keyed off styleRuns,
// advancing by measured width, baseline at the engine transform. NEVER couples to a
// live canvas — STORY-9 passes `ctx.measureText`.
import type { StyleRun, Anchor } from '../psd/types';

/** A single positioned run ready to draw with `fillText`. */
export interface TitleDrawOp {
  /** Substring to draw. */
  text: string;
  /** Canvas font shorthand, e.g. `45.83px "Square721BT-BoldCondensed"`. */
  font: string;
  /** Left x (baseline start) for this run. */
  x: number;
  /** Baseline y (shared by all runs). */
  y: number;
}

/** Injected width measurer: `(text, font) => advanceWidthPx`. */
export type Measure = (text: string, font: string) => number;

/** A sized text segment before positioning. */
interface Segment {
  text: string;
  size: number;
}

/** Build the canvas font shorthand for a size + family. */
function fontString(size: number, family: string): string {
  return `${size}px "${family}"`;
}

/**
 * Slice the title into segments using explicit styleRuns. Only valid when the runs'
 * total length equals the title length (the original PSD title).
 */
function segmentsFromRuns(text: string, runs: StyleRun[]): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  for (const run of runs) {
    segments.push({ text: text.substr(i, run.length), size: run.fontSize });
    i += run.length;
  }
  return segments;
}

/**
 * Regenerate segments for arbitrary edited text using the faux small-caps rule:
 * the first glyph of each whitespace-delimited word is drawn large, the rest small;
 * whitespace runs are drawn small. Big/small sizes are inferred from the styleRuns
 * (max = initial-cap size, min = body size), falling back to the PSD defaults.
 */
function segmentsSmallCaps(text: string, runs: StyleRun[]): Segment[] {
  const sizes = runs.map((r) => r.fontSize).filter((s) => s > 0);
  const big = sizes.length ? Math.max(...sizes) : 45.83333;
  const small = sizes.length ? Math.min(...sizes) : 37.5;
  const segments: Segment[] = [];
  // Split on whitespace but keep the whitespace tokens so advances stay exact.
  for (const token of text.split(/(\s+)/)) {
    if (token.length === 0) continue;
    if (/^\s+$/.test(token)) {
      segments.push({ text: token, size: small });
      continue;
    }
    segments.push({ text: token[0], size: big });
    if (token.length > 1) segments.push({ text: token.slice(1), size: small });
  }
  return segments;
}

/**
 * Lay out the title into positioned draw ops.
 *
 * If the provided styleRuns exactly cover the text (original PSD title), they are
 * honored verbatim; otherwise the small-caps rule regenerates runs for edited text.
 */
export function layoutTitle(
  text: string,
  styleRuns: StyleRun[],
  family: string,
  anchor: Anchor,
  measure: Measure,
): TitleDrawOp[] {
  if (text.length === 0) return [];

  const runsCoverText =
    styleRuns.length > 0 &&
    styleRuns.reduce((sum, r) => sum + r.length, 0) === text.length;

  const segments = runsCoverText
    ? segmentsFromRuns(text, styleRuns)
    : segmentsSmallCaps(text, styleRuns);

  const ops: TitleDrawOp[] = [];
  let x = anchor.x;
  for (const seg of segments) {
    const font = fontString(seg.size, family);
    ops.push({ text: seg.text, font, x, y: anchor.y });
    // Advance by the measured width of THIS run for the next run's start.
    x += measure(seg.text, font);
  }
  return ops;
}
