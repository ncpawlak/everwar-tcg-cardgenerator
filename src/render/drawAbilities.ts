// STORY-14 (Variant D) — Draw the structured abilities block over the background. The
// layout math (mixed-weight wrapping, paragraph gaps, whole-line clipping, dormant
// shrink-to-fit) lives in the PURE `layoutAbilities` core; this file only reads the six
// ability value keys, clips to the box interior, and blits the resolved segments with
// `ctx.measureText` injected as the measurer. Empty abilities produce NO output (keeps
// the fidelity baseline honest: the empty-abilities render matches the PSD composite).
import type { AbilitiesFieldModel } from '../psd/types';
import { ABILITY_SLOTS } from '../config/editableLayers';
import { layoutAbilities } from './abilitiesLayout';
import { ctxMeasure, rgbCss, type Ctx2D } from './drawText';

/**
 * Gather the up-to-three abilities from the flat value map (each ability is two keys:
 * `abilityN-name` / `abilityN-body`). Missing keys default to empty strings.
 */
export function abilitiesFromValues(values: Record<string, string>): { name: string; body: string }[] {
  return ABILITY_SLOTS.map((slot) => ({
    name: values[slot.nameKey] ?? '',
    body: values[slot.bodyKey] ?? '',
  }));
}

/**
 * Draw the abilities body. Reads the current values, lays them out (native size unless
 * the block overflows the reclaimed 191px box, then shrinks toward minScale), and draws
 * each positioned segment. Clipped to the box interior so nothing spills past the gold
 * borders. No-op when every ability is blank.
 */
export function drawAbilities(
  ctx: Ctx2D,
  field: AbilitiesFieldModel,
  values: Record<string, string>,
): void {
  const abilities = abilitiesFromValues(values);
  const layout = layoutAbilities(abilities, {
    x: field.textArea.x,
    textTop: field.textArea.y,
    maxWidth: field.textArea.w,
    textBottom: field.textBottom,
    fontSize: field.fontSize,
    lineHeight: field.lineHeight,
    paragraphGap: field.paragraphGap,
    boldFamily: field.boldFont,
    romanFamily: field.font,
    minScale: field.minScale,
    measure: ctxMeasure(ctx),
  });
  if (layout.lines.length === 0) return; // nothing to draw (all abilities empty)

  ctx.save();
  // Clip strictly to the black interior so no glyph draws over the gold borders.
  ctx.beginPath();
  ctx.rect(
    field.box.left,
    field.box.top,
    field.box.right - field.box.left,
    field.box.bottom - field.box.top,
  );
  ctx.clip();
  ctx.fillStyle = rgbCss(field.color);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // Each segment carries its own font (bold name vs regular body) at the chosen scale.
  for (const line of layout.lines) {
    for (const seg of line.segments) {
      ctx.font = seg.font;
      ctx.fillText(seg.text, seg.x, line.y);
    }
  }
  ctx.restore();
}
