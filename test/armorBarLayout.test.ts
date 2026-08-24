// STORY-15 test — pure armor-bar layout. `armorBarSegments` splits the fill rect into
// N equal green segments with fixed gaps; it is measurer-free (no canvas) so the math is
// unit-tested in isolation, and it must stay defensive even if UI validation is bypassed.
import { describe, it, expect } from 'vitest';
import { armorBarSegments, coerceArmorBars } from '../src/render/armorBarLayout';
import { ARMOR_BAR_FILL } from '../src/config/armorBar';

describe('armorBarSegments', () => {
  it('N=0 → no segments (empty track)', () => {
    expect(armorBarSegments(0)).toEqual([]);
  });

  it('N=1 → one full-height segment, no gap', () => {
    const segs = armorBarSegments(1);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ x: 600, y: 351, w: 29, h: 174 });
  });

  it('N=2 → two 86px segments with a single 2px gap', () => {
    const segs = armorBarSegments(2);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ x: 600, y: 351, w: 29, h: 86 });
    // second starts after seg0 (86) + gap (2) = 439.
    expect(segs[1]).toEqual({ x: 600, y: 439, w: 29, h: 86 });
  });

  it('N=8 → eight 20px segments at the documented y-starts', () => {
    const segs = armorBarSegments(8);
    expect(segs).toHaveLength(8);
    for (const s of segs) expect(s.h).toBeCloseTo(20, 6);
    const ys = segs.map((s) => s.y);
    expect(ys).toEqual([351, 373, 395, 417, 439, 461, 483, 505]);
    // The last segment ends exactly at the track bottom (525).
    expect(segs[7].y + segs[7].h).toBeCloseTo(ARMOR_BAR_FILL.bottom, 6);
  });

  it('is defensive: negative → [], >max → clamped to max, non-integer floored', () => {
    expect(armorBarSegments(-3)).toEqual([]);
    expect(armorBarSegments(99)).toHaveLength(8); // clamped to ARMOR_BARS_MAX
    expect(armorBarSegments(2.9)).toHaveLength(2); // floored
    expect(armorBarSegments(NaN)).toEqual([]);
  });
});

describe('coerceArmorBars', () => {
  it('floors, clamps to [0,8], and accepts numeric strings', () => {
    expect(coerceArmorBars('8')).toBe(8);
    expect(coerceArmorBars('3.7')).toBe(3);
    expect(coerceArmorBars(-2)).toBe(0);
    expect(coerceArmorBars(12)).toBe(8);
    expect(coerceArmorBars('nonsense')).toBe(0);
    expect(coerceArmorBars('')).toBe(0);
  });
});
