// STORY-4 test — extract the model from the real PSD; assert the title's per-run
// styleRuns + baseline transform (spike values), each single-line field's captured
// props, the synthesized abilities field, and the loud missing-layer error.
import { describe, it, expect, beforeAll } from 'vitest';
import { readPsdBuffer } from '../src/psd/loadPsd';
import { extractModel } from '../src/psd/extractModel';
import { isAbilities, type LayerFieldModel } from '../src/psd/types';
import { EDITABLE_FIELDS } from '../src/config/editableLayers';
import { setupNapiCanvas, readCardPsdBuffer } from './helpers/napiCanvas';

beforeAll(() => setupNapiCanvas());

function buildModel() {
  return extractModel(readPsdBuffer(readCardPsdBuffer()));
}

describe('extractModel', () => {
  it('returns a field for every allow-list entry', () => {
    const model = buildModel();
    expect(model.order).toHaveLength(EDITABLE_FIELDS.length);
    for (const f of EDITABLE_FIELDS) {
      expect(model.fields[f.id]).toBeDefined();
    }
    expect(model.width).toBe(690);
    expect(model.height).toBe(1020);
  });

  it('captures the title per-run styleRuns [1@45.83, 8@37.5, 1@45.83, 8@37.5]', () => {
    const model = buildModel();
    const title = model.fields['name'] as LayerFieldModel;
    expect(title.text).toBe('IRONFIST COMMANDER');
    expect(title.font).toBe('Square721BT-BoldCondensed');
    const lengths = title.styleRuns.map((r) => r.length);
    const sizes = title.styleRuns.map((r) => r.fontSize);
    expect(lengths).toEqual([1, 8, 1, 8]);
    expect(sizes[0]).toBeCloseTo(45.83, 1);
    expect(sizes[1]).toBeCloseTo(37.5, 1);
    expect(sizes[2]).toBeCloseTo(45.83, 1);
    expect(sizes[3]).toBeCloseTo(37.5, 1);
    // Baseline anchor from the engine transform ≈ (69.63, 75.92).
    expect(title.anchor.x).toBeCloseTo(69.63, 1);
    expect(title.anchor.y).toBeCloseTo(75.92, 1);
  });

  it('captures single-line field props (text, font, size, color, position)', () => {
    const model = buildModel();
    const level = model.fields['level'] as LayerFieldModel;
    expect(level.text).toBe('4');
    expect(level.font).toBe('Square721BT-BoldCondensed');
    expect(level.fontSize).toBeGreaterThan(0);
    expect(level.color).toEqual({ r: 255, g: 255, b: 255 });
    expect(level.anchor.x).toBeGreaterThan(0);
    expect(level.anchor.y).toBeGreaterThan(0);

    const faction = model.fields['faction'] as LayerFieldModel;
    expect(faction.text).toBe('IRONWARD LEGION');
    expect(faction.font).toBe('Square721BT-RomanCondensed');
  });

  it('synthesizes the abilities field from config (no PSD layer)', () => {
    const model = buildModel();
    const ab = model.fields['abilities'];
    expect(isAbilities(ab)).toBe(true);
    if (isAbilities(ab)) {
      // Reclaimed-top interior box + text-top y=780 (191px usable height).
      expect(ab.box).toEqual({ left: 37, top: 771, right: 664, bottom: 971 });
      expect(ab.textArea).toEqual({ x: 59, y: 780, w: 583 });
      expect(ab.textBottom).toBe(971);
      expect(ab.fontSize).toBe(21);
      expect(ab.lineHeight).toBe(25);
      expect(ab.paragraphGap).toBe(6);
      expect(ab.minScale).toBe(0.7);
      expect(ab.boldFont).toBe('Square721BT-BoldCondensed');
      // Seeds up to 3 abilities: one non-empty placeholder + two empty.
      expect(ab.abilities).toHaveLength(3);
      expect(ab.abilities[0].name.length).toBeGreaterThan(0);
      expect(ab.abilities[0].body.length).toBeGreaterThan(0);
      expect(ab.abilities[1]).toEqual({ name: '', body: '' });
      expect(ab.abilities[2]).toEqual({ name: '', body: '' });
    }
  });

  it('is plain/serializable (survives JSON round-trip)', () => {
    const model = buildModel();
    const round = JSON.parse(JSON.stringify(model));
    expect(round.fields['name'].text).toBe('IRONFIST COMMANDER');
  });

  it('seeds the authored armorBars control at the default 8 (STORY-15)', () => {
    const model = buildModel();
    // Authored numeric — not a field entry, so it must NOT appear in order/fields.
    expect(model.armorBars).toBe(8);
    expect(model.order).not.toContain('armorBars');
    expect(model.fields['armorBars']).toBeUndefined();
  });

  it('throws loudly when an allow-list layer name is missing', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const bogus = [
      { id: 'ghost', layerName: 'NoSuchLayer', label: 'Ghost', kind: 'single-line' as const },
    ];
    expect(() => extractModel(psd, bogus)).toThrow(/NoSuchLayer/);
  });
});
