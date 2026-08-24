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

/** One structured ability: a bold NAME and a regular BODY (STORY-14 / Variant D). */
export interface Ability {
  name: string;
  body: string;
}

/**
 * The state keys + UI labels for one of the (up to 3) ability slots. Each ability is
 * serialized as TWO flat value keys (name + body) so it rides the existing
 * `Values = Record<string,string>` store without any structural change to app state.
 */
export interface AbilitySlot {
  nameKey: string;
  bodyKey: string;
  label: string;
}

/**
 * Up to THREE ability slots. Each ability is stored as two value keys
 * (`abilityN-name`, `abilityN-body`); an ability whose name AND body are both blank is
 * skipped at render (STORY-14). This is the single source of truth for the ordering.
 */
export const ABILITY_SLOTS: readonly AbilitySlot[] = [
  { nameKey: 'ability1-name', bodyKey: 'ability1-body', label: 'Ability 1' },
  { nameKey: 'ability2-name', bodyKey: 'ability2-body', label: 'Ability 2' },
  { nameKey: 'ability3-name', bodyKey: 'ability3-body', label: 'Ability 3' },
] as const;

/** The authored abilities body region — has NO backing PSD layer. */
export interface AbilitiesField {
  id: string;
  layerName: null;
  label: string;
  kind: 'abilities';
  /** Regular body font family (registered name). */
  font: string;
  /** Bold font used for the ability NAME prefix (the title font). */
  boldFont: string;
  /** Base font size in px. */
  fontSize: number;
  /** Base line height in px. */
  lineHeight: number;
  /** Extra vertical gap (px) inserted between consecutive abilities. */
  paragraphGap: number;
  /** Readability floor for the block shrink-to-fit fallback (0.7 per spec). */
  minScale: number;
  /** Fill colour (white per spec §4.3). */
  color: Rgb;
  /** Seed abilities shown on load (abilities has no PSD layer to pre-fill from). */
  defaultAbilities: Ability[];
}

export type EditableField = LayerField | AbilitiesField;

// Abilities black-interior clip box (690×1020 card space), MEASURED from the PSD
// composite AFTER the ABILITIES badge removal reclaimed the top of the box:
//   - top = 771: the first fully-black interior row just BELOW the top gold border
//     (the border peaks y768–770). Text may now start here instead of the old y=808.
//   - bottom = 971: the last black interior row just ABOVE the bottom gold border
//     (which starts y972). Lines are clipped to this bottom.
export const ABILITIES_BOX = {
  left: 37,
  top: 771,
  right: 664,
  bottom: 971,
} as const;

// Padded text area derived from the box (spec §4.5). The reclaimed top lets text start
// at y=780 (interior top 771 + 9px pad), giving 191px usable height (971−780) vs the
// old 144px (from y=824) — enough for 3 abilities at native 21px with no shrink.
export const ABILITIES_TEXT_AREA = {
  x: 59,
  y: 780,
  w: 583,
} as const;

// Bottom limit for abilities text (clip). A whole line is dropped if it would extend
// past this y (never mid-word); matches the box interior bottom.
export const ABILITIES_TEXT_BOTTOM = 971 as const;

// The abilities field definition (synthesized — no PSD layer backs it).
export const ABILITIES_FIELD: AbilitiesField = {
  id: 'abilities',
  layerName: null,
  label: 'Abilities',
  kind: 'abilities',
  font: 'Square721BT-RomanCondensed',
  boldFont: 'Square721BT-BoldCondensed',
  fontSize: 21,
  lineHeight: 25,
  paragraphGap: 6,
  minScale: 0.7,
  color: { r: 255, g: 255, b: 255 },
  // Authored defaults (the card ships with no abilities PSD layer): ONE realistic
  // placeholder ability, the other two empty (skipped at render). Mirrors how the
  // single free-text field was previously seeded.
  defaultAbilities: [
    {
      name: 'Rallying Cry',
      body:
        'At the start of your turn, all friendly INFANTRY units gain +5 ATTACK and ' +
        '+5 ACCURACY until end of turn.',
    },
    { name: '', body: '' },
    { name: '', body: '' },
  ],
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
