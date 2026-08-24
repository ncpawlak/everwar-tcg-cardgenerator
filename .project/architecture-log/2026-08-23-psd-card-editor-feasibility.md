# Architecture Log — PSD Trading-Card Editor: Gate 1 Feasibility

**Date:** 2026-08-23
**Author:** Senior Coder
**Gate:** 1 (pre-spec feasibility consult)
**Status:** PROPOSAL — nothing built. No product code exists. Awaiting Planner spec + user answers.

---

## 1. Verdict

**FEASIBLE — yes, with one architectural caveat that must be respected from day one.**

The caveat is not optional; it is the whole design. You cannot treat a PSD as
"edit the text layer, ask the library to redraw it." No open-source PSD library
re-renders type layers. The feasible path is: **rasterize everything that isn't
being edited, and render the editable text ourselves.** Get that right and the
rest (live preview, PNG export) is easy.

---

## 2. Core technical risk & finding

**Risk:** Photoshop type layers store the raw string + rich run styling (font,
size, color, tracking, justification, transform) in "text engine" data. The
visible pixels of that layer are a *cached raster* Photoshop produced with its
own type engine. A parser can hand us the cached raster OR the engine data, but
**it will not lay out and rasterize new text for us.**

**Finding (verified against current library docs/changelogs):**

- **`ag-psd` (Node/TS/browser, actively maintained, v31.x line):** Reads text
  layers and exposes the text engine data — string, font list, sizes, fill
  color, justification, transform. Can *write* text-layer data back. **But it
  explicitly does NOT redraw the layer bitmap after a text change** — the README
  states Photoshop must reopen/re-save to refresh the raster. So writing a PSD is
  useless for our preview; the *value* of ag-psd is as a **reader** that gives us
  each editable layer's string + style + position so we can render it ourselves.
- **`psd-tools` (Python):** Text `text` property is effectively read-only;
  editing type-layer content is a long-standing unsupported feature. Its
  compositor is pixel-based and only *approximates* Photoshop for effects. Same
  conclusion: great reader, not a text re-renderer.
- **`@webtoon/psd` / `psd.js`:** Decode/read only. No help for re-rendering text.

**Conclusion:** No library does "edit text → correct re-render" for us. Therefore
the app must own text layout itself. This is the decision the whole architecture
hangs on.

---

## 3. Recommended architecture (optimized for iteration speed)

**Strategy — "bake the art, render the text":**

1. **Parse once** with `ag-psd`. Walk the layer tree. Classify each layer:
   - *Editable text layers* (identified by name convention, e.g. a `#` prefix or
     an allow-list) → capture string + style + bounding box + justification.
   - *Everything else* (art, frame, background, foil, icons) → treat as static.
2. **Composite the static layers once** into a single background raster (PNG /
   ImageBitmap). This is the card minus the editable text. Cache it.
3. **Render editable text ourselves** on an HTML5 Canvas layered over the baked
   background, using the captured font/size/color/position. This is the live,
   editable surface.
4. **Preview = the canvas.** Editing a field re-runs only step 3.
5. **Export = `canvas.toBlob('image/png')`** at target resolution, written to a
   directory.

**Stack recommendation:**

- **Language/UI:** Local web app — **Vite + TypeScript**, plain or with a light
  framework (React/Svelte optional; not required). This is the single biggest
  win for "easy to iterate": instant HMR, no build ceremony, huge ecosystem.
- **PSD read:** `ag-psd` (browser build) — runs client-side, no server needed to
  parse.
- **Render:** HTML5 Canvas 2D for the text overlay + the baked background. Canvas
  text metrics + `fillText` cover font/size/color/alignment directly.
- **PNG export to a directory:** two clean options —
  - **Browser-only:** File System Access API (`showSaveFilePicker` /
    `showDirectoryPicker`, Chromium) — lets the user pick a target directory and
    write PNGs with no backend. Simplest.
  - **Tiny Node sidecar:** a Vite middleware / small Express `POST /export` that
    writes the PNG to a configured output dir on disk. Use this if we need a
    fixed, non-interactive output path or cross-browser support.
  - Fallback everywhere: plain `<a download>` blob download.
- **NOT recommended now:** Electron/Tauri (packaging overhead, slower iteration),
  and driving real Photoshop/Photopea (heavy, license/automation friction,
  opposite of "easy to iterate"). Revisit Tauri only if a shippable desktop
  binary becomes a hard requirement.

