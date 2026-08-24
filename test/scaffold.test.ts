// STORY-1 scaffold sanity test. Proves the Vitest runner works and that the
// bundled PSD asset resolves to real bytes on disk (the prod app fetches it as a
// URL; here we assert the source-of-truth file is present and non-empty).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Resolve the PSD relative to this test file so the check is location-independent.
const psdPath = fileURLToPath(new URL('../assets/Card_1.psd', import.meta.url));

describe('scaffold', () => {
  it('runs a trivial assertion (runner smoke test)', () => {
    expect(1 + 1).toBe(2);
  });

  it('the bundled Card_1.psd asset exists and has bytes > 0', () => {
    expect(existsSync(psdPath)).toBe(true);
    const bytes = readFileSync(psdPath);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
