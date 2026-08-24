// STORY-17 — Unit tests for the PURE filename sanitizer + collision suffixing.
import { describe, it, expect } from 'vitest';
import { sanitizeCardName, uniqueFilename } from '../../src/batch/filename';

describe('sanitizeCardName', () => {
  it('lowercases and collapses non-alphanumeric runs to single dashes', () => {
    expect(sanitizeCardName('Echo 2: Kodiak')).toBe('echo-2-kodiak');
    expect(sanitizeCardName('Devil Dog 4: Brick')).toBe('devil-dog-4-brick');
  });
  it('trims leading/trailing dashes', () => {
    expect(sanitizeCardName('  --Goliath!!  ')).toBe('goliath');
  });
  it('falls back to "card" for all-punctuation names', () => {
    expect(sanitizeCardName('!!!')).toBe('card');
  });
});

describe('uniqueFilename', () => {
  it('returns a bare name on first use and suffixes collisions', () => {
    const used = new Set<string>();
    expect(uniqueFilename('goliath', used)).toBe('goliath.png');
    expect(uniqueFilename('goliath', used)).toBe('goliath-2.png');
    expect(uniqueFilename('goliath', used)).toBe('goliath-3.png');
    // A different slug is unaffected.
    expect(uniqueFilename('echo-2-kodiak', used)).toBe('echo-2-kodiak.png');
  });
});
