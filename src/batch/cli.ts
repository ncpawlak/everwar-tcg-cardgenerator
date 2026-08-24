// STORY-17 — Batch CLI (Node entry). Reads the Hero rows from an xlsx, maps each to a
// CardModel value overlay, renders every card through the SHARED production pipeline
// (bake ONCE + renderCard per row) and writes one PNG per card plus a manifest.json.
//
// Fail-loud contract: a FULL validation pass runs first (field mapping + abilities-overflow
// against the real box). If ANY row has an error, every error is printed and the process
// exits non-zero WITHOUT writing a single file. Only a completely clean set is rendered.
//
// Run via:  npm run batch -- --input <xlsx> --sheet "full Set Table v2 - stat adjust" --out <dir>
// (This module is Node-only — it imports @napi-rs/canvas via nodeCanvas and must never be
// pulled into the Vite browser bundle.)
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { readPsdBuffer } from '../psd/loadPsd';
import { extractModel } from '../psd/extractModel';
import { seedValues } from '../app/seedValues';
import { bakeBackground } from '../render/bakeBackground';
import { renderCard } from '../render/renderCard';
import { ctxMeasure } from '../render/drawText';
import { abilitiesFromValues } from '../render/drawAbilities';
import { isAbilities, type AbilitiesFieldModel } from '../psd/types';
import { setupNodeCanvas, readTemplatePsd, createCanvas } from './nodeCanvas';
import { mapRow, isHeroRow, type RawRow, type MappedCard } from './mapRow';
import { detectAbilitiesOverflow } from './overflow';
import { sanitizeCardName, uniqueFilename } from './filename';
import { planIncremental, type IncrementalPlan, type PlannedCard } from './incremental';

/** Parsed CLI options. */
interface CliOptions {
  input: string;
  sheet: string;
  out: string;
  /** Opt-in incremental mode: re-render only changed/new rows vs the prior manifest. */
  incremental: boolean;
  /** Print the plan and write nothing. */
  dryRun: boolean;
}

/** The default worksheet name (overridable with --sheet). */
const DEFAULT_SHEET = 'full Set Table v2 - stat adjust';

/**
 * Parse flags from argv (everything after the script name). `--input`/`--out` are required;
 * `--sheet` defaults to the Hero table; `--incremental` and `--dry-run` are opt-in booleans.
 */
export function parseArgs(argv: string[]): CliOptions {
  const opts: Partial<CliOptions> = { sheet: DEFAULT_SHEET, incremental: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') opts.input = argv[++i];
    else if (a === '--sheet') opts.sheet = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--incremental') opts.incremental = true;
    else if (a === '--dry-run') opts.dryRun = true;
  }
  if (!opts.input || !opts.out) {
    throw new Error(
      'Usage: batch --input <xlsx> --sheet "<sheet name>" --out <dir> [--incremental] [--dry-run]\n' +
        '  --input and --out are required; --sheet defaults to the Hero table.',
    );
  }
  return opts as CliOptions;
}

/**
 * Read the named worksheet and return its rows as header-keyed objects with the header
 * keys trimmed (guards against stray trailing spaces in the sheet headers). Blank cells
 * default to '' so downstream fail-loud checks see "missing", not `undefined` surprises.
 */
