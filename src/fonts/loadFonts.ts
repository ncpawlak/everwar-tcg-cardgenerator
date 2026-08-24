// STORY-5 — Font loading via the browser FontFace API (spec §6). Registers the two
// bundled OTFs under the EXACT family names the PSD references, then blocks on
// `document.fonts.ready` so the first render never uses a fallback face. A failed
// load throws LOUDLY (no silent substitution) — the fonts are a hard fidelity
// dependency.
//
// Dependencies (FontFace constructor + font set) are injectable so the logic is
// unit-testable under jsdom, which lacks the FontFace API.

/** The exact family names the PSD text layers reference (spec §6). */
export const FONT_FAMILIES = {
  bold: 'Square721BT-BoldCondensed',
  roman: 'Square721BT-RomanCondensed',
} as const;

/** A font to register: its family name and a fetchable URL to the OTF. */
export interface FontSpec {
  family: string;
  url: string;
}

/** Minimal shape of a FontFace we depend on. */
interface FontFaceLike {
  family: string;
  load(): Promise<unknown>;
}

/** Minimal shape of the document font set we depend on. */
interface FontSetLike {
  add(face: unknown): void;
  readonly ready: Promise<unknown>;
}

/** Injectable dependencies (default to the real browser APIs). */
export interface LoadFontsDeps {
  createFontFace?: (family: string, source: string) => FontFaceLike;
  fontSet?: FontSetLike;
}

/**
 * Register and load each font, failing loudly on any error, then await the font set
 * to be ready. Resolves only once every face is usable for rendering.
 */
export async function loadFonts(
  specs: FontSpec[],
  deps: LoadFontsDeps = {},
): Promise<void> {
  // Default to the real browser FontFace + document.fonts.
  const createFontFace =
    deps.createFontFace ??
    ((family: string, source: string) =>
      new FontFace(family, source) as unknown as FontFaceLike);
  const fontSet: FontSetLike = deps.fontSet ?? (document.fonts as unknown as FontSetLike);

  for (const spec of specs) {
    try {
      // FontFace source string points at the OTF URL emitted by the bundler.
      const face = createFontFace(spec.family, `url(${spec.url})`);
      const loaded = (await face.load()) as unknown;
      // `load()` resolves with the FontFace; register whatever it returns (or the
      // original face for mocks that resolve with a plain object).
      fontSet.add(loaded ?? face);
    } catch (err) {
      // Loud, actionable failure naming the offending font (spec §4.4, §6).
      throw new Error(
        `Failed to load required font "${spec.family}" from "${spec.url}". ` +
          `These fonts are required for fidelity — no fallback is used. Cause: ${String(err)}`,
      );
    }
  }

  // Block until the font set reports ready so first render uses the real faces.
  await fontSet.ready;
}