**Why a web app over desktop:** the user's stated top priority is iteration
speed. Vite's dev loop is the fastest feedback environment available, ag-psd runs
in the browser, and Canvas gives us pixel-accurate text control. A desktop
wrapper adds packaging cost for zero iteration benefit at this stage.

**Live/auto preview mechanics:** bind each editable field to state; on change,
**debounce ~100–150 ms**, then redraw the text layers over the cached background
bitmap (background is *not* recomposited — it's a static image, so redraws are
cheap and instant). No PSD re-parse per keystroke.

**Render location:** in-browser is sufficient — Canvas 2D renders and exports PNG
client-side. A server/native render step is only needed if we later require
headless batch export or fonts we can't load in-browser. Not needed for v1.

---

## 4. Fidelity risks & mitigations

The moment we render text ourselves instead of using Photoshop's cached raster,
we own a fidelity gap. For a trading card this is manageable but must be scoped.

| Risk | Severity | Mitigation |
|---|---|---|
| **Fonts not present** on the machine → wrong glyphs/metrics | **High** (breaks layout) | Require the exact card fonts; load via `@font-face`/FontFace and `document.fonts.ready` before rendering. Fail loudly if a font is missing rather than silently substituting. |
| **Kerning / tracking / leading** differ from Photoshop's engine | Medium | Apply the tracking/leading from the engine data; accept minor sub-pixel differences. Trading-card text is short (name/stats/description) so drift is small. |
| **Layer effects on text** (drop shadow, stroke, gradient/color overlay, glow) | Medium–High | These are NOT free from Canvas. Re-implement the common ones (shadow, stroke) explicitly in the text renderer. For complex overlays, decide per-layer whether to re-implement or bake. This must be enumerated per the actual PSD. |
| **Auto-fit / text-box wrapping** (paragraph type that reflows) | Medium | Honor the layer's bounding box; implement word-wrap for description fields. Confirm which fields are point-type vs box-type. |
| **Non-text layers with blend modes/effects** | Low | They're baked once from ag-psd's composited output, so they match by construction — as long as ag-psd composites them acceptably. Verify against the real PSD. |
| **Color space** (CMYK/16-bit/PSB) | Low for us | ag-psd write is RGB-only; we only *read* + render RGB. Confirm the source PSD is 8-bit RGB. |

**Key mitigation principle:** only text layers are re-rendered; every other layer
is baked from the original. That confines the fidelity risk to a handful of
short text fields, which is the smallest possible blast radius.

---

## 5. Open questions for the Planner (must be resolved before spec sign-off)

1. **Editable layers:** exactly which layers are editable, and how are they
   identified? (Naming convention like `#name`, an explicit allow-list, or by
   layer type?) How many fields?
2. **Point vs box text:** are the editable fields single-line (point type) or
   wrapping paragraphs (box type)? Description almost certainly wraps.
3. **Fonts:** are the exact fonts available to us (files we can ship / install)?
   Any licensing constraints on embedding them?
4. **Text effects:** do the editable text layers carry layer styles (stroke,
   drop shadow, gradient/overlay, glow)? Which ones, per layer?
5. **Template stability:** one fixed card template, or many? Does the PSD change
   over time, or is it a frozen template we build tooling around?
6. **Fidelity bar:** is exact Photoshop-pixel parity required, or is
   "visually close / correct" acceptable? (Drives how much effect re-implementation we do.)
7. **Output:** target PNG resolution/DPI. Transparent background or flattened?
   Fixed output directory, or user-chosen at export time?
8. **Delivery target:** local web app acceptable, or is a packaged desktop app a
   hard requirement? (Affects browser-only vs sidecar export, and Vite vs Tauri.)
9. **Batch vs single:** edit one card at a time interactively, or bulk-generate
   many cards from a data source (CSV/JSON)? (Batch pushes toward a Node render path.)
10. **Non-text edits:** truly text-only, or will image swaps (art) ever be needed?

---

## 6. Decision record

- **DECISION:** Do not rely on any library to re-render edited text. Adopt the
  "bake static layers, re-render text on Canvas" architecture. — *rationale in §2/§3.*
- **DECISION (proposal):** Stack = Vite + TypeScript + `ag-psd` (reader) + Canvas
  2D preview + File System Access API (or tiny Node sidecar) for PNG export.
  Chosen for iteration speed per explicit user priority. — *pending spec approval.*
- **RISK ACCEPTED (conditional):** Text fidelity gap confined to editable fields;
  acceptable only once fonts + effects are enumerated (open questions 3 & 4).
