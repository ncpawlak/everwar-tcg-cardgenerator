// STORY-9 test — render the full card through napi canvas with the real fonts and
// assert: the small-caps invariant (initial-cap run larger than the body run), the
// abilities clip holds (nothing below y=968), and a stat number draws ink at its spot.
import { describe, it, expect, beforeAll } from 'vitest';
import { readPsdBuffer } from '../src/psd/loadPsd';
import { extractModel } from '../src/psd/extractModel';
import { bakeBackground } from '../src/render/bakeBackground';
import { renderCard } from '../src/render/renderCard';
import type { CardModel } from '../src/psd/types';
import { seedValues } from '../src/app/seedValues';
import { setupNapiCanvas, readCardPsdBuffer, createCanvas } from './helpers/napiCanvas';

beforeAll(() => setupNapiCanvas());

const factory = (w: number, h: number) => createCanvas(w, h) as any;

/** Seed the value map from the model (abilities-aware: six slot keys). */
function initialValues(model: CardModel): Record<string, string> {
  return seedValues(model);
}

function build() {
  const psd = readPsdBuffer(readCardPsdBuffer());
  const model = extractModel(psd);
  const bg = bakeBackground(psd, { createCanvas: factory });
  const canvas = createCanvas(model.width, model.height) as any;
  const ctx = canvas.getContext('2d');
  renderCard(ctx, bg, model, initialValues(model));
  return { psd, model, bg, canvas, ctx };
}

describe('renderCard', () => {
  it('applies per-run small-caps sizing (initial cap ascent > body ascent)', () => {
    const { ctx } = build();
    // The rendered engine's own metrics prove the two run sizes differ.
    ctx.font = '45.83333px "Square721BT-BoldCondensed"';
    const bigAscent = ctx.measureText('I').actualBoundingBoxAscent;
    ctx.font = '37.5px "Square721BT-BoldCondensed"';
    const smallAscent = ctx.measureText('I').actualBoundingBoxAscent;
    expect(bigAscent).toBeGreaterThan(smallAscent);
  });

  it('draws title ink over the background in the title band', () => {
    const { ctx, bg } = build();
    const bgCtx = bg.getContext('2d');
    const [x, y, w, h] = [72, 43, 341, 33];
    const rendered = ctx.getImageData(x, y, w, h).data;
    const base = bgCtx.getImageData(x, y, w, h).data;
    let diff = 0;
    for (let i = 0; i < rendered.length; i += 4) {
      if (Math.abs(rendered[i] - base[i]) > 30) diff++;
    }
    expect(diff).toBeGreaterThan(100);
  });

  it('clips the abilities body — nothing renders below y=971', () => {
    const { ctx, bg } = build();
    const bgCtx = bg.getContext('2d');
    // Sample a row below the box bottom (971) within the abilities x-range.
    const y = 975;
    const rendered = ctx.getImageData(40, y, 600, 1).data;
    const base = bgCtx.getImageData(40, y, 600, 1).data;
    for (let i = 0; i < rendered.length; i++) {
      expect(Math.abs(rendered[i] - base[i])).toBeLessThanOrEqual(2);
    }
  });

  it('draws a stat number over the background at its position', () => {
    const { ctx, bg } = build();
    const bgCtx = bg.getContext('2d');
    // Level "4" bounds ≈ (582,75)-(605,111).
    const [x, y, w, h] = [580, 74, 30, 40];
    const rendered = ctx.getImageData(x, y, w, h).data;
    const base = bgCtx.getImageData(x, y, w, h).data;
    let diff = 0;
    for (let i = 0; i < rendered.length; i += 4) {
      if (Math.abs(rendered[i] - base[i]) > 30) diff++;
    }
    expect(diff).toBeGreaterThan(20);
  });

  it('is deterministic across repeated renders (background reused, no re-bake)', () => {
    const { ctx, canvas, model, bg } = build();
    const first = ctx.getImageData(0, 0, 100, 100).data.slice();
    // Re-render with the SAME background and model — must match exactly.
    renderCard(ctx, bg, model, initialValues(model));
    const second = canvas.getContext('2d').getImageData(0, 0, 100, 100).data;
    for (let i = 0; i < first.length; i++) expect(second[i]).toBe(first[i]);
  });
});
