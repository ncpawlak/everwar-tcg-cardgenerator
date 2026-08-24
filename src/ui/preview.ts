// STORY-11 — Preview + layout wiring. Builds the app shell: a prominent card canvas
// (with an Export button + status line) beside the field panel, and mounts it into
// the root. Returns the pieces the composition root needs (canvas, 2D context, export
// button, status element). Pure DOM, no framework.

/** The elements the composition root wires up. */
export interface PreviewLayout {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  exportButton: HTMLButtonElement;
  statusEl: HTMLElement;
}

/**
 * Assemble the two-column layout (preview | panel) inside `root` at the native card
 * resolution and return the interactive pieces.
 */
export function buildLayout(
  root: HTMLElement,
  width: number,
  height: number,
  panel: HTMLElement,
): PreviewLayout {
  root.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'app-shell';

  // Left column: the prominent card preview + export controls.
  const previewCol = document.createElement('div');
  previewCol.className = 'preview-col';

  const title = document.createElement('h1');
  title.textContent = 'EverWar Card Generator';
  previewCol.appendChild(title);

  const canvas = document.createElement('canvas');
  // Native card resolution — the export matches the preview 1:1.
  canvas.width = width;
  canvas.height = height;
  canvas.className = 'card-canvas';
  previewCol.appendChild(canvas);

  const controls = document.createElement('div');
  controls.className = 'controls';

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = 'Export PNG…';
  exportButton.className = 'export-btn';
  controls.appendChild(exportButton);

  const statusEl = document.createElement('span');
  statusEl.className = 'status';
  controls.appendChild(statusEl);

  previewCol.appendChild(controls);

  // Right column: the editable field panel.
  const panelCol = document.createElement('div');
  panelCol.className = 'panel-col';
  panelCol.appendChild(panel);

  shell.appendChild(previewCol);
  shell.appendChild(panelCol);
  root.appendChild(shell);

  // 2D context for rendering. `alpha: true` preserves PSD transparency on export.
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Could not acquire a 2D canvas context.');

  return { canvas, ctx, exportButton, statusEl };
}
