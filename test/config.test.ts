// STORY-2 test — the editable-layer allow-list is the single source of truth for
// "what is editable". Assert its shape, ordering, uniqueness, kinds, and the
// abilities box geometry constants (spec §3, §4.3).
import { describe, it, expect } from 'vitest';
import {
  EDITABLE_FIELDS,
  ABILITIES_FIELD,
  ABILITIES_BOX,
  ABILITIES_TEXT_AREA,
  EDITABLE_LAYER_NAMES,
} from '../src/config/editableLayers';

describe('editableLayers config', () => {
  it('defines exactly 10 fields (9 name-mapped + 1 abilities) in spec order', () => {
    expect(EDITABLE_FIELDS).toHaveLength(10);
    const layerNames = EDITABLE_FIELDS.slice(0, 9).map((f) => f.layerName);
    expect(layerNames).toEqual([
      'Name text',
      '4',
      '40',
      '25',
      '30',
      '75',
      'INFANTRY',
      'IRONWARD LEGION',
      'HUMAN',
    ]);
  });

  it('has unique, stable field ids', () => {
    const ids = EDITABLE_FIELDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('classifies title, abilities, and single-line kinds correctly', () => {
    const byId = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.id, f]));
    expect(byId['name'].kind).toBe('title');
    expect(byId['abilities'].kind).toBe('abilities');
    // Every other field is a plain single-line value.
    const singles = EDITABLE_FIELDS.filter(
      (f) => f.kind !== 'title' && f.kind !== 'abilities',
    );
    expect(singles).toHaveLength(8);
    for (const f of singles) expect(f.kind).toBe('single-line');
  });

  it('the abilities field carries the exact box + padded-area geometry', () => {
    expect(ABILITIES_FIELD.kind).toBe('abilities');
    expect(ABILITIES_FIELD.layerName).toBeNull();
    // Reclaimed-top interior box (badge removed): top 771 (below top gold border),
    // bottom 971 (above bottom gold border). Text starts at y=780 (191px usable).
    expect(ABILITIES_BOX).toEqual({ left: 37, top: 771, right: 664, bottom: 971 });
    expect(ABILITIES_TEXT_AREA).toEqual({ x: 59, y: 780, w: 583 });
    expect(ABILITIES_FIELD.font).toBe('Square721BT-RomanCondensed');
    expect(ABILITIES_FIELD.boldFont).toBe('Square721BT-BoldCondensed');
    expect(ABILITIES_FIELD.fontSize).toBe(21);
    expect(ABILITIES_FIELD.lineHeight).toBe(25);
    expect(ABILITIES_FIELD.paragraphGap).toBe(6);
    expect(ABILITIES_FIELD.minScale).toBe(0.7);
    expect(ABILITIES_FIELD.color).toEqual({ r: 255, g: 255, b: 255 });
    // Seeds up to 3 abilities: one placeholder + two empty (skipped at render).
    expect(ABILITIES_FIELD.defaultAbilities).toHaveLength(3);
    expect(ABILITIES_FIELD.defaultAbilities[0].name.length).toBeGreaterThan(0);
    expect(ABILITIES_FIELD.defaultAbilities[1]).toEqual({ name: '', body: '' });
    expect(ABILITIES_FIELD.defaultAbilities[2]).toEqual({ name: '', body: '' });
  });

  it('exposes the set of editable PSD layer names (for the bake skip-set)', () => {
    expect(EDITABLE_LAYER_NAMES.has('Name text')).toBe(true);
    expect(EDITABLE_LAYER_NAMES.has('HUMAN')).toBe(true);
    // Non-editable static labels must NOT be in the set.
    expect(EDITABLE_LAYER_NAMES.has('LEVEL')).toBe(false);
    expect(EDITABLE_LAYER_NAMES.has('ABILITIES')).toBe(false);
    expect(EDITABLE_LAYER_NAMES.size).toBe(9);
  });
});
