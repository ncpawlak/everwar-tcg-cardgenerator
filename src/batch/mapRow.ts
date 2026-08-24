// STORY-17 — Batch CLI: PURE spreadsheet-row → CardModel-value mapping + per-row
// validation. No fs, no canvas, no side effects — every function here is unit-tested.
// The mapping contract is LOCKED by the story spec; see each helper's comment. All
// helpers throw a plain Error with an actionable message on bad input; `mapRow` catches
// each field independently so a single row surfaces ALL of its problems at once (the CLI
// runs a full validation pass and refuses to render if any row has errors).
import { coerceArmorBars } from '../render/armorBarLayout';

/** A raw spreadsheet row keyed by its (trimmed) header cell. Cells are strings/numbers. */
export type RawRow = Record<string, unknown>;

/** One ability in the manifest (already split into name + body). */
export interface ManifestAbility {
  name: string;
  body: string;
}

/** The per-card manifest record (minus `file`, which the CLI assigns after sanitizing). */
export interface CardManifest {
  name: string;
  level: number;
  hp: number;
  dmg: number;
  acc: number;
  armor: number;
  armorBars: number;
  unitType: string;
  faction: string;
  commander: boolean;
  unique: boolean;
  abilities: ManifestAbility[];
}

/** A fully-mapped card: the value-map overlay + its manifest data. */
export interface MappedCard {
  /** Raw Name string (render path auto-uppercases the title). */
  name: string;
  /** Value overlay applied on top of `seedValues(model)` before renderCard. */
  values: Record<string, string>;
  /** Manifest data for traceability (file added later). */
  manifest: CardManifest;
}

/** Canonical spreadsheet headers (row 1), exactly as they appear in the sheet. */
export const HEADERS = {
  name: 'Name',
  type: 'Type',
  subType: 'SubType',
  allegiance: 'Allegiance',
  level: 'Level',
  hp: 'HP',
  dmg: 'DMG',
  acc: 'ACC',
  armorBars: 'Armor Bars',
  armor: 'Armor',
  unique: 'Unique',
  commander: 'Commander',
  ability1: 'Ability 1',
  ability2: 'Ability 2',
  ability3: 'Ability 3',
} as const;

/** The Type value that marks a card as a Hero (trim + case-insensitive compare). */
export const HERO_TYPE = 'hero';

/** True when a row's Type is "Hero" (trimmed, case-insensitive). */
export function isHeroRow(row: RawRow): boolean {
  return String(row[HEADERS.type] ?? '').trim().toLowerCase() === HERO_TYPE;
}

/**
 * Coerce a stat cell (Level/HP/DMG/ACC/Armor) to an INTEGER string. Values arrive as
 * floats (e.g. 240.0) so we round to the nearest integer. Fail-loud on missing/blank or
 * non-numeric input — a silent 0 would print a wrong card.
 */
export function coerceStatInt(raw: unknown, field: string): string {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error(`${field} is missing`);
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    throw new Error(`${field} is not numeric ("${String(raw)}")`);
  }
  return String(Math.round(n));
}

/** Trim + UPPERCASE a tag cell (SubType → unitType, Allegiance → faction). */
export function upperTag(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

/**
 * Coerce a 0/1 flag cell (Unique/Commander) to the value-map string 'true'/'false'.
 * 1 → 'true' (chip shown), 0 → 'false' (chip hidden). Fail-loud on anything else.
 */
export function coerceBool01(raw: unknown, field: string): 'true' | 'false' {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error(`${field} is missing (expected 0 or 1)`);
  }
  const n = Number(String(raw).trim());
  if (n === 1) return 'true';
  if (n === 0) return 'false';
  throw new Error(`${field} must be 0 or 1 (got "${String(raw)}")`);
}

/**
 * Split one ability cell into { name, body } on the FIRST ":" (all current rows use
 * "Name: body"). Returns null for an empty/blank cell (that slot is left blank → skipped
 * at render). Fail-loud when a NON-empty cell has no ":" splitter.
 */
