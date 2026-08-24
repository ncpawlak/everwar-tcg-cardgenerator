# PSD Card Editor — Feasibility SPIKE Results

**Date:** 2026-08-23
**Author:** Senior Coder
**Type:** Throwaway proof-of-concept (spike code in `spike/`, disposable)
**Constraint #10:** Architecture logging — this record.

## Verdict: FEASIBLE ✅ (with one hard dependency: the fonts)

**UPDATE 2026-08-23 (later): fonts supplied — see "Real-font outcome" at bottom. Verdict upgraded to FEASIBLE, fidelity confirmed near-parity.**

The full pipeline was proven against the real card `assets/Card_1.psd`:
load PSD → enumerate text layers → read text properties → remove one text
layer → re-render edited text → export faithful PNG. All steps succeeded.

## Stack (installed cleanly on Windows / Node v24.14.1 / npm 11.11.0)
- `ag-psd` — PSD reader. Exposes per-layer decoded bitmaps (`layer.canvas`),
  the document composite (`psd.canvas`), and full text-engine data.
- `@napi-rs/canvas` — prebuilt native canvas (no node-gyp/Python build pain).
  Wired into ag-psd via `initializeCanvas((w,h)=>createCanvas(w,h))`.

Recommended stack **holds**. No fallback to skia-canvas/canvas needed.

## Layer inventory findings (`spike/layer-inventory.json`)
- Document is **690 × 1020 px**, 29 layers, flat (no groups).
- **18 text layers.** Identified reliably by the presence of `layer.text`
  (the text-engine object). Every text layer also carries a pre-rasterized
  `layer.canvas` bitmap — PSD libraries do NOT re-rasterize on edit, confirming
  the prior design assumption.
- Text properties read successfully per layer:
  - `text.text` — the string (e.g. "IRONFIST COMMANDER", "40", "LEVEL").
  - `text.style.font.name`, `text.style.fontSize`, `text.style.fillColor {r,g,b}`.
  - Layer `left/top/right/bottom` bounds give position; `justification` available.
