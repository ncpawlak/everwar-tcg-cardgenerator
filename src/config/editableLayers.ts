// STORY-2 — Editable-layer allow-list (spec §3, §10) + abilities box config.
//
// This module is the SINGLE SOURCE OF TRUTH for "what is editable". Three
// consumers read it: the model extractor (STORY-4), the background bake skip-set
// (STORY-6), and the UI field panel (STORY-11). Editability is an explicit
// allow-list keyed by exact PSD layer name — NOT a heuristic on layer type or
// naming convention (spec §10 mandate).

/** RGB colour, 0–255 per channel (matches ag-psd fillColor shape). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** How a field is laid out / drawn. */
export type FieldKind = 'title' | 'single-line' | 'abilities';

/** A field mapped to an existing PSD text layer (title or single-line). */
export interface LayerField {
  /** Stable id used as form + state key. */
  id: string;
  /** Exact PSD layer name to match during extraction. */
  layerName: string;
  /** Human label shown in the UI panel. */
  label: string;
  kind: 'title' | 'single-line';
}

/** The authored abilities body region — has NO backing PSD layer. */
export interface AbilitiesField {
  id: string;
  layerName: null;
  label: string;
  kind: 'abilities';
  /** Font family (registered name). */
  font: string;
  /** Font size in px. */
  fontSize: number;
  /** Line height in px. */
  lineHeight: number;
  /** Fill colour (white per spec §4.3). */
  color: Rgb;
  /** Seed text shown on load (abilities has no PSD layer to pre-fill from). */
  defaultText: string;
}

export type EditableField = LayerField | AbilitiesField;

// Abilities content box, detected in the spike (spec §4.1): (37,808)–(664,968).
export const ABILITIES_BOX = {
  left: 37,
  top: 808,
  right: 664,
  bottom: 968,
} as const;

// Padded text area derived from the box (spec §4.3): x=59, y=824, w=583.
export const ABILITIES_TEXT_AREA = {
  x: 59,
  y: 824,
  w: 583,
} as const;

// The abilities field definition (synthesized — no PSD layer backs it).
export const ABILITIES_FIELD: AbilitiesField = {
  id: 'abilities',
  layerName: null,
  label: 'Abilities (body)',
  kind: 'abilities',
  font: 'Square721BT-RomanCondensed',
  fontSize: 21,
  lineHeight: 25,
  color: { r: 255, g: 255, b: 255 },
  // Authored placeholder body (the card ships with no abilities PSD layer). Mirrors
  // the spike's sample so the box shows realistic wrapped text on first load.
  defaultText:
    'Rallying Cry: At the start of your turn, all friendly INFANTRY units gain ' +
    '+5 ATTACK and +5 ACCURACY until end of turn. Ironfist Commander cannot be ' +
    'targeted by enemy abilities while at least two allied units remain on the field.',
};

// The 9 name-mapped fields, in spec §3 order. The first is the per-run small-caps
// title; the rest are single-line values.
const LAYER_FIELDS: LayerField[] = [
  { id: 'name', layerName: 'Name text', label: 'Card Name / Title', kind: 'title' },
  { id: 'level', layerName: '4', label: 'Level', kind: 'single-line' },
  { id: 'hp', layerName: '40', label: 'HP', kind: 'single-line' },
  { id: 'armor', layerName: '25', label: 'Armor', kind: 'single-line' },
  { id: 'dmg', layerName: '30', label: 'DMG', kind: 'single-line' },
  { id: 'acc', layerName: '75', label: 'ACC', kind: 'single-line' },
  { id: 'unitType', layerName: 'INFANTRY', label: 'Unit Type', kind: 'single-line' },
  { id: 'faction', layerName: 'IRONWARD LEGION', label: 'Faction', kind: 'single-line' },
  { id: 'species', layerName: 'HUMAN', label: 'Species / Tag', kind: 'single-line' },
];

// The full ordered allow-list: 9 layer fields + the authored abilities field.
export const EDITABLE_FIELDS: EditableField[] = [...LAYER_FIELDS, ABILITIES_FIELD];

// Set of editable PSD layer names — used by the bake (STORY-6) as the skip-set so
// editable text is never baked into the static background.
export const EDITABLE_LAYER_NAMES: ReadonlySet<string> = new Set(
  LAYER_FIELDS.map((f) => f.layerName),
);
