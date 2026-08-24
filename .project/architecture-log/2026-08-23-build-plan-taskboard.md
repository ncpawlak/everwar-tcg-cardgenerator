# Build Plan & Project Structure — EverWar TCG Card Generator (v1)

**Date:** 2026-08-23
**Author:** Senior Coder
**Type:** Decision record + build plan (Gate 1.5 handoff)
**Constraint #10:** Architecture logging — this record is mandatory before Coder starts.
**Related:** `.project/spec.md` (approved), `2026-08-23-psd-card-editor-feasibility.md`,
`2026-08-23-psd-spike-results.md`, taskboard `.project/taskboard/001-card-generator-mvp.md`.

## Context

Spec is user-approved. Feasibility green-lit and fidelity proven near-parity in the
spike (real fonts supplied). This entry records the **implementation structure and
key build decisions** the Coder must follow so architecture stays coherent through
the TDD build.

## Chosen stack (now approved — still pre-implementation)

| Concern | Choice |
|---|---|
| Build/dev loop | Vite |
| Language | TypeScript (`strict: true`) |
| UI | Plain TS (no framework) — a canvas + a form does not justify React/Svelte |
| PSD read | `ag-psd` (browser build), reader-only |
| Compositing/preview | HTML5 Canvas 2D — bake background once, re-render editable text |
| Fonts | Browser FontFace API, block first render on `document.fonts.ready`, fail loud |
| Export | File System Access `showSaveFilePicker` → `canvas.toBlob('image/png')` |
| Test runner | **Vitest** (node env for logic, jsdom for UI, napi-canvas for pixels) |
| Test-only render | `@napi-rs/canvas` (**dev dependency only**, never bundled) |
| Lint | ESLint + `@typescript-eslint` |

## Key decisions

1. **Inject the text measurer.** All layout math (`layoutTitle`, `wrapText`) takes
   `measure(text, font) => number` rather than a live canvas ctx. Rationale: makes
   the hardest logic (faux small-caps advance, word-wrap+clip) unit-testable in
   pure Node with a deterministic stub; the browser passes `ctx.measureText`. This
   is the single most important testability decision for a TDD build of a renderer.
2. **Editable set is an explicit allow-list** (`config/editableLayers.ts`), not a
   type/naming heuristic (spec §10). It is the shared source of truth for extraction,
   the bake skip-set, and the UI panel — one definition, three consumers.
3. **Three-stage pipeline, cached:** parse+extract (once) → bake background (once) →
   render editable text (every debounced edit). Only stage 3 repeats. Enforced by
   putting debounce in `appState`, not the UI.
4. **`@napi-rs/canvas` is test-only.** The shipped app uses the browser's native
   canvas; napi-canvas exists solely to render/measure in Node tests and to feed
   `ag-psd`'s `initializeCanvas` under test. It must never enter the browser bundle.
5. **Model is plain/serializable** — no live canvas refs in `CardModel`, so it can be
   snapshot-tested and seeded into state cleanly.
6. **Fidelity is a committed regression test** (STORY-13), diffing our render of the
   original values against `psd.canvas` within a documented tolerance that absorbs
   sub-pixel metric kerning (spec §4.4) but catches gross regressions.
7. **Reuse the spike learnings verbatim:** per-run `styleRuns` title sizing
   (`[45.83,37.5,45.83,37.5]` over `[1,8,1,8]`, baseline transform ≈(69.63,75.92));
   opacity is 0–1 (never /255); abilities box `(37,808)–(664,968)`, padded
   `x=59,y=824,w=583`, RomanCondensed 21/25 white, clip to box bottom;
   back-to-front `drawImage` bake (blend all `normal`, no effects).

## Project structure

Root-level app (NOT inside `spike/`, which stays disposable). `src/` layout:
`config/` (allow-list), `psd/` (loadPsd, extractModel, types), `fonts/` (loadFonts),
`render/` (bakeBackground, layoutTitle, wrapText, drawText, renderCard), `state/`
(appState), `ui/` (fieldPanel, preview), `export/` (exportPng), `main.ts` composition
root. Full tree in the taskboard. Ownership is single-track (one Coder), so no
parallel-file partition is needed this cycle.

