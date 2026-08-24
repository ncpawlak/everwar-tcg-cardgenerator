// STORY-15 — Draw the dynamic armor bar over the (patched) background. For N=0 it paints
// the empty recessed track; for N>0 it lays down an olive divider base (so the 2px inter-
// segment gaps read like the baked art) then draws N top-lit, left-beveled green segments.
// All geometry comes from the pure `armorBarSegments`; this module only does canvas ops.
import type { Ctx2D } from './drawText';
import { armorBarSegments, coerceArmorBars, type ArmorSegment } from './armorBarLayout';
import { ARMOR_BAR_TRACK, ARMOR_BAR_COLORS } from '../config/armorBar';

/** Paint the empty, inactive recessed track (used for N=0). */
function drawEmptyTrack(ctx: Ctx2D): void {
  const t = ARMOR_BAR_TRACK;
  const w = t.right - t.left;
  const h = t.bottom - t.top;
  // Deepest outer recess, then a slightly lighter inner channel inset by 1px.
  ctx.fillStyle = ARMOR_BAR_COLORS.emptyOuter;
  ctx.fillRect(t.left, t.top, w, h);
  ctx.fillStyle = ARMOR_BAR_COLORS.emptyInner;
  ctx.fillRect(t.left + 1, t.top + 1, w - 2, h - 2);
}

/** Draw one beveled green segment: vertical gradient body + top and left highlights. */
function drawSegment(ctx: Ctx2D, s: ArmorSegment): void {
  // Vertical gradient: bright top → mid body → darker bottom (top-lit look).
  const grad = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
  grad.addColorStop(0, ARMOR_BAR_COLORS.segTop);
  grad.addColorStop(0.18, ARMOR_BAR_COLORS.segMid);
  grad.addColorStop(1, ARMOR_BAR_COLORS.segBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(s.x, s.y, s.w, s.h);

  // 1px bright top edge and 1px bright left column reproduce the baked bevel highlight.
  ctx.fillStyle = ARMOR_BAR_COLORS.segTop;
  ctx.fillRect(s.x, s.y, s.w, 1);
  ctx.fillStyle = ARMOR_BAR_COLORS.segLeftHighlight;
  ctx.fillRect(s.x, s.y, 1, s.h);
}

/**
 * Draw the armor bar for a given count. `armorBars` may be a number or the string held in
 * the value map; it is coerced/clamped defensively. Called from `renderCard` right after
 * the cached background is blitted and BEFORE any editable text.
 */
export function drawArmorBar(ctx: Ctx2D, armorBars: number | string): void {
  const N = coerceArmorBars(armorBars);

  if (N <= 0) {
    drawEmptyTrack(ctx);
    return;
  }

  // Olive divider base fills the whole track so the 2px gaps between segments show the
  // same olive the baked art uses; the green segments then cover everything but the gaps.
  const t = ARMOR_BAR_TRACK;
  ctx.fillStyle = ARMOR_BAR_COLORS.divider;
  ctx.fillRect(t.left, t.top, t.right - t.left, t.bottom - t.top);

  for (const s of armorBarSegments(N)) drawSegment(ctx, s);
}
