// STORY-15 — Pure armor-bar layout. Given a segment count, return the green segment
// rectangles that fill the track. This is NOT a partial-fill meter: for ANY N>0 the
// full track height is occupied by N equal segments separated by fixed gaps (the spike's
// proven model). Kept measurer-free (no canvas) so it is unit-testable in isolation.
import {
  ARMOR_BAR_FILL,
  ARMOR_BAR_GAP_PX,
  ARMOR_BARS_MAX,
  type ArmorRect,
} from '../config/armorBar';

/** A resolved segment rectangle (card pixel coords). */
export interface ArmorSegment {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Coerce arbitrary input (number OR string from the value map) to a valid integer bar
 * count in [0, ARMOR_BARS_MAX]. Defensive so callers that bypass UI validation still get
 * a safe value: NaN/garbage → 0, negatives → 0, non-integers floored, over-cap clamped.
 */
export function coerceArmorBars(value: number | string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.min(ARMOR_BARS_MAX, Math.max(0, Math.floor(n)));
}

/**
 * Compute the green segment rects for `armorBars`. Defaults to the config fill rect and
 * gap; both are injectable for testing. Returns [] for 0 (empty track). The gap collapses
 * to 0 when N===1 so a single bar fills the whole track with no divider.
 */
export function armorBarSegments(
  armorBars: number,
  track: ArmorRect = ARMOR_BAR_FILL,
  gap: number = ARMOR_BAR_GAP_PX,
): ArmorSegment[] {
  const N = coerceArmorBars(armorBars);
  if (N <= 0) return [];

  const height = track.bottom - track.top;
  const width = track.right - track.left;
  // No divider gap for a single segment; otherwise N-1 gaps between N segments.
  const g = N === 1 ? 0 : gap;
  const segmentHeight = (height - (N - 1) * g) / N;

  // Stack top-to-bottom; each segment advances by its height + one gap.
  return Array.from({ length: N }, (_, i) => ({
    x: track.left,
    y: track.top + i * (segmentHeight + g),
    w: width,
    h: segmentHeight,
  }));
}
