// STORY-17 — SMOKE test: map a single representative Hero row ("Goliath") and render it
// through the SHARED production pipeline (napi canvas + real fonts + bake + renderCard) to
// a PNG buffer. Proves the batch wiring end-to-end without the slow full 50-card run.
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

describe('batch smoke render (Goliath)', () => {
  it('maps and renders one Hero row to a non-empty PNG buffer', () => {
    setupNapiCanvas();
    const psd = readPsdBuffer(readCardPsdBuffer());
    const model = extractModel(psd);
    const background = bakeBackground(psd, { createCanvas: (w, h) => createCanvas(w, h) as any });

    const { card, errors } = mapRow(goliathRow, '"Goliath"');
    expect(errors).toEqual([]);
    expect(card).not.toBeNull();

    const values = { ...seedValues(model), ...card!.values };
    const canvas = createCanvas(model.width, model.height) as any;
    renderCard(canvas.getContext('2d'), background, model, values);

    const png = canvas.toBuffer('image/png');
    expect(png.length).toBeGreaterThan(1000); // a real PNG, not an empty blit
    // PNG magic number sanity check.
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
  });
});
