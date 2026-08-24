// STORY-9 — Draw a single layer-backed editable field onto a 2D context. Single-line
// values use the captured font/size/colour/justification at the baseline anchor; the
// title uses per-run small-caps ops (STORY-7). The abilities body is a separate path
// (`drawAbilities`, STORY-14). Layout math is delegated to the pure functions with
// `ctx.measureText` injected as the measurer — no layout logic lives here.
import type { LayerFieldModel, Rgb } from '../psd/types';
import { layoutTitle, type Measure } from './layoutTitle';
import { layoutSingleLine, SINGLE_LINE_WIDTH_ALLOWANCE, titleAvailableWidth } from './fitText';

/** A 2D context we can draw text on (DOM or napi). Typed loosely for cross-env use. */
export type Ctx2D = any;

/** Convert an Rgb to a CSS `rgb(...)` string. */
export function rgbCss(c: Rgb): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** Build a measurer backed by the real canvas text engine. */
export function ctxMeasure(ctx: Ctx2D): Measure {
  return (text: string, font: string) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

/**
 * Apply letter-spacing to the context if supported. Both target engines — Chromium and
 * @napi-rs/canvas — support `ctx.letterSpacing`; the guard keeps it safe elsewhere.
 * Measurement is always done with spacing reset to 0, so the layout math (which adds
 * tracking explicitly) is never double-counted.
 */
function setLetterSpacing(ctx: Ctx2D, px: number): void {
  try {
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
  } catch {
    /* letterSpacing unsupported: ignore (tracking simply not applied) */
  }
}

/** Available slot width for a layer-backed field, derived from its layer bounds. */
function layerWidth(field: { bounds: { left: number; right: number } }): number {
  return field.bounds.right - field.bounds.left;
}

/** Map PSD justification to a canvas textAlign value. */
function toTextAlign(justification: string): CanvasTextAlign {
  if (justification === 'center') return 'center';
  if (justification === 'right') return 'right';
  return 'left';
}

/**
 * Draw one layer-backed field (title or single-line). `value` overrides the model's
 * stored text (the live edited value). The abilities body is drawn separately.
 */
export function drawText(ctx: Ctx2D, field: LayerFieldModel, value: string): void {
  // Layer-backed field (title or single-line).
  ctx.fillStyle = rgbCss(field.color);
  // Reset tracking before measuring/drawing so leftover spacing never skews layout.
  setLetterSpacing(ctx, 0);

  if (field.kind === 'title') {
    // Per-run small-caps: baseline anchored at the engine transform. Edited titles
    // shrink uniformly to fit the black TITLE BAR — its available width spans from the
    // title's left anchor to the bar's inner-right edge (titleAvailableWidth), NOT the
    // tight ink bounds (which shrank the title far too early, left of the bar edge).
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const ops = layoutTitle(
      value,
      field.styleRuns,
      field.font,
      field.anchor,
      ctxMeasure(ctx),
      titleAvailableWidth(field.anchor.x),
      // STORY-16c — pass the original captured title so ONLY the unchanged authored value
      // uses the authored runs; any edited value renders as true small-caps (uppercased).
      field.text,
    );
    for (const op of ops) {
      ctx.font = op.font;
      ctx.fillText(op.text, op.x, op.y);
    }
    return;
  }

  // Single-line value at its captured position, shrunk-to-fit its slot width so long
  // edits never overflow the card horizontally (FIX-1). The slot is the layer's own
  // ink bounds plus a small allowance (see SINGLE_LINE_WIDTH_ALLOWANCE).
  const available = layerWidth(field) * SINGLE_LINE_WIDTH_ALLOWANCE;
  const fit = layoutSingleLine(value, field.font, field.fontSize, available, ctxMeasure(ctx));
  ctx.textAlign = toTextAlign(field.justification);
  ctx.textBaseline = 'alphabetic';
  ctx.font = fit.font;
  setLetterSpacing(ctx, fit.letterSpacing);
  ctx.fillText(value, field.anchor.x, field.anchor.y);
  // Reset so the next field measures/draws with no residual tracking.
  setLetterSpacing(ctx, 0);
}
