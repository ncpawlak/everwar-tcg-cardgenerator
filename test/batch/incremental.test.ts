// STORY-18a — Tests for the PURE incremental-diff planner. Cards are built by feeding
// spreadsheet-shaped rows through the real `mapRow` (so normalization/noise is exercised
// exactly as production does), then diffed against a prior manifest and an existing-file set.
import { describe, it, expect } from 'vitest';
import { mapRow, type RawRow, type MappedCard, type CardManifest } from '../../src/batch/mapRow';
import {
  planIncremental,
  validatePriorManifest,
  type ManifestEntry,
} from '../../src/batch/incremental';

/** A valid Hero row; override any cell for a specific case. */
function heroRow(over: Partial<Record<string, unknown>> = {}): RawRow {
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
    'Ability 1': 'Iron Wall: Reduce damage by half.',
    'Ability 2': '',
    'Ability 3': '',
    ...over,
  };
}

/** Map a row (throwing on any mapping error — tests use valid rows). */
function card(over: Partial<Record<string, unknown>> = {}): MappedCard {
  const { card: c, errors } = mapRow(heroRow(over), 'test');
  if (!c) throw new Error(`unexpected mapping errors: ${errors.join('; ')}`);
  return c;
}

/** Build a prior manifest entry from a card's manifest + a filename. */
function entry(m: CardManifest, file: string): ManifestEntry {
  return { ...m, file };
}

describe('validatePriorManifest', () => {
  it('returns [] for null (no baseline)', () => {
    expect(validatePriorManifest(null)).toEqual([]);
  });
  it('throws on a non-array', () => {
    expect(() => validatePriorManifest({})).toThrow(/not a JSON array/);
  });
  it('throws on a malformed entry', () => {
    expect(() => validatePriorManifest([{ name: 'x' }])).toThrow(/"file"/);
  });
  it('throws on duplicate prior names', () => {
    const g = card().manifest;
    expect(() => validatePriorManifest([entry(g, 'a.png'), entry(g, 'b.png')])).toThrow(
      /duplicate name/,
    );
  });
});

