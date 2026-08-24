// STORY-8 test — abilities word-wrap is a PURE function taking an injected measurer.
// Stub measurer treats each char as a fixed width so line breaks are deterministic.
import { describe, it, expect } from 'vitest';
import { wrapText } from '../src/render/wrapText';

const FONT = '21px "Square721BT-RomanCondensed"';
const CHAR_W = 10;
// Deterministic measurer: width = charCount * CHAR_W (font-independent for the test).
const measure = (text: string, _font: string) => text.length * CHAR_W;

describe('wrapText', () => {
  it('wraps on word boundaries; no line exceeds the padded width', () => {
    // maxWidth 60 => 6 chars per line. "aaa bbb ccc" => "aaa bbb"(7) too wide → wraps.
    const lines = wrapText('aaa bbb ccc', {
      x: 59,
      y: 824,
      maxWidth: 60,
      lineHeight: 25,
      maxBottom: 968,
      font: FONT,
      measure,
    });
    for (const ln of lines) expect(measure(ln.text, FONT)).toBeLessThanOrEqual(60);
    expect(lines.map((l) => l.text)).toEqual(['aaa', 'bbb', 'ccc']);
    // y advances by lineHeight from the start y.
    expect(lines[0].y).toBe(824);
    expect(lines[1].y).toBe(849);
    expect(lines.every((l) => l.x === 59)).toBe(true);
  });

  it('clips lines that would overflow the box bottom (never drawn below it)', () => {
    // Start y=824, lineHeight=25, maxBottom=900 → only lines with y+lineHeight<=900.
    // Allowed ys: 824 (849<=900 ✓), 849 (874<=900 ✓), 874 (899<=900 ✓), 899 (924>900 ✗)
    const lines = wrapText('a b c d e f', {
      x: 0,
      y: 824,
      maxWidth: 10, // one char per line
      lineHeight: 25,
      maxBottom: 900,
      font: FONT,
      measure,
    });
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l.y + 25).toBeLessThanOrEqual(900);
  });

  it('returns no lines for empty input', () => {
    const lines = wrapText('', {
      x: 0,
      y: 824,
      maxWidth: 583,
      lineHeight: 25,
      maxBottom: 968,
      font: FONT,
      measure,
    });
    expect(lines).toEqual([]);
  });

  it('hard-breaks a single over-long word without infinite looping', () => {
    // Word of 10 chars, maxWidth = 30 (3 chars). Must split into chunks, not hang.
    const lines = wrapText('abcdefghij', {
      x: 0,
      y: 0,
      maxWidth: 30,
      lineHeight: 10,
      maxBottom: 1000,
      font: FONT,
      measure,
    });
    expect(lines.length).toBeGreaterThan(1);
    for (const ln of lines) expect(measure(ln.text, FONT)).toBeLessThanOrEqual(30);
    // No characters lost.
    expect(lines.map((l) => l.text).join('')).toBe('abcdefghij');
  });
});
