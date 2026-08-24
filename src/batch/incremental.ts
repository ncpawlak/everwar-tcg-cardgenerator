// STORY-18a — PURE incremental-diff planner for the batch CLI. Given the freshly-mapped
// current Hero cards, a parsed prior `manifest.json`, and the set of PNG filenames that
// currently exist on disk, compute which cards are UNCHANGED / CHANGED / NEW / REMOVED and
// produce the final planned manifest plus the render/archive operation lists.
//
// This module is deliberately fs-free and canvas-free so the whole diff is unit-testable.
// The CLI does the actual reading, rendering, and archive moves from this plan.
import type { CardManifest, MappedCard } from './mapRow';
import { sanitizeCardName, uniqueFilename } from './filename';

/** A prior manifest record: the card fingerprint plus its output filename. */
export type ManifestEntry = CardManifest & { file: string };

/** Per-card diff outcome. */
export type CardStatus = 'UNCHANGED' | 'CHANGED' | 'NEW' | 'REMOVED';

/** One card's place in the plan. */
export interface PlannedCard {
  status: CardStatus;
  /** Trimmed identity name. */
  name: string;
  /** Output filename (for REMOVED this is the prior file being archived). */
  file: string;
  /** Final manifest entry, or null for REMOVED (dropped from the new manifest). */
  manifestEntry: ManifestEntry | null;
  /** Prior filename when this name existed before (UNCHANGED/CHANGED/REMOVED). */
  priorFile?: string;
  /** True when the prior PNG should be archived before rendering/removal. */
  archive: boolean;
}

/** The complete incremental plan. */
export interface IncrementalPlan {
  /** Every card (all four statuses), sorted by name. */
  cards: PlannedCard[];
  /** Final manifest (UNCHANGED/CHANGED/NEW), sorted by name; REMOVED omitted. */
  manifest: ManifestEntry[];
  /** Cards needing a render (CHANGED + NEW), sorted by name. */
  toRender: PlannedCard[];
  /** Cards whose prior PNG must be archived first (CHANGED-with-file + REMOVED-with-file). */
  toArchive: PlannedCard[];
}

/** The fingerprint field names compared between prior and current (everything but `file`). */
const NUMERIC_FIELDS = ['level', 'hp', 'dmg', 'acc', 'armor', 'armorBars'] as const;
const STRING_FIELDS = ['name', 'unitType', 'faction'] as const;
const BOOL_FIELDS = ['commander', 'unique'] as const;

/**
 * Validate one prior-manifest record has the exact known shape. Throws a clear error on any
 * missing/mistyped field so a corrupt or old-schema manifest fails loud rather than silently
 * mis-diffing. Returns the value narrowed to `ManifestEntry`.
 */
function validateEntry(raw: unknown, index: number): ManifestEntry {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`Prior manifest entry #${index} is not an object.`);
  }
  const e = raw as Record<string, unknown>;
  if (typeof e.file !== 'string') {
    throw new Error(`Prior manifest entry #${index} has a non-string "file".`);
  }
  for (const f of STRING_FIELDS) {
    if (typeof e[f] !== 'string') {
      throw new Error(`Prior manifest entry #${index} ("${String(e.name)}") field "${f}" must be a string.`);
    }
  }
  for (const f of NUMERIC_FIELDS) {
    if (typeof e[f] !== 'number') {
      throw new Error(`Prior manifest entry #${index} ("${String(e.name)}") field "${f}" must be a number.`);
    }
  }
  for (const f of BOOL_FIELDS) {
    if (typeof e[f] !== 'boolean') {
      throw new Error(`Prior manifest entry #${index} ("${String(e.name)}") field "${f}" must be a boolean.`);
    }
  }
  if (!Array.isArray(e.abilities)) {
    throw new Error(`Prior manifest entry #${index} ("${String(e.name)}") field "abilities" must be an array.`);
  }
  for (const [ai, a] of (e.abilities as unknown[]).entries()) {
    if (typeof a !== 'object' || a === null) {
      throw new Error(`Prior manifest entry #${index} ability #${ai} is not an object.`);
    }
    const ab = a as Record<string, unknown>;
    if (typeof ab.name !== 'string' || typeof ab.body !== 'string') {
      throw new Error(`Prior manifest entry #${index} ability #${ai} must have string name/body.`);
    }
  }
  return raw as ManifestEntry;
}

/**
 * Parse/validate a prior manifest value (already JSON-parsed) into an array of entries,
 * failing loud on a non-array shape, a bad entry, or a duplicate name. Returns [] for a
 * null/undefined prior (no baseline). Exported so the CLI can validate before diffing.
 */
export function validatePriorManifest(prior: unknown): ManifestEntry[] {
  if (prior === null || prior === undefined) return [];
  if (!Array.isArray(prior)) {
    throw new Error('Prior manifest is not a JSON array — cannot use it as an incremental baseline.');
  }
  const entries = prior.map((e, i) => validateEntry(e, i));
  const seen = new Set<string>();
  for (const e of entries) {
    const key = e.name.trim();
    if (seen.has(key)) {
      throw new Error(`Prior manifest has duplicate name "${key}" — cannot diff reliably.`);
    }
    seen.add(key);
  }
  return entries;
}

