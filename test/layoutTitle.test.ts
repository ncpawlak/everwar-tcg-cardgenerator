// STORY-7 test — title layout is a PURE function taking an injected measurer, so the
// faux small-caps advance math is unit-testable with no canvas. Stub measurer returns
// text.length * fontSizePx * k so widths are deterministic.
import { describe, it, expect } from 'vitest';
import { layoutTitle } from '../src/render/layoutTitle';
import { titleAvailableWidth } from '../src/render/fitText';
import type { StyleRun } from '../src/psd/types';

const FAMILY = 'Square721BT-BoldCondensed';
const ANCHOR = { x: 69.63, y: 75.92 };
const K = 0.5;
// Deterministic measurer: parses the px size out of the font string.
const measure = (text: string, font: string) => text.length * parseFloat(font) * K;

describe('layoutTitle', () => {
  it('produces 4 positioned ops for the real title runs with correct substrings', () => {
    const runs: StyleRun[] = [
      { length: 1, fontSize: 45.83 },
      { length: 8, fontSize: 37.5 },
      { length: 1, fontSize: 45.83 },
      { length: 8, fontSize: 37.5 },
    ];
    const ops = layoutTitle('IRONFIST COMMANDER', runs, FAMILY, ANCHOR, measure);
    expect(ops.map((o) => o.text)).toEqual(['I', 'RONFIST ', 'C', 'OMMANDER']);
    // All ops share the baseline y.
    for (const o of ops) expect(o.y).toBe(ANCHOR.y);
    // x is monotonically increasing.
    for (let i = 1; i < ops.length; i++) expect(ops[i].x).toBeGreaterThan(ops[i - 1].x);
    // Cumulative x math: each op's x = anchor + sum of prior measured widths.
    let x = ANCHOR.x;
    for (const o of ops) {
      expect(o.x).toBeCloseTo(x, 5);
      x += measure(o.text, o.font);
    }
  });

  it('re-segments arbitrary edited text via the small-caps rule (first glyph large)', () => {
    // styleRuns whose lengths do not match the new text → regenerate small-caps runs.
    const runs: StyleRun[] = [
      { length: 1, fontSize: 45.83 },
      { length: 8, fontSize: 37.5 },
    ];
    const ops = layoutTitle('AB CD', runs, FAMILY, ANCHOR, measure);
    // Expect: 'A'(big) 'B'(small) ' '(small) 'C'(big) 'D'(small)
    expect(ops.map((o) => o.text)).toEqual(['A', 'B', ' ', 'C', 'D']);
    expect(parseFloat(ops[0].font)).toBeCloseTo(45.83, 1);
    expect(parseFloat(ops[1].font)).toBeCloseTo(37.5, 1);
    expect(parseFloat(ops[3].font)).toBeCloseTo(45.83, 1);
  });

  // STORY-16b — true small-caps: edited titles render ALL-CAPS automatically, with only
  // the first glyph of each word larger. Both the big initial and the small tail are
  // uppercased; whitespace tokens are untouched.
  it('uppercases edited titles (true small-caps) for both the initial and the tail', () => {
    // Runs that do NOT cover either edited title length → force the small-caps path.
    const runs: StyleRun[] = [
      { length: 1, fontSize: 45.83 },
      { length: 4, fontSize: 37.5 },
    ];
    // Single lowercase-containing word: "Goliath" → 'G'(big) + 'OLIATH'(small).
    const one = layoutTitle('Goliath', runs, FAMILY, ANCHOR, measure);
    expect(one.map((o) => o.text)).toEqual(['G', 'OLIATH']);
    expect(parseFloat(one[0].font)).toBeCloseTo(45.83, 1); // big initial
    expect(parseFloat(one[1].font)).toBeCloseTo(37.5, 1); // small tail
    // Multi-word: "Devil Dog" → 'D','EVIL',' ','D','OG', each initial big, tails small.
    const two = layoutTitle('Devil Dog', runs, FAMILY, ANCHOR, measure);
    expect(two.map((o) => o.text)).toEqual(['D', 'EVIL', ' ', 'D', 'OG']);
    // Whitespace token is preserved verbatim.
    expect(two[2].text).toBe(' ');
    // Small-caps size invariant still holds (initial run larger than the body run).
    expect(parseFloat(two[0].font)).toBeGreaterThan(parseFloat(two[1].font));
  });

  it('handles a single word', () => {
    const runs: StyleRun[] = [{ length: 1, fontSize: 45.83 }];
    const ops = layoutTitle('X', runs, FAMILY, ANCHOR, measure);
    expect(ops.map((o) => o.text)).toEqual(['X']);
    expect(ops[0].x).toBeCloseTo(ANCHOR.x, 5);
  });

  it('returns no ops for empty text', () => {
    const ops = layoutTitle('', [], FAMILY, ANCHOR, measure);
    expect(ops).toEqual([]);
  });

  // FIX-1 — shrink-to-fit for edited titles.
  it('shrinks an over-long edited title to fit the available width', () => {
    const runs: StyleRun[] = [
      { length: 1, fontSize: 45.83 },
      { length: 8, fontSize: 37.5 },
    ];
    const available = 80; // deliberately narrower than the native width
    const ops = layoutTitle('AB CD', runs, FAMILY, ANCHOR, measure, available);
    // Final advance (last op start + its width) must fit within the available width.
    const last = ops[ops.length - 1];
    const totalWidth = last.x - ANCHOR.x + measure(last.text, last.font);
    expect(totalWidth).toBeLessThanOrEqual(available + 1e-6);
  });

  it('preserves the small-caps size ratio when shrinking', () => {
    const runs: StyleRun[] = [
      { length: 1, fontSize: 45.83 },
      { length: 8, fontSize: 37.5 },
    ];
    const ops = layoutTitle('AB CD', runs, FAMILY, ANCHOR, measure, 80);
    // ops: A(big) B(small) ' '(small) C(big) D(small)
    const big = parseFloat(ops[0].font);
    const small = parseFloat(ops[1].font);
    expect(big).toBeLessThan(45.83); // actually shrank
    // Ratio between the two run sizes is unchanged from the authored 45.83 / 37.5.
    expect(big / small).toBeCloseTo(45.83 / 37.5, 5);
  });

  it('never shrinks the authored PSD title even under a tiny available width', () => {
    // Runs exactly cover the text (original title) → authored sizes are preserved.
    const runs: StyleRun[] = [
      { length: 1, fontSize: 45.83 },
      { length: 8, fontSize: 37.5 },
      { length: 1, fontSize: 45.83 },
      { length: 8, fontSize: 37.5 },
    ];
    const ops = layoutTitle('IRONFIST COMMANDER', runs, FAMILY, ANCHOR, measure, 10);
    expect(parseFloat(ops[0].font)).toBeCloseTo(45.83, 2);
    expect(parseFloat(ops[1].font)).toBeCloseTo(37.5, 2);
  });

  // Title-bar-width fix — the title fits against the black bar width, not ink bounds.
  it('renders a medium edited title within the bar at native size (scale = 1)', () => {
    const runs: StyleRun[] = [
      { length: 1, fontSize: 45.83 },
      { length: 8, fontSize: 37.5 },
    ];
    const avail = titleAvailableWidth(ANCHOR.x); // ≈ 442.37 (bar-based)
    // "IRON WAR" native width via the stub measurer ≈ 158px — well within the bar.
    const ops = layoutTitle('IRON WAR', runs, FAMILY, ANCHOR, measure, avail);
    // No shrink: the big/small runs keep their authored sizes.
    expect(parseFloat(ops[0].font)).toBeCloseTo(45.83, 2); // 'I' big cap
    expect(parseFloat(ops[1].font)).toBeCloseTo(37.5, 2); // 'RON' small
  });

  it('still shrinks an extreme title to fit the bar width', () => {
    const runs: StyleRun[] = [
      { length: 1, fontSize: 45.83 },
      { length: 8, fontSize: 37.5 },
    ];
    const avail = titleAvailableWidth(ANCHOR.x); // ≈ 442.37
    // 24-char single word: native ≈ 454px > bar → must shrink to fit.
    const ops = layoutTitle('AAAAAAAAAAAAAAAAAAAAAAAA', runs, FAMILY, ANCHOR, measure, avail);
    expect(parseFloat(ops[0].font)).toBeLessThan(45.83); // actually shrank
    const last = ops[ops.length - 1];
    const totalWidth = last.x - ANCHOR.x + measure(last.text, last.font);
    expect(totalWidth).toBeLessThanOrEqual(avail + 1e-6);
  });
});
