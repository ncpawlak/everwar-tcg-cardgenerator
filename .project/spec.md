# Specification — EverWar TCG Card Generator (v1)

> Written by the **Planner Agent** after gathering requirements from the user and
> confirming technical feasibility with the Senior Coder (Gate 1). Feasibility is
> **green-lit**: see `.project/architecture-log/2026-08-23-psd-card-editor-feasibility.md`
> and `.project/architecture-log/2026-08-23-psd-spike-results.md`. Approved by the
> user before implementation begins.

---

## 1. Overview

A **local, browser-based** web app that loads the fixed EverWar trading-card
Photoshop template (`assets/Card_1.psd`, 690×1020 px, 8-bit RGB), renders it
faithfully, lets the user edit a defined set of text fields, updates the preview
live as fields change, and exports the result as a PNG the user saves to a
folder+filename of their choosing.

The core constraint driving the whole design: **no PSD library re-renders edited
type layers.** Therefore the app bakes all non-editable layers into a static
background image and re-renders only the editable text itself on an HTML5 Canvas
over that background, using the card's own bundled fonts. This was proven to
near pixel-parity in the spike.

**v1 is text-only.** Art placement, higher-res export, batch generation, and
multi-template support are out of scope (see §9 Non-Goals and `.project/backlog/`).

---

## 2. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Build tool / dev loop | **Vite** | Chosen for fastest iteration (HMR). Top user priority. |
| Language | **TypeScript** | |
| UI framework | Plain TS or a light framework (React/Svelte) — **optional, not required** | Keep it minimal; the app is a preview canvas + a form panel. |
| PSD read | **`ag-psd`** (browser build) | Reads the PSD client-side: layer tree, per-layer bitmaps (`layer.canvas`), document composite (`psd.canvas`), and full text-engine data (`text.text`, `styleRuns`, `fillColor`, `justification`, `transform`, bounds). Used as a **reader only** — never to write/re-rasterize text. |
| Preview / compositing | **HTML5 Canvas 2D** | Baked background drawn once; editable text drawn over it with `fillText` + per-run metrics. |
| Fonts | **Browser FontFace API** | Load the two bundled OTFs at startup; block first render on `document.fonts.ready`. |
| Export | **File System Access API** (`showSaveFilePicker`) | User picks folder + filename each export; write `canvas.toBlob('image/png')`. |
| Server / native render | **None for v1** | Everything runs in-browser. (The spike used `@napi-rs/canvas` under Node *only* to prove fidelity; the shipping app does not.) |

**Browser support:** Chromium-based browsers (Chrome/Edge) — required for the File
System Access API. A plain `<a download>` blob fallback MAY be added if a target
browser lacks `showSaveFilePicker`, but the primary, specified path is
`showSaveFilePicker`.

---

## 3. Editable Fields (v1 scope)

The template exposes **9 existing text layers** (edited by PSD layer name) plus
**1 new authored region** (ABILITIES body) that has no PSD layer. Fields are
pre-filled with the PSD's current values on load.

| # | PSD layer name | Field label (UI) | Type | Notes |
|---|---|---|---|---|
| 1 | `Name text` | Card Name / Title | **title-with-per-run-sizing** | Faux small-caps via `styleRuns` (e.g. 45.83px initials / 37.5px rest). Renderer draws each run sequentially, advancing x by `measureText().width`. Baseline anchored at engine `text.transform` (≈ 69.63, 75.92). Font: Square721BT-BoldCondensed. |
| 2 | `4` | Level | single-line value | |
| 3 | `40` | HP | single-line value | |
| 4 | `25` | Armor | single-line value | |
| 5 | `30` | DMG | single-line value | |
| 6 | `75` | ACC | single-line value | |
| 7 | `INFANTRY` | Unit Type | single-line value | |
| 8 | `IRONWARD LEGION` | Faction | single-line value | |
| 9 | `HUMAN` | Species / Tag | single-line value | |
| 10 | *(none — new authored region)* | Abilities (up to 3) | **structured wrapping block** | Up to **3** abilities, each a **bold NAME** + regular **BODY**, word-wrapping inline in the black abilities box. Empty (blank name+body) abilities are skipped. See §4.3 / §4.6. |

