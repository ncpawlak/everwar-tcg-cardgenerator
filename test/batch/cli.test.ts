// STORY-17a — Tests for the CLI's sheet reader: the fs-not-found guard and buffer parsing
// (the fix for SheetJS's ESM `XLSX.readFile` fs-binding issue — we read bytes ourselves).
import { describe, it, expect } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { readSheetRows } from '../../src/batch/cli';

describe('readSheetRows', () => {
  it('throws a clear error when the input file does not exist', () => {
    expect(() => readSheetRows('C:\\no\\such\\file.xlsx', 'Sheet1')).toThrow(
      /Input file not found/,
    );
  });

  it('parses a real xlsx buffer from disk and trims header keys', () => {
    // Build a tiny workbook with a padded header (" Name ") to prove the trim.
    const ws = XLSX.utils.aoa_to_sheet([
      [' Name ', 'Type'],
      ['Goliath', 'Hero'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const path = fileURLToPath(new URL('./__fixture.xlsx', import.meta.url));
    writeFileSync(path, buf);
    try {
      const rows = readSheetRows(path, 'S');
      expect(rows).toEqual([{ Name: 'Goliath', Type: 'Hero' }]);
    } finally {
      rmSync(path, { force: true });
    }
  });

  it('throws a helpful error listing sheets when the named sheet is missing', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Name']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Only');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const path = fileURLToPath(new URL('./__fixture2.xlsx', import.meta.url));
    writeFileSync(path, buf);
    try {
      expect(() => readSheetRows(path, 'Missing')).toThrow(/Sheet "Missing" not found/);
    } finally {
      rmSync(path, { force: true });
    }
  });
});
