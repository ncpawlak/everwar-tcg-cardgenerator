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
});