**Single-line value** fields render using the layer's captured font family, font
size, fill color, justification, and position/`transform` from the PSD text-engine
data. They do not wrap. To prevent long edits from overflowing the card horizontally,
each single-line field (and the title) is **shrink-to-fit**: see §4.5.

### Locked / non-editable (v1)

Static labels `LEVEL`, `HP`, `ARMOR`, `DMG`, `ACC`, the `ABILITIES` header; the
`COMMANDER` and `UNIQUE` chips; and all art/frame/graphics. These are part of the
baked background and are not exposed for editing.

---

## 4. Render Pipeline

### 4.1 Load & parse (once, at startup)

1. Fetch the bundled `assets/Card_1.psd` and parse it with `ag-psd` in-browser.
2. Load the two bundled OTFs via the FontFace API and await `document.fonts.ready`
   **before** the first text render (see §6).
3. Walk the layer tree and classify each layer:
   - **Editable text layers** — the 9 named layers in §3. Capture per layer:
     string, font family, per-run sizes (`styleRuns`), fill color, justification,
     position/`transform`, and bounds.
   - **Everything else** — art, frame, background, labels, chips, icons — treated
     as static.
4. Detect the abilities content box from the composite. With the baked **ABILITIES
     badge removed** (opaque-black patch, see build log), the box's usable interior is
     reclaimed at the top: interior **(37,771)–(664,971)**; text starts at the reclaimed
     top **x=59, y=780, w=583** (191px usable height). See §4.6.

> **Gotcha (logged):** `ag-psd` reports `layer.opacity` as a **0–1 float**, not
> 0–255. Do not divide by 255.

### 4.2 Bake the static background (once)

Composite all non-editable layers into a **single static background raster**
(the card minus the editable text) and cache it (e.g. an `ImageBitmap`). Because
the sampled PSD has no layer effects and all blend modes are `normal`, back-to-
front bitmap compositing reproduces the card exactly. The background is **not**
recomposited on edits.

### 4.3 Render editable text (on every edit)

Draw the cached background, then render the editable text over it on the Canvas:

- **Single-line values** — draw with the captured font/size/color/justification at
  the layer position, **shrunk to fit** the field's slot width (§4.5).
- **Title (`Name text`)** — honor **per-run sizing** from `styleRuns`; draw each
  run sequentially, advancing x by measured width, baseline at the engine
  `transform`. Do **not** assume one size per layer. Edited titles are **shrunk to
  fit** their slot, scaling both small-caps run sizes by the same factor so the
  initial-cap / body ratio is preserved (§4.5).
- **Abilities body** — up to **3 structured abilities**, each a **bold** NAME
  (`Square721BT-BoldCondensed`) + `": "` + regular **BODY**
  (`Square721BT-RomanCondensed`), rendered **inline** and word-wrapping across lines
  (continuation lines are regular weight). White, native **21px** / **25px** line-height,
  ~6px gap between abilities, starting at the reclaimed top **(x=59, y=780, w=583)** and
  **clipped** whole-line to the box bottom **y=971**. Empty abilities are skipped. A
  dormant shrink-to-fit fallback scales the whole block down (floor 0.7×) only if it
  overflows. See §4.6.

Only step 4.3 re-runs on an edit; parse and bake do not repeat.

### 4.5 Single-line shrink-to-fit (user-approved refinement)

Single-line fields must never overflow their slot horizontally. When a value's
measured width at its authored size exceeds the available slot width, the renderer
condenses it in two capped stages, in this order:

1. **Tracking first** — apply a small negative letter-spacing, up to **8% of the
   font size per inter-glyph gap**.
2. **Then font scaling** — if tracking alone is insufficient, scale the font size
   down, **floored at 0.6×** (readability cap). At the floor, extremely long values
   remain legible and stay on-card, though they may slightly exceed the tight slot.

The **title** uses font-scaling only (no tracking) and scales **both** small-caps
runs by the same factor, preserving the authored initial-cap / body size ratio.

**Available slot width.** The PSD gives no explicit container width for these fields,
so the slot is derived per field:

- **Single-line values** (stats, faction, tags, species) use the field's **PSD layer
  bounds** (rendered ink extent) plus a **1.15× allowance**, because the authored
  values measure up to ~9% wider than their tight bounds (glyph side-bearings); this
  keeps the original card pixel-identical while still catching genuinely-too-long edits.
