// STORY-17 — Batch CLI: Node-only canvas + font bootstrap. Mirrors the test harness
// (test/helpers/napiCanvas.ts) but lives in src/ so the production CLI never imports test
// code. Points ag-psd at the @napi-rs/canvas factory and registers the two real OTFs under
// the exact PostScript family names the PSD references. Import this ONLY from Node entry
// points — it pulls in @napi-rs/canvas, which must never enter the Vite browser bundle.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeCanvas } from 'ag-psd';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

let initialized = false;

/**
 * Register the napi canvas factory with ag-psd and load both card fonts. Idempotent.
 * Throws loudly (via readFileSync/registerFromPath) if a font file is missing — a batch
 * must never silently fall back to a substitute typeface.
 */
export function setupNodeCanvas(): void {
  if (initialized) return;
  initializeCanvas((w: number, h: number) => createCanvas(w, h) as unknown as HTMLCanvasElement);
  const boldPath = fileURLToPath(
    new URL('../../assets/fonts/Square721BT-BoldCondensed.otf', import.meta.url),
  );
  const romanPath = fileURLToPath(
    new URL('../../assets/fonts/Square721BT-RomanCondensed.otf', import.meta.url),
  );
  const okBold = GlobalFonts.registerFromPath(boldPath, 'Square721BT-BoldCondensed');
  const okRoman = GlobalFonts.registerFromPath(romanPath, 'Square721BT-RomanCondensed');
  if (!okBold || !okRoman) {
    throw new Error('Failed to register one or both Square721BT OTFs — cannot render.');
  }
  initialized = true;
}

/** Read the bundled Card_1.psd bytes as an ArrayBuffer. */
export function readTemplatePsd(): ArrayBuffer {
  const psdPath = fileURLToPath(new URL('../../assets/Card_1.psd', import.meta.url));
  const buf = readFileSync(psdPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export { createCanvas };
