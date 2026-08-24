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
import { ABILITIES_BADGE_PATCH } from '../config/framePatch';
import { ARMOR_BAR_PATCH, ARMOR_BAR_COLORS } from '../config/armorBar';

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
  /**
   * Paint over the baked ABILITIES banner with interior black (defaults to TRUE). The
   * generator authors the abilities body itself, so the PSD's baked banner is removed.
   * Tests set this false to compare an untouched bake.
   */
  removeAbilitiesBadge?: boolean;
  /**
   * Cover the PSD's baked 8-segment armor bar with the empty-recess colour (defaults to
   * TRUE) so the dynamic bar (STORY-15) never reveals old green underneath. The fidelity
   * baseline sets this false to compare against the PSD's own baked bar.
   */
  patchArmorBar?: boolean;
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
  const removeAbilitiesBadge = deps.removeAbilitiesBadge ?? true;
  const patchArmorBar = deps.patchArmorBar ?? true;

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

  // Remove the PSD's baked ABILITIES banner. The banner sits entirely inside the black
  // abilities-box interior, so a flat opaque-black fillRect over its measured footprint
  // erases it with no seam (black-on-black) and cannot reach the tag row above the box
  // border. This is the only region of the otherwise-transparent canvas made opaque.
  if (removeAbilitiesBadge) {
    const p = ABILITIES_BADGE_PATCH;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(p.left, p.top, p.right - p.left, p.bottom - p.top);
  }

  // Cover the PSD's baked 8-segment armor bar (STORY-15). The dynamic bar is drawn fresh
  // on every render, but patching the baked green here guarantees no old green survives
  // at the track edges/gaps. Filled with the empty-recess colour (a dark inner channel
  // over a deeper outer recess), staying strictly inside the track so the surrounding
  // metallic housing/frame art is untouched. Disabled for the fidelity baseline.
  if (patchArmorBar) {
    const a = ARMOR_BAR_PATCH;
    const w = a.right - a.left;
    const h = a.bottom - a.top;
    ctx.globalAlpha = 1;
    ctx.fillStyle = ARMOR_BAR_COLORS.emptyOuter;
    ctx.fillRect(a.left, a.top, w, h);
    ctx.fillStyle = ARMOR_BAR_COLORS.emptyInner;
    ctx.fillRect(a.left + 1, a.top + 1, w - 2, h - 2);
  }
  return canvas;
}