- Editable content maps cleanly to card semantics: title (#11 "Name text"),
  Level (#13), HP (#14), Armor (#16), DMG (#18), ACC (#20), tags
  (COMMANDER/UNIQUE/INFANTRY/IRONWARD LEGION/HUMAN), ABILITIES header.
- **Gotcha logged:** `layer.opacity` is a **0–1 float**, NOT 0–255. Dividing by
  255 makes everything ~0.4% opaque (blank output). This cost one debug cycle.
- No layer effects present on the sampled layers; blend modes all `normal`.
  This is why naive back-to-front bitmap compositing reproduces the card exactly.

## Fonts the card needs (`spike/fonts-referenced.json`)
- `Square721BT-BoldCondensed` (title, stat numbers, ABILITIES)
- `Square721BT-RomanCondensed` (labels: LEVEL, HP, ARMOR, tags, etc.)

**Neither font is installed on this machine, and no font files ship in the repo.**
`@napi-rs/canvas` reports the exact family absent; re-render fell back to a
generic condensed sans.

## Fidelity assessment (be blunt — this decides the project)
- **Card composite / baseline: pixel-perfect.** `psd.canvas` is the untouched
  Photoshop composite. `baseline.png` is indistinguishable from the source card.
- **Text removal + recomposite: excellent.** Compositing every visible layer
  except the target reproduces "the card minus that text" with no artifacts
  (see `edited.png` — title cleanly gone, everything else identical to baseline).
- **Re-rendered TEXT itself: NOT faithful yet — font is the blocker.**
  `text-layer-original-vs-rerendered.png` shows it directly. The original
  Square721BT is a squared Eurostile-style face rendered with a small-caps look
  (tall initial caps, shorter following caps); our fallback is a different,
  wider, all-uniform-height sans. Position, color and point size are correct;
  **letterforms are visibly wrong.** For a "looks faithful" product this is a
  fail until the actual fonts are provided.

## Blockers / risks
1. **FONTS (must-fix, not optional).** Ship `Square721BT-BoldCondensed` and
   `Square721BT-RomanCondensed` and register via `GlobalFonts.registerFromPath`.
   With the real fonts, text fidelity should reach near-parity. Without them the
   product cannot claim faithful output. This is the #1 project dependency.
2. **Small-caps / OpenType features.** Confirm whether the title's mixed-height
   look is the font itself or an applied small-caps feature; may need
   `font-variant` / manual handling to match exactly.
3. **Baseline placement.** We used `textBaseline='top'` at layer bounds — close,
   but `text.transform` (affine matrix) is available for exact positioning if
   pixel-level alignment is required.

## Recommendation
Green-light the approach. The architecture is sound and the tooling is proven on
Windows/Node 24. Gate the product on acquiring/licensing the two Square721BT
fonts and registering them with the canvas. Re-run the fidelity comparison once
the fonts are installed before final sign-off.

## Artifacts
- `spike/output/baseline.png`, `spike/output/edited.png`,
  `spike/output/text-layer-original-vs-rerendered.png`
- `spike/layer-inventory.json`, `spike/fonts-referenced.json`
- Copies for viewing in the session files dir.


---

## Real-font outcome (2026-08-23, follow-up run)

User supplied the two fonts:
- `assets/fonts/Square721BT-BoldCondensed.otf`
- `assets/fonts/Square721BT-RomanCondensed.otf`

Registered in @napi-rs/canvas via `GlobalFonts.registerFromPath(path, 'Square721BT-BoldCondensed')`
and `...('Square721BT-RomanCondensed')` — mapped to the exact PostScript/family
names the PSD text layers reference. `GlobalFonts.has(...)` returns true for both.
Script: `spike/render-realfont.js`.

### Small-caps mechanism (decoded)
The title "IRONFIST COMMANDER" is an ALL-CAPS string; the small-caps look is a
**faux effect done with per-run font sizes**, NOT an OpenType feature. The PSD
`text.styleRuns` are: run(len 1)=45.83px, run(len 8)=37.5px, run(len 1)=45.83px,
run(len 8)=37.5px — i.e. the first letter of each word is 45.83px, the rest 37.5px.
Reproduced by drawing each run sequentially, advancing x by `measureText().width`,
baseline anchored at the engine `text.transform` = (69.63, 75.92). This matches
Photoshop's rendering.

### Fidelity verdict: YES — near pixel-parity.
`text-layer-original-vs-rerendered.png` shows the original PSD-baked bitmap and
our canvas re-render of the SAME text essentially indistinguishable: identical
font, identical faux small-caps sizing, identical weight/color/position. The card
title now renders as if native (`edited-realfont.png`, title changed to
"IRONFIST WARLORD"). Residual risk is only sub-pixel tracking/kerning — the PSD
style has `tracking:0`, `autoKerning:true`, `kerning:0`, so our default metric
kerning is a faithful approximation. No visible discrepancy at card resolution.

### Wrapping ABILITIES body (new, not in PSD)
The PSD has only an "ABILITIES" header layer — no body text layer. Detected the
inner black content box from the composite by scanning the contiguous black run
through the box center: **box = (37, 808) – (664, 968)**. Used a padded text area
`x=59, y=824, w=583` inside it. A sample paragraph word-wraps cleanly to 3 lines
in Square721BT-RomanCondensed (white, 21px, 25px line-height) with clipping to the
box bottom. Rendering is clean (`edited-realfont.png` / `abilities-demo.png`).
This proves we can author NEW text regions (with layout/wrapping) that the PSD
does not contain — important since ability text is dynamic.

### Updated recommendation
Green-light confirmed. Stack unchanged (ag-psd + @napi-rs/canvas). Font dependency
is now satisfied; bundle the two OTFs with the app and register at startup. The
faux small-caps pattern (per-run sizing keyed off styleRuns) must be honored by
the real renderer — do not assume uniform font size per text layer. For new
authored text (abilities body), we own layout: box bounds + padding + wrap +
line-height, all working.

### Artifacts (session files dir)
- `text-layer-original-vs-rerendered.png` (overwritten — now with real font)
- `edited-realfont.png` (full card, real font, wrapped abilities body)
- `abilities-demo.png` (crop of the abilities region)