describe('planIncremental', () => {
  it('marks an identical card UNCHANGED and retains its prior file', () => {
    const c = card();
    const prior = [entry(c.manifest, 'goliath.png')];
    const plan = planIncremental([c], prior, new Set(['goliath.png']));
    expect(plan.cards).toHaveLength(1);
    expect(plan.cards[0].status).toBe('UNCHANGED');
    expect(plan.cards[0].file).toBe('goliath.png');
    expect(plan.toRender).toHaveLength(0);
    expect(plan.manifest[0].file).toBe('goliath.png');
  });

  it('ignores spreadsheet noise (float/case/whitespace) — no false change', () => {
    const prior = [entry(card().manifest, 'goliath.png')];
    // Same data expressed noisily: 240.0 float, padded/lowercase tags, "1" strings.
    const noisy = card({
      HP: 240.0,
      Level: '4.0',
      Allegiance: ' coalition ',
      SubType: 'heavy',
      Unique: '1',
      Commander: '1',
      'Ability 1': 'Iron Wall:   Reduce damage by half.  ',
    });
    const plan = planIncremental([noisy], prior, new Set(['goliath.png']));
    expect(plan.cards[0].status).toBe('UNCHANGED');
  });

  it('marks a changed field CHANGED, retains the prior file, and renders it', () => {
    const prior = [entry(card().manifest, 'goliath.png')];
    const changed = card({ HP: 999 });
    const plan = planIncremental([changed], prior, new Set(['goliath.png']));
    expect(plan.cards[0].status).toBe('CHANGED');
    expect(plan.cards[0].file).toBe('goliath.png');
    expect(plan.cards[0].manifestEntry!.hp).toBe(999);
    expect(plan.toRender.map((c) => c.name)).toEqual(['Goliath']);
    expect(plan.toArchive.map((c) => c.file)).toEqual(['goliath.png']);
  });

  it('treats a fingerprint match with a MISSING prior PNG as CHANGED (repair)', () => {
    const c = card();
    const prior = [entry(c.manifest, 'goliath.png')];
    const plan = planIncremental([c], prior, new Set()); // png not on disk
    expect(plan.cards[0].status).toBe('CHANGED');
    expect(plan.toRender).toHaveLength(1);
    expect(plan.toArchive).toHaveLength(0); // nothing to archive — the file is gone
  });

  it('marks a brand-new name NEW with a collision-safe file', () => {
    const kept = card({ Name: 'Goliath' });
    const fresh = card({ Name: 'Goliath X' }); // sanitizes to goliath-x
    const prior = [entry(kept.manifest, 'goliath.png')];
    const plan = planIncremental([kept, fresh], prior, new Set(['goliath.png']));
    const created = plan.cards.find((c) => c.name === 'Goliath X')!;
    expect(created.status).toBe('NEW');
    expect(created.file).toBe('goliath-x.png');
    expect(plan.toRender.map((c) => c.name)).toEqual(['Goliath X']);
  });

  it('does not let a NEW card steal a retained filename', () => {
    // Prior "A B" kept as a-b.png; a NEW "A-B" also sanitizes to a-b → must suffix.
    const kept = card({ Name: 'A B' });
    const fresh = card({ Name: 'A-B' });
    const prior = [entry(kept.manifest, 'a-b.png')];
    const plan = planIncremental([kept, fresh], prior, new Set(['a-b.png']));
    const created = plan.cards.find((c) => c.name === 'A-B')!;
    expect(created.status).toBe('NEW');
    expect(created.file).toBe('a-b-2.png');
  });

  it('marks a prior-only name REMOVED, archives it, and omits it from the manifest', () => {
    const stays = card({ Name: 'Goliath' });
    const gone = card({ Name: 'Retired Hero' });
    const prior = [entry(stays.manifest, 'goliath.png'), entry(gone.manifest, 'retired-hero.png')];
    const plan = planIncremental([stays], prior, new Set(['goliath.png', 'retired-hero.png']));
    const removed = plan.cards.find((c) => c.name === 'Retired Hero')!;
    expect(removed.status).toBe('REMOVED');
    expect(removed.manifestEntry).toBeNull();
    expect(plan.manifest.map((e) => e.name)).toEqual(['Goliath']);
    expect(plan.toArchive.map((c) => c.file)).toContain('retired-hero.png');
  });

  it('treats a rename as REMOVED(old) + NEW(new)', () => {
    const renamed = card({ Name: 'Goliath Prime' });
    const prior = [entry(card({ Name: 'Goliath' }).manifest, 'goliath.png')];
    const plan = planIncremental([renamed], prior, new Set(['goliath.png']));
    const statuses = Object.fromEntries(plan.cards.map((c) => [c.name, c.status]));
    expect(statuses['Goliath']).toBe('REMOVED');
    expect(statuses['Goliath Prime']).toBe('NEW');
  });

  it('throws on duplicate current names', () => {
    const a = card({ Name: 'Dup' });
    const b = card({ Name: 'Dup' });
    expect(() => planIncremental([a, b], null, new Set())).toThrow(/duplicate Hero name/);
  });

  it('with no prior manifest, every card is NEW (full render)', () => {
    const cards = [card({ Name: 'Alpha' }), card({ Name: 'Bravo' })];
    const plan = planIncremental(cards, null, new Set());
    expect(plan.cards.every((c) => c.status === 'NEW')).toBe(true);
    expect(plan.toRender).toHaveLength(2);
    // Manifest sorted by name; NEW filenames allocated in that order.
    expect(plan.manifest.map((e) => e.name)).toEqual(['Alpha', 'Bravo']);
    expect(plan.manifest.map((e) => e.file)).toEqual(['alpha.png', 'bravo.png']);
  });
});
