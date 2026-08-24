// STORY-16 — Hide a COMMANDER / UNIQUE chip by reconstructing the rail over its rect.
// The pill art is baked into the broad `Layer 3` raster, so it cannot be hidden by
// skipping a layer; instead we overwrite each chip row with the median of a stable
// no-chip donor strip on the same row (Senior spike recipe). The median reduction is a
// pure function (unit-tested); the canvas sampling/fill glue is kept thin.
import type { Ctx2D } from './drawText';
import type { ChipRect } from '../config/chips';
import { CHIP_DONOR_STRIP } from '../config/chips';

/** A resolved RGBA tuple, 0–255 per channel. */
export type Rgba = [number, number, number, number];

/**
 * Reduce a row of donor pixels (packed RGBA, one pixel per 4 bytes) to a single
 * representative RGBA using the per-channel median. The median is robust to the odd
 * bright ornament/highlight pixel that a plain mean would smear into the fill. For an even
 * sample count the two middle order-statistics are averaged (rounded).
 */
export function computeRowFill(pixels: Uint8ClampedArray): Rgba {
  const n = Math.floor(pixels.length / 4);
  if (n <= 0) throw new Error('computeRowFill: empty pixel row (no samples).');

  // Per-channel median over the n samples.
  const channel = (offset: number): number => {
    const vals = new Array<number>(n);
    for (let i = 0; i < n; i++) vals[i] = pixels[i * 4 + offset];
    vals.sort((a, b) => a - b);
    const mid = n >> 1;
    // Odd count → the middle value; even count → mean of the two middle values.
    return n % 2 === 1 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
  };

  return [channel(0), channel(1), channel(2), channel(3)];
}

/**
 * Overwrite `rect` on the current canvas with a per-row donor-median fill, erasing the
 * baked pill art + chip text. The donor strip is the stable no-chip rail to the right of
 * the chips; on this card that rail is a transparent frame cutout, so most donor rows are
 * fully transparent and the patch must genuinely REPLACE the target pixels (alpha and all)
 * rather than alpha-blend over them — a plain fillRect at globalAlpha 0 would paint nothing
 * and leave the pill showing. We therefore build an ImageData for the rect from the per-row
 * donor colours and putImageData it, which overwrites destination pixels outright. Reads the
 * donor strip from the CURRENT canvas (post background blit), so it must run after the
 * background is drawn. `donorStrip` defaults to the config strip.
 */
export function patchChip(
  ctx: Ctx2D,
  rect: ChipRect,
  donorStrip: { left: number; right: number } = CHIP_DONOR_STRIP,
): void {
  const donorW = donorStrip.right - donorStrip.left;
  const rectW = rect.right - rect.left;
  const rectH = rect.bottom - rect.top;

  // Destination buffer we fill row-by-row then blit once with putImageData (replace, not blend).
  const out = ctx.createImageData(rectW, rectH);
  const D = out.data;

  for (let ry = 0; ry < rectH; ry++) {
    const y = rect.top + ry;
    // Sample the whole donor strip at this row and reduce to one RGBA.
    const donorRow = ctx.getImageData(donorStrip.left, y, donorW, 1).data;
    const [r, g, b, a] = computeRowFill(donorRow);
    // Paint every pixel of this rect row with the donor colour (including its alpha).
    for (let rx = 0; rx < rectW; rx++) {
      const i = (ry * rectW + rx) * 4;
      D[i] = r;
      D[i + 1] = g;
      D[i + 2] = b;
      D[i + 3] = a;
    }
  }

  // putImageData replaces the destination rectangle wholesale, so a transparent donor row
  // correctly clears the baked pill to transparent (matching the empty rail slot).
  ctx.putImageData(out, rect.left, rect.top);
}