- **Title (`Name text`)** uses the **width of the black title bar** it sits on — NOT
  its tight ink bounds. The slot spans from the title's left baseline anchor
  (x≈69.63) to the bar's inner-right edge at **x=512** (`TITLE_BAR_INNER_RIGHT_X`),
  giving ≈442px. That edge was MEASURED from the PSD composite (`assets/Card_1.psd`
  → `psd.canvas`, 690×1020): scanning luminance across the title rows, the black bar
  interior stays dark until x≈519, then a bright metallic bevel (x≈521–523) marks the
  divider to the angled LEVEL panel; 512 leaves ≈7px padding so glyphs never touch the
  LEVEL module. Deriving the title slot from ink bounds made it condense far too early
  (well left of the bar edge) — the bar width fixes that so the title renders at native
  size until it actually reaches the bar edge, then shrinks.

The authored title (whose `styleRuns` still cover the text) is **never** shrunk, so the
baked baseline / fidelity render is unaffected. This logic lives in the pure,
measurer-injected layout core (`src/render/fitText.ts`, `layoutTitle.ts`) and is
unit-tested without a canvas.

### 4.6 Structured abilities (up to 3, user-approved "Variant D")

The abilities region holds an **ordered list of up to 3 abilities**, each a
`{ name, body }` pair. In the UI they are three rows (a NAME input + a BODY textarea
each); in state they are six flat value keys (`ability{1..3}-name`, `ability{1..3}-body`)
so the existing `Record<string,string>` store is unchanged. An ability whose name AND
body are both blank is **skipped** at render (no line, no gap).

**Layout.** For each non-empty ability the NAME renders **bold** (the title font,
`Square721BT-BoldCondensed`) immediately followed by `": "` and the **regular** body
(`Square721BT-RomanCondensed`), wrapping **inline** — the bold prefix sits on the first
line and continuation lines are regular weight. A **~6px gap** separates abilities.
Native size is **21px / 25px** line-height.

**Reclaimed top.** With the baked ABILITIES badge removed, text starts at the **reclaimed
top y=780** (measured: the first fully-black interior row below the top gold border is
y771; +9px pad = 780) and is clipped whole-line at **y=971** (above the bottom gold
border). Usable height is **191px** vs the old 144px (from y=824) — enough for the three
realistic sample abilities at native size with no shrink.

**Shrink-to-fit (dormant fallback).** If the full block (all non-empty abilities at
native size) exceeds the 191px usable height, the font size, line-height, and paragraph
gap are scaled **down together**, floored at **0.7×**, until it fits. For the realistic
3-ability sample this is a no-op (scale 1.0). Any line still past y=971 after the floor is
clipped whole (never mid-word).

This all lives in the pure, measurer-injected core `src/render/abilitiesLayout.ts`
(mixed-weight wrapping + block fit) and is drawn by `src/render/drawAbilities.ts`; both
are unit-tested without a real canvas.

### 4.7 Dynamic armor bar (STORY-15, user-approved)

The card's right rail carries a segmented armor bar. In v1 it is driven by an **authored
numeric control `armorBars` (integer 0–8, default 8)** — SEPARATE from the printed
`armor` text value. Default 8 matches the template's baked art, so the card looks
unchanged on load.

**Semantics (not a partial-fill meter).** For any `N > 0` the full track is filled by
`N` equal green segments separated by fixed **2px** gaps (gap collapses to 0 when N=1).
`N = 0` shows the empty recessed track (no green). Out-of-range/non-integer input is
coerced to an integer clamped to `[0, 8]` at the UI boundary, and the pure layout helper
stays defensive (floor at 0, clamp at the cap) even if the UI is bypassed.

**Geometry (measured from the PSD).** Housing track `{599,351}–{629,525}` (H=174); green
fill inset 1px to x=600–629. `segmentHeight = (174 − (N−1)·2) / N`; segment `i` starts at
`351 + i·(segmentHeight + gap)`. The green is top-lit and left-beveled (bright top
`rgb(202,242,99)` → mid `rgb(136,167,66)` → darker bottom), gaps show olive
`rgb(82,79,48)`, and the empty track is a dark recess (`rgb(13,14,13)`/`rgb(24,25,22)`).

