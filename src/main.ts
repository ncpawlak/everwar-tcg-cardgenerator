// STORY-11 — Composition root. Wires the whole pipeline together in order:
//   loadFonts → loadPsd → extractModel → bakeBackground → seed state → mount UI →
//   first render → subscribe (debounced re-render) → wire export.
// Only the render step re-runs on edits; the PSD is never re-parsed and the
// background is never re-baked (spec §4.3, §5).
import psdUrl from '../assets/Card_1.psd?url';
import boldUrl from '../assets/fonts/Square721BT-BoldCondensed.otf?url';
import romanUrl from '../assets/fonts/Square721BT-RomanCondensed.otf?url';
import './style.css';

import { loadFonts, FONT_FAMILIES } from './fonts/loadFonts';
import { loadPsd } from './psd/loadPsd';
import { extractModel } from './psd/extractModel';
import { bakeBackground } from './render/bakeBackground';
import { renderCard } from './render/renderCard';
import { createAppState, type Values } from './state/appState';
import { createFieldPanel } from './ui/fieldPanel';
import { buildLayout } from './ui/preview';
import { exportPng } from './export/exportPng';
import { EDITABLE_FIELDS } from './config/editableLayers';
import type { CardModel } from './psd/types';

/** Seed the value map from the model's captured field texts. */
function seedFromModel(model: CardModel): Values {
  const values: Values = {};
  for (const id of model.order) values[id] = model.fields[id].text;
  return values;
}

/** Show a loud, readable fatal error in the app root (fonts/PSD failures, etc.). */
function showFatal(root: HTMLElement, err: unknown): void {
  root.innerHTML = '';
  const pre = document.createElement('pre');
  pre.className = 'fatal';
  pre.textContent = `Failed to start the card generator:\n\n${
    err instanceof Error ? err.message : String(err)
  }`;
  root.appendChild(pre);
}

/** Boot the app. */
async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app mount element.');

  try {
    // 1. Fonts FIRST — block first render so text never uses a fallback face.
    await loadFonts([
      { family: FONT_FAMILIES.bold, url: boldUrl },
      { family: FONT_FAMILIES.roman, url: romanUrl },
    ]);

    // 2. Load + parse the PSD (reader-only).
    const psd = await loadPsd(psdUrl);

    // 3. Extract the typed, serializable model.
    const model = extractModel(psd);

    // 4. Bake the static background ONCE (cached; never re-baked on edits).
    const background = bakeBackground(psd);

    // 5. Seed state from the model's captured values.
    const seed = seedFromModel(model);
    const state = createAppState(seed);

    // 6. Build the field panel (edits push into state; debounce lives in state).
    const panel = createFieldPanel({
      fields: EDITABLE_FIELDS,
      seed,
      onInput: (id, value) => state.set(id, value),
    });

    // 7. Mount the layout and grab the render context + export controls.
    const { canvas, ctx, exportButton, statusEl } = buildLayout(
      root,
      model.width,
      model.height,
      panel,
    );

    // The ONLY thing that re-runs on an edit: redraw editable text over the cache.
    const render = (values: Values): void => renderCard(ctx, background, model, values);

    // 8. First render, then subscribe for debounced live updates.
    render(state.getAll());
    state.subscribe(render);

    // 9. Wire export (user picks folder + filename every time).
    exportButton.addEventListener('click', async () => {
      try {
        statusEl.textContent = 'Saving…';
        await exportPng(canvas, { suggestedName: 'everwar-card.png' });
        statusEl.textContent = 'Saved.';
      } catch (err) {
        // AbortError (user cancelled) is expected and non-fatal.
        const msg = err instanceof Error ? err.message : String(err);
        statusEl.textContent = /abort/i.test(msg) ? 'Export cancelled.' : `Export failed: ${msg}`;
      }
    });
  } catch (err) {
    showFatal(root, err);
    throw err;
  }
}

void main();
