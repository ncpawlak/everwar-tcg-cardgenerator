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
| 10 | *(none — new authored region)* | Abilities (body) | **wrapping block** | Multi-line, word-wrapping text inside the black abilities box. See §4.3. |

**Single-line value** fields render using the layer's captured font family, font
size, fill color, justification, and position/`transform` from the PSD text-engine
data. They do not wrap.

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
4. Detect the abilities content box from the composite (confirmed bounds
     **(37,808)–(664,968)**); derive the padded text area **x=59, y=824, w=583**.

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
  the layer position.
- **Title (`Name text`)** — honor **per-run sizing** from `styleRuns`; draw each
  run sequentially, advancing x by measured width, baseline at the engine
  `transform`. Do **not** assume one size per layer.
- **Abilities body** — word-wrap the text within the padded area (x=59, y=824,
  w=583) in white **Square721BT-RomanCondensed**, ~**21px** font / ~**25px**
  line-height, **clipped** to the box bottom (37,808)–(664,968).

Only step 4.3 re-runs on an edit; parse and bake do not repeat.

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
