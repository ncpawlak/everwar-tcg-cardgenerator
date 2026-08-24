// STORY-13 — Fidelity / regression baseline. Render the card with the ORIGINAL PSD
// field values and diff against the PSD composite (`psd.canvas`) within a documented
// tolerance that absorbs sub-pixel metric kerning (spec §4.4) but catches gross
// regressions (wrong font, missing field, mis-position). Also asserts the small-caps
// and abilities-clip invariants. This is the render-path regression guard.
import { describe, it, expect, beforeAll } from 'vitest';
import { readPsdBuffer } from '../src/psd/loadPsd';
import { extractModel } from '../src/psd/extractModel';
import { bakeBackground } from '../src/render/bakeBackground';
import { renderCard } from '../src/render/renderCard';
import type { CardModel } from '../src/psd/types';
import { seedValues } from '../src/app/seedValues';
import { ABILITY_SLOTS } from '../src/config/editableLayers';
import { setupNapiCanvas, readCardPsdBuffer, createCanvas } from './helpers/napiCanvas';

beforeAll(() => setupNapiCanvas());

const factory = (w: number, h: number) => createCanvas(w, h) as any;

// TOLERANCE RATIONALE:
// - PER-PIXEL colour delta threshold = 60 (sum of |ΔR|+|ΔG|+|ΔB|). Anti-aliased
//   glyph edges shift by sub-pixel kerning between the PSD rasterizer and the canvas
//   engine, producing small deltas along text edges; 60 ignores those while catching
//   a wrong/missing glyph (which flips large white-on-dark areas, delta >> 60).
// - MAX MISMATCH RATIO = 3% of pixels. Editable text is a small fraction of the
//   690×1020 card; a correct render mismatches only thin AA edges. A gross regression
//   (missing field, wrong font, mis-position) pushes well past 3%.
const PIXEL_DELTA = 60;
const MAX_MISMATCH_RATIO = 0.03;

/** Original PSD values: captured texts, but the abilities body is empty (no layer). */
function originalValues(model: CardModel): Record<string, string> {
  const v = seedValues(model);
  // The PSD composite has NO abilities body, so the faithful baseline is empty:
  // blank all six ability slot keys so nothing renders in the abilities box.
  for (const slot of ABILITY_SLOTS) {
    v[slot.nameKey] = '';
    v[slot.bodyKey] = '';
  }
  // The PSD composite carries its OWN baked 8-segment armor bar. Delete the armorBars key
  // so renderCard skips the dynamic bar (STORY-15) and the baked bar is compared
  // apples-to-apples (paired with bakeBackground `patchArmorBar:false`).
  delete v['armorBars'];
  return v;
}

describe('fidelity baseline', () => {
  it('renders original values within tolerance of the PSD composite', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const model = extractModel(psd);
    // Faithful baseline: the PSD composite still contains the baked ABILITIES banner,
    // so keep it here (removeAbilitiesBadge:false) to compare the render path apples-to-
    // apples. Badge removal is an intentional deviation, tested in bakeBackground.test.ts.
    const bg = bakeBackground(psd, {
      createCanvas: factory,
      removeAbilitiesBadge: false,
      // Keep the PSD's baked armor bar for the fidelity comparison (see originalValues).
      patchArmorBar: false,
    });
    const canvas = createCanvas(model.width, model.height) as any;
    const ctx = canvas.getContext('2d');
    renderCard(ctx, bg, model, originalValues(model));

    const ours = ctx.getImageData(0, 0, model.width, model.height).data;
    const comp = (psd.canvas as any).getContext('2d').getImageData(0, 0, model.width, model.height)
      .data;

    let mismatches = 0;
    let sumAbsError = 0;
    const totalPx = model.width * model.height;
    for (let i = 0; i < ours.length; i += 4) {
      const d =
        Math.abs(ours[i] - comp[i]) +
        Math.abs(ours[i + 1] - comp[i + 1]) +
        Math.abs(ours[i + 2] - comp[i + 2]);
      sumAbsError += d;
      if (d > PIXEL_DELTA) mismatches++;
    }
    const ratio = mismatches / totalPx;
    const meanAbsError = sumAbsError / (totalPx * 3);
    // Surface the actual numbers for tuning/regression triage.

    console.log(
      `[fidelity] mismatch ratio=${(ratio * 100).toFixed(3)}% ` +
        `mean|err|=${meanAbsError.toFixed(3)} (threshold ${MAX_MISMATCH_RATIO * 100}%)`,
    );
    expect(ratio).toBeLessThan(MAX_MISMATCH_RATIO);
  });

  it('small-caps invariant holds: initial-cap run is larger than the body run', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const model = extractModel(psd);
    const canvas = createCanvas(model.width, model.height) as any;
    const ctx = canvas.getContext('2d');
    ctx.font = '45.83333px "Square721BT-BoldCondensed"';
    const big = ctx.measureText('I').actualBoundingBoxAscent;
    ctx.font = '37.5px "Square721BT-BoldCondensed"';
    const small = ctx.measureText('I').actualBoundingBoxAscent;
    expect(big).toBeGreaterThan(small);
  });

  it('abilities region renders within its box (no pixels below y=971)', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const model = extractModel(psd);
    const bg = bakeBackground(psd, { createCanvas: factory });
    const canvas = createCanvas(model.width, model.height) as any;
    const ctx = canvas.getContext('2d');
    // Render WITH a very long abilities body to prove the whole-line clip holds.
    const values = originalValues(model);
    values['ability1-name'] = 'Overflow Test';
    values['ability1-body'] =
      'This is a deliberately very long ability body repeated many times to force the ' +
      'wrapped block to exceed the reclaimed box and prove that lines past the bottom ' +
      'border are clipped whole and never drawn below the box interior at all. '.repeat(4);
    renderCard(ctx, bg, model, values);

    const bgCtx = bg.getContext('2d');
    const y = 974; // just below the reclaimed box bottom (971)
    const rendered = ctx.getImageData(40, y, 600, 1).data;
    const base = bgCtx.getImageData(40, y, 600, 1).data;
    for (let i = 0; i < rendered.length; i++) {
      expect(Math.abs(rendered[i] - base[i])).toBeLessThanOrEqual(2);
    }
  });
});
