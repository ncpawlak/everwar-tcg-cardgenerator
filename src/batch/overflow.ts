// STORY-17 — Batch CLI: PURE abilities-overflow detector. The interactive app silently
// shrinks the abilities block to `minScale` (0.7) and then clips whole lines that still
// don't fit. For an unattended BATCH we must NOT ship a card with clipped ability text, so
// this reuses the existing pure `layoutAbilities` and surfaces its `clipped` signal (plus
// which ability overflowed) as a hard validation error. Kept measurer-injected → no canvas
// dependency, unit-testable.
import type { Ability, AbilitiesFieldModel } from '../psd/types';
import type { Measure } from '../render/layoutTitle';
import { layoutAbilities } from '../render/abilitiesLayout';

/** Result of checking one card's abilities against its box. */
export interface OverflowResult {
  /** True when a whole line had to be dropped even at the minimum scale. */
  overflow: boolean;
  /** Chosen font scale (1.0 = native, down to the field's minScale). */
  scale: number;
  /**
   * 0-based index (into the NON-EMPTY abilities) of the first ability that could not be
   * fully placed. Undefined when nothing overflowed.
   */
  clippedAbilityIndex?: number;
}

/**
 * Lay out `abilities` with the field's production geometry (reclaimed top, 191px box,
 * shrink-to-minScale, whole-line clip) using the injected `measure`, and report whether
 * anything was clipped. Blank abilities are skipped by the layout, so an all-empty card
 * never overflows.
 */
export function detectAbilitiesOverflow(
  abilities: Ability[],
  field: AbilitiesFieldModel,
  measure: Measure,
): OverflowResult {
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
    measure,
  });
  return {
    overflow: layout.clipped,
    scale: layout.scale,
    clippedAbilityIndex: layout.clippedAbilityIndex,
  };
}
