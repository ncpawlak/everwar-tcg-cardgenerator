// FIX-1 test — single-line shrink-to-fit is a PURE, measurer-injected computation so
// the scale/tracking math is unit-testable with no canvas. A deterministic stub
// measurer returns text.length * fontSizePx * K so widths are exact and predictable.
import { describe, it, expect } from 'vitest';
import { computeFit, layoutSingleLine, MIN_SCALE } from '../src/render/fitText';

const FAMILY = 'Square721BT-RomanCondensed';
const K = 0.5;
// Deterministic measurer: parse the px size out of the font shorthand.
const measure = (text: string, font: string) => text.length * parseFloat(font) * K;

describe('computeFit', () => {
  it('does not shrink when the text already fits', () => {
    const fit = computeFit(100, 200, 10, 20);
    expect(fit.scale).toBe(1);
    expect(fit.letterSpacing).toBe(0);
  });

  it('condenses tracking first for a small overflow (no font scaling)', () => {
    // native 100 into 92 available: over=8 fits inside the tracking budget → scale 1.
    const fit = computeFit(100, 92, 10, 20);
    expect(fit.scale).toBe(1);
    expect(fit.letterSpacing).toBeLessThan(0);
  });

  it('scales the font down once tracking is exhausted', () => {
    const fit = computeFit(100, 80, 10, 20);
    expect(fit.scale).toBeLessThan(1);
    expect(fit.scale).toBeGreaterThan(MIN_SCALE);
    expect(fit.letterSpacing).toBeLessThan(0);
  });

  it('never scales below the readability floor', () => {
    const fit = computeFit(400, 100, 40, 20);
    expect(fit.scale).toBe(MIN_SCALE);
  });
});

describe('layoutSingleLine', () => {
  it('leaves normal text untouched (no shrink)', () => {
    const out = layoutSingleLine('AB', FAMILY, 20, 100, measure);
    expect(out.shrink).toBe(false);
    expect(out.scale).toBe(1);
    expect(out.letterSpacing).toBe(0);
    expect(out.fontSize).toBe(20);
    expect(out.font).toBe('20px "Square721BT-RomanCondensed"');
  });

  it('shrinks overly-long text so the final width fits the available width', () => {
    // 10 chars @20px → native 100; into 80 available (past the tracking budget).
    const out = layoutSingleLine('ABCDEFGHIJ', FAMILY, 20, 80, measure);
    expect(out.shrink).toBe(true);
    expect(out.scale).toBeGreaterThan(MIN_SCALE);
    expect(out.scale).toBeLessThan(1);
    expect(out.fittedWidth).toBeLessThanOrEqual(80 + 1e-6);
  });

  it('condenses via tracking alone for a small overflow, keeping the font size', () => {
    const out = layoutSingleLine('ABCDEFGHIJ', FAMILY, 20, 92, measure);
    expect(out.shrink).toBe(true);
    expect(out.scale).toBe(1);
    expect(out.letterSpacing).toBeLessThan(0);
    expect(out.fittedWidth).toBeLessThanOrEqual(92 + 1e-6);
  });

  it('clamps at the readability floor for absurdly long text (may still overflow)', () => {
    const out = layoutSingleLine('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN', FAMILY, 20, 100, measure);
    expect(out.shrink).toBe(true);
    expect(out.scale).toBe(MIN_SCALE);
  });
});
