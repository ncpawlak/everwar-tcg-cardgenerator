// STORY-6 — Bake the static background: composite every NON-editable leaf layer
// back-to-front into a single 690×1020 raster, honoring `hidden` and the 0–1
// `opacity` (spec gotcha: opacity is 0–1, NOT 0–255). The 9 editable text layers are
// skipped so their pixels never enter the bake. Baking runs ONCE; the result is
// reused on every edit (only the editable text redraws).
//
// All blend modes are `normal` and there are no layer effects (spike-confirmed), so
// naive back-to-front `drawImage` reproduces the card exactly.
import type { Psd } from 'ag-psd';
import { flattenLayers } from '../psd/loadPsd';
import { EDITABLE_LAYER_NAMES } from '../config/editableLayers';

/** Minimal canvas shape the bake needs (works for DOM + napi canvases). */
export interface BakeCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): any;
}

/** Injectable dependencies. */
export interface BakeDeps {
  /** Canvas factory (defaults to a DOM canvas in the browser). */
  createCanvas?: (w: number, h: number) => BakeCanvas;
  /** Layer names to exclude (defaults to the editable allow-list). */
  skipNames?: ReadonlySet<string>;
}

/** Default browser canvas factory. */
function domCanvasFactory(w: number, h: number): BakeCanvas {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c as unknown as BakeCanvas;
}

/**
 * Composite the non-editable layers into a cached background raster. Transparency is
 * preserved (the canvas is never filled with an opaque colour), matching the PSD.
 */
export function bakeBackground(psd: Psd, deps: BakeDeps = {}): BakeCanvas {
  const createCanvas = deps.createCanvas ?? domCanvasFactory;
  const skip = deps.skipNames ?? EDITABLE_LAYER_NAMES;

  const canvas = createCanvas(psd.width, psd.height);
  const ctx = canvas.getContext('2d');

  for (const layer of flattenLayers(psd)) {
    // Skip hidden layers, editable text, layers without a raster, and empties.
    if (layer.hidden) continue;
    if (layer.name && skip.has(layer.name)) continue;
    if (!layer.canvas) continue;
    const w = (layer.right ?? 0) - (layer.left ?? 0);
    const h = (layer.bottom ?? 0) - (layer.top ?? 0);
    if (w <= 0 || h <= 0) continue;

    // opacity is a 0–1 float — apply directly as alpha (do NOT divide by 255).
    ctx.globalAlpha = layer.opacity == null ? 1 : layer.opacity;
    ctx.drawImage(layer.canvas, layer.left ?? 0, layer.top ?? 0);
  }
  ctx.globalAlpha = 1;
  return canvas;
}
