// STORY-4 — Typed card model. These types are UI-agnostic and fully serializable
// (NO live canvas refs), so the model can be snapshot-tested and seeded into state.
import type { Rgb, FieldKind, Ability } from '../config/editableLayers';

export type { Rgb, Ability };

/** A per-character run of the title, carrying its own font size (small-caps). */
export interface StyleRun {
  /** Number of characters this run covers. */
  length: number;
  /** Font size (px) for this run. */
  fontSize: number;
}

/** Axis-aligned pixel bounds of a layer. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Baseline anchor point derived from the text-engine transform matrix. */
export interface Anchor {
  x: number;
  y: number;
}

/** A field backed by an existing PSD text layer (title or single-line value). */
export interface LayerFieldModel {
  id: string;
  layerName: string;
  kind: 'title' | 'single-line';
  /** Current text (pre-filled from the PSD on load). */
  text: string;
  /** Font family name (as referenced by the PSD). */
  font: string;
  /** Base font size in px (styleRuns override this per-run for the title). */
  fontSize: number;
  /** Fill colour, 0–255 per channel. */
  color: Rgb;
  /** PSD justification (e.g. 'left'). */
  justification: string;
  /** Per-run sizes (present for the title; may be empty for uniform fields). */
  styleRuns: StyleRun[];
  /** Baseline anchor (engine transform e[4], e[5]). */
  anchor: Anchor;
  /** Layer pixel bounds. */
  bounds: Bounds;
}

/** The authored abilities body block (no PSD layer). Holds an ordered list of up to
 * three structured abilities (bold name + regular body) plus the geometry + type
 * needed to lay them out and shrink-to-fit (STORY-14 / Variant D). */
export interface AbilitiesFieldModel {
  id: 'abilities';
  kind: 'abilities';
  /** Seed abilities (up to 3); empty name+body pairs are skipped at render. */
  abilities: Ability[];
  /** Regular body font family. */
  font: string;
  /** Bold font family for the ability NAME prefix (the title font). */
  boldFont: string;
  /** Base font size in px. */
  fontSize: number;
  /** Base line height in px. */
  lineHeight: number;
  /** Vertical gap (px) between consecutive abilities. */
  paragraphGap: number;
  /** Readability floor for the dormant shrink-to-fit fallback. */
  minScale: number;
  color: Rgb;
  /** Content box (clip region — the black interior, top border to bottom border). */
  box: Bounds;
  /** Padded text area: start x/y (reclaimed top) and wrap width. */
  textArea: { x: number; y: number; w: number };
  /** Bottom y limit for text (whole-line clip). */
  textBottom: number;
}

export type FieldModel = LayerFieldModel | AbilitiesFieldModel;

/** The complete card model: document size + ordered editable fields. */
export interface CardModel {
  width: number;
  height: number;
  /** Field lookup by id. */
  fields: Record<string, FieldModel>;
  /** Field ids in spec/UI order. */
  order: string[];
  /**
   * Armor-bar segment count (STORY-15). An AUTHORED numeric control (0–8), SEPARATE from
   * the printed `armor` text field. Default 8 matches the template's baked art. It is NOT
   * a field entry (not in `order`/`fields`) — it is drawn dynamically over the background.
   */
  armorBars: number;
  /**
   * Show the COMMANDER chip (STORY-16). Default true keeps the baked pill visible; false
   * patches it out at render time. Authored flag — not a PSD field, not in `order`.
   */
  commander: boolean;
  /** Show the UNIQUE chip (STORY-16). Default true; false patches it out at render time. */
  unique: boolean;
}

/** Narrowing helper — true for the abilities field. */
export function isAbilities(f: FieldModel): f is AbilitiesFieldModel {
  return f.kind === 'abilities';
}

// Re-export FieldKind for convenience of downstream consumers.
export type { FieldKind };
