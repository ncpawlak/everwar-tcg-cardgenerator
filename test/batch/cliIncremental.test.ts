// STORY-18b — CLI-level tests for incremental mode. These drive the exported `run()` in
// process (Vitest sets VITEST so the module's `main()` never auto-runs) against small xlsx
// fixtures and temp output dirs, then assert on-disk effects. Real bake+render is used, so a
// tiny 2-row sheet keeps each run fast.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { run } from '../../src/batch/cli';

const SHEET = 'S';
const tmpRoot = fileURLToPath(new URL('./.clitmp', import.meta.url));
let counter = 0;

/** A valid Hero row object keyed by the real spreadsheet headers. */
function heroRow(name: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Name: name,
    Type: 'Hero',
    SubType: 'Heavy',
    Allegiance: 'Coalition',
    Level: 4,
    HP: 240,
    DMG: 60,
    ACC: 80,
    'Armor Bars': 2,
    Armor: 20,
    Unique: 1,
    Commander: 1,
    'Ability 1': 'Iron Wall: Reduce damage by half.',
    'Ability 2': '',
    'Ability 3': '',
    ...over,
  };
}

/** Write an xlsx fixture with the given rows on sheet "S" and return its path. */
function writeSheet(dir: string, rows: Record<string, unknown>[]): string {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET);
  const p = join(dir, 'cards.xlsx');
  writeFileSync(p, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return p;
}

/** Make a fresh, unique temp working dir under the test tmp root. */
function freshDir(): string {
  const d = join(tmpRoot, `t${counter++}`);
  mkdirSync(d, { recursive: true });
  return d;
}

/** List root-level PNG filenames in an output dir (excludes the archive subfolder). */
function pngs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
}

beforeAll(() => {
  mkdirSync(tmpRoot, { recursive: true });
});
afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

let work: string;
beforeEach(() => {
  work = freshDir();
});

describe('incremental CLI', () => {
  it('with no prior manifest, renders all cards (full behavior)', () => {
    const input = writeSheet(work, [heroRow('Alpha'), heroRow('Bravo')]);
    const out = join(work, 'out');
    run({ input, sheet: SHEET, out, incremental: true, dryRun: false });
    expect(pngs(out).sort()).toEqual(['alpha.png', 'bravo.png']);
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    expect(manifest.map((e: any) => e.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('--dry-run --incremental writes nothing', () => {
    const input = writeSheet(work, [heroRow('Alpha')]);
    const out = join(work, 'out');
    run({ input, sheet: SHEET, out, incremental: true, dryRun: true });
    expect(existsSync(join(out, 'manifest.json'))).toBe(false);
    expect(pngs(out)).toEqual([]);
    expect(existsSync(join(out, 'archive'))).toBe(false);
  });

  it('fails loud on a corrupt prior manifest and writes nothing', () => {
    const input = writeSheet(work, [heroRow('Alpha')]);
    const out = join(work, 'out');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'manifest.json'), '{ this is not json');
    expect(() => run({ input, sheet: SHEET, out, incremental: true, dryRun: false })).toThrow(
      /Corrupt prior manifest/,
    );
    expect(pngs(out)).toEqual([]);
  });

  it('a validation failure causes no renders, no archive, no manifest write', () => {
    // Seed a valid prior run first.
    const input1 = writeSheet(work, [heroRow('Alpha')]);
    const out = join(work, 'out');
    run({ input: input1, sheet: SHEET, out, incremental: true, dryRun: false });
    const before = readFileSync(join(out, 'manifest.json'), 'utf8');

    // Now feed a sheet where Alpha changed but a new row is invalid (non-numeric HP).
    const input2 = writeSheet(work, [heroRow('Alpha', { HP: 999 }), heroRow('Bravo', { HP: 'oops' })]);
    expect(() => run({ input: input2, sheet: SHEET, out, incremental: true, dryRun: false })).toThrow(
      /Validation FAILED/,
    );
    // Prior manifest untouched, no archive dir, only the original png present.
    expect(readFileSync(join(out, 'manifest.json'), 'utf8')).toBe(before);
    expect(existsSync(join(out, 'archive'))).toBe(false);
    expect(pngs(out).sort()).toEqual(['alpha.png']);
  });

  it('a CHANGED row archives the old PNG then writes the new one', () => {
    const out = join(work, 'out');
    const input1 = writeSheet(work, [heroRow('Alpha')]);
    run({ input: input1, sheet: SHEET, out, incremental: true, dryRun: false });
    const oldBytes = readFileSync(join(out, 'alpha.png'));

    const input2 = writeSheet(work, [heroRow('Alpha', { HP: 999 })]);
    run({ input: input2, sheet: SHEET, out, incremental: true, dryRun: false });

    // A versioned archive copy of the old png exists…
    const archived = readdirSync(join(out, 'archive'));
    expect(archived.some((f) => f.startsWith('alpha-') && f.endsWith('.png'))).toBe(true);
    // …the live png was rewritten (bytes differ) …
    expect(readFileSync(join(out, 'alpha.png')).equals(oldBytes)).toBe(false);
    // …and the manifest reflects the new value.
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    expect(manifest.find((e: any) => e.name === 'Alpha').hp).toBe(999);
  });

  it('a REMOVED row is archived and dropped from the manifest', () => {
    const out = join(work, 'out');
    const input1 = writeSheet(work, [heroRow('Alpha'), heroRow('Bravo')]);
    run({ input: input1, sheet: SHEET, out, incremental: true, dryRun: false });
    expect(pngs(out).sort()).toEqual(['alpha.png', 'bravo.png']);

    // Re-run with Bravo removed from the sheet.
    const input2 = writeSheet(work, [heroRow('Alpha')]);
    run({ input: input2, sheet: SHEET, out, incremental: true, dryRun: false });

    // Bravo's png moved into archive/, gone from the root, and dropped from the manifest.
    expect(pngs(out).sort()).toEqual(['alpha.png']);
    const archived = readdirSync(join(out, 'archive'));
    expect(archived.some((f) => f.startsWith('bravo-') && f.endsWith('.png'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    expect(manifest.map((e: any) => e.name)).toEqual(['Alpha']);
  });

  it('an UNCHANGED re-run renders nothing and keeps the manifest', () => {
    const out = join(work, 'out');
    const input = writeSheet(work, [heroRow('Alpha')]);
    run({ input, sheet: SHEET, out, incremental: true, dryRun: false });
    const first = readFileSync(join(out, 'manifest.json'), 'utf8');
    run({ input, sheet: SHEET, out, incremental: true, dryRun: false });
    expect(readFileSync(join(out, 'manifest.json'), 'utf8')).toBe(first);
    expect(existsSync(join(out, 'archive'))).toBe(false); // nothing superseded
  });
});
