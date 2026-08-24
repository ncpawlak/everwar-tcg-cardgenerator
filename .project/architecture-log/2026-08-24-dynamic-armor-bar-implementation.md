# Dynamic Armor Bar — Implementation Note (STORY-15)

Implements the Senior's spike (`2026-08-24-dynamic-armor-bar-spike.md`) as production.

## What shipped

- **Authored numeric control** `armorBars` (integer 0–8, default 8), separate from the
  printed `armor` text field. Lives as a `CardModel` scalar + a flat `armorBars` value
  key (string), NOT a PSD text layer and NOT in `model.order`.
- **Config** `src/config/armorBar.ts`: track `{599,351,629,525}` (H=174), fill inset to
  x=600, gap 2, cap/default 8, sampled colours, and the bake-patch rect.
- **Pure layout** `src/render/armorBarLayout.ts`: `armorBarSegments(n, track, gap)` splits
  the fill rect into N equal segments (gap 0 for N=1); `coerceArmorBars` floors+clamps to
  [0,8]. Canvas-free.
- **Draw** `src/render/drawArmorBar.ts`: N=0 → empty recessed track; N>0 → olive divider
  base + top-lit/left-beveled gradient green segments. Called from `renderCard` after the
  background blit and before editable text.
- **Bake patch** `bakeBackground` `patchArmorBar` (default true) covers the baked green
  with the empty-recess colour so no old green survives; the dynamic bar redraws on every
  render.
- **UI** an "Armor bars (0–8)" number input in `fieldPanel.ts`, coerced+clamped before it
  reaches state.

## Measurement refinement over the spike

Sampling the PSD composite showed the baked green occupies **x599–628, y351–524**. The
green is beveled: x600 is a bright left highlight `(200,239,98)`, gap rows read olive
`(82,79,48)`. So the fill is drawn at x600 (width 29) with x599 left as a thin edge rim,
and the divider base is painted olive (not black) so the 2px gaps match the baked art.

## Fidelity honesty

The PSD composite still carries its own baked 8-segment bar. The fidelity test bakes with
`patchArmorBar:false` (keep the baked bar) AND deletes the `armorBars` value key so
`renderCard` skips the dynamic bar — an apples-to-apples comparison. Baseline stays
**0.914%**.

## Verification

89 tests green, `npm run build` clean, `npx eslint .` exit 0. QA renders
`armorbar-final-N{0,1,2,3,5,8}.png` visually match the spike proofs.