/**
 * Build the canonical, file-independent fingerprint of a card. Only the known fields are
 * included, arrays are compared in order — never a raw stringify of an arbitrary object.
 */
function fingerprint(m: CardManifest): string {
  const canonical = {
    level: m.level,
    hp: m.hp,
    dmg: m.dmg,
    acc: m.acc,
    armor: m.armor,
    armorBars: m.armorBars,
    unitType: m.unitType,
    faction: m.faction,
    commander: m.commander,
    unique: m.unique,
    abilities: m.abilities.map((a) => ({ name: a.name, body: a.body })),
  };
  // A fixed-shape object with a fixed key order stringifies deterministically; this is a
  // controlled canonical form, not an arbitrary-object stringify.
  return JSON.stringify(canonical);
}

/** Deterministic name comparator for stable manifest ordering. */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Build a candidate manifest entry from a mapped card + its resolved filename. */
function candidateEntry(card: MappedCard, file: string): ManifestEntry {
  return { ...card.manifest, file };
}

/**
 * Compute the incremental plan.
 *
 * @param currentCards Valid mapped current Hero cards (any order).
 * @param prior        Parsed prior manifest (array), or null/undefined for no baseline.
 * @param existingFiles Set of PNG filenames present in the output dir (excluding archive/).
 */
export function planIncremental(
  currentCards: MappedCard[],
  prior: unknown,
  existingFiles: ReadonlySet<string>,
): IncrementalPlan {
  const priorEntries = validatePriorManifest(prior);
  const priorByName = new Map<string, ManifestEntry>();
  for (const e of priorEntries) priorByName.set(e.name.trim(), e);

  // Index current cards by trimmed name; fail loud on duplicates (data identity guard).
  const currentByName = new Map<string, MappedCard>();
  for (const c of currentCards) {
    const key = c.name.trim();
    if (currentByName.has(key)) {
      throw new Error(`Current sheet has duplicate Hero name "${key}" — cannot diff reliably.`);
    }
    currentByName.set(key, c);
  }

  // Reserve every retained filename (from names present in BOTH prior and current) BEFORE
  // allocating any NEW filename, so a new card can never steal a kept name.
  const used = new Set<string>();
  for (const [key, card] of currentByName) {
    const priorEntry = priorByName.get(key);
    if (priorEntry) {
      void card;
      used.add(priorEntry.file);
    }
  }

  const cards: PlannedCard[] = [];

  // Current cards → UNCHANGED / CHANGED / NEW. Sort by name so NEW filenames are allocated
  // deterministically in name order.
  const sortedCurrentKeys = [...currentByName.keys()].sort(byName);
  for (const key of sortedCurrentKeys) {
    const card = currentByName.get(key)!;
    const priorEntry = priorByName.get(key);
    if (!priorEntry) {
      // NEW — allocate a collision-safe filename after all retained names are reserved.
      const file = uniqueFilename(sanitizeCardName(card.name), used);
      cards.push({ status: 'NEW', name: key, file, manifestEntry: candidateEntry(card, file), archive: false });
      continue;
    }
    const priorFile = priorEntry.file;
    const same = fingerprint(card.manifest) === fingerprint(priorEntry);
    const pngPresent = existingFiles.has(priorFile);
    if (same && pngPresent) {
      // UNCHANGED — keep the prior entry verbatim (including its file).
      cards.push({ status: 'UNCHANGED', name: key, file: priorFile, manifestEntry: priorEntry, priorFile, archive: false });
    } else {
      // CHANGED (fingerprint differs OR prior PNG missing). Retain the prior filename; archive
      // the old PNG first only if it actually exists on disk.
      cards.push({
        status: 'CHANGED',
        name: key,
        file: priorFile,
        manifestEntry: candidateEntry(card, priorFile),
        priorFile,
        archive: pngPresent,
      });
    }
  }

  // Prior names absent from the current sheet → REMOVED (archived, dropped from manifest).
  for (const e of priorEntries) {
    const key = e.name.trim();
    if (!currentByName.has(key)) {
      cards.push({
        status: 'REMOVED',
        name: key,
        file: e.file,
        manifestEntry: null,
        priorFile: e.file,
        archive: existingFiles.has(e.file),
      });
    }
  }

  cards.sort((a, b) => byName(a.name, b.name));

  const manifest = cards
    .filter((c) => c.manifestEntry !== null)
    .map((c) => c.manifestEntry as ManifestEntry)
    .sort((a, b) => byName(a.name.trim(), b.name.trim()));

  const toRender = cards.filter((c) => c.status === 'CHANGED' || c.status === 'NEW');
  const toArchive = cards.filter((c) => c.archive);

  return { cards, manifest, toRender, toArchive };
}