export function readSheetRows(file: string, sheet: string): RawRow[] {
  // Fail-loud with a clear message before touching the parser.
  if (!existsSync(file)) {
    throw new Error(`Input file not found: ${file}`);
  }
  // Read the bytes ourselves and parse the buffer. The SheetJS ESM build (`xlsx.mjs`)
  // does NOT auto-bind Node's `fs`, so `XLSX.readFile` throws "Cannot access file …"
  // under vite-node. Parsing an in-memory buffer sidesteps the fs-binding issue.
  const buf = readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[sheet];
  if (!ws) {
    throw new Error(
      `Sheet "${sheet}" not found. Available: ${wb.SheetNames.map((s) => `"${s}"`).join(', ')}`,
    );
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return raw.map((row) => {
    const trimmed: RawRow = {};
    for (const [k, v] of Object.entries(row)) trimmed[k.trim()] = v;
    return trimmed;
  });
}

/** List the PNG filenames present in `dir` (the archive subfolder is not a .png, so it's
 * naturally excluded). Returns an empty set when the directory doesn't exist yet. */
function listExistingPngs(dir: string): Set<string> {
  if (!existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')));
}

/** Compact UTC stamp like `20260824T135000Z` for versioned archive filenames. */
function compactUtcStamp(d: Date = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/**
 * Move a prior PNG into `<out>/archive/` under a versioned name `<stem>-<ts>.png`, ensuring
 * uniqueness within the run and against any existing archive file. Never deletes anything.
 */
function archivePriorPng(out: string, file: string, ts: string, usedArchive: Set<string>): void {
  const stem = file.replace(/\.png$/i, '');
  let target = `${stem}-${ts}.png`;
  let n = 2;
  while (usedArchive.has(target) || existsSync(join(out, 'archive', target))) {
    target = `${stem}-${ts}-${n}.png`;
    n++;
  }
  usedArchive.add(target);
  renameSync(join(out, file), join(out, 'archive', target));
}

/** Status glyph for the per-card summary lines. */
function statusGlyph(status: PlannedCard['status']): string {
  switch (status) {
    case 'UNCHANGED':
      return '=';
    case 'CHANGED':
      return '~';
    case 'NEW':
      return '+';
    case 'REMOVED':
      return '-';
  }
}

/** Print the incremental diff summary (design §8 format, with `(archived)` annotations). */
function printIncrementalSummary(plan: IncrementalPlan, manifestPath: string): void {
  const count = (s: PlannedCard['status']) => plan.cards.filter((c) => c.status === s).length;
  console.log(`Incremental diff against "${manifestPath}":`);
  console.log(`  UNCHANGED ${count('UNCHANGED')}`);
  console.log(`  CHANGED   ${count('CHANGED')}`);
  console.log(`  NEW       ${count('NEW')}`);
  console.log(`  REMOVED   ${count('REMOVED')}`);
  console.log(`  RENDER    ${plan.toRender.length}`);
  console.log('\nCards:');
  for (const c of plan.cards) {
    // Annotate the lines whose prior PNG is (or would be) moved to the archive.
    const annot = c.archive ? ' (archived)' : '';
    console.log(`  ${statusGlyph(c.status)} ${c.name} -> ${c.file}${annot}`);
  }
}

/**
 * Run the batch pipeline for the given options. Throws on any fail-loud condition (no Hero
 * rows, validation errors, corrupt prior manifest, duplicate names) so callers/tests can
 * observe the failure; the thin `main` wrapper turns a throw into a non-zero exit. Writes
 * nothing when it throws before the write phase.
 */
export function run(opts: CliOptions): void {
  // --- Ingest + Hero filter -------------------------------------------------
  const allRows = readSheetRows(opts.input, opts.sheet);
  const heroRows = allRows.filter(isHeroRow);
  if (heroRows.length === 0) {
    throw new Error(`No Hero rows found in sheet "${opts.sheet}".`);
  }
  console.log(`Read ${heroRows.length} Hero row(s) from "${opts.sheet}".`);

  // --- Shared pipeline bootstrap ------------------------------------------
  // Use the SAME loader as the app (readPsdBuffer) so each layer keeps its rasterized
  // `.canvas` — bakeBackground composites via `.canvas`. (A raw readPsd with
  // useImageData:true would populate `.imageData` instead and bake a transparent frame.)
  setupNodeCanvas();
  const psd = readPsdBuffer(readTemplatePsd());
  const model = extractModel(psd);
  const seed = seedValues(model);
  const factory = (w: number, h: number) => createCanvas(w, h) as any;
  // Bake lazily: a --dry-run never renders, so it must never pay for the bake.
  let background: ReturnType<typeof bakeBackground> | undefined;
  const getBackground = () => (background ??= bakeBackground(psd, { createCanvas: factory }));

  // Locate the abilities field once (needed for the overflow validation).
  const abilitiesField = model.order
    .map((id) => model.fields[id])
    .find((f): f is AbilitiesFieldModel => isAbilities(f));

  // A dedicated measuring context (napi) for the pure overflow detector.
  const measureCanvas = createCanvas(model.width, model.height);
  const measure = ctxMeasure(measureCanvas.getContext('2d'));

  // --- Validation pass (fail-loud, writes nothing on any error) -------------
  const errors: string[] = [];
  const validCards: { card: MappedCard; merged: Record<string, string> }[] = [];
  for (const row of heroRows) {
    const nm = String(row['Name'] ?? '').trim();
    const label = nm ? `"${nm}"` : '(unnamed row)';
    const { card, errors: rowErrors } = mapRow(row, label);
    if (!card) {
      errors.push(...rowErrors);
      continue;
    }
    // Merge the row overlay onto the seed, then check abilities against the real box.
    const merged = { ...seed, ...card.values };
    if (abilitiesField) {
      const abilities = abilitiesFromValues(merged);
      const of = detectAbilitiesOverflow(abilities, abilitiesField, measure);
      if (of.overflow) {
        // `clippedAbilityIndex` is an index into the NON-EMPTY abilities, not the
        // spreadsheet Ability column. Map it back to the original slot (Ability 1/2/3)
        // using the SAME blank-skip rule as layoutAbilities so the message names the
        // real column even when an earlier Ability cell was left blank.
        const nonEmptySlots = abilities
          .map((a, i) => ({ a, slot: i + 1 }))
          .filter(({ a }) => a.name.trim().length > 0 || a.body.trim().length > 0)
          .map(({ slot }) => slot);
        const which =
          of.clippedAbilityIndex !== undefined
            ? ` (Ability ${nonEmptySlots[of.clippedAbilityIndex]})`
            : '';
        errors.push(
          `${label}: abilities overflow the box even at min scale ${of.scale}${which} — shorten ability text`,
        );
        continue;
      }
    }
    validCards.push({ card, merged });
  }

  if (errors.length > 0) {
    // Surface every problem at once; caller (main) turns this into a non-zero exit.
    throw new Error(
      `Validation FAILED — ${errors.length} error(s), no files written:\n` +
        errors.map((e) => `  - ${e}`).join('\n'),
    );
  }

  /** Render one already-validated card's merged values to `<out>/<file>`. */
  const renderToFile = (merged: Record<string, string>, file: string): void => {
    const canvas = createCanvas(model.width, model.height);
    renderCard(canvas.getContext('2d'), getBackground(), model, merged);
    writeFileSync(join(opts.out, file), canvas.toBuffer('image/png'));
  };

  if (opts.incremental) {
    runIncremental(opts, validCards, renderToFile);
  } else {
    runFull(opts, validCards, renderToFile);
  }
}

/**
 * Incremental mode: diff the current cards against `<out>/manifest.json`, render only
 * CHANGED + NEW cards, archive superseded/removed PNGs into `<out>/archive/`, and write the
 * manifest LAST. `--dry-run` prints the plan and writes nothing.
 */
function runIncremental(
  opts: CliOptions,
  validCards: { card: MappedCard; merged: Record<string, string> }[],
  renderToFile: (merged: Record<string, string>, file: string) => void,
): void {
  const manifestPath = join(opts.out, 'manifest.json');

  // Load the prior manifest baseline. Missing → behave like a full run (all NEW). Corrupt →
  // fail loud and write nothing.
  let prior: unknown = null;
  if (existsSync(manifestPath)) {
    try {
      prior = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      throw new Error(`Corrupt prior manifest at "${manifestPath}": ${(e as Error).message}`);
    }
  } else {
    console.log(
      `No prior manifest at "${manifestPath}"; incremental run will render all ${validCards.length} card(s).`,
    );
  }

  const cards = validCards.map((v) => v.card);
  const existingFiles = listExistingPngs(opts.out);

  // Plan the diff. Duplicate names / bad prior shape throw here → fail loud, no writes.
  const plan: IncrementalPlan = planIncremental(cards, prior, existingFiles);

  printIncrementalSummary(plan, manifestPath);

  if (opts.dryRun) {
    console.log('\nDry run: no files written.');
    return;
  }

  // Execute. Archive BEFORE rendering so a CHANGED card's old PNG is preserved before its
  // new version overwrites the same filename. Write the manifest LAST for crash-safety.
  mkdirSync(opts.out, { recursive: true });
  if (plan.toArchive.length > 0) mkdirSync(join(opts.out, 'archive'), { recursive: true });
  const ts = compactUtcStamp();
  const usedArchive = new Set<string>();
  for (const c of plan.toArchive) archivePriorPng(opts.out, c.file, ts, usedArchive);

  const cardByName = new Map(validCards.map((v) => [v.card.name.trim(), v]));
  for (const c of plan.toRender) {
    const v = cardByName.get(c.name);
    if (v) renderToFile(v.merged, c.file);
  }

  writeFileSync(manifestPath, JSON.stringify(plan.manifest, null, 2));

  const unchanged = plan.cards.filter((c) => c.status === 'UNCHANGED').length;
  console.log(
    `\nWrote ${plan.toRender.length} rendered/updated PNG(s), skipped ${unchanged} unchanged, ` +
      `archived ${plan.toArchive.length}, updated manifest.json.`,
  );
}

/**
 * Full mode (default): render EVERY validated card in sheet order and write a fresh
 * manifest. `--dry-run` prints what would render and writes nothing.
 */
function runFull(
  opts: CliOptions,
  validCards: { card: MappedCard; merged: Record<string, string> }[],
  renderToFile: (merged: Record<string, string>, file: string) => void,
): void {
  if (opts.dryRun) {
    console.log(`\nDry run: would render all ${validCards.length} card(s).`);
    console.log('Dry run: no files written.');
    return;
  }
  mkdirSync(opts.out, { recursive: true });
  const used = new Set<string>();
  const manifest: Record<string, unknown>[] = [];
  for (const { card, merged } of validCards) {
    const file = uniqueFilename(sanitizeCardName(card.name), used);
    renderToFile(merged, file);
    const m = card.manifest;
    manifest.push({
      name: m.name,
      file,
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
      abilities: m.abilities,
    });
  }
  writeFileSync(join(opts.out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${validCards.length} card PNG(s) + manifest.json to ${opts.out}`);
}

// Only run the pipeline when invoked as the CLI — importing this module from tests (to
// exercise `run`/`readSheetRows`/`parseArgs`) must NOT auto-run. Vitest sets `VITEST`, so we
// skip there; every other invocation (the `batch` script via vite-node, or `node`) runs.
function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  try {
    run(opts);
  } catch (e) {
    console.error(`\n${(e as Error).message}`);
    process.exit(1);
  }
}

if (process.env.VITEST === undefined) main();
