# 2026-08-23 — SPIKE: Removing the "ABILITIES" badge, keeping the box border

**Author:** Senior Coder · **Type:** Feasibility spike (throwaway, `spike/patch3.js`) · **Verdict: FEASIBLE (yes)**

## Question
Can we remove the "ABILITIES" badge (banner shape + "ABILITIES" text) from the abilities box while
keeping the box's border intact? The badge shape is **baked into the frame artwork** (Frame 0/1/2,
Layer 3) — it is NOT a hideable layer — so it must be patched out of the rendered composite. Only the
"ABILITIES" **text** (layer #9) is a separate, omittable layer.

## Corrected geometry (this supersedes the first-pass reading)
The lower-left of the card has **TWO stacked, separate banners** — the first pass conflated them:
1. **INFANTRY tag-row banner (upper):** a full-width olive/gold chevron divider band holding the
   editable **INFANTRY / IRONWARD LEGION / HUMAN** text. Sits ABOVE the abilities box (~y735–768).
   **This is legit card structure — must NOT be touched.**
2. **ABILITIES banner (lower):** a separate, shorter olive/gold banner (left + right chevron ends)
   holding "ABILITIES" text. It sits **entirely INSIDE the abilities box interior** — below the box
   top border and right of the box left border.

- **Box top border:** thin gold line at **y768–770**, horizontally uniform, full width. KEEP.
- **Box left border:** vertical gold line at **x30–32** (glow to ~x28). KEEP.
- **ABILITIES banner footprint (measured):** top outline y774, bottom y814; left chevron tip ~x34
  (black box-interior between border x32 and banner); **right chevron tip reaches x=251** (y789–790).
- **Box interior:** pure black `rgb(0,0,0)`.

## Patch approach (final — v3)
Because the ABILITIES banner lives **wholly inside the black box interior**, removal is trivial:
> **Fill rectangle `{left:33, top:771, right:254, bottom:816}` with black `rgb(0,0,0)`.**

No border reconstruction, no donor stamping, no tag-row involvement. The box top border (y768–770)
and left border (x<=32) are never crossed; the INFANTRY tag-row band (y<771) is never crossed.

## Defect from the first pass, and the fix
The first-pass patch (`patch.js`) repainted **upward from y754**, cutting through the box top border
AND up into the INFANTRY tag-row band, stamping an interior/border donor over the tag row. That
produced the reported **"brown box"** over the tag row and **clipped INFANTRY**. Root cause was the
mistaken belief that the banner overlapped the top border and tag row; in fact it does neither.
The v3 interior-only black fill eliminates the defect entirely — the tag row and both borders are
outside the patched rectangle by construction. **No tag-row donor is needed.**

## Editable-text requirement
The baked BACKGROUND must contain **no tag-row text** (INFANTRY/IRONWARD LEGION/HUMAN are drawn by
the renderer on top, editable). The proof composite therefore excludes those text layers *and* the
"ABILITIES" text layer; sample tag + body text is overlaid only to prove alignment on the clean bg.

## Fidelity — honest assessment
**Pixel-perfect.** The fill color is the exact interior black already present on all four sides of the
banner, so there is literally no seam, grain mismatch, or tell — it is indistinguishable from box
interior at any magnification. This is strictly more robust than the border-reconstruction idea from
the first pass (which had a subtle "perfect donor copy lacks grain" tell); that tell is gone because
no border is reconstructed. Confirmed by viewing outputs: ABILITIES banner gone, INFANTRY banner +
text intact, top/left borders continuous, no brown box, no remnant, body text seated correctly.

## Recommendation for the real app
**Bake a patched background asset ONCE, then reuse.** Geometry is fixed across cards, and the patch is
a deterministic constant-rectangle black fill:
- Preferred: run the fill one time, export the **patched frame/background PNG**, ship it as the static
  card background. Zero per-render cost, pixel-perfect, no designer touch-up needed.
- Acceptable fallback: programmatic fill at load (`patch3.js` logic) — a one-time `fillRect`, trivial.
- **Not required:** a hand-edited frame in an image editor. The programmatic result is exact.

## Deliverables
- `.../session-state/7a783953-.../files/patch-tagrow-before.png` (tag row + box top, first-pass broken repro)
- `.../files/patch-tagrow-after.png` (interior fix: banner gone, INFANTRY banner intact, clean)
- `.../files/patch-fullcard-after.png` (full 690x1020 card: banner gone, clean tag row, sample
  INFANTRY/IRONWARD LEGION/HUMAN + abilities body overlaid)
- Spike code: `spike/patch3.js` (final) + diagnostics `analyze-badge.js`, `band.js`, `measure*.js`
  (`patch.js`/`patch2.js` are superseded earlier iterations, kept for history).