**Bake coordination.** The PSD's baked 8-segment green is covered during the static bake
by an empty-recess patch over the fill channel (`bakeBackground` `patchArmorBar`, default
true), then the dynamic bar is drawn by `src/render/drawArmorBar.ts` from `renderCard`
right after the background blit and before editable text. The pure segment math lives in
`src/render/armorBarLayout.ts` (canvas-free, unit-tested). The **fidelity baseline** bakes
with `patchArmorBar:false` and omits the `armorBars` key so it compares against the PSD's
own baked bar (0.914% holds).

### 4.4 Fidelity notes

- Fonts are the hard dependency and are now satisfied (bundled). Do not silently
  substitute — if a font fails to load, fail loudly.
- The PSD title style is `tracking:0`, `autoKerning:true`, `kerning:0`; default
  metric kerning is a faithful approximation. Residual risk is sub-pixel
  tracking/kerning only — no visible discrepancy at card resolution.

---

## 5. Live Preview Behavior

- The card preview is shown prominently. A form/panel lists the editable fields,
  pre-filled with current PSD values.
- Editing **any** field updates the preview **automatically** — no explicit
  "apply" step.
- Updates are **debounced (~100–150 ms)**; each update redraws only the editable
  text over the cached background bitmap (cheap, instant). No PSD re-parse and no
  re-bake per keystroke.

---

## 6. Fonts Handling

- Bundle both OTFs with the app and load them at startup via the FontFace API:
  - `assets/fonts/Square721BT-BoldCondensed.otf` (title, stat numbers)
  - `assets/fonts/Square721BT-RomanCondensed.otf` (labels, tags, abilities body)
- Register them under the exact family names the PSD text layers reference
  (`Square721BT-BoldCondensed`, `Square721BT-RomanCondensed`).
- **Block the first render** until `document.fonts.ready` resolves so text never
  draws with a fallback face. Missing/failed font load is a loud error, not a
  silent substitution. These fonts are REQUIRED for fidelity.

---

## 7. Export Behavior

- An **Export** button triggers the File System Access **"Save As"** flow
  (`showSaveFilePicker`): the user picks **folder AND filename every time**.
- Output is a **PNG at native 690×1020**, produced from the preview canvas via
  `canvas.toBlob('image/png')`, written to the chosen location.
- The PNG is **transparent where the PSD is transparent** (match the PSD's
  transparency; do not force a flattened/opaque background).
- The exported PNG must visually match the on-screen preview.

---

## 8. Success Criteria

- Loads `Card_1.psd` and displays a faithful rendered card using the bundled fonts.
- All 9 listed fields + the new ABILITIES body are editable; edits reflect live in
  the preview (debounced).
- Exported PNG visually matches the preview and the card's Photoshop fidelity
  (fonts correct, faux small-caps title preserved, layout intact).
- User chooses folder + filename on export; PNG is written there at 690×1020 with
  PSD-matching transparency.

---

## 9. Non-Goals (v1) — deferred, see `.project/backlog/`

- **Artwork placement** into the white art panel (v2).
- **Higher-resolution / print-quality export** multiplier & DPI control (future).
- **Multiple / other card templates** and **batch generation** from a data file
  (CSV/JSON) (future).
- **Editing locked labels/chips** (`LEVEL`, `HP`, `ARMOR`, `DMG`, `ACC`,
  `ABILITIES` header, `COMMANDER`/`UNIQUE` chips) or any art/frame.
- Desktop packaging (Electron/Tauri) and any server/native render path.

---

## 10. Assumptions

- The source PSD is a **frozen, single template** for v1: `Card_1.psd`, 690×1020,
  8-bit RGB, flat (no groups), with no layer effects and `normal` blend modes on
  the relevant layers (as observed in the spike). If the PSD changes, the parse/
  classify step may need revisiting.
- The 9 editable layers are identified **by exact layer name** as listed in §3
  (an explicit allow-list), not by a naming convention or layer type.
- The abilities box geometry is stable at the detected bounds
  (37,808)–(664,968) with padded area (x=59, y=824, w=583).
- Target browser is Chromium-based (Chrome/Edge) for `showSaveFilePicker`.
- Fonts are licensed/available to bundle with the app (user supplied the two OTFs).
- Editable values are point-type single lines except the title (per-run sizing)
  and the abilities body (box-type wrapping).
