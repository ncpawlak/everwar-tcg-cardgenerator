# Taskboard 001 — EverWar TCG Card Generator (v1 MVP)

**Author:** Senior Coder — Gate 1.5 implementation handoff
**Spec:** `.project/spec.md` (USER-APPROVED)
**Build plan / architecture:** `.project/architecture-log/2026-08-23-build-plan-taskboard.md`
**Project mode:** **TDD** (harness Constraint: no production code without a failing test first — Red → Green → Refactor).

---

## How to work this board

Implement stories **top-down in the numbered order**. Each story lists its own
dependencies explicitly; a story may not start until every `Depends on` story is
🟢 Done. Every story is **test-first**: write the failing test(s) named under
_Tests_, watch them fail (Red), implement the minimum to pass (Green), refactor.

**Design rule that makes rendering testable (READ THIS FIRST):** all text layout
math (word-wrap, per-run title advance) must take an **injected measurer**
`measure: (text: string, font: string) => number` rather than reaching for a live
`CanvasRenderingContext2D`. This lets the geometry be unit-tested with a
deterministic stub in Node, and lets the real app pass `ctx.measureText`. Do not
couple layout logic to a live canvas.

**Test runner:** Vitest. Pure logic (model extraction, wrap, run layout, config)
runs in the default node environment. Pixel/compositing assertions render through
`@napi-rs/canvas` (a **dev/test-only** dependency — mirrors the spike; the shipped
app uses the browser's native canvas) and `ag-psd`'s `initializeCanvas(...)`.
DOM/UI wiring runs under `environment: 'jsdom'` (or `happy-dom`).

---

## Proposed source structure (Coder MUST follow — keeps architecture coherent)

```
/
├─ index.html                     # single canvas preview + field panel mount
├─ package.json  tsconfig.json  vite.config.ts  vitest.config.ts  eslint.config.js
├─ assets/                        # EXISTING — bundled, not modified
│  ├─ Card_1.psd
│  └─ fonts/Square721BT-BoldCondensed.otf, Square721BT-RomanCondensed.otf
├─ src/
│  ├─ main.ts                     # composition root: load → bake → state → ui → export
│  ├─ config/
│  │  └─ editableLayers.ts        # ALLOW-LIST of 9 layer names + ABILITIES box config
│  ├─ psd/
│  │  ├─ loadPsd.ts               # fetch + readPsd(Card_1.psd) in-browser
│  │  ├─ extractModel.ts          # walk tree, classify, build typed CardModel
│  │  └─ types.ts                 # StyleRun, EditableField, AbilitiesConfig, CardModel
│  ├─ fonts/
│  │  └─ loadFonts.ts             # FontFace register + await fonts.ready, fail loud
│  ├─ render/
│  │  ├─ bakeBackground.ts        # composite non-editable layers → ImageBitmap
│  │  ├─ layoutTitle.ts           # per-run (styleRuns) small-caps advance (pure)
│  │  ├─ wrapText.ts              # word-wrap + clip geometry for abilities (pure)
│  │  ├─ drawText.ts              # draw one field to a ctx (single-line / title)
│  │  └─ renderCard.ts            # draw bg + every editable field (orchestrator)
│  ├─ state/
│  │  └─ appState.ts              # field values, debounced change notification
│  ├─ ui/
│  │  ├─ fieldPanel.ts            # inputs for 9 fields + abilities textarea
│  │  └─ preview.ts               # canvas element + panel layout wiring
│  └─ export/
│     └─ exportPng.ts             # toBlob('image/png') → showSaveFilePicker
└─ test/
   ├─ fixtures/                   # expected metrics, baseline crop tolerances
   └─ *.test.ts                   # co-located or here, per story
```

---

## Story summary (ordered)

| ID | Title | Cx | Depends on |
|----|-------|----|-----------|
| STORY-1  | Project scaffold (Vite + TS + Vitest + ESLint + asset bundling) | M | — |
| STORY-2  | Editable-layer allow-list + abilities box config | S | STORY-1 |
| STORY-3  | PSD loader (parse Card_1.psd in-browser) | M | STORY-1 |
| STORY-4  | Typed text-layer model + extraction | L | STORY-2, STORY-3 |
| STORY-5  | Font loading (FontFace, fail-loud) | S | STORY-1 |
| STORY-6  | Background baking (non-editable composite) | M | STORY-3 |
| STORY-7  | Title layout — per-run styleRuns small-caps (pure) | M | STORY-4 |
| STORY-8  | Abilities word-wrap + clip (pure) | M | STORY-2 |
| STORY-9  | Field draw + renderCard orchestrator | L | STORY-5, STORY-6, STORY-7, STORY-8 |
| STORY-10 | App state + debounced change | M | STORY-4 |
| STORY-11 | UI layout + field panel + live preview wiring | L | STORY-9, STORY-10 |
| STORY-12 | PNG export (showSaveFilePicker) | M | STORY-9 |
| STORY-13 | Fidelity / regression baseline test | M | STORY-9 |

---

### STORY-1: Project scaffold — Vite + TS + Vitest + ESLint + asset bundling

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** —
**Estimated complexity:** M

**Description:**
Stand up the app skeleton at repo root (NOT inside `spike/`): Vite + TypeScript,
Vitest as the test runner, ESLint + `@typescript-eslint`. Add `ag-psd` (prod) and
`@napi-rs/canvas` (dev/test only). Ensure `assets/Card_1.psd` and the two OTFs are
bundled/served so they load in-browser (import-as-URL or a served `assets/` path;
do not inline-base64 the PSD). Provide npm scripts: `dev`, `build`, `test`,
`test:run`, `lint`. `index.html` mounts an empty app container.

**Acceptance Criteria:**
- [ ] `npm run dev` serves the app; `npm run build` produces a production bundle with no TS errors.
- [ ] `npm test` runs Vitest; a trivial sample test passes.
- [ ] `npm run lint` runs clean on the scaffold.
- [ ] `assets/Card_1.psd` and both OTFs resolve to a fetchable URL at runtime (verified by a test or a logged fetch of the PSD returning >0 bytes).
- [ ] `tsconfig.json` uses `strict: true`.

**Tests:**
- `test/scaffold.test.ts` — asserts the asset URL for the PSD resolves and the bundler exposes it (import.meta URL / fetch length > 0). Sanity test proving the runner works.

**Technical Notes:**
Keep UI framework-free (plain TS) per spec — a canvas + a form does not warrant
React/Svelte. Vitest config: default `environment: 'node'`; add a `jsdom` project
or per-file `// @vitest-environment jsdom` for UI tests in STORY-11. Register
`@napi-rs/canvas` as devDependency only; it must never enter the browser bundle.

---

### STORY-2: Editable-layer allow-list + abilities box config

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-1
**Estimated complexity:** S

**Description:**
Encode the **explicit allow-list** of the 9 editable PSD layer names (spec §3) and
the authored ABILITIES body region config as data in `src/config/editableLayers.ts`.
Each entry carries a stable field `id`, the exact PSD `layerName`, a UI `label`, and
a `kind` (`'title' | 'single-line' | 'abilities'`). The abilities entry carries the
box geometry: content box `(37,808)–(664,968)`, padded text area `x=59, y=824,
w=583`, font `Square721BT-RomanCondensed`, fontSize `21`, lineHeight `25`, white.

**Acceptance Criteria:**
- [ ] Exactly 9 name-mapped fields + 1 abilities field are defined, matching spec §3 order and names (`Name text`, `4`, `40`, `25`, `30`, `75`, `INFANTRY`, `IRONWARD LEGION`, `HUMAN`).
- [ ] `Name text` has `kind: 'title'`; abilities has `kind: 'abilities'` with the exact box + padded area constants; the rest are `single-line`.
- [ ] Field `id`s are unique and stable (used later as form + state keys).

**Tests:**
- `test/config.test.ts` — assert allow-list length, unique ids, exact layer names, kinds, and the abilities geometry constants.

**Technical Notes:**
This is the single source of truth for "what is editable." Extraction (STORY-4)
and UI (STORY-11) both consume it. Do NOT classify by layer type or naming
convention — spec §10 mandates an explicit allow-list.

---

### STORY-3: PSD loader — parse Card_1.psd in-browser

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-1
**Estimated complexity:** M

**Description:**
`src/psd/loadPsd.ts`: fetch the bundled PSD as an `ArrayBuffer` and parse with
`ag-psd`'s `readPsd`, requesting layer bitmaps and text-engine data. Return the
parsed document. Provide a small `flattenLayers(psd)` helper (document order,
bottom→top, skipping group containers) reused by extraction and baking.

**Acceptance Criteria:**
- [ ] Parsing `Card_1.psd` yields a document of **690×1020**.
- [ ] `flattenLayers` returns the expected leaf-layer count (assert against the spike inventory: 29 layers) and preserves document order.
- [ ] Each text layer exposes `layer.text` (text-engine object) and each drawn layer exposes `layer.canvas`.

**Tests:**
- `test/loadPsd.test.ts` — in node, `initializeCanvas(createCanvas)` from `@napi-rs/canvas`, read the real PSD from `assets/`, assert dimensions, layer count, and that `Name text` layer has `.text`.

**Technical Notes:**
ag-psd requires `initializeCanvas` in Node (tests) but uses the DOM canvas in the
browser automatically — keep the `initializeCanvas` call in test setup, NOT in
`loadPsd.ts`. Reuse the spike's flatten walk (`spike/edit.js` L15-17).

---

### STORY-4: Typed text-layer model + extraction

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-2, STORY-3
**Estimated complexity:** L

**Description:**
`src/psd/types.ts` + `src/psd/extractModel.ts`: build a typed `CardModel` by
matching flattened layers against the allow-list (STORY-2). For each editable
field capture: text string, font family, **per-run `styleRuns` sizes** (array of
`{length, fontSize}`), fill color `{r,g,b}`, justification, and position via the
text-engine `transform` (baseline anchor) plus layer bounds. The abilities field
is synthesized from config (no PSD layer). Guard the `opacity` gotcha (0–1 float,
do not divide by 255).

**Acceptance Criteria:**
- [ ] `extractModel` returns a field for every allow-list entry; a missing named layer throws a loud, named error (not a silent skip).
- [ ] `Name text` yields per-run sizes matching the spike: runs of `[45.83, 37.5, 45.83, 37.5]` px over lengths `[1,8,1,8]` (tolerance ±0.1), and baseline transform ≈ `(69.63, 75.92)`.
- [ ] Single-line fields capture non-empty text, a font name, a numeric fontSize, an `{r,g,b}` fill, and a position.
- [ ] Model is a plain serializable object (no live canvas refs) so it can be snapshot-tested.

**Tests:**
- `test/extractModel.test.ts` — read the real PSD, assert title styleRuns + transform, assert each single-line field's captured props, assert a bogus allow-list name throws.

**Technical Notes:**
`text.styleRuns` is the authority for title sizing — do NOT collapse to
`text.style.fontSize`. Fall back to `text.style` only for uniform single-line
fields. Keep the model UI-agnostic; STORY-10 state seeds its initial values from
`model.fields[id].text`.

---

### STORY-5: Font loading — FontFace, fail-loud

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-1
**Estimated complexity:** S

**Description:**
`src/fonts/loadFonts.ts`: construct `FontFace` objects for the two OTFs under the
exact family names the PSD references (`Square721BT-BoldCondensed`,
`Square721BT-RomanCondensed`), `add` them to `document.fonts`, and `await`
`document.fonts.ready`. A load failure **throws loudly** — no silent fallback.

**Acceptance Criteria:**
- [ ] Both faces are registered under the exact family names from spec §6.
- [ ] The function resolves only after `document.fonts.ready`; render is blocked until then.
- [ ] A missing/failed font file rejects with a descriptive error naming the font.

**Tests:**
- `test/loadFonts.test.ts` (`@vitest-environment jsdom`) — mock `document.fonts` (`add`, `ready`); assert both families requested, assert a rejected `FontFace.load()` propagates as a thrown named error.

**Technical Notes:**
Browser-only API; unit test via a mocked `document.fonts`. This is the hard
fidelity dependency — loudness is a spec requirement (§4.4, §6), assert it.

---

### STORY-6: Background baking — non-editable composite

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-3
**Estimated complexity:** M

**Description:**
`src/render/bakeBackground.ts`: composite every **non-editable** layer (all leaves
except the 9 editable named text layers) back-to-front into a single 690×1020
raster, honoring `hidden` and the 0–1 `opacity`. Return a cached `ImageBitmap`
(browser) / canvas (test). Baking runs once; it is not repeated on edits.

**Acceptance Criteria:**
- [ ] Output is 690×1020 and excludes exactly the 9 editable layers (their pixels absent from the bake).
- [ ] Hidden layers are skipped; `opacity` applied as a 0–1 alpha (not /255).
- [ ] Baking is invoked once and the result is reusable (pure w.r.t. edits).

**Tests:**
- `test/bakeBackground.test.ts` — bake from the real PSD via napi canvas; assert dimensions; sample a pixel inside the `Name text` region and assert it matches the "title-removed" background (i.e. differs from the full PSD composite there), and assert a static-frame pixel matches `psd.canvas`.

**Technical Notes:**
Reuse the spike's `composeMinus` compositing (`spike/edit.js` L36-51) but skip the
whole editable **set**, not one layer. Blend modes are all `normal` and there are
no layer effects (spike-confirmed), so naive drawImage is exact.

---

### STORY-7: Title layout — per-run styleRuns small-caps (pure)

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-4
**Estimated complexity:** M

**Description:**
`src/render/layoutTitle.ts`: pure function that, given the title string, its
`styleRuns` (per-run font sizes), the font family, a baseline anchor, and an
injected `measure(text, font)` fn, returns a list of positioned draw ops
`{ text, font, x, y }` — each run advanced by the measured width of the prior run.
This reproduces the faux small-caps (tall initial + shorter rest per word).

**Acceptance Criteria:**
- [ ] For the real title runs `[1@45.83, 8@37.5, 1@45.83, 8@37.5]`, returns 4 ops with the correct substrings and monotonically increasing `x`.
- [ ] Each op's `x` equals the anchor plus the summed measured widths of all prior runs (verified against a deterministic stub measurer).
- [ ] Works for arbitrary edited title text by re-segmenting runs proportionally (document the segmentation rule: first glyph of each whitespace-delimited word large, rest small).

**Tests:**
- `test/layoutTitle.test.ts` — inject a stub `measure` returning `len * size * k`; assert op count, substrings, and cumulative x math; assert single-word and empty-string edge cases.

**Technical Notes:**
This is the spike's key learning — per-run sizing keyed off `styleRuns`, advancing
by `measureText().width`, baseline at `text.transform` (≈69.63, 75.92). NEVER
assume one size per layer. Keep it canvas-free; STORY-9 supplies `ctx.measureText`.

---

### STORY-8: Abilities word-wrap + clip (pure)

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-2
**Estimated complexity:** M

**Description:**
`src/render/wrapText.ts`: pure greedy word-wrap. Given text, the padded width
(583), line-height (25), a max bottom (box bottom 968 minus start y 824), and an
injected `measure`, return an array of `{ text, x, y }` lines, dropping/clipping
lines that would overflow the box bottom.

**Acceptance Criteria:**
- [ ] Wraps on word boundaries; no line's measured width exceeds the padded width.
- [ ] Lines beyond the box bottom are clipped (not emitted) — never drawn below `(37,808)–(664,968)`.
- [ ] A sample paragraph wraps to the expected line count with the spike's metrics (21px/25px, w=583).
- [ ] Handles empty input (0 lines) and a single over-long word (hard-breaks or clips without infinite loop).

**Tests:**
- `test/wrapText.test.ts` — stub measurer; assert line breaks for a known paragraph, assert clipping when text exceeds available height, assert edge cases.

**Technical Notes:**
Mirrors the spike's abilities demo (3 lines, clean wrap, clip to box bottom). Keep
geometry pure; the caller clips-and-draws in white RomanCondensed.

---

### STORY-9: Field draw + renderCard orchestrator

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-5, STORY-6, STORY-7, STORY-8
**Estimated complexity:** L

**Description:**
`src/render/drawText.ts` + `src/render/renderCard.ts`. `drawText` draws one field
to a `ctx`: single-line values with captured font/size/color/justification at
position; title via STORY-7 ops (passing `ctx.measureText`); abilities via STORY-8
lines inside a clip rect. `renderCard(ctx, background, model, values)` draws the
cached background then every editable field over it. Only this path re-runs on edit.

**Acceptance Criteria:**
- [ ] `renderCard` draws background first, then all 10 fields, at 690×1020.
- [ ] Title renders with per-run sizing (initial glyphs visibly larger) — verified by measuring rendered glyph heights or run x-advances.
- [ ] Abilities text stays within the box; nothing renders below y=968.
- [ ] Colors/positions of single-line fields match the model within tolerance.
- [ ] No PSD re-parse and no re-bake occur inside `renderCard`.

**Tests:**
- `test/renderCard.test.ts` — render to a napi canvas with fonts registered via `GlobalFonts.registerFromPath`; assert a title initial-cap column is taller than a following-cap column (small-caps invariant); assert an abilities pixel below y=968 is unchanged from background (clip holds); assert a stat number renders non-background pixels at its position.

**Technical Notes:**
Register the OTFs in test setup via `GlobalFonts.registerFromPath(...)` (spike
real-font run). `textBaseline`/anchor: single-line uses layer position; title uses
the transform baseline. Inject `ctx.measureText` into STORY-7/8 pure fns here.

---

### STORY-10: App state + debounced change

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-4
**Estimated complexity:** M

**Description:**
`src/state/appState.ts`: hold the current value per field id, seeded from the
extracted model. Expose `get`, `set(id, value)`, and `subscribe(cb)` where `set`
notifies subscribers **debounced ~100–150 ms**. Only text values live here; the
background bitmap and model are immutable inputs held elsewhere.

**Acceptance Criteria:**
- [ ] Initial state equals the model's captured field texts.
- [ ] Rapid successive `set` calls collapse into a single debounced notification (~100–150 ms).
- [ ] `subscribe` fires with the latest values; unsubscribe works.

**Tests:**
- `test/appState.test.ts` — fake timers; assert seed values, assert N rapid sets → 1 callback after the debounce window, assert latest value delivered.

**Technical Notes:**
Debounce belongs here so the UI layer stays dumb. Notification triggers a
`renderText`-only redraw (STORY-9), never a re-parse/re-bake (spec §5).

---

### STORY-11: UI layout + field panel + live preview wiring

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-9, STORY-10
**Estimated complexity:** L

**Description:**
`src/ui/fieldPanel.ts` + `src/ui/preview.ts` + `main.ts` wiring. Build the layout:
a prominent 690×1020 canvas preview and a field panel with an input per single-line
field, a title input, and a textarea for abilities — all pre-filled from state.
Input events call `state.set`; the debounced subscription redraws editable text over
the cached background. `main.ts` is the composition root: loadFonts → loadPsd →
extractModel → bakeBackground → seed state → mount UI → first render.

**Acceptance Criteria:**
- [ ] Preview canvas is prominent; panel lists all 10 fields pre-filled with PSD values.
- [ ] Editing any field updates the preview automatically (no apply button), debounced.
- [ ] First render is blocked until fonts are ready (no fallback flash).
- [ ] Only editable text redraws on edit; the background bitmap is reused (no re-parse/re-bake).
- [ ] **Coder visually verifies in a Chromium browser** (Senior Coder will ask; code-only validation is not acceptable for this UI story).

**Tests:**
- `test/fieldPanel.test.ts` (`@vitest-environment jsdom`) — mount the panel from a fake model, assert inputs are pre-filled, simulate an input event, assert `state.set` called with the right id/value and (with fake timers) a redraw callback fires once.

**Technical Notes:**
Keep DOM plain (no framework). The panel is a pure function of the field config
(STORY-2) + seed values. Manual browser check is mandatory before Senior Coder
sign-off.

---

### STORY-12: PNG export — showSaveFilePicker

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-9
**Estimated complexity:** M

**Description:**
`src/export/exportPng.ts` + an Export button. On click: `canvas.toBlob('image/png')`
→ `showSaveFilePicker` (user picks folder + filename every time) → write the blob to
the chosen handle. Output is native 690×1020 with PSD-matching transparency (do not
flatten to opaque). Optional `<a download>` fallback only if `showSaveFilePicker` is
absent.

**Acceptance Criteria:**
- [ ] Export produces a 690×1020 PNG identical to the on-screen preview.
- [ ] Transparency is preserved where the PSD is transparent (alpha not forced opaque).
- [ ] `showSaveFilePicker` is invoked each export; the blob is written to the user-chosen handle.
- [ ] Missing `showSaveFilePicker` degrades to a download fallback (if implemented) or a loud, actionable error.

**Tests:**
- `test/exportPng.test.ts` (`@vitest-environment jsdom`) — mock `HTMLCanvasElement.toBlob` and `window.showSaveFilePicker` (writable stub); assert MIME `image/png`, assert the picker is called, assert the writable receives the blob and is closed.

**Technical Notes:**
Do not upsample in v1 (native res only). Transparency comes for free if the canvas
is never filled with an opaque background — verify the bake preserves alpha.

---

### STORY-13: Fidelity / regression baseline test

**Status:** 🟢 Done
**Assigned to:** Coder
**Depends on:** STORY-9
**Estimated complexity:** M

**Description:**
An integration test that renders the card with the **original PSD field values** and
asserts it matches the PSD composite (`psd.canvas`) within tolerance, and asserts the
small-caps sizing is applied. This is the regression guard for future changes.

**Acceptance Criteria:**
- [ ] Full render with unedited values matches `psd.canvas` within a documented per-pixel/mean tolerance (fonts registered; sub-pixel kerning slack allowed per spec §4.4).
- [ ] The title small-caps invariant holds (initial-cap run taller/larger than following run) — asserted, not eyeballed.
- [ ] The abilities region renders within its box (no pixels below y=968).
- [ ] Test documents the tolerance value and rationale.

**Tests:**
- `test/fidelity.test.ts` — render via napi canvas with real fonts; diff against `psd.canvas`; compute mean abs error / mismatched-pixel ratio under threshold; assert the small-caps and clip invariants.

**Technical Notes:**
Tolerance must absorb metric-kerning sub-pixel differences (spec §4.4) but catch
gross regressions (wrong font, missing field, mis-position). Start ~2–3% mismatched
pixels at a small color delta and tighten empirically. This test is the fidelity
gate in the blast-radius suite below.

---

## Regression blast-radius (MANDATORY before Senior Coder sign-off)

The render pipeline is the shared core; almost everything depends on it. Coupling:

- `config/editableLayers.ts` → consumed by `extractModel`, `bakeBackground` (skip
  set), UI panel. **Any change here reruns:** config, extractModel, bake, render,
  fidelity, fieldPanel tests.
- `render/layoutTitle.ts`, `render/wrapText.ts` → consumed by `drawText`/`renderCard`.
  **Any change reruns:** their unit tests **+ renderCard + fidelity**.
- `render/bakeBackground.ts` or `render/renderCard.ts` → **reruns the FULL suite**
  (these are the core; err wide).
- `psd/extractModel.ts` → reruns extractModel + renderCard + fidelity + appState seed.
- `state/appState.ts` → reruns appState + fieldPanel.
- `export/exportPng.ts`, `ui/*` → rerun their own suites; if they touch the shared
  canvas, also rerun renderCard + fidelity.

**Sign-off rule:** for a change touching `render/*`, `psd/*`, or `config/*`, run the
**entire Vitest suite** (`npm run test:run`) + `npm run lint` + a browser visual
check, and report **actual green results** (not "should pass"). Isolated `ui/` or
`export/` changes may run their own suite + lint, but STORY-13 fidelity runs on any
render-path change without exception.

---

## Notes for the Reviewer & Learner

- Every story is a Reviewer checklist via its Acceptance Criteria.
- Scope is fixed by this board — anything not listed here is out of scope (route to
  `.project/backlog/`), per the Senior Coder scope-creep rule.
- v1 Non-Goals (spec §9): art placement, hi-res/DPI export, multi-template/batch,
  editing locked labels/chips, desktop packaging, any server/native render path.


---

## Post-review refinements (Gate 2 → pre-push, user-approved)

Applied after both Gate 2 reviews signed off; full suite kept green (59 tests).

- **FIX-1 — Single-line shrink-to-fit (spec refinement, see `spec.md` §4.5).**
  Single-line fields (title + faction/tags/stat values) now shrink to fit their slot
  instead of overflowing: condense tracking up to 8%/gap, then scale font down floored
  at 0.6x. The title scales both small-caps runs by one factor (ratio preserved). Slot
  width = PSD layer bounds x1.15 allowance (single-line); authored title never shrinks.
  New pure module `src/render/fitText.ts` + changes to `layoutTitle.ts`/`drawText.ts`.
  Unit-tested in `test/fitText.test.ts` and `test/layoutTitle.test.ts` (no canvas).
- **FIX-2 — Composition-wiring integration test.** Wiring extracted to
  `src/app/livePreview.ts` (`createLivePreview`); `test/livePreview.test.ts` proves
  edit -> debounce -> exactly one text-only re-render (fake timers, injected renderer).
- **FIX-3 — Preview shell smoke test.** `test/preview.test.ts` asserts `buildLayout`
  builds the shell + a 690x1020 canvas with a 2D context.

- **FIX-4 — Title fit box = title bar width (user feedback, see `spec.md` §4.5).**
  The TITLE was condensing far too early because its slot was derived from tight ink
  bounds (~341px x1.15). Corrected: the title's available width now spans from its left
  anchor (x≈69.63) to the black title bar's inner-right edge, `TITLE_BAR_INNER_RIGHT_X
  = 512` (measured from the PSD composite; bar interior ends ~x519, metallic bevel to
  the LEVEL panel at ~x521-523, 512 leaves ~7px padding) → ≈442px. Only the TITLE's
  available-width source changed (`titleAvailableWidth` in `fitText.ts`, wired in
  `drawText.ts`); single-line fields untouched. Tests added in `test/fitText.test.ts`
  and `test/layoutTitle.test.ts`. Full suite green (64 tests).


---

## STORY-14 — Structured abilities (up to 3, user-approved "Variant D")

Post-badge-removal enhancement; full suite kept green (76 tests, fidelity 0.914%).

- **MODEL.** The single free-text `abilities` field became an ordered list of up to 3
  `{ name, body }` abilities. `AbilitiesFieldModel` (src/psd/types.ts) now carries
  `abilities[]`, `boldFont`, `paragraphGap`, `minScale`, `textBottom`; `extractModel`
  seeds one placeholder + two empty (skipped at render). In state each ability is two
  flat keys (`ability{1..3}-name/-body`), seeded by the shared `src/app/seedValues.ts`.
- **UI.** `fieldPanel.ts` expands abilities into three rows (NAME input + BODY textarea
  each), wired to the six slot keys via the existing ~120ms debounce.
- **RENDER.** Reclaimed text-top **y=780** (first black interior row below the top gold
  border is y771; +9px pad), text-bottom **y=971** → 191px usable (was 144 from y=824).
  Each ability renders a **bold** NAME + ": " + **regular** BODY inline-wrapping;
  continuation lines are regular. ~6px gap between abilities. New pure module
  `src/render/abilitiesLayout.ts` (mixed-weight tokens, per-word fonts, whole-line clip,
  dormant shrink-to-fit floored 0.7x) + `src/render/drawAbilities.ts`. Realistic
  3-ability sample fits at native scale 1.0 (Variant D).
- **TESTS.** `test/abilitiesLayout.test.ts` (pure: bold-metric prefix, wrap, gaps,
  reclaimed top, skip-empty, shrink, clip) + `test/abilitiesFit.test.ts` (real-font
  Variant D fit). Updated config/extractModel/fidelity/renderCard/fieldPanel tests.
  Fidelity stays 0.914% (baseline renders abilities EMPTY). Test count 65 -> 76.


---

## STORY-15 — Dynamic armor bar (user-approved)

Authored numeric control replacing the baked fixed 8-segment bar. Full suite green
(89 tests, fidelity 0.914%). Local commit only.

- **MODEL/CONFIG.** New `armorBars: number` (default 8) on `CardModel` (src/psd/types.ts),
  set by `extractModel` and seeded to the flat store by `seedValues` (key `armorBars`).
  It is an authored control — NOT a PSD text layer and NOT in `model.order`. Geometry,
  colours, cap (8) and the bake-patch rect live in new `src/config/armorBar.ts`.
- **BAKE PATCH.** `bakeBackground` gained `patchArmorBar?: boolean` (default true) — after
  the composite loop it fills the fill channel (x599-629, y351-525) with the empty-recess
  colour so the PSD's baked green never shows through. Broad frame/right-rail layers are
  NOT skipped. Fidelity bakes `patchArmorBar:false` + omits `armorBars` → 0.914% holds.
- **PURE LAYOUT.** `src/render/armorBarLayout.ts` `armorBarSegments(n, track, gap)` → N
  equal segment rects (gap 0 when N=1), defensive `coerceArmorBars` (floor/clamp [0,8]).
  Canvas-free, unit-tested.
- **DRAW.** `src/render/drawArmorBar.ts` — empty recessed track for 0, else olive divider
  base + top-lit/left-beveled gradient green segments; called from `renderCard` after the
  background blit, before editable text.
- **UI.** `fieldPanel.ts` appends an "Armor bars (0-8)" number input, coerced+clamped to
  an integer via `coerceArmorBars` before it reaches state (~120ms debounce → re-render).
- **TESTS.** `test/armorBarLayout.test.ts` (N=0/1/2/8, clamp), `test/armorBarConfig.test.ts`
  (pinned geometry/colours), plus bakeBackground (patch covers green, frame untouched),
  renderCard (green at N=8 centre, empty at N=0), extractModel (armorBars=8), fieldPanel
  (clamp). Test count 76 -> 89. QA renders armorbar-final-N{0,1,2,3,5,8}.png match the
  Senior's spike proofs.

---

## STORY-16 — Dynamic COMMANDER / UNIQUE chips (user-approved)

Two authored booleans to hide each rarity chip independently. Hide-only (no reflow of the
remaining chip). Full suite green (96 tests, fidelity 0.914%). Local commit only.

- **MODEL.** New `commander: boolean` and `unique: boolean` (both default **true**) on
  `CardModel` (src/psd/types.ts), set by `extractModel` and seeded to the flat store by
  `seedValues` as `'true'/'false'` strings. Authored controls — NOT PSD text layers, NOT in
  `model.order`. Default true keeps the baked art on screen and the fidelity baseline honest.
- **CONFIG.** New `src/config/chips.ts` — COMMANDER hide rect `{52,686,222,728}`, UNIQUE hide
  rect `{220,687,370,728}` (both stop at y=728, above the INFANTRY tag row), and
  `CHIP_DONOR_STRIP {380,500}`.
- **RENDER HELPER.** `src/render/patchChip.ts` — pure, unit-tested `computeRowFill` (per-channel
  median of a donor row) + thin `patchChip(ctx, rect)` glue. For each rect row it takes the
  median of the donor strip at the same y and writes it via `putImageData` (wholesale pixel
  replace, alpha included). On this card the donor rail is a transparent frame cutout, so the
  patch clears the pill to transparent — matching the empty rail slot. `putImageData` (not
  `fillRect`) is required so a transparent donor actually erases the opaque baked pill.
- **INTEGRATION.** `renderCard` patches the commander rect when `commander==='false'` and the
  unique rect when `unique==='false'`, after the background blit (and donor read) and before
  the armor bar / editable text — live toggles, no re-bake. Default bake path unchanged;
  both-true → no patch → fidelity 0.914% holds.
- **UI.** `fieldPanel.ts` appends "Commander" and "Unique" checkboxes (default checked), wired
  through the existing debounce → re-render, emitting `String(checked)`.
- **TESTS.** `test/patchChip.test.ts` (median: odd/even/outlier/empty-throws), plus renderCard
  (chip hidden band differs, other chip + INFANTRY row byte-identical), extractModel
  (chips default true), fieldPanel (checkboxes exist, default checked, emit true/false).
  Test count 89 -> 96. QA renders chips-final-{both,no-commander,no-unique,none}.png confirm
  clean hide with the tag row intact.

---

## STORY-17 — Batch CLI: generate all Hero cards from the spreadsheet

**Goal.** Headless Node command reads the xlsx, filters Hero rows (50), maps each to a
CardModel value overlay, renders through the SHARED pipeline (bake once + `renderCard`), and
writes one PNG per card + `manifest.json`.

- **CLI.** `npm run batch -- --input <xlsx> --sheet "full Set Table v2 - stat adjust" --out <dir>`
  (`vite-node src/batch/cli.ts`). New deps: `xlsx` (SheetJS), `@napi-rs/canvas` promoted to
  `dependencies` (Node-only CLI + fonts).
- **Structure.** `src/batch/`: `mapRow.ts` (pure row→values+manifest, multi-error collection),
  `filename.ts` (slug + collision suffix), `overflow.ts` (pure abilities-overflow detector over
  `layoutAbilities`), `nodeCanvas.ts` (src-local napi/font/PSD bootstrap), `cli.ts` (Node glue:
  ingest → validate-all → render → write).
- **Fail-loud.** Full validation pass first (field errors + abilities overflow). Any error →
  print all, exit non-zero, write nothing. Overflow attributed to the offending ability via
  `clippedAbilityIndex` (added to `AbilitiesLayout`).
- **TESTS.** `test/batch/`: `mapRow` (14), `filename` (4), `overflow` (3), `smokeRender` (1 —
  maps + renders one Goliath row to a real PNG buffer). Test count 99 → 121. Fidelity 0.914%.

## STORY-18 — Incremental batch mode (`--incremental` / `--dry-run`, archive-not-delete)

**Goal.** Opt-in incremental re-render: diff the sheet against the prior `<out>/manifest.json`
and render only CHANGED + NEW cards; preserve superseded/removed PNGs in `<out>/archive/`.

- **18a — pure planner.** `src/batch/incremental.ts` (fs-free/canvas-free):
  `validatePriorManifest`, `planIncremental(currentCards, prior, existingFiles)`. Identity key
  `name.trim()`; fixed-shape fingerprint over all fields except `file`. Statuses UNCHANGED /
  CHANGED (fingerprint differs OR prior PNG missing) / NEW / REMOVED. Retained cards keep prior
  `file`; NEW allocated collision-safe in sorted order after reserving retained names. Fails loud
  on malformed manifest or duplicate prior/current names.
- **18b — CLI wiring.** `src/batch/cli.ts` flags `--incremental` (default off) + `--dry-run`.
  Validate ALL rows first (fail-loud) in every mode. Order: validate → plan → (dry-run exits) →
  archive → render → write manifest LAST. Missing prior manifest → full run; corrupt manifest /
  dup names → fail loud, nothing written. Pipeline body extracted to exported `run(opts)` (throws
  on failure); `main()` stays `VITEST`-guarded.
- **Archive (product-owner override of design §6).** CHANGED/REMOVED prior PNG moved to
  `<out>/archive/<stem>-<compactUTC>.png` before any new write; never deleted; `archive/` excluded
  from the existing-PNG scan.
- **TESTS.** `test/batch/incremental.test.ts` (14, pure planner) + `test/batch/cliIncremental.test.ts`
  (7, in-process `run()` over xlsx fixtures + temp dirs: dry-run writes nothing, corrupt manifest
  fails, validation-failure no-writes, CHANGED archives-then-writes, REMOVED archives-and-drops,
  no-prior renders all, UNCHANGED skips). Test count 124 → 145. Fidelity 0.914%. Verified
  end-to-end on the real 50-card sheet (full → all-UNCHANGED re-run → dry-run → doctored
  CHANGED/NEW/REMOVED archive run).
