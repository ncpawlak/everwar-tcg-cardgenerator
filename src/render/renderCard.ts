// STORY-9 — renderCard orchestrator. Draws the cached background once, then every
// editable field over it, at 690×1020. This is the ONLY path that re-runs on an edit;
// it never re-parses the PSD or re-bakes the background (spec §4.3, §5).
import type { CardModel } from '../psd/types';
import { isAbilities } from '../psd/types';
import { drawText, type Ctx2D } from './drawText';
import { drawAbilities } from './drawAbilities';
import { drawArmorBar } from './drawArmorBar';

/** Anything drawImage accepts as a source (canvas/bitmap). Typed loosely for env. */
export type BackgroundSource = any;

/**
 * Render the full card: clear, draw the cached background, then draw all fields in
 * model order using the current `values` (field id → text).
 */
export function renderCard(
  ctx: Ctx2D,
  background: BackgroundSource,
  model: CardModel,
  values: Record<string, string>,
): void {
  // Clear to transparent so the export preserves the PSD's transparency (never fill
  // an opaque colour). Then blit the pre-baked background.
  ctx.clearRect(0, 0, model.width, model.height);
  ctx.drawImage(background, 0, 0);

  // Dynamic armor bar (STORY-15): drawn over the (patched) background and BEFORE any
  // editable text. Skipped ONLY when the value key is absent — the fidelity baseline
  // deletes it so the render is compared against the PSD's own baked bar apples-to-apples.
  if (values['armorBars'] !== undefined) {
    drawArmorBar(ctx, values['armorBars']);
  }

  // Draw each editable field over the background in defined order.
  for (const id of model.order) {
    const field = model.fields[id];
    // Abilities is a structured, multi-value block (up to 3 name+body pairs) drawn
    // from six flat value keys — not a single string — so it has its own draw path.
    if (isAbilities(field)) {
      drawAbilities(ctx, field, values);
      continue;
    }
    // Fall back to the model's captured text if no live value is present.
    const value = values[id] ?? field.text;
    drawText(ctx, field, value);
  }
}