export function splitAbilityCell(raw: unknown, field: string): ManifestAbility | null {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  const idx = s.indexOf(':');
  if (idx < 0) {
    throw new Error(`${field} has no ":" splitter (expected "Name: body"): "${s}"`);
  }
  return { name: s.slice(0, idx).trim(), body: s.slice(idx + 1).trim() };
}

/**
 * Map one Hero row to a full card (value overlay + manifest). Collects EVERY field error
 * into `errors` (rather than throwing on the first) so the CLI's validation pass can print
 * all problems for all rows in one shot. Returns `card: null` when any error was found.
 */
export function mapRow(row: RawRow, label: string): { card: MappedCard | null; errors: string[] } {
  const errors: string[] = [];
  /** Run a field mapper, funneling its thrown message into `errors` (prefixed by row). */
  const tryField = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
      return undefined;
    }
  };

  // Name is required and non-blank.
  const name = String(row[HEADERS.name] ?? '').trim();
  if (name === '') errors.push(`${label}: Name is missing`);

  const level = tryField(() => coerceStatInt(row[HEADERS.level], HEADERS.level));
  const hp = tryField(() => coerceStatInt(row[HEADERS.hp], HEADERS.hp));
  const dmg = tryField(() => coerceStatInt(row[HEADERS.dmg], HEADERS.dmg));
  const acc = tryField(() => coerceStatInt(row[HEADERS.acc], HEADERS.acc));
  const armor = tryField(() => coerceStatInt(row[HEADERS.armor], HEADERS.armor));
  // Armor Bars → int string, clamped to [0,8] by the shared render coerce (data is 0–2).
  const armorBars = tryField(() =>
    String(coerceArmorBars(coerceStatInt(row[HEADERS.armorBars], HEADERS.armorBars))),
  );
  const unique = tryField(() => coerceBool01(row[HEADERS.unique], HEADERS.unique));
  const commander = tryField(() => coerceBool01(row[HEADERS.commander], HEADERS.commander));

  const unitType = upperTag(row[HEADERS.subType]);
  const faction = upperTag(row[HEADERS.allegiance]);

  // Up to three abilities; each non-empty cell must split on ":".
  const abilities: ManifestAbility[] = [];
  for (const header of [HEADERS.ability1, HEADERS.ability2, HEADERS.ability3]) {
    const parsed = tryField(() => splitAbilityCell(row[header], header));
    // `undefined` = a thrown error was recorded; `null` = an empty (skipped) slot.
    if (parsed) abilities.push(parsed);
    else abilities.push({ name: '', body: '' }); // keep slot positions stable
  }

  if (errors.length > 0) return { card: null, errors };

  // All fields are present at this point (no error was recorded).
  const values: Record<string, string> = {
    name,
    level: level as string,
    hp: hp as string,
    dmg: dmg as string,
    acc: acc as string,
    armor: armor as string,
    armorBars: armorBars as string,
    unitType,
    faction,
    species: 'HUMAN', // no species column yet → static tag
    unique: unique as string,
    commander: commander as string,
    'ability1-name': abilities[0].name,
    'ability1-body': abilities[0].body,
    'ability2-name': abilities[1].name,
    'ability2-body': abilities[1].body,
    'ability3-name': abilities[2].name,
    'ability3-body': abilities[2].body,
  };

  // Manifest keeps only the non-empty abilities (blank slots are omitted for readability).
  const manifest: CardManifest = {
    name,
    level: Number(level),
    hp: Number(hp),
    dmg: Number(dmg),
    acc: Number(acc),
    armor: Number(armor),
    armorBars: Number(armorBars),
    unitType,
    faction,
    commander: commander === 'true',
    unique: unique === 'true',
    abilities: abilities.filter((a) => a.name !== '' || a.body !== ''),
  };

  return { card: { name, values, manifest }, errors: [] };
}
