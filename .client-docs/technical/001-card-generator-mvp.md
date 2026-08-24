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
  createFieldPanel() → inputs (9) + 3 ability rows (name+text); edits → state.set
  createLivePreview()→ panel + state + start(ctx): first render + debounced subscribe
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
├─ config/editableLayers.ts    ALLOW-LIST: 9 layer names + abilities geometry + slots
├─ psd/
│  ├─ loadPsd.ts               readPsdBuffer / loadPsd(url) / flattenLayers
│  ├─ extractModel.ts          walk + classify → CardModel (loud on missing layer)
│  └─ types.ts                 StyleRun, Bounds, Anchor, Ability, FieldModel, CardModel
├─ fonts/loadFonts.ts          FontFace register, fail-loud, injectable deps
├─ render/
│  ├─ bakeBackground.ts        back-to-front drawImage of non-editable leaves + badge patch
│  ├─ layoutTitle.ts           PURE per-run small-caps advance + shrink-to-fit
│  ├─ fitText.ts               PURE single-line shrink-to-fit (tracking→scale)
│  ├─ wrapText.ts              PURE greedy word-wrap + clip (injected measurer)
│  ├─ abilitiesLayout.ts       PURE mixed-weight wrap + block fit/clip (injected measurer)
│  ├─ armorBarLayout.ts        PURE armor segment rects + coerce/clamp (no canvas)
│  ├─ patchChip.ts             PURE row-median + patch a COMMANDER/UNIQUE chip out
│  ├─ drawText.ts              draw one layer-backed field (single-line / title)
│  ├─ drawAbilities.ts         draw the up-to-3 structured abilities (bold name + body)
│  ├─ drawArmorBar.ts          draw the dynamic 0–8 armor bar (empty track / gradient segs)
│  └─ renderCard.ts            bg + chip patches + armor bar + every field (edit-time redraw)
├─ state/appState.ts           values + debounced subscribe
├─ app/livePreview.ts          edit-loop wiring (panel+state+debounced render)
├─ app/seedValues.ts           model → initial value map (abilities → 6 slot keys)
├─ ui/fieldPanel.ts            labelled controls from config + seed
├─ ui/preview.ts               two-column layout, canvas, export button
└─ export/exportPng.ts         toBlob → showSaveFilePicker (download fallback)
```

## Key design decisions

- **Inject the measurer.** `layoutTitle`, `wrapText`, and `abilitiesLayout` take
  `measure(text, font) => number` instead of a live canvas. The browser passes
  `ctx.measureText`; tests pass a deterministic stub. This makes the hardest logic
  (faux small-caps advance, word-wrap + clip, mixed-weight ability wrapping + block fit)
  unit-testable in pure Node.
- **Explicit allow-list** (`config/editableLayers.ts`) is the single source of truth for
  extraction, the bake skip-set, and the UI panel — one definition, three consumers.
- **Faux small-caps** = per-run `styleRuns` sizing (`[45.83, 37.5, 45.83, 37.5]` over
  lengths `[1, 8, 1, 8]`), each run advanced by its measured width, baseline at the
  engine `transform` (≈ 69.63, 75.92). Edited titles re-segment via the rule "first
  glyph of each word large, rest small".
- **Abilities body** is authored (no PSD layer) and **structured**: up to 3
  `{ name, body }` abilities. In state each is two flat keys (`ability{1..3}-name/-body`);
  `renderCard` special-cases the abilities field → `drawAbilities`, which gathers the six
  keys, skips blank pairs, and lays them out via the pure `abilitiesLayout`. Each ability
  renders a **bold** name + ": " + regular body, inline-wrapping (continuation lines are
  regular). The badge-removed box reclaims the top: interior `(37,771)–(664,971)`, text
  starts `x=59, y=780, w=583` (191px usable), ~6px paragraph gap, whole-line clip at
  y=971, dormant shrink-to-fit (floor 0.7×) if it overflows. White
  `Square721BT-RomanCondensed` body / `Square721BT-BoldCondensed` name, 21px / 25px.
- **Dynamic armor bar** is an authored numeric control `armorBars` (0–8, default 8),
  separate from the printed `armor` text. `renderCard` calls `drawArmorBar` right after
  the background blit and before text. The pure `armorBarLayout.ts` splits the fill rect
  (x600–629, y351–525, H=174) into N equal segments (2px gaps; 0 for N=1) and defensively
  coerces/clamps input to `[0,8]`. The PSD's baked 8-segment art is covered during the
  bake (`bakeBackground` `patchArmorBar`, default true); the fidelity baseline disables it
  and omits `armorBars` to keep 0.914%. Config (geometry/colours/patch) lives in
  `config/armorBar.ts`.
- **Dynamic COMMANDER / UNIQUE chips** are authored booleans (`commander`, `unique`, both
  default true), separate from any text layer. The pills are baked into a broad raster
  (`Layer 3`), so a chip is hidden by patching its rect at render time, not by skipping a
  layer. `renderCard` calls `patchChip` for each chip whose flag is `'false'`, after the
  background blit and before the armor bar / text (live toggles, no re-bake). `patchChip`
  reconstructs each rect row from the per-row **median** of a no-chip donor strip
  (`CHIP_DONOR_STRIP {380,500}`) via `putImageData` — a wholesale pixel replace. On this
  card that donor rail is a transparent frame cutout, so the pill is cleared to transparent
  to match the empty slot; `putImageData` (not `fillRect`) is required so a transparent
  donor actually erases the opaque baked pill. Rects (`config/chips.ts`) stop at y=728, above
  the INFANTRY tag row. Both-true default → no patch → fidelity 0.914% holds. Hide-only, no
  reflow of the remaining chip (product-approved).
- **Opacity is 0–1** in ag-psd — applied directly as canvas alpha (never `/255`).
- **`@napi-rs/canvas` is dev/test-only** — it renders/measures in Node tests and feeds
  `ag-psd`'s `initializeCanvas`; it never enters the browser bundle.
- **Transparency preserved** — the canvas is never filled opaque, so export matches the
  PSD's transparent regions.
- **Single-line shrink-to-fit** (`fitText.ts`) — long edits never overflow: condense
  tracking (≤8%/gap) first, then scale the font down (floored 0.6×). The slot width is
  the field's PSD layer bounds × 1.15 for single-line values; the **title** uses the
  black title bar's width instead (`titleAvailableWidth` = `TITLE_BAR_INNER_RIGHT_X`
  512 − anchor.x ≈ 442px, the bar edge measured from the PSD composite) so it only
  condenses when it actually reaches the bar edge, not its tight ink bounds. The title
  scales both small-caps runs by one factor (ratio preserved) and the authored title
  never shrinks. Pure and measurer-injected, so it is canvas-free unit-testable
  (spec §4.5).

## Tests (Vitest — 76 tests, all green)

- Pure logic (node env): `config`, `loadFonts` (jsdom), `layoutTitle`, `wrapText`,
  `fitText`, `appState`, `fieldPanel` (jsdom), `livePreview` (jsdom), `preview` (jsdom),
  `exportPng` (jsdom).
- Pixel/compositing (napi canvas + real OTFs): `loadPsd`, `extractModel`,
  `bakeBackground`, `renderCard`, and the **fidelity** regression.
- **Fidelity gate** (`fidelity.test.ts`): renders the original PSD values and diffs
  against `psd.canvas`. Tolerance = per-pixel colour delta 60 (sum |ΔRGB|), max 3%
  mismatched pixels — absorbs sub-pixel metric kerning but catches gross regressions.
  Current baseline: **0.914% mismatch, mean abs error 0.81**. Also asserts the
  small-caps invariant and the abilities clip.

## Scripts

`npm run dev` · `npm run build` (tsc --noEmit + vite build) · `npm test` /
`npm run test:run` (Vitest) · `npm run lint` (ESLint).

## Known limitations / tech debt (v1)

- Chromium-only export (`showSaveFilePicker`); an `<a download>` fallback exists but the
  primary path is the Save dialog.
- Edited single-line values shrink-to-fit their slot (tracking then scale, floored at
  0.6×); extremely long values stay legible at the floor and may slightly exceed the
  tight slot by design.
- Non-goals deferred to backlog: art placement, hi-res/DPI export, multi-template/batch,
  editing locked labels/chips.

## Batch generation (headless CLI)

Beyond the interactive app, the whole Hero set can be rendered from the source spreadsheet in
one command — same bake + `renderCard` pipeline as the app, so batch output matches the UI.

- **Entry:** `src/batch/cli.ts` (run through `vite-node`). Pure, unit-tested cores under
  `src/batch/`: `mapRow.ts` (spreadsheet row → value overlay + manifest, fail-loud per field),
  `filename.ts` (safe slug + collision suffix), `overflow.ts` (abilities-overflow detector),
  `nodeCanvas.ts` (Node canvas/font/PSD bootstrap).
- **Deps:** `xlsx` (SheetJS) to read the workbook; `@napi-rs/canvas` for the headless canvas +
  the two real OTFs (now a prod dependency because the CLI is a Node tool).
- **Fail-loud contract:** the CLI validates ALL Hero rows first (bad/missing stats, `Unique`/
  `Commander` not 0/1, an ability cell missing its `:` splitter, abilities that overflow the box
  even at min scale). If anything is wrong it prints every error and exits non-zero **without
  writing a file** — a batch is all-or-nothing.
- **Output:** one PNG per card (native 690×1020, PSD transparency) + `manifest.json` for
  traceability, into the `--out` directory.

### Incremental mode (`--incremental`, `--dry-run`)

Re-renders only cards that changed vs the prior run instead of the full 50, diffing the
spreadsheet against the `manifest.json` already in `--out`.

- **Pure planner:** `src/batch/incremental.ts` is fs-free / canvas-free and fully unit-tested.
  `planIncremental(currentCards, priorManifest, existingFiles)` returns a plan: per-card
  `{status, name, file, manifestEntry, archive}` + the final planned `manifest` + `toRender` /
  `toArchive` lists. Identity key is `name.trim()` (case-sensitive v1). Fingerprint is a
  fixed-shape canonical object over every field EXCEPT `file` (so `JSON.stringify` is
  deterministic), comparing arrays in order and only known fields.
- **Statuses:** UNCHANGED (same fingerprint AND prior PNG present), CHANGED (fingerprint differs
  OR prior PNG missing), NEW (name absent from prior), REMOVED (prior name gone from the sheet).
  Retained cards keep their prior `file` to avoid churn; NEW files are allocated collision-safe in
  sorted-name order after reserving all retained names. `validatePriorManifest` fails loud on a
  malformed manifest or duplicate prior/current names.
- **Archive, not delete (product-owner override of design §6):** a superseded (CHANGED) or REMOVED
  PNG is moved to `<out>/archive/<stem>-<compactUTC>.png` (e.g. `...-20260824T180715Z.png`, made
  unique on collision) BEFORE the new PNG is written — CHANGED reuses the same filename, so the old
  copy must move first. `archive/` is excluded from the existing-PNG scan and never treated as card
  output. Nothing is ever deleted.
- **Ordering / crash-safety:** validate ALL rows → plan → (dry-run exits here) → archive moves →
  render CHANGED+NEW → write `manifest.json` LAST. `--dry-run` performs no bake, render, move, or
  write; it only prints the plan. Missing prior manifest → notice + behave like a full run. Corrupt
  prior manifest or duplicate names → fail loud, nothing written.
- **Testability:** `main()` is `VITEST`-guarded; the pipeline body is the exported `run(opts)`,
  which throws on fail-loud conditions (the thin `main` wrapper turns a throw into a non-zero
  exit). `test/batch/cliIncremental.test.ts` drives `run()` in-process against tiny xlsx fixtures +
  temp dirs to assert on-disk effects (dry-run writes nothing, corrupt manifest fails, CHANGED
  archives-then-writes, REMOVED archives-and-drops, etc.).

