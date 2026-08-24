# 001 — Card Generator MVP (Technical)

**Cycle:** 001 · **Feature:** EverWar TCG Card Generator v1 (text editing + PNG export)
**Stack:** Vite + TypeScript (strict) · plain DOM (no framework) · `ag-psd` (reader) ·
HTML5 Canvas 2D · FontFace API · File System Access API · Vitest (+ `@napi-rs/canvas`
dev-only for pixel tests) · ESLint.

> Draft kept current by the Coder during the build. The Learner finalizes at Gate 3.

## How it works (pipeline)

The core constraint: **no PSD library re-renders edited type layers.** So the app bakes
every non-editable layer into a static background once, then re-renders only the editable
text on a canvas over it.

```
main.ts (composition root)
  loadFonts()        → FontFace register + await document.fonts.ready (blocks first render)
  loadPsd(url)       → fetch + ag-psd readPsd (reader-only)
  extractModel(psd)  → typed, serializable CardModel from the allow-list
  bakeBackground()   → composite non-editable leaves → cached raster (ONCE)
  createAppState()   → seeded values + ~120ms debounced notify
  createFieldPanel() → inputs (9) + abilities textarea; edits → state.set
  buildLayout()      → canvas preview + Export button + status
  renderCard()       → draw cached bg + all editable fields  (ONLY this re-runs on edit)
  exportPng()        → canvas.toBlob('image/png') → showSaveFilePicker → write
```

Only `renderCard` re-runs on an edit — the PSD is never re-parsed and the background is
never re-baked (spec §4.3, §5). Debounce lives in `appState`, so the UI stays dumb.

## Source structure

```
src/
├─ main.ts                     composition root (order above)
├─ style.css                   app styles
├─ config/editableLayers.ts    ALLOW-LIST: 9 layer names + abilities box geometry
├─ psd/
│  ├─ loadPsd.ts               readPsdBuffer / loadPsd(url) / flattenLayers
│  ├─ extractModel.ts          walk + classify → CardModel (loud on missing layer)
│  └─ types.ts                 StyleRun, Bounds, Anchor, FieldModel, CardModel
├─ fonts/loadFonts.ts          FontFace register, fail-loud, injectable deps
├─ render/
│  ├─ bakeBackground.ts        back-to-front drawImage of non-editable leaves
│  ├─ layoutTitle.ts           PURE per-run small-caps advance (injected measurer)
│  ├─ wrapText.ts              PURE greedy word-wrap + clip (injected measurer)
│  ├─ drawText.ts              draw one field (single-line / title / abilities+clip)
│  └─ renderCard.ts            bg + every field (the edit-time redraw)
├─ state/appState.ts           values + debounced subscribe
├─ ui/fieldPanel.ts            labelled controls from config + seed
├─ ui/preview.ts               two-column layout, canvas, export button
└─ export/exportPng.ts         toBlob → showSaveFilePicker (download fallback)
```

## Key design decisions

- **Inject the measurer.** `layoutTitle` and `wrapText` take
  `measure(text, font) => number` instead of a live canvas. The browser passes
  `ctx.measureText`; tests pass a deterministic stub. This makes the hardest logic
  (faux small-caps advance, word-wrap + clip) unit-testable in pure Node.
- **Explicit allow-list** (`config/editableLayers.ts`) is the single source of truth for
  extraction, the bake skip-set, and the UI panel — one definition, three consumers.
- **Faux small-caps** = per-run `styleRuns` sizing (`[45.83, 37.5, 45.83, 37.5]` over
  lengths `[1, 8, 1, 8]`), each run advanced by its measured width, baseline at the
  engine `transform` (≈ 69.63, 75.92). Edited titles re-segment via the rule "first
  glyph of each word large, rest small".
- **Abilities body** is authored (no PSD layer): box `(37,808)–(664,968)`, padded area
  `x=59, y=824, w=583`, white `Square721BT-RomanCondensed` 21px / 25px line-height,
  clipped to the box bottom.
- **Opacity is 0–1** in ag-psd — applied directly as canvas alpha (never `/255`).
- **`@napi-rs/canvas` is dev/test-only** — it renders/measures in Node tests and feeds
  `ag-psd`'s `initializeCanvas`; it never enters the browser bundle.
- **Transparency preserved** — the canvas is never filled opaque, so export matches the
  PSD's transparent regions.

## Tests (Vitest — 46 tests, all green)

- Pure logic (node env): `config`, `loadFonts` (jsdom), `layoutTitle`, `wrapText`,
  `appState`, `fieldPanel` (jsdom), `exportPng` (jsdom).
- Pixel/compositing (napi canvas + real OTFs): `loadPsd`, `extractModel`,
  `bakeBackground`, `renderCard`, and the **fidelity** regression.
- **Fidelity gate** (`fidelity.test.ts`): renders the original PSD values and diffs
  against `psd.canvas`. Tolerance = per-pixel colour delta 60 (sum |ΔRGB|), max 3%
  mismatched pixels — absorbs sub-pixel metric kerning but catches gross regressions.
  Current baseline: **0.91% mismatch, mean abs error 0.81**. Also asserts the
  small-caps invariant and the abilities clip.

## Scripts

`npm run dev` · `npm run build` (tsc --noEmit + vite build) · `npm test` /
`npm run test:run` (Vitest) · `npm run lint` (ESLint).

## Known limitations / tech debt (v1)

- Chromium-only export (`showSaveFilePicker`); an `<a download>` fallback exists but the
  primary path is the Save dialog.
- Edited single-line values are not re-fitted if they overflow their original slot
  (v1 renders point-type as-is).
- Non-goals deferred to backlog: art placement, hi-res/DPI export, multi-template/batch,
  editing locked labels/chips.
