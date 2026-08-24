// STORY-17 / STORY-17b regression — map a representative Hero row ("Goliath") and render
// it through the SHARED production pipeline, then PROVE the static frame actually baked.
//
// The original smoke test only checked the PNG buffer was non-empty, which the abilities
// text alone satisfies — so it missed a bug where the CLI read the PSD with
// `useImageData:true` (populating layer `.imageData` instead of `.canvas`) and baked a
// fully-transparent frame. These assertions sample known-opaque FRAME pixels and fail if
// the background is empty/transparent.
import { describe, it, expect } from 'vitest';
import { setupNapiCanvas, readCardPsdBuffer, createCanvas } from '../helpers/napiCanvas';
import { readPsdBuffer } from '../../src/psd/loadPsd';
import { extractModel } from '../../src/psd/extractModel';
import { bakeBackground } from '../../src/render/bakeBackground';
import { renderCard } from '../../src/render/renderCard';
import { seedValues } from '../../src/app/seedValues';
import { mapRow, type RawRow } from '../../src/batch/mapRow';

/** The Goliath Hero row exactly as it appears in the spreadsheet. */
const goliathRow: RawRow = {
  Name: 'Goliath',
  Type: 'Hero',
  SubType: 'Heavy',
  Allegiance: 'Coalition',
  Level: 4,
  HP: 240,
  DMG: 60,
  ACC: 80,
  'Armor Bars': 2,
  Armor: 20,
  Unique: 1,
  Commander: 1,
  'Ability 1': "Heavy Suppression: Once per turn, select up to 2 enemy Heroes. Those Heroes have -20ACC during your opponent's next turn.",
  'Ability 2': 'Shock Deployment: If only Coalition Heavy Heroes were used to Commit Set this Hero, it can attack the turn it is set.',
  'Ability 3': 'Iron Wall: Once per turn discard the top card of your Deck to force enemies to target this Hero next turn.',
};

/**
 * Known-OPAQUE frame pixels (x, y, r, g, b) sampled from a correct render. Every one has
 * alpha 255; if the background failed to bake they would be transparent (alpha 0), so the
 * alpha check is the real regression guard. The interior cutouts stay transparent.
 */
const FRAME_PIXELS: [number, number, number, number, number][] = [
  [345, 8, 24, 24, 22], // top gold/black border
  [8, 510, 21, 21, 21], // left border
  [345, 1012, 13, 13, 12], // bottom border
  [630, 300, 13, 14, 13], // right rail
];

/** A transparent interior point (a genuine cutout) — proves we're not just filling solid. */
const TRANSPARENT_INTERIOR: [number, number] = [60, 300];

describe('batch frame regression (Goliath)', () => {
  it('bakes the full frame and renders it under the editable content', () => {
    setupNapiCanvas();
    const psd = readPsdBuffer(readCardPsdBuffer());
    const model = extractModel(psd);
    const factory = (w: number, h: number) => createCanvas(w, h) as any;
    const background = bakeBackground(psd, { createCanvas: factory });

    // The baked background itself must contain the opaque frame pixels (not just the
    // final render) — this isolates the bake step from the text overlay.
    const bgCtx = (background as any).getContext('2d');
    for (const [x, y, r, g, b] of FRAME_PIXELS) {
      const d = bgCtx.getImageData(x, y, 1, 1).data;
      expect(d[3], `baked bg alpha at (${x},${y})`).toBe(255);
      expect(Math.abs(d[0] - r) + Math.abs(d[1] - g) + Math.abs(d[2] - b)).toBeLessThanOrEqual(12);
    }

    const { card, errors } = mapRow(goliathRow, '"Goliath"');
    expect(errors).toEqual([]);
    expect(card).not.toBeNull();

    const values = { ...seedValues(model), ...card!.values };
    const canvas = createCanvas(model.width, model.height) as any;
    const ctx = canvas.getContext('2d');
    renderCard(ctx, background, model, values);

    // The FINAL rendered card must keep the frame pixels opaque and correctly coloured.
    for (const [x, y, r, g, b] of FRAME_PIXELS) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      expect(d[3], `rendered alpha at (${x},${y})`).toBe(255);
      expect(Math.abs(d[0] - r) + Math.abs(d[1] - g) + Math.abs(d[2] - b)).toBeLessThanOrEqual(12);
    }

    // Interior cutout stays transparent (the frame isn't an opaque flood-fill).
    const t = ctx.getImageData(TRANSPARENT_INTERIOR[0], TRANSPARENT_INTERIOR[1], 1, 1).data;
    expect(t[3]).toBe(0);

    // And it's still a real PNG.
    const png = canvas.toBuffer('image/png');
    expect(png.length).toBeGreaterThan(1000);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
  });
});
