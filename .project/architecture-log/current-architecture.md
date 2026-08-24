# Current Architecture

**Status:** APPROVED STACK — pre-implementation (Gate 1.5 taskboard produced; no app
code written yet). Spec is user-approved; build plan recorded in
`architecture-log/2026-08-23-build-plan-taskboard.md`; stories in
`.project/taskboard/001-card-generator-mvp.md`.

This is a fresh downstream product repo. Harness scaffolding (`.agent`, `.project`,
`.client-docs`, README, CHANGELOG) plus input assets exist:
`assets/Card_1.psd` (690x1020) and `assets/fonts/*.otf` (two Square721BT faces). A
disposable proof-of-concept lives in `spike/` (Node + `@napi-rs/canvas`) - it is not
shipped. No application `src/`, dependencies, or build config exist yet.

## Approved stack

- **App type:** Local, browser-based web app (Chromium - needs File System Access API).
- **Build/UI:** Vite + TypeScript (`strict`), plain TS (no UI framework).
- **PSD read:** `ag-psd` (browser build) - reader only; never re-renders edited text.
- **Render/preview:** HTML5 Canvas 2D. Non-editable layers baked once into a
  background raster; the 9 editable text layers + authored ABILITIES body re-rendered
  on top, debounced (~100-150 ms). Only text redraws on edit; no re-parse/re-bake.
- **Fonts:** Browser FontFace API; block first render on `document.fonts.ready`; fail
  loud on missing font (hard fidelity dependency).
- **Export:** `canvas.toBlob('image/png')` -> File System Access `showSaveFilePicker`
  (user picks folder+filename each time); native 690x1020, PSD-matching transparency.
- **Testing:** Vitest - node env for pure logic, jsdom for UI/export, and
  `@napi-rs/canvas` (**dev-only**) for pixel/compositing + fidelity tests. TDD:
  no production code without a failing test first.

## Core constraint driving the design

No open-source PSD library re-renders edited type layers. We re-render editable text
ourselves and bake all other layers. Proven near pixel-parity in the spike.

## Planned source structure

Root app; `src/` = `config/` (editable allow-list), `psd/` (loadPsd, extractModel,
types), `fonts/` (loadFonts), `render/` (bakeBackground, layoutTitle, wrapText,
drawText, renderCard), `state/` (appState), `ui/` (fieldPanel, preview), `export/`
(exportPng), `main.ts` root. Full tree + rationale in the build-plan log and taskboard.

## Settled build decisions (see build-plan log for detail)

1. Inject `measure(text, font)` into all text-layout math -> pure, unit-testable.
2. Editable set = explicit allow-list (`config/editableLayers.ts`), the single source
   of truth for extraction, bake skip-set, and UI.
3. Cached three-stage pipeline (parse+extract -> bake -> render); debounce lives in
   `appState`.
4. `@napi-rs/canvas` is test-only; never bundled.
5. `CardModel` is plain/serializable - no live canvas refs.
6. Fidelity regression test diffs render-of-original vs `psd.canvas` within a
   documented tolerance.

## Reused spike facts (do not re-derive)

- Title faux small-caps = per-run `styleRuns` sizes `[45.83, 37.5, 45.83, 37.5]` over
  lengths `[1, 8, 1, 8]`; baseline transform ~ `(69.63, 75.92)`; advance x by measured
  run width. Never assume one size per layer.
- `layer.opacity` is a 0-1 float - never divide by 255.
- ABILITIES body region (authored, no PSD layer): content box `(37,808)-(664,968)`,
  padded text area `x=59, y=824, w=583`, Square721BT-RomanCondensed, 21px / 25px
  line-height, white, clipped to box bottom.
- Blend modes all `normal`, no layer effects -> back-to-front `drawImage` bake is exact.

## Known constraints / risks

- Chromium-only for `showSaveFilePicker` (optional `<a download>` fallback).
- Residual fidelity risk is sub-pixel tracking/kerning only (spec 4.4) - absorbed by
  the fidelity-test tolerance.
- Frozen single template (`Card_1.psd`); the parse/classify step assumes its current
  layer names and geometry (spec 10). PSD changes require revisiting extraction.

## Out of scope (v1 - see `.project/backlog/`)

Art placement, hi-res/DPI export, multi-template/batch, editing locked labels/chips,
desktop packaging, any server/native render path.
