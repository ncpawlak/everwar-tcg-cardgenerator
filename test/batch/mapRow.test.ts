// STORY-17 — Unit tests for the PURE batch row-mapping helpers. No fs/canvas.
import { describe, it, expect } from 'vitest';
import {
  isHeroRow,
  coerceStatInt,
  upperTag,
  coerceBool01,
  splitAbilityCell,
  mapRow,
  type RawRow,
} from '../../src/batch/mapRow';

/** A fully-valid Hero row used as a baseline; individual tests mutate a copy. */
function goodRow(): RawRow {
  return {
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
    'Ability 1': 'Heavy Suppression: Enemy heroes get -20 ACC.',
    'Ability 2': '',
    'Ability 3': '',
  };
}

describe('isHeroRow', () => {
  it('matches "Hero" case-insensitively with surrounding whitespace', () => {
    expect(isHeroRow({ Type: '  hero ' })).toBe(true);
    expect(isHeroRow({ Type: 'HERO' })).toBe(true);
  });
  it('rejects non-Hero types', () => {
    expect(isHeroRow({ Type: 'Unit' })).toBe(false);
    expect(isHeroRow({ Type: '' })).toBe(false);
    expect(isHeroRow({})).toBe(false);
  });
});

describe('coerceStatInt', () => {
  it('rounds a float to an integer string', () => {
    expect(coerceStatInt(240.0, 'HP')).toBe('240');
    expect(coerceStatInt('4.6', 'Level')).toBe('5');
  });
  it('fails loud on missing/blank', () => {
    expect(() => coerceStatInt('', 'HP')).toThrow(/HP is missing/);
    expect(() => coerceStatInt(undefined, 'HP')).toThrow(/HP is missing/);
  });
  it('fails loud on non-numeric', () => {
    expect(() => coerceStatInt('abc', 'DMG')).toThrow(/DMG is not numeric/);
  });
});

describe('upperTag', () => {
  it('trims and uppercases', () => {
    expect(upperTag(' Heavy ')).toBe('HEAVY');
    expect(upperTag('Coalition')).toBe('COALITION');
  });
});

describe('coerceBool01', () => {
  it('maps 1→true and 0→false as value strings', () => {
    expect(coerceBool01(1, 'Unique')).toBe('true');
    expect(coerceBool01('0', 'Commander')).toBe('false');
  });
  it('fails loud on missing or out-of-domain', () => {
    expect(() => coerceBool01('', 'Unique')).toThrow(/missing/);
    expect(() => coerceBool01(2, 'Unique')).toThrow(/must be 0 or 1/);
  });
});

describe('splitAbilityCell', () => {
  it('splits on the FIRST colon into trimmed name + body', () => {
    expect(splitAbilityCell('Iron Wall: Reduce damage: by half.', 'Ability 1')).toEqual({
      name: 'Iron Wall',
      body: 'Reduce damage: by half.',
    });
  });
  it('returns null for an empty cell', () => {
    expect(splitAbilityCell('', 'Ability 2')).toBeNull();
    expect(splitAbilityCell('   ', 'Ability 2')).toBeNull();
  });
  it('fails loud when a non-empty cell has no colon', () => {
    expect(() => splitAbilityCell('No splitter here', 'Ability 3')).toThrow(/no ":" splitter/);
  });
});

describe('mapRow', () => {
  it('maps a valid Hero row to values + manifest', () => {
    const { card, errors } = mapRow(goodRow(), '"Goliath"');
    expect(errors).toEqual([]);
    expect(card).not.toBeNull();
    expect(card!.values).toMatchObject({
      name: 'Goliath',
      level: '4',
      hp: '240',
      dmg: '60',
      acc: '80',
      armor: '20',
      armorBars: '2',
      unitType: 'HEAVY',
      faction: 'COALITION',
      species: 'HUMAN',
      unique: 'true',
      commander: 'true',
      'ability1-name': 'Heavy Suppression',
      'ability1-body': 'Enemy heroes get -20 ACC.',
      'ability2-name': '',
      'ability3-name': '',
    });
    expect(card!.manifest.abilities).toEqual([
      { name: 'Heavy Suppression', body: 'Enemy heroes get -20 ACC.' },
    ]);
    expect(card!.manifest.commander).toBe(true);
    expect(card!.manifest.unique).toBe(true);
  });

  it('clamps Armor Bars to [0,8]', () => {
    const row = goodRow();
    row['Armor Bars'] = 12;
    expect(mapRow(row, 'x').card!.values.armorBars).toBe('8');
    row['Armor Bars'] = -3;
    expect(mapRow(row, 'x').card!.values.armorBars).toBe('0');
  });

  it('collects ALL field errors for a bad row and returns card=null', () => {
    const row = goodRow();
    row.Name = '';
    row.HP = 'oops';
    row.Unique = 5;
    row['Ability 1'] = 'missing colon';
    const { card, errors } = mapRow(row, '(row)');
    expect(card).toBeNull();
    // Every independent problem is reported, not just the first.
    expect(errors.length).toBe(4);
    expect(errors.join('\n')).toMatch(/Name is missing/);
    expect(errors.join('\n')).toMatch(/HP is not numeric/);
    expect(errors.join('\n')).toMatch(/Unique must be 0 or 1/);
    expect(errors.join('\n')).toMatch(/no ":" splitter/);
  });
});
