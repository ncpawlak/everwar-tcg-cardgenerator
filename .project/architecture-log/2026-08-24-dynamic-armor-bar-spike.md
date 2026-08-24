# Dynamic Armor Bar Spike

## Verdict

Feasible, but not by hiding one clean production layer.

PSD inspection found a candidate pixel layer:

- Layer inventory id/index: `10`
- Name/path: `green`
- Type: pixel layer
- Bounds: `(390,344)-(636,537)`
- Blend: `normal`, opacity `1`, visible
- It contains the armor-bar green segment art at approximately `(595,344)-(635,536)`, plus a tiny stray green speck near `(390,394)`.

However, hiding/skipping only `green` does **not** remove the fixed bar. The same fixed 8-segment bar is also baked into broad frame/right-rail layers (`Frame 0`, `Frame 1`, and/or `Layer 1`; broad bounds include `Frame 0 (-1,0)-(690,1022)`, `Frame 1 (0,0)-(690,1020)`, `Layer 1 (615,135)-(690,997)`). Skipping those broad layers destroys unrelated right-side frame art.

Therefore: treat the current bar as baked frame art. Use a cover patch over the bar track, then draw a dynamic bar over it. Do not rely on `green` as the only bake skip.

## Measured geometry in 690x1020 card coordinates

Visible green stack confirms the current art is 8 segments.

Recommended dynamic fill geometry:

```ts
const ARMOR_BAR_TRACK = {
  left: 599,
  top: 351,
  right: 629,
  bottom: 525,
}; // w=30, h=174

const ARMOR_BAR_SEGMENT_FILL = {
  left: 600,
  right: 629,
}; // visible green fill width ~=29px

const ARMOR_BAR_GAP_PX = 2;
```

Current 8-segment pitch matches:

- Track height `H = 174`.
- Gap `G = 2`.
- Segment height for `N=8`: `(174 - 7*2) / 8 = 20`.
- Segment y rects, exclusive-bottom: `[351,371)`, `[373,393)`, `[395,415)`, `[417,437)`, `[439,459)`, `[461,481)`, `[483,503)`, `[505,525)`.

The decorative outer recess/border extends beyond the dynamic fill area, roughly `(595,348)-(634,526)` with small rounded corners (~2-3px visual radius). Leave that frame art intact when possible; patch the old green/fill area only.

## Sampled colors

Representative samples from `assets/Card_1.psd` composite / layer pixels:

- Bright green highlight: `rgb(202,242,99)` / nearby `rgb(195,234,96)`.
- Mid fill green: `rgb(136,167,66)` to `rgb(148,181,72)`.
- Darker green edge/shadow: `rgb(80,89,44)` / `rgb(101,120,52)`.
- Divider/gap as currently visible through segment separations: `rgb(82,79,48)` at center divider rows; deepest recess/track edge: `rgb(13,14,13)` to `rgb(24,25,22)`.
- Empty/inactive track recommendation for `0`: fill patch interior with `rgb(13,14,13)` outer recess + `rgb(24,25,22)` inner track, preserving/re-drawing a subtle `rgb(82,79,48)` rim if the patch covers it.

The current green is not flat; it has top-lit bevel/highlight. A production implementation should either reproduce this with a small vertical gradient per segment or accept a flatter look by product decision.

## Dynamic layout math

This is not a partial-fill meter. For any `N > 0`, the full track height is occupied by `N` equal green segments separated by fixed-size gaps.

```ts
function armorBarSegments(n: number) {
  const N = Math.max(0, Math.floor(n));
  if (N === 0) return [];

  const left = 600;
  const right = 629;
  const top = 351;
  const height = 174;
  const gap = N === 1 ? 0 : 2;
  const segmentHeight = (height - (N - 1) * gap) / N;

  return Array.from({ length: N }, (_, i) => ({
    x: left,
    y: top + i * (segmentHeight + gap),
    w: right - left,
    h: segmentHeight,
  }));
}
```

Stack direction: top-to-bottom. Since the meter is always full for `N > 0`, top-vs-bottom fill semantics do not change the final coverage; the current 8 segments are vertically justified to fill the measured stack from `y=351` to `y=525`.

Proof rects:

- `N=0`: no segments; empty/inactive track patch only.
- `N=1`: `{ x:600, y:351, w:29, h:174 }` no gap.
- `N=2`: `{ y:351, h:86 }`, `{ y:439, h:86 }` with one 2px gap.
- `N=3`: segment height `56.6667`; y starts `351`, `409.6667`, `468.3333`.
- `N=8`: segment height `20`; y starts `351`, `373`, `395`, `417`, `439`, `461`, `483`, `505`.

## Integration plan

No production change was made in this spike. Suggested implementation path:

1. Extend the card data model with a numeric `armorBars` field. Keep the existing text `armor` field separate; it remains the printed armor number.
2. Add UI config/field metadata near `src/config/editableLayers.ts`, but do not model it as a PSD text layer. It is an authored numeric control like abilities is an authored structured region.
3. In `bakeBackground.ts`, patch over the baked fixed bar during the static bake, analogous to `ABILITIES_BADGE_PATCH`. Do **not** skip broad frame layers. Optionally also skip `green`, but still patch because the bar persists without it.
4. Add a pure layout helper, e.g. `src/render/armorBarLayout.ts`, that accepts `{ track, gap, armorBars }` and returns segment rects. Keep it measurer-free and unit-testable.
5. Add `drawArmorBar(ctx, armorBars)` to render the inactive track for `0` or the green segments for `N > 0`.
6. Call `drawArmorBar()` from `renderCard.ts` immediately after drawing the cached background and before drawing editable text.
7. Validation/capping should live at state/input boundaries and in the pure layout helper:
   - coerce to integer;
   - floor at `0`;
   - cap at a product-approved max;
   - layout helper should remain defensive even if UI validation is bypassed.

## Proof PNGs

Generated and visually checked in the session files directory:

- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\armorbar-N0.png`
- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\armorbar-N1.png`
- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\armorbar-N2.png`
- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\armorbar-N3.png`
- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\armorbar-N5.png`
- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\armorbar-N8.png`

## Open questions

1. What is the maximum allowed `armorBars` value? Above ~12, 2px gaps leave very short segments at native resolution.
2. Should `0` mean an empty recessed track remains visible, or should the entire bar module visually disappear? The request says empty/greyed-out; current recommendation keeps the recess.
3. Should dynamic segments preserve the current beveled/gradient green look, or is a flatter green acceptable?
4. Should non-integer user input round, floor, or reject with validation messaging?
5. Should the default value come from the current template count (`8`) or from card data/import defaults?
