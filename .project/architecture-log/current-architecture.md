# Current Architecture

**Status:** IMPLEMENTED — MVP + post-review fixes + structured abilities complete on
`npawlakel-psd-card-editor`. Reviewer PASS; 76 tests green; fidelity 0.914%. Branch is
committed locally and not pushed; next phase is Gate 2.5 push + PR.

This downstream product repo now ships the local browser card editor under `src/` plus
Vite/Vitest/ESLint configuration. Harness scaffolding (`.agent`, `.project`,
`.client-docs`, README, CHANGELOG) and input assets remain in place:
`assets/Card_1.psd` (690x1020) and `assets/fonts/*.otf` (two Square721BT faces). Spike
scripts remain disposable/reference-only and are not shipped.

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

## Source structure

Root app; `src/` = `config/` (editable allow-list + ability geometry), `psd/` (loadPsd,
extractModel, types), `fonts/` (loadFonts), `render/` (bakeBackground, layoutTitle,
fitText, wrapText, abilitiesLayout, drawText, drawAbilities, renderCard), `state/`
(appState), `app/` (livePreview, seedValues), `ui/` (fieldPanel, preview), `export/`
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
7. ABILITIES badge removal is an interior-only opaque-black patch in `bakeBackground`
   (`removeAbilitiesBadge` default true); no border/donor reconstruction is required.
8. Structured abilities are one model field but six flat UI/state keys
   (`ability{1..3}-name/-body`), rendered through pure mixed-weight layout with bold
   inline names and regular bodies.

## Reused spike facts (do not re-derive)

- Title faux small-caps = per-run `styleRuns` sizes `[45.83, 37.5, 45.83, 37.5]` over
  lengths `[1, 8, 1, 8]`; baseline transform ~ `(69.63, 75.92)`; advance x by measured
  run width. Never assume one size per layer.
- `layer.opacity` is a 0-1 float - never divide by 255.
- ABILITIES body region (authored, no PSD layer): badge-removed interior
  `(37,771)-(664,971)`, padded text area `x=59, y=780, w=583`, Square721BT-RomanCondensed
  body + Square721BT-BoldCondensed names, 21px / 25px line-height, clipped to box bottom,
  with dormant whole-block shrink floor 0.7x.
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
