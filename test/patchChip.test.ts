// STORY-16 test — pure row-fill median. `computeRowFill` reduces a donor row's RGBA
// samples to a single representative RGBA (per-channel median), used to reconstruct the
// rail behind a hidden chip. Pure (no canvas), so the reduction is unit-tested directly.
import { describe, it, expect } from 'vitest';
import { computeRowFill } from '../src/render/patchChip';

describe('computeRowFill', () => {
  it('returns the per-channel median for an odd sample count', () => {
    // Three RGBA pixels; median of each channel independently.
    const px = Uint8ClampedArray.from([
      10, 20, 30, 255,
      50, 60, 70, 255,
      90, 100, 110, 255,
    ]);
    expect(computeRowFill(px)).toEqual([50, 60, 70, 255]);
  });

  it('averages the two middle values for an even sample count', () => {
    const px = Uint8ClampedArray.from([
      10, 10, 10, 200,
      20, 20, 20, 220,
      30, 30, 30, 240,
      40, 40, 40, 255,
    ]);
    // Even count → mean of the two middle order-statistics: (20+30)/2 = 25, alpha (220+240)/2=230.
    expect(computeRowFill(px)).toEqual([25, 25, 25, 230]);
  });

  it('is robust to outliers (median ignores a single bright chip pixel)', () => {
    const px = Uint8ClampedArray.from([
      40, 48, 30, 255,
      42, 50, 31, 255,
      41, 49, 30, 255,
      255, 255, 200, 255, // an ornament/highlight outlier
      43, 51, 32, 255,
    ]);
    const [r, g, b] = computeRowFill(px);
    // Median lands in the rail-olive cluster, not near the bright outlier.
    expect(r).toBeLessThan(60);
    expect(g).toBeLessThan(70);
    expect(b).toBeLessThan(50);
  });

  it('throws on an empty row (no samples to reduce)', () => {
    expect(() => computeRowFill(new Uint8ClampedArray(0))).toThrow();
  });
});
