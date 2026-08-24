// STORY-9 — Draw a single editable field onto a 2D context. Single-line values use
// the captured font/size/colour/justification at the baseline anchor; the title uses
// per-run small-caps ops (STORY-7); the abilities body uses wrapped, clipped lines
// (STORY-8). Layout math is delegated to the pure functions with `ctx.measureText`
// injected as the measurer — no layout logic lives here.
import type { FieldModel, Rgb } from '../psd/types';
import { isAbilities } from '../psd/types';
import { layoutTitle, type Measure } from './layoutTitle';
import { wrapText } from './wrapText';

/** A 2D context we can draw text on (DOM or napi). Typed loosely for cross-env use. */
export type Ctx2D = any;

/** Convert an Rgb to a CSS `rgb(...)` string. */
function rgbCss(c: Rgb): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** Build a measurer backed by the real canvas text engine. */
function ctxMeasure(ctx: Ctx2D): Measure {
  return (text: string, font: string) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

/** Map PSD justification to a canvas textAlign value. */
function toTextAlign(justification: string): CanvasTextAlign {
  if (justification === 'center') return 'center';
  if (justification === 'right') return 'right';
  return 'left';
}

/**
 * Draw one field. `value` overrides the model's stored text (the live edited value).
 */
export function drawText(ctx: Ctx2D, field: FieldModel, value: string): void {
  if (isAbilities(field)) {
    // Abilities body — wrap + clip to the content box, white RomanCondensed.
    const font = `${field.fontSize}px "${field.font}"`;
    ctx.save();
    // Clip strictly to the content box so nothing draws below y = box.bottom.
    ctx.beginPath();
    ctx.rect(
      field.box.left,
      field.box.top,
      field.box.right - field.box.left,
      field.box.bottom - field.box.top,
    );
    ctx.clip();
    ctx.fillStyle = rgbCss(field.color);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font;
    const lines = wrapText(value, {
      x: field.textArea.x,
      y: field.textArea.y,
      maxWidth: field.textArea.w,
      lineHeight: field.lineHeight,
      maxBottom: field.box.bottom,
      font,
      measure: ctxMeasure(ctx),
    });
    for (const line of lines) ctx.fillText(line.text, line.x, line.y);
    ctx.restore();
    return;
  }

  // Layer-backed field (title or single-line).
  ctx.fillStyle = rgbCss(field.color);

  if (field.kind === 'title') {
    // Per-run small-caps: baseline anchored at the engine transform.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const ops = layoutTitle(value, field.styleRuns, field.font, field.anchor, ctxMeasure(ctx));
    for (const op of ops) {
      ctx.font = op.font;
      ctx.fillText(op.text, op.x, op.y);
    }
    return;
  }

  // Single-line value at its captured position.
  ctx.textAlign = toTextAlign(field.justification);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${field.fontSize}px "${field.font}"`;
  ctx.fillText(value, field.anchor.x, field.anchor.y);
}
