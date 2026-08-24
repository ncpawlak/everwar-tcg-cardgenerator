// STORY-15 test — armor-bar config constants (single source of truth for the bar's
// geometry). These are MEASURED from the PSD, so pin the values that the layout math and
// the bake patch depend on; a silent edit here would shift the whole bar.
import { describe, it, expect } from 'vitest';
import {
  ARMOR_BAR_TRACK,
  ARMOR_BAR_FILL,
  ARMOR_BAR_GAP_PX,
  ARMOR_BARS_MAX,
  ARMOR_BARS_DEFAULT,
  ARMOR_BAR_PATCH,
  ARMOR_BAR_COLORS,
} from '../src/config/armorBar';

describe('armorBar config', () => {
  it('pins the measured track + fill geometry (H=174, fill 1px inset)', () => {
    expect(ARMOR_BAR_TRACK).toEqual({ left: 599, top: 351, right: 629, bottom: 525 });
    expect(ARMOR_BAR_TRACK.bottom - ARMOR_BAR_TRACK.top).toBe(174);
    // Fill is inset 1px from the track's left (x=599 stays as an edge rim).
    expect(ARMOR_BAR_FILL).toEqual({ left: 600, top: 351, right: 629, bottom: 525 });
  });

  it('pins the gap, cap, default and bake-patch rect', () => {
    expect(ARMOR_BAR_GAP_PX).toBe(2);
    expect(ARMOR_BARS_MAX).toBe(8);
    expect(ARMOR_BARS_DEFAULT).toBe(8);
    // Patch covers exactly the baked-green channel.
    expect(ARMOR_BAR_PATCH).toEqual({ left: 599, top: 351, right: 629, bottom: 525 });
  });

  it('exposes the beveled green + empty-recess colours', () => {
    expect(ARMOR_BAR_COLORS.segTop).toBe('rgb(202,242,99)');
    expect(ARMOR_BAR_COLORS.segMid).toBe('rgb(136,167,66)');
    expect(ARMOR_BAR_COLORS.emptyInner).toBe('rgb(24,25,22)');
  });
});
