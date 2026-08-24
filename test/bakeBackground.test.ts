// STORY-6 test — bake the static background (all layers MINUS the 9 editable text
// layers) and assert: correct dimensions, the editable title's pixels are absent
// (region differs from the full PSD composite), and a static frame pixel matches the
// composite. Renders through @napi-rs/canvas.
import { describe, it, expect, beforeAll } from 'vitest';
import { readPsdBuffer } from '../src/psd/loadPsd';
import { bakeBackground } from '../src/render/bakeBackground';
import { setupNapiCanvas, readCardPsdBuffer, createCanvas } from './helpers/napiCanvas';

beforeAll(() => setupNapiCanvas());

// napi canvas factory adapter matching the BakeCanvas shape used by bakeBackground.
const factory = (w: number, h: number) => createCanvas(w, h) as any;

describe('bakeBackground', () => {
  it('produces a 690×1020 raster', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const bg = bakeBackground(psd, { createCanvas: factory });
    expect(bg.width).toBe(690);
    expect(bg.height).toBe(1020);
  });

  it('excludes the editable title (region differs from the full PSD composite)', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const bg = bakeBackground(psd, { createCanvas: factory });
    const bgCtx = bg.getContext('2d');
    const compCtx = (psd.canvas as any).getContext('2d');

    // Title bounds from the inventory: (72,43)-(413,76). Count differing pixels.
    const [x, y, w, h] = [72, 43, 341, 33];
    const bgData = bgCtx.getImageData(x, y, w, h).data;
    const compData = compCtx.getImageData(x, y, w, h).data;
    let diff = 0;
    for (let i = 0; i < bgData.length; i += 4) {
      const d =
        Math.abs(bgData[i] - compData[i]) +
        Math.abs(bgData[i + 1] - compData[i + 1]) +
        Math.abs(bgData[i + 2] - compData[i + 2]);
      if (d > 30) diff++;
    }
    // The removed title glyphs leave many differing pixels in this region.
    expect(diff).toBeGreaterThan(100);
  });

  it('keeps static frame pixels identical to the PSD composite', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const bg = bakeBackground(psd, { createCanvas: factory });
    const bgCtx = bg.getContext('2d');
    const compCtx = (psd.canvas as any).getContext('2d');
    // A frame/art pixel far from any editable text should match the composite.
    const px = 15;
    const py = 400;
    const b = bgCtx.getImageData(px, py, 1, 1).data;
    const c = compCtx.getImageData(px, py, 1, 1).data;
    for (let i = 0; i < 3; i++) expect(Math.abs(b[i] - c[i])).toBeLessThanOrEqual(4);
  });

  // ABILITIES-badge removal — the baked banner is painted over with interior black.
  it('removes the ABILITIES badge (default) with opaque black, leaving the tag row untouched', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    // Default bake removes the badge; the control bake keeps it for comparison.
    const withPatch = bakeBackground(psd, { createCanvas: factory });
    const noPatch = bakeBackground(psd, { createCanvas: factory, removeAbilitiesBadge: false });
    const wCtx = withPatch.getContext('2d');
    const nCtx = noPatch.getContext('2d');

    // Center of the patch rect (~x=143, y=793) must be opaque black after removal.
    const center = wCtx.getImageData(143, 793, 1, 1).data;
    expect([center[0], center[1], center[2], center[3]]).toEqual([0, 0, 0, 255]);

    // A pixel in the INFANTRY tag-row band ABOVE the box border (outside the rect) must
    // be byte-identical between the patched and unpatched bakes — proof the tag row is
    // never touched.
    const tagW = wCtx.getImageData(110, 750, 1, 1).data;
    const tagN = nCtx.getImageData(110, 750, 1, 1).data;
    expect([tagW[0], tagW[1], tagW[2], tagW[3]]).toEqual([tagN[0], tagN[1], tagN[2], tagN[3]]);
  });

  // Armor-bar patch (STORY-15) — the baked green fill is covered with the empty-recess
  // colour during the static bake so no old green shows through the dynamic bar.
  it('patches the baked armor-bar green (default) without touching neighbouring frame art', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const withPatch = bakeBackground(psd, { createCanvas: factory });
    const noPatch = bakeBackground(psd, { createCanvas: factory, patchArmorBar: false });
    const wCtx = withPatch.getContext('2d');
    const nCtx = noPatch.getContext('2d');

    // The unpatched bake still has bright baked green at a segment centre (~x=614,y=361).
    const greenN = nCtx.getImageData(614, 361, 1, 1).data;
    expect(greenN[1]).toBeGreaterThan(greenN[0] + 20); // green channel dominant
    expect(greenN[1]).toBeGreaterThan(120);

    // The patched bake replaces it with the dark empty-recess colour (no green dominance).
    const greenW = wCtx.getImageData(614, 361, 1, 1).data;
    expect(greenW[1]).toBeLessThan(60);
    expect(Math.abs(greenW[1] - greenW[0])).toBeLessThan(15);

    // A pixel OUTSIDE the track (the metallic housing at ~x=633,y=400) is byte-identical
    // between the two bakes — the patch never reaches the surrounding frame art.
    const outW = wCtx.getImageData(633, 400, 1, 1).data;
    const outN = nCtx.getImageData(633, 400, 1, 1).data;
    expect([outW[0], outW[1], outW[2], outW[3]]).toEqual([outN[0], outN[1], outN[2], outN[3]]);
  });
});
