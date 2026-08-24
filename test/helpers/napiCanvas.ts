// Shared test helper: initialize ag-psd's canvas factory with @napi-rs/canvas and
// register the real OTFs, so Node tests can parse PSD layer bitmaps and render text
// with the exact card fonts. This mirrors the spike's Node harness. @napi-rs/canvas
// is a DEV-ONLY dependency and is imported here (test code) only — never in `src/`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeCanvas } from 'ag-psd';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

let initialized = false;

/**
 * Point ag-psd at the napi canvas factory and register both card fonts.
 * Idempotent — safe to call from every test file.
 */
export function setupNapiCanvas(): void {
  if (initialized) return;
  // ag-psd needs a canvas factory in Node to rasterize layer image data.
  initializeCanvas((w: number, h: number) => createCanvas(w, h) as unknown as HTMLCanvasElement);
  // Register the OTFs under the exact PostScript family names the PSD references.
  const boldPath = fileURLToPath(
    new URL('../../assets/fonts/Square721BT-BoldCondensed.otf', import.meta.url),
  );
  const romanPath = fileURLToPath(
    new URL('../../assets/fonts/Square721BT-RomanCondensed.otf', import.meta.url),
  );
  GlobalFonts.registerFromPath(boldPath, 'Square721BT-BoldCondensed');
  GlobalFonts.registerFromPath(romanPath, 'Square721BT-RomanCondensed');
  initialized = true;
}

/** Read the real Card_1.psd bytes from `assets/` as an ArrayBuffer. */
export function readCardPsdBuffer(): ArrayBuffer {
  const psdPath = fileURLToPath(new URL('../../assets/Card_1.psd', import.meta.url));
  const buf = readFileSync(psdPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export { createCanvas, GlobalFonts };
