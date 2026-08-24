// FIX-1 — Shrink-to-fit for single-line text, as a PURE, measurer-injected core so the
// scale/tracking math is unit-testable without a canvas (mirrors the layout core from
// STORY-7/8). A single-line field must never overflow its slot horizontally: when the
// text is wider than the available width we first condense the tracking (negative
// letter-spacing) a little, then — if that is not enough — scale the font size down,
// keeping both moves capped so the text stays readable.

/** Readability floor: never scale a field's font below 60% of its authored size. */
export const MIN_SCALE = 0.6;

/**
 * Maximum tracking we will apply per inter-glyph gap, expressed as a fraction of the
 * (base) font size. 0.08 ≈ a subtle condense that stays legible before we resort to
 * scaling the glyphs themselves.
 */
export const MAX_TRACK_RATIO = 0.08;

/**
 * Single-line fields carry no explicit container width in the PSD, so we use the text
 * layer's own tight ink bounds as the slot and add a small allowance: the authored
 * values measure up to ~9% wider than their bounds (side bearings), so 1.15 keeps the
 * original card unchanged while still catching genuinely-too-long edits. Documented in
 * `.project/spec.md` (single-line render behavior).
 */
export const SINGLE_LINE_WIDTH_ALLOWANCE = 1.15;

/** The result of fitting a run of text into an available width. */
export interface Fit {
  /** Font-size multiplier in (MIN_SCALE .. 1]. */
  scale: number;
  /** Effective (already-scaled) letter-spacing in px; 0 or negative. */
  letterSpacing: number;
}

/**
 * Compute how to fit `nativeWidth` (the text's width at its authored size) into
 * `availableWidth`. Strategy: condense tracking up to the per-gap cap, then scale the
 * font, clamped at MIN_SCALE. When the text already fits, returns the identity fit.
 */
export function computeFit(
  nativeWidth: number,
  availableWidth: number,
  charCount: number,
  baseFontSize: number,
): Fit {
  // Fits already (or no meaningful width) → draw at authored size, no tracking.
  if (!(availableWidth > 0) || nativeWidth <= availableWidth) {
    return { scale: 1, letterSpacing: 0 };
  }

  const gaps = Math.max(charCount - 1, 0);
  const over = nativeWidth - availableWidth;

  // 1) Condense tracking first, but only up to the per-gap budget.
  const maxTrackTotal = MAX_TRACK_RATIO * baseFontSize * gaps;
  const trackTotal = Math.min(over, maxTrackTotal);
  const lsNative = gaps > 0 ? -(trackTotal / gaps) : 0;
  const widthAfterTrack = nativeWidth - trackTotal;

  // 2) If tracking alone did not close the gap, scale the font down (floored).
  let scale = 1;
  if (widthAfterTrack > availableWidth) {
    scale = Math.max(availableWidth / widthAfterTrack, MIN_SCALE);
  }

  // Letter-spacing is part of the layout, so it scales with the glyphs.
  return { scale, letterSpacing: lsNative * scale };
}

/** A fully-resolved single-line layout, ready to apply to a 2D context. */
export interface SingleLineLayout {
  /** Whether any shrink (scale and/or tracking) was applied. */
  shrink: boolean;
  /** Scaled font-size in px. */
  fontSize: number;
  /** Canvas font shorthand at the scaled size. */
  font: string;
  /** Font-size multiplier applied (<= 1). */
  scale: number;
  /** Effective letter-spacing in px (<= 0). */
  letterSpacing: number;
  /** Final drawn width in px (glyph advances + tracking). */
  fittedWidth: number;
}

/** Build the canvas font shorthand for a size + family. */
function fontString(size: number, family: string): string {
  return `${size}px "${family}"`;
}

/**
 * Resolve the shrink-to-fit layout for one single-line value. Pure: all width queries
 * go through the injected `measure`, so it is fully testable with a stub measurer and
 * identical in the browser (which injects `ctx.measureText`).
 */
export function layoutSingleLine(
  text: string,
  family: string,
  fontSize: number,
  availableWidth: number,
  measure: (text: string, font: string) => number,
): SingleLineLayout {
  const nativeWidth = measure(text, fontString(fontSize, family));
  const fit = computeFit(nativeWidth, availableWidth, text.length, fontSize);

  const scaledSize = fontSize * fit.scale;
  const font = fontString(scaledSize, family);
  const gaps = Math.max(text.length - 1, 0);
  // Final width = the scaled glyph advances plus tracking across the inter-glyph gaps.
  const fittedWidth = measure(text, font) + fit.letterSpacing * gaps;

  return {
    shrink: fit.scale < 1 || fit.letterSpacing < 0,
    fontSize: scaledSize,
    font,
    scale: fit.scale,
    letterSpacing: fit.letterSpacing,
    fittedWidth,
  };
}
