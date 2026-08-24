# Dynamic COMMANDER / UNIQUE chips — implementation note (STORY-16)

**Date:** 2026-08-24
**Author:** Coder agent (Gate 2 build)
**Spike:** `.project/architecture-log/2026-08-24-dynamic-chips-spike.md` (Senior)
**Status:** Implemented, full suite green (96 tests), fidelity 0.914%, local commit only.

## What shipped

Two authored booleans — `commander` and `unique`, both **default true** — that hide each
rarity chip independently at render time. Hide-only: hiding one chip does not reflow the
other (product-approved). Mirrors the armor-bar pattern: authored flag → config constants →
pure/unit-tested helper → render-time application → BakeDeps honesty.

- **Model:** `commander`/`unique` on `CardModel` (`src/psd/types.ts`), set true by
  `extractModel`, seeded to the flat value store by `seedValues` as `'true'/'false'`.
- **Config:** `src/config/chips.ts` — `COMMANDER_CHIP_RECT {52,686,222,728}`,
  `UNIQUE_CHIP_RECT {220,687,370,728}`, `CHIP_DONOR_STRIP {380,500}`.
- **Helper:** `src/render/patchChip.ts` — pure `computeRowFill` (per-channel median of a
  donor row, even-count averages the two middle order-statistics) + `patchChip(ctx, rect)`.
- **Integration:** `renderCard` patches the commander rect when `commander==='false'` and the
  unique rect when `unique==='false'`, right after `drawImage(background,0,0)` (so the donor
  read sees the baked rail) and before the armor bar / editable text.
- **UI:** two checkboxes in `fieldPanel.ts` (default checked), debounced → re-render.

## The one non-obvious finding (donor is transparent → putImageData, not fillRect)

The Senior spec called for donor reconstruction to "preserve the rail bevel/gradient." When
I sampled `CHIP_DONOR_STRIP {380,500}` against the **production baked background** (which
preserves PSD transparency), the donor rows came back **fully transparent** (`rgba 0,0,0,0`).
Confirmed this is real: even a full flatten of every PSD layer is transparent at x=380–500,
y≈700 — the card frame has a genuine **transparent cutout** in the empty rail slot to the
right of the chips. So the correct "no chip" look is transparent, matching that empty slot.

Consequence for the fill primitive: a `fillRect` at `globalAlpha = a/255 = 0` paints
**nothing**, leaving the opaque baked pill visible. The patch must therefore **replace** the
destination pixels (alpha included), which `fillRect`/alpha-blending cannot do. `patchChip`
now builds an `ImageData` for the rect from the per-row donor colours and `putImageData`s it
once — a wholesale pixel replace. A transparent donor row then clears the pill to
transparent; an opaque donor row would write its colour. This is robust either way.

Rects stop at `y=728`, above the INFANTRY/faction tag row (~y=736+), so that row is never
touched. Verified in QA crops: `chips-final-{both,no-commander,no-unique,none}.png` show
clean hide with the tag row and the other chip intact.

## Fidelity honesty

No bake-time change — the default bake path is unchanged and both flags default true, so no
patch runs in the fidelity baseline. It still compares the render against the PSD composite
with both chips present: **0.914% holds** (unchanged).

## Tests

- `test/patchChip.test.ts` — median: odd, even-average, outlier robustness, empty-throws.
- `test/renderCard.test.ts` — a false flag erases the chip's text band (differs) while the
  other chip and the INFANTRY row (y=745) stay byte-identical.
- `test/extractModel.test.ts` — chips default true.
- `test/fieldPanel.test.ts` — checkboxes exist, default checked, emit `'true'/'false'`.

Test count 89 → 96, all green. Build clean, eslint clean.