## TDD sequence

13 stories, dependency-ordered in the taskboard. Red→Green→Refactor per story; no
production code without a failing test first. Pure logic (config, extractModel,
layoutTitle, wrapText, appState) is straightforward unit tests; pixel/compositing
(bake, renderCard, fidelity) render through napi-canvas with the real OTFs; UI/export
via jsdom with mocked `document.fonts`, `toBlob`, and `showSaveFilePicker`.

## Regression blast-radius policy

Render pipeline is the shared core. Any change to `render/*`, `psd/*`, or `config/*`
reruns the full Vitest suite + lint + a browser visual check; STORY-13 fidelity runs
on every render-path change. Isolated `ui/`/`export/` changes run their own suite +
lint. Full policy in the taskboard. Actual green results required before sign-off —
never "should pass."

## Skill candidates surfaced to Orchestrator (not written here)

- **"ag-psd in-browser text-layer extraction pattern"** — walk/flatten tree,
  classify by allow-list, read `text.styleRuns`/`transform`/`fillColor`, opacity 0–1
  gotcha. Likely universal.
- **"Faux small-caps via per-run styleRuns"** — segment runs, advance x by measured
  width, baseline at engine transform. Likely universal (any canvas text renderer
  reproducing PSD/point-type type).
- **"Inject-the-measurer for testable canvas text layout"** — pure layout fns taking
  `measure(text,font)` so wrap/advance logic is unit-testable without a canvas.
  Universal TDD/testing pattern.

---

## Addendum (2026-08-23, post-Gate-2, user-approved refinements)

- **Single-line shrink-to-fit** added as a new pure layer-core module
  `src/render/fitText.ts` (`computeFit`, `layoutSingleLine`), consumed by
  `drawText.ts`; `layoutTitle.ts` gained an optional `availableWidth` param for
  uniform (ratio-preserving) title scaling. Decision: derive each field's slot width
  from its **PSD layer bounds** (no explicit container width exists in the PSD); apply
  a 1.15x allowance to single-line fields so authored values stay pixel-identical
  (measured ink runs ~9% past the tight bounds). Tracking (<=8%/gap) is tried before
  font scaling; scale is floored at 0.6x for readability. The authored title (runs
  cover the text) is never shrunk, protecting the baked baseline / fidelity render
  (still 0.914%). Kept in the measurer-injected core so it is canvas-free unit-testable.
- **Composition wiring** extracted from `main.ts` into `src/app/livePreview.ts`
  (`createLivePreview`) with an injectable renderer, enabling an integration test of
  the edit -> debounce -> single re-render loop. `main.ts` now delegates to it.
- Test count 46 -> 59, all green; build + lint clean. No push (Gate 2.5 is the user's).

- **Title fit box corrected (post-Gate-2 user feedback).** The title's shrink slot was
  derived from tight ink bounds and condensed the title well left of the actual bar
  edge. Fixed by deriving the title's available width from the **black title bar**
  instead: `TITLE_BAR_INNER_RIGHT_X = 512` (a documented constant in `fitText.ts`) and
  `titleAvailableWidth(anchorX) = 512 - anchorX` (≈442px). The 512 edge was MEASURED
  from the PSD composite (`psd.canvas`): the black bar interior stays dark until x≈519,
  a metallic bevel to the LEVEL panel spikes at x≈521-523, so 512 leaves ~7px padding.
  Only the TITLE branch of `drawText.ts` changed (now passes `titleAvailableWidth` in
  place of `layerWidth`); single-line fields keep their ink-bounds x1.15 slot. Tests
  added to `fitText.test.ts` (bar-based width, not ink width) and `layoutTitle.test.ts`
  (medium title at native scale=1; extreme still shrinks to <= available). Test count
  59 -> 64, all green; build + lint clean.
