# Dynamic COMMANDER / UNIQUE chips spike

Date: 2026-08-24
Role: Senior Coder
Scope: feasibility only. No production code in `src/`.

## Verdict

The chip text layers are separate PSD text layers, but the pill/capsule art is baked into the larger raster frame layer:

| Chip | Text layer | Text bounds | Pill art layer | Pill/patch bounds |
|---|---:|---|---:|---|
| COMMANDER | `#7 COMMANDER` | `{ left: 90, top: 698, right: 185, bottom: 712 }` | `#6 Layer 3` | `{ left: 52, top: 686, right: 222, bottom: 728 }` |
| UNIQUE | `#8 UNIQUE` | `{ left: 268, top: 701, right: 314, bottom: 713 }` | `#6 Layer 3` | `{ left: 220, top: 687, right: 370, bottom: 728 }` |

`Layer 3` itself is a broad raster layer with bounds `{ left: 20, top: 686, right: 670, bottom: 979 }`. The chip capsules are not independently hideable PSD shape layers.

Important consequence: skipping `COMMANDER` / `UNIQUE` text layers alone is insufficient; it leaves the baked pill art. Hiding a chip requires a patch over the full pill rect after the static art and text have been composited.

## Geometry / surrounding art

Chip area is the upper tag rail above the `INFANTRY` / faction row. Behind/around the chips is a dark olive-black frame strip with subtle row-wise gradient, a thin green/gold horizontal bevel line, and light texture. It is not plain black. The lower tag row begins around y=736/743; the hide rects stop at y=728, so the `INFANTRY` / `IRONWARD LEGION` row is not touched.

The two patch rects intentionally meet near the inter-chip seam but do not overlap the visible neighboring chip body:

- COMMANDER hide rect: `{ left: 52, top: 686, right: 222, bottom: 728 }`
- UNIQUE hide rect: `{ left: 220, top: 687, right: 370, bottom: 728 }`

These rects remove pill border, pill fill, and text. Removing only one does not disturb the other chip or the tag row below.

## Hide recipe

Recommended patch method: donor reconstruction from the same row of the already-baked background.

Use a stable no-chip donor strip on the right side of the same rail:

```ts
const CHIP_DONOR_STRIP = { left: 380, right: 500 };
```

For each y row in the target chip rect, sample pixels from x=380..499 at the same y, take the median RGBA, and fill the target row with that value. This preserves the rail's horizontal bevel/gradient while avoiding copied diagonals or ornaments from neighboring caps.

Patch after compositing all PSD layers for a "hidden" chip so both the baked capsule in `Layer 3` and the separate text layer are erased.

## Show path

When the flag is true, render exactly as today: bake/draw the PSD normally and do not patch that chip.

Cleaner integration: keep the baseline background with both chips present, then apply chip hide patches during `renderCard` after `ctx.drawImage(background, 0, 0)` and before editable text. This keeps checkbox changes live without re-parsing/re-baking the PSD. A bake-time `BakeDeps` patch flag is useful for tests or precomputed variants, but render-time patching fits the current cached-background architecture better.

## Integration plan

- Add model values:
  - `commander: boolean`, default `true`
  - `unique: boolean`, default `true`
- Add config constants for:
  - commander chip rect
  - unique chip rect
  - donor strip `{ left: 380, right: 500 }`
- Add a small render helper, e.g. `patchChip(ctx, rect)`, using row-median donor fill from the current background pixels.
- In `renderCard`, after background blit:
  - if `commander === false`, patch commander rect
  - if `unique === false`, patch unique rect
  - then draw dynamic armor bar and editable text as today
- UI: two checkboxes, default checked.
- Fidelity test remains honest by defaulting both booleans true and doing no chip patch; the baseline still compares against the PSD composite with both chips present.

## Proof PNGs

Generated proof crops:

- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\chips-both.png`
- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\chips-no-commander.png`
- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\chips-none.png`
- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\chips-no-unique.png`

Viewed all four outputs. No text ghosting, no leftover pill outline, and the lower `INFANTRY` / faction row remains intact.

## Open questions

- Product should confirm whether the no-chip state should expose a continuous rail (as proved here) or collapse/re-center remaining chips. The cleanest technical path is hide-only; no reflow.
