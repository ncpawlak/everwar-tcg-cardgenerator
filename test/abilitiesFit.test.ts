// STORY-14 test — Variant D proof with the REAL fonts (napi canvas). The three
// realistic sample abilities (Rallying Cry / Ironward Resolve / Last Stand) with bold
// names + gaps must fit in the reclaimed 191px box at NATIVE size (scale 1.0, nothing
// clipped). An over-long set must trigger the shrink fallback (scale < 1) and still fit.
import { describe, it, expect, beforeAll } from 'vitest';
import { layoutAbilities } from '../src/render/abilitiesLayout';
import { ctxMeasure } from '../src/render/drawText';
import { ABILITIES_FIELD, ABILITIES_TEXT_AREA, ABILITIES_TEXT_BOTTOM } from '../src/config/editableLayers';
import { setupNapiCanvas, createCanvas } from './helpers/napiCanvas';

beforeAll(() => setupNapiCanvas());

const SAMPLE = [
  {
    name: 'Rallying Cry',
    body: 'At the start of your turn, all friendly INFANTRY units gain +5 ATTACK and +5 ACCURACY until end of turn.',
  },
  {
    name: 'Ironward Resolve',
    body: 'Ironfist Commander cannot be targeted by enemy abilities while at least two allied units remain on the field.',
  },
  {
    name: 'Last Stand',
    body: 'When reduced below 10 HP, gain +10 ARMOR and immunity to critical hits until the end of your next turn.',
  },
];

function realOpts() {
  const canvas = createCanvas(690, 1020) as any;
  const ctx = canvas.getContext('2d');
  return {
    x: ABILITIES_TEXT_AREA.x,
    textTop: ABILITIES_TEXT_AREA.y,
    maxWidth: ABILITIES_TEXT_AREA.w,
    textBottom: ABILITIES_TEXT_BOTTOM,
    fontSize: ABILITIES_FIELD.fontSize,
    lineHeight: ABILITIES_FIELD.lineHeight,
    paragraphGap: ABILITIES_FIELD.paragraphGap,
    boldFamily: ABILITIES_FIELD.boldFont,
    romanFamily: ABILITIES_FIELD.font,
    minScale: ABILITIES_FIELD.minScale,
    measure: ctxMeasure(ctx),
  };
}

describe('abilities Variant D fit (real fonts)', () => {
  it('fits the 3 realistic sample abilities at native size (scale 1.0, 0 clipped)', () => {
    const layout = layoutAbilities(SAMPLE, realOpts());
    expect(layout.scale).toBe(1);
    expect(layout.clipped).toBe(false);
    // Every line sits inside the reclaimed box.
    const usable = ABILITIES_TEXT_BOTTOM - ABILITIES_TEXT_AREA.y;
    for (const line of layout.lines) {
      expect(line.y + layout.lineHeight).toBeLessThanOrEqual(ABILITIES_TEXT_BOTTOM + 0.5);
    }
    // Sanity: the block consumes no more than the usable height.
    const last = layout.lines[layout.lines.length - 1];
    expect(last.y + layout.lineHeight - ABILITIES_TEXT_AREA.y).toBeLessThanOrEqual(usable);
  });

  it('shrinks (scale < 1) but still fits when far more text is supplied', () => {
    const overlong = SAMPLE.map((a) => ({ name: a.name, body: a.body + ' ' + a.body + ' ' + a.body }));
    const layout = layoutAbilities(overlong, realOpts());
    expect(layout.scale).toBeLessThan(1);
    expect(layout.scale).toBeGreaterThanOrEqual(ABILITIES_FIELD.minScale);
  });
});
