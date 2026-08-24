// STORY-14 test — the abilities block layout is a PURE function of the abilities list +
// an injected measurer. A deterministic stub measurer makes widths font- and
// size-proportional (bold glyphs wider than roman) so mixed-weight measuring, wrapping,
// paragraph gaps, the reclaimed text-top, whole-line clipping, and the shrink-to-fit
// fallback are all assertable without a real canvas.
import { describe, it, expect } from 'vitest';
import { layoutAbilities, type AbilitiesLayoutOptions } from '../src/render/abilitiesLayout';
import { ABILITIES_TEXT_AREA, ABILITIES_TEXT_BOTTOM } from '../src/config/editableLayers';

// width = charCount * fontSize * perChar; bold is wider than roman. Size is parsed from
// the font shorthand so shrinking the font shrinks measured widths proportionally.
const measure = (text: string, font: string): number => {
  const size = parseFloat(font) || 21;
  const perChar = /Bold/.test(font) ? 0.6 : 0.5;
  return text.length * size * perChar;
};

// Base options mirroring the production geometry (reclaimed top y=780, bottom 971).
function opts(over: Partial<AbilitiesLayoutOptions> = {}): AbilitiesLayoutOptions {
  return {
    x: 59,
    textTop: 780,
    maxWidth: 583,
    textBottom: 971,
    fontSize: 21,
    lineHeight: 25,
    paragraphGap: 6,
    boldFamily: 'Square721BT-BoldCondensed',
    romanFamily: 'Square721BT-RomanCondensed',
    minScale: 0.7,
    measure,
    ...over,
  };
}

describe('layoutAbilities', () => {
  it('places the first line at the reclaimed text-top (y=780)', () => {
    // Guards against regressing the reclaimed-top constant: first line sits at textTop.
    expect(ABILITIES_TEXT_AREA.y).toBe(780);
    expect(ABILITIES_TEXT_BOTTOM).toBe(971);
    const layout = layoutAbilities([{ name: 'A', body: 'b c' }], opts());
    expect(layout.lines[0].y).toBe(780);
  });

  it('renders a bold name prefix then regular body inline; bold measured with bold metrics', () => {
    const layout = layoutAbilities([{ name: 'Rally', body: 'a b c' }], opts({ maxWidth: 100000 }));
    expect(layout.lines).toHaveLength(1);
    const segs = layout.lines[0].segments;
    // Segment 0 is the bold "Rally:" prefix; the body words are regular.
    expect(segs[0].text).toBe('Rally:');
    expect(segs[0].font).toContain('Square721BT-BoldCondensed');
    expect(segs[1].text).toBe('a');
    expect(segs[1].font).toContain('Square721BT-RomanCondensed');
    // The first body word's x depends on the BOLD width of "Rally:" (+ one space),
    // proving the prefix is measured with bold, not roman, metrics.
    const boldFont = segs[0].font;
    const romanFont = segs[1].font;
    const expectedX = 59 + measure('Rally:', boldFont) + measure(' ', romanFont);
    expect(segs[1].x).toBeCloseTo(expectedX, 5);
  });

  it('wraps across lines; continuation words stay regular weight', () => {
    // Narrow width forces the body to wrap onto a second line.
    const layout = layoutAbilities(
      [{ name: 'N', body: 'alpha beta gamma delta epsilon' }],
      opts({ maxWidth: 120 }),
    );
    expect(layout.lines.length).toBeGreaterThan(1);
    // Every wrapped line stays within the width.
    for (const line of layout.lines) {
      const right = line.segments.reduce(
        (max, s) => Math.max(max, s.x + measure(s.text, s.font)),
        0,
      );
      expect(right).toBeLessThanOrEqual(59 + 120 + 0.5);
    }
    // The second line's words are body → regular.
    expect(layout.lines[1].segments[0].font).toContain('RomanCondensed');
  });

  it('3 abilities fit at native size (scale 1.0, nothing clipped) with paragraph gaps', () => {
    const abilities = [
      { name: 'One', body: 'aa bb cc' },
      { name: 'Two', body: 'dd ee ff' },
      { name: 'Three', body: 'gg hh ii' },
    ];
    // Wide enough for one line each → 3 lines + 2 gaps = 3*25 + 2*6 = 87 <= 191.
    const layout = layoutAbilities(abilities, opts({ maxWidth: 100000 }));
    expect(layout.scale).toBe(1);
    expect(layout.clipped).toBe(false);
    expect(layout.lines).toHaveLength(3);
    // Gap inserted between paragraphs: line 2 y = 780 + 25 + 6.
    expect(layout.lines[1].y).toBe(780 + 25 + 6);
  });

  it('skips empty ability pairs entirely (no line, no gap)', () => {
    const layout = layoutAbilities(
      [
        { name: 'A', body: 'x' },
        { name: '', body: '' },
        { name: 'B', body: 'y' },
      ],
      opts({ maxWidth: 100000 }),
    );
    expect(layout.lines).toHaveLength(2);
    // Only ONE gap between the two rendered abilities (the empty one added nothing).
    expect(layout.lines[1].y).toBe(780 + 25 + 6);
  });

  it('produces no output for an all-empty abilities list', () => {
    const layout = layoutAbilities(
      [
        { name: '', body: '' },
        { name: '  ', body: '' },
      ],
      opts(),
    );
    expect(layout.lines).toEqual([]);
    expect(layout.clipped).toBe(false);
  });

  it('shrinks the block (scale < 1) when it overflows, and still fits without clipping', () => {
    // One single line (25px native) into a 20px usable height forces a shrink to 0.8.
    const layout = layoutAbilities(
      [{ name: 'X', body: 'short' }],
      opts({ maxWidth: 100000, textTop: 0, textBottom: 20 }),
    );
    expect(layout.scale).toBeLessThan(1);
    expect(layout.scale).toBeGreaterThanOrEqual(0.7);
    expect(layout.clipped).toBe(false);
    expect(layout.lines).toHaveLength(1);
    // Fits within the box after shrinking.
    expect(layout.lines[0].y + layout.lineHeight).toBeLessThanOrEqual(20 + 0.5);
  });

  it('clips whole lines past the bottom when even the floor scale cannot fit', () => {
    // 25px native, floor 0.7 → 17.5px, into a 10px box → nothing fits: clipped, no lines.
    const layout = layoutAbilities(
      [{ name: 'X', body: 'short' }],
      opts({ maxWidth: 100000, textTop: 0, textBottom: 10 }),
    );
    expect(layout.scale).toBe(0.7);
    expect(layout.clipped).toBe(true);
    expect(layout.lines).toHaveLength(0);
  });
});
