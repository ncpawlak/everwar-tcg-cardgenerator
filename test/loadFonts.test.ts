// STORY-5 test (@vitest-environment jsdom) — font loading must register both
// families and FAIL LOUDLY on a bad font file. FontFace/document.fonts are mocked
// via injected deps (jsdom does not implement the FontFace API).
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { loadFonts, type FontSpec } from '../src/fonts/loadFonts';

const specs: FontSpec[] = [
  { family: 'Square721BT-BoldCondensed', url: '/bold.otf' },
  { family: 'Square721BT-RomanCondensed', url: '/roman.otf' },
];

describe('loadFonts', () => {
  it('registers both families and resolves after fonts.ready', async () => {
    const added: string[] = [];
    let readyResolved = false;
    const fontSet = {
      add: (f: { family: string }) => added.push(f.family),
      // ready resolves after a tick; flag proves we awaited it.
      ready: Promise.resolve().then(() => {
        readyResolved = true;
        return undefined;
      }),
    };
    // Fake FontFace: load() succeeds.
    const createFontFace = (family: string, _source: string) => ({
      family,
      load: () => Promise.resolve({ family }),
    });

    await loadFonts(specs, { createFontFace, fontSet: fontSet as any });

    expect(added).toEqual([
      'Square721BT-BoldCondensed',
      'Square721BT-RomanCondensed',
    ]);
    expect(readyResolved).toBe(true);
  });

  it('throws a descriptive, font-named error when a font fails to load', async () => {
    const fontSet = { add: vi.fn(), ready: Promise.resolve(undefined) };
    const createFontFace = (family: string) => ({
      family,
      load: () => Promise.reject(new Error('404')),
    });

    await expect(
      loadFonts(specs, { createFontFace, fontSet: fontSet as any }),
    ).rejects.toThrow(/Square721BT-BoldCondensed/);
    // No face was registered because the first load rejected.
    expect(fontSet.add).not.toHaveBeenCalled();
  });
});
