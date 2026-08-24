// STORY-12 test (@vitest-environment jsdom) — export must produce a PNG blob via
// toBlob('image/png'), invoke showSaveFilePicker, and write the blob to the chosen
// writable then close it. All browser APIs are mocked/injected.
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { exportPng } from '../src/export/exportPng';

/** A fake canvas whose toBlob yields a PNG blob and records the requested MIME. */
function fakeCanvas() {
  const calls: { type?: string } = {};
  const canvas = {
    toBlob(cb: (b: Blob | null) => void, type?: string) {
      calls.type = type;
      cb(new Blob(['PNGDATA'], { type: 'image/png' }));
    },
  };
  return { canvas, calls };
}

describe('exportPng', () => {
  it('requests image/png, opens the picker, writes the blob, and closes', async () => {
    const { canvas, calls } = fakeCanvas();
    const written: Blob[] = [];
    let closed = false;
    const writable = {
      write: (b: Blob) => {
        written.push(b);
        return Promise.resolve();
      },
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    };
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: () => Promise.resolve(writable),
    });

    await exportPng(canvas as any, { showSaveFilePicker, suggestedName: 'card.png' });

    expect(calls.type).toBe('image/png');
    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(written).toHaveLength(1);
    expect(written[0].type).toBe('image/png');
    expect(closed).toBe(true);
  });

  it('passes a suggestedName + png accept types to the picker', async () => {
    const { canvas } = fakeCanvas();
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: () =>
        Promise.resolve({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
    });
    await exportPng(canvas as any, { showSaveFilePicker, suggestedName: 'hero.png' });
    const arg = showSaveFilePicker.mock.calls[0][0];
    expect(arg.suggestedName).toBe('hero.png');
    expect(JSON.stringify(arg.types)).toContain('image/png');
  });

  it('throws a loud error when showSaveFilePicker is unavailable and no fallback given', async () => {
    const { canvas } = fakeCanvas();
    await expect(
      exportPng(canvas as any, { showSaveFilePicker: undefined, downloadFallback: false }),
    ).rejects.toThrow(/showSaveFilePicker/);
  });
});
