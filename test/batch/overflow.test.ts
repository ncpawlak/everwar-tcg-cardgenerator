// STORY-17 — Unit tests for the PURE abilities-overflow detector. A synthetic fixed-width
// measurer stands in for a real canvas (10px per character), so this is fully offline.
import { describe, it, expect } from 'vitest';
import { detectAbilitiesOverflow } from '../../src/batch/overflow';
import type { AbilitiesFieldModel, Ability } from '../../src/psd/types';

/** Production-geometry abilities field (reclaimed top y780, 191px usable box). */
const field: AbilitiesFieldModel = {
  id: 'abilities',
  kind: 'abilities',
  abilities: [],
  font: 'Roman',
  boldFont: 'Bold',
  fontSize: 21,
  lineHeight: 25,
  paragraphGap: 6,
  minScale: 0.7,
  color: { r: 255, g: 255, b: 255 },
  box: { left: 37, top: 808, right: 664, bottom: 968 },
  textArea: { x: 59, y: 780, w: 583 },
  textBottom: 971,
};

/** Deterministic measurer: every glyph is 10px wide, ignoring the font string. */
const measure = (text: string): number => text.length * 10;

describe('detectAbilitiesOverflow', () => {
  it('reports no overflow for empty abilities', () => {
    const abilities: Ability[] = [
      { name: '', body: '' },
      { name: '', body: '' },
      { name: '', body: '' },
    ];
    const r = detectAbilitiesOverflow(abilities, field, measure);
    expect(r.overflow).toBe(false);
    expect(r.clippedAbilityIndex).toBeUndefined();
  });

  it('reports no overflow for a short, fitting set (scale 1.0)', () => {
    const abilities: Ability[] = [
      { name: 'Iron Wall', body: 'Reduce damage by half.' },
      { name: '', body: '' },
      { name: '', body: '' },
    ];
    const r = detectAbilitiesOverflow(abilities, field, measure);
    expect(r.overflow).toBe(false);
    expect(r.scale).toBe(1);
  });

  it('reports overflow (with the offending ability index) for an over-long set', () => {
    const longBody = 'word '.repeat(300); // ~1500 chars → dozens of wrapped lines
    const abilities: Ability[] = [
      { name: 'A', body: longBody },
      { name: 'B', body: longBody },
      { name: 'C', body: longBody },
    ];
    const r = detectAbilitiesOverflow(abilities, field, measure);
    expect(r.overflow).toBe(true);
    expect(r.clippedAbilityIndex).not.toBeUndefined();
    expect(r.clippedAbilityIndex).toBeGreaterThanOrEqual(0);
  });
});
