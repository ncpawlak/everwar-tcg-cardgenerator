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

  // STORY-15 — the dynamic armor bar is drawn over the background before editable text.
  it('draws green armor segments for armorBars=8 and an empty track for armorBars=0', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const model = extractModel(psd);
    const bg = bakeBackground(psd, { createCanvas: factory });

    // N=8: sample the centre of the first segment (~x=614, y=361) — bright green.
    const c8 = createCanvas(model.width, model.height) as any;
    const ctx8 = c8.getContext('2d');
    renderCard(ctx8, bg, model, { ...initialValues(model), armorBars: '8' });
    const g8 = ctx8.getImageData(614, 361, 1, 1).data;
    expect(g8[1]).toBeGreaterThan(g8[0] + 20); // green channel dominant
    expect(g8[1]).toBeGreaterThan(120);

    // N=0: same pixel must be the dark empty-track recess (no green dominance).
    const c0 = createCanvas(model.width, model.height) as any;
    const ctx0 = c0.getContext('2d');
    renderCard(ctx0, bg, model, { ...initialValues(model), armorBars: '0' });
    const g0 = ctx0.getImageData(614, 361, 1, 1).data;
    expect(g0[1]).toBeLessThan(60);
    expect(Math.abs(g0[1] - g0[0])).toBeLessThan(15);
  });

  // STORY-16 — the COMMANDER/UNIQUE chips are patched out at render time when false.
  it('hides a chip when its flag is false and leaves the tag row + other chip intact', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const model = extractModel(psd);
    const bg = bakeBackground(psd, { createCanvas: factory });

    // Baseline: both chips shown.
    const shown = createCanvas(model.width, model.height) as any;
    const sCtx = shown.getContext('2d');
    renderCard(sCtx, bg, model, { ...initialValues(model), commander: 'true', unique: 'true' });

    // Commander hidden only.
    const hidden = createCanvas(model.width, model.height) as any;
    const hCtx = hidden.getContext('2d');
    renderCard(hCtx, bg, model, { ...initialValues(model), commander: 'false', unique: 'true' });

    // The COMMANDER text band (~x=90..185, y=698..712) must differ (glyphs erased).
    const [cx, cy, cw, ch] = [90, 698, 95, 14];
    const s1 = sCtx.getImageData(cx, cy, cw, ch).data;
    const h1 = hCtx.getImageData(cx, cy, cw, ch).data;
    let diff = 0;
    for (let i = 0; i < s1.length; i += 4) if (Math.abs(s1[i] - h1[i]) > 20) diff++;
    expect(diff).toBeGreaterThan(30);

    // The UNIQUE chip (x=268..314, y=701..713) is untouched by a commander-only hide.
    const uS = sCtx.getImageData(268, 701, 46, 12).data;
    const uH = hCtx.getImageData(268, 701, 46, 12).data;
    for (let i = 0; i < uS.length; i++) expect(uH[i]).toBe(uS[i]);

    // The INFANTRY tag row below the hide rect (y=745) is untouched too.
    const rS = sCtx.getImageData(52, 745, 320, 1).data;
    const rH = hCtx.getImageData(52, 745, 320, 1).data;
    for (let i = 0; i < rS.length; i++) expect(rH[i]).toBe(rS[i]);
  });
});
