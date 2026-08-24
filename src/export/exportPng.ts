// STORY-12 — PNG export via the File System Access API (spec §7). Produces a native
// 690×1020 PNG from the preview canvas with `toBlob('image/png')` (transparency
// preserved — the canvas is never flattened to opaque), then lets the user pick a
// folder + filename EVERY export via `showSaveFilePicker` and writes the blob there.
// Falls back to an `<a download>` when the picker is unavailable (optional), otherwise
// throws loudly.

/** Minimal canvas shape we need (DOM canvas in prod; a stub in tests). */
interface CanvasLike {
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

/** Minimal file-picker/handle shapes (File System Access API). */
interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}
type ShowSaveFilePicker = (options?: any) => Promise<FileHandleLike>;

/** Export options (all injectable for tests). */
export interface ExportOptions {
  /** Picker impl (defaults to `window.showSaveFilePicker`). */
  showSaveFilePicker?: ShowSaveFilePicker;
  /** Default filename offered in the Save dialog. */
  suggestedName?: string;
  /** If true (default), fall back to an `<a download>` when the picker is absent. */
  downloadFallback?: boolean;
}

/** Wrap `canvas.toBlob` in a promise, rejecting if the browser returns null. */
function canvasToPngBlob(canvas: CanvasLike): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null — could not encode PNG.'));
    }, 'image/png');
  });
}

/** Trigger a plain `<a download>` for the blob (fallback path). */
function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Export the canvas as a PNG. Opens the Save dialog each call; writes the blob to the
 * chosen handle. Uses the download fallback only if the picker is missing.
 */
export async function exportPng(canvas: CanvasLike, opts: ExportOptions = {}): Promise<void> {
  const suggestedName = opts.suggestedName ?? 'everwar-card.png';
  const downloadFallback = opts.downloadFallback ?? true;
  // Default to the browser global when not injected.
  const picker =
    opts.showSaveFilePicker ??
    (typeof window !== 'undefined'
      ? (window as any).showSaveFilePicker as ShowSaveFilePicker | undefined
      : undefined);

  const blob = await canvasToPngBlob(canvas);

  if (typeof picker === 'function') {
    // Preferred path: user picks folder + filename every time.
    const handle = await picker({
      suggestedName,
      types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  // Picker unavailable — either degrade to a download or fail loudly.
  if (downloadFallback && typeof document !== 'undefined') {
    downloadBlob(blob, suggestedName);
    return;
  }
  throw new Error(
    'showSaveFilePicker is unavailable in this browser and the download fallback is ' +
      'disabled. Use a Chromium-based browser (Chrome/Edge) to export.',
  );
}
