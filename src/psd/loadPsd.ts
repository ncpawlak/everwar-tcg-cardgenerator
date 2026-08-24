// STORY-3 — PSD loader. Parses `Card_1.psd` with ag-psd (reader-only, never used to
// write/rasterize text) and provides a flatten helper reused by extraction (STORY-4)
// and baking (STORY-6).
//
// IMPORTANT: ag-psd needs `initializeCanvas(...)` in Node (done in test setup only);
// in the browser it uses the DOM canvas automatically, so this module never calls it.
import { readPsd, type Psd, type Layer } from 'ag-psd';

/**
 * Parse a PSD from an already-fetched ArrayBuffer. Requests layer bitmaps and full
 * text-engine data (both are ag-psd defaults). Kept separate from `loadPsd` so
 * tests can feed bytes read from disk without a network fetch.
 */
export function readPsdBuffer(buffer: ArrayBuffer): Psd {
  return readPsd(buffer, {
    // Keep per-layer rasters (needed by the bake) and text-engine data (needed by
    // extraction). These are on by default; set explicitly for intent + safety.
    skipLayerImageData: false,
    skipCompositeImageData: false,
    skipThumbnail: true,
  });
}

/**
 * Fetch the bundled PSD by URL (browser path) and parse it. The URL is produced by
 * Vite's `?url` asset import in the composition root.
 */
export async function loadPsd(url: string): Promise<Psd> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch PSD at ${url}: HTTP ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  return readPsdBuffer(buffer);
}

/**
 * Flatten the layer tree to a list of LEAF layers in document order (bottom→top),
 * skipping group containers. Card_1 is flat (no groups) but we still guard groups
 * so the helper is correct for any PSD.
 */
export function flattenLayers(psd: Psd): Layer[] {
  const out: Layer[] = [];
  const walk = (layers: Layer[] | undefined): void => {
    if (!layers) return;
    for (const l of layers) {
      if (l.children && l.children.length > 0) {
        // Group container: descend into its children, don't emit the container.
        walk(l.children);
      } else {
        out.push(l);
      }
    }
  };
  walk(psd.children);
  return out;
}
