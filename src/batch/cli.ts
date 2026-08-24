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
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { readPsd } from 'ag-psd';
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

/** Parsed CLI options. */
interface CliOptions {
  input: string;
  sheet: string;
  out: string;
}

/** The default worksheet name (overridable with --sheet). */
const DEFAULT_SHEET = 'full Set Table v2 - stat adjust';

/**
 * Parse `--input`, `--sheet`, `--out` from argv (everything after the script name). The
 * sheet defaults to the known Hero table; input and out are required.
 */
export function parseArgs(argv: string[]): CliOptions {
  const opts: Partial<CliOptions> = { sheet: DEFAULT_SHEET };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') opts.input = argv[++i];
    else if (a === '--sheet') opts.sheet = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
  }
  if (!opts.input || !opts.out) {
    throw new Error(
      'Usage: batch --input <xlsx> --sheet "<sheet name>" --out <dir>\n' +
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
  const wb = XLSX.readFile(file);
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

/** Main entry: orchestrate ingest → validate → render → write. */
function main(): void {
  const opts = parseArgs(process.argv.slice(2));

  // --- Ingest + Hero filter -------------------------------------------------
  const allRows = readSheetRows(opts.input, opts.sheet);
  const heroRows = allRows.filter(isHeroRow);
  if (heroRows.length === 0) {
    console.error(`No Hero rows found in sheet "${opts.sheet}".`);
    process.exit(1);
  }
  console.log(`Read ${heroRows.length} Hero row(s) from "${opts.sheet}".`);

  // --- Shared pipeline bootstrap (bake ONCE) --------------------------------
  setupNodeCanvas();
  const psd = readPsd(readTemplatePsd(), { useImageData: true, useRawThumbnail: true });
  const model = extractModel(psd);
  const seed = seedValues(model);
  const background = bakeBackground(psd, {
    createCanvas: (w, h) => createCanvas(w, h) as any,
  });

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
        const which =
          of.clippedAbilityIndex !== undefined ? ` (ability ${of.clippedAbilityIndex + 1})` : '';
        errors.push(
          `${label}: abilities overflow the box even at min scale ${of.scale}${which} — shorten ability text`,
        );
        continue;
      }
    }
    validCards.push({ card, merged });
  }

  if (errors.length > 0) {
    console.error(`\nValidation FAILED — ${errors.length} error(s), no files written:\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // --- Render pass ----------------------------------------------------------
  mkdirSync(opts.out, { recursive: true });
  const used = new Set<string>();
  const manifest: Record<string, unknown>[] = [];
  for (const { card, merged } of validCards) {
    const canvas = createCanvas(model.width, model.height);
    const ctx = canvas.getContext('2d');
    renderCard(ctx, background, model, merged);
    const file = uniqueFilename(sanitizeCardName(card.name), used);
    writeFileSync(join(opts.out, file), canvas.toBuffer('image/png'));
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

main();
