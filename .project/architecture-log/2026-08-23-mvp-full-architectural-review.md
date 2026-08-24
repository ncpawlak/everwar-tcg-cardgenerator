# Architecture Review — Card Generator MVP (STORY-1..13)

**Date:** 2026-08-23
**Reviewer:** Senior Coder (Gate 2 sign-off review)
**Branch:** `npawlakel-psd-card-editor` (local only — NOT pushed)
**Scope:** Full architectural review of the complete 13-story MVP against
`.project/spec.md` and `.project/taskboard/001-card-generator-mvp.md`.

---

## Verdict: ✅ SIGN-OFF — ready for the Reviewer

The implementation is architecturally sound, matches the approved structure, and
the spec-critical constraints are all honored. Build, lint, and the full test
suite are green. One mandatory follow-up (browser visual verification) and two
test-to-add coverage items are recorded below — none block Reviewer entry, but the
browser check MUST be confirmed before final QA.

---

## What I actually ran (results, not "should pass")

| Command | Result |
|---|---|
| `npx vitest run` | **46 passed / 46**, 13 files, exit 0 |
| `npm run build` (`tsc --noEmit && vite build`) | **clean**, 81 modules, no TS errors, exit 0 |
| `npx eslint .` | **clean**, exit 0 |
| Fidelity (STORY-13) | **mismatch 0.914%** vs PSD composite (threshold 3%), mean|err| 0.809 |

## Structure & spec compliance

- Source layout matches the taskboard's mandated tree exactly (config / psd /
  fonts / render / state / ui / export + `main.ts` composition root). No stray files.
- **Injected-measurer pattern honored** — `layoutTitle` and `wrapText` are pure,
  take `measure: (text, font) => number`, and never touch a live canvas.
  `drawText` injects `ctx.measureText`. Layout is unit-tested with deterministic
  stubs (`wrapText.test.ts` CHAR_W=10). Good separation of geometry vs. drawing.
- **Bake-once / re-render-only-text** — `bakeBackground` runs once in `main.ts`;
  `renderCard` is the sole edit-path and only clears + blits the cached background +
  redraws text. No re-parse, no re-bake per edit (spec §4.3, §5). Verified in
  `renderCard.test.ts` "deterministic across repeated renders".
- **Per-run styleRuns small-caps** — `extractModel` captures `[1@45.83, 8@37.5,
  1@45.83, 8@37.5]`; `layoutTitle` honors runs verbatim when they cover the text,
  and regenerates faux small-caps (first glyph big, rest small) for edited text,
  advancing x by measured width. Never collapses to one size (spike learning).
- **Abilities word-wrap + clip** — greedy wrap in the padded area (59,824,w=583),
  hard-break guard against infinite loop, lines past box bottom (968) dropped, and
  `drawText` also `ctx.clip()`s the box as belt-and-suspenders. `renderCard.test.ts`
  and `fidelity.test.ts` both assert no pixels below y=968.
- **Fail-loud fonts** — `loadFonts` throws a named, actionable error on any face
  failure and blocks on `document.fonts.ready`; `main.ts` loads fonts FIRST before
  parse/bake/render (spec §6). No silent fallback.
- **Export via File System Access** — `exportPng` uses `showSaveFilePicker` each
  call, `toBlob('image/png')` (transparency preserved, canvas never flattened).
  The `<a download>` fallback is explicitly permitted by spec §2 (not scope creep).
- **Opacity gotcha** — `bakeBackground` applies `layer.opacity` directly as 0–1
  alpha, does NOT divide by 255 (logged gotcha honored).

## Test quality

Tests are real and assert behavior, not presence: specific styleRun lengths/sizes,
baseline anchor (69.63, 75.92), loud missing-layer error path (`toThrow(/NoSuchLayer/)`),
JSON-serializability, clip invariants, and the pixel-diff fidelity guard against the
real `psd.canvas` composite with a documented tolerance rationale. The fidelity test
(STORY-13) genuinely renders through `@napi-rs/canvas` with the real OTFs and diffs
vs. the PSD composite — a true regression guard.

## Regression blast-radius

Config (`editableLayers`) fans out to extraction, bake skip-set, and the UI panel;
render depends on extract + bake. The suites covering that coupled surface —
`config`, `extractModel`, `bakeBackground`, `layoutTitle`, `wrapText`, `renderCard`,
`fidelity` — all ran green. That is the correct scope for these changes and it is
confirmed green.

## Scope-creep check

No out-of-scope work. Grep for upload/drag-drop/template/batch/localStorage found
nothing; the only `fetch` is the PSD load. Non-goals (art placement, hi-res export,
multi-template/batch, editing locked labels) are absent and already bookmarked in
`.project/backlog/`. The download fallback is spec-sanctioned.

## Coverage gaps — test-to-add items (do NOT wave through)

1. **Composition-root integration untested.** `main.ts` wires
   fonts→psd→extract→bake→state→render→export, and the live edit→debounce→re-render
   path is only tested in isolation (`appState`, `fieldPanel`), never end-to-end.
   Add a jsdom/happy-dom integration test: mount panel, fire an `input`, advance
   fake timers past the debounce, assert `renderCard` runs exactly once.
2. **`ui/preview.ts buildLayout` untested.** No assertion on the two-column shell,
   canvas sizing (690×1020), or that a 2D context is acquired. Add a jsdom smoke test.

These are acceptable to defer past Reviewer entry but are logged as owed tests, not
silently skipped.

## Mandatory follow-up before final QA (UI work rule)

Automated tests cannot exercise the real browser canvas render or
`showSaveFilePicker` (jsdom returns null for `getContext`). **The Coder must visually
verify in a Chromium browser**: card renders faithfully with bundled fonts, all 10
fields live-update (debounced), small-caps title intact, abilities wraps+clips, and
Export writes a 690×1020 transparent PNG to a chosen path. Confirm before final QA.

## Minor / latent notes (non-blocking)

- Single-line `drawText` maps PSD justification to `textAlign` and draws at
  `anchor.x` (transform origin). For any center/right-justified field this pairing
  could shift placement; the 0.914% fidelity pass indicates the current card's
  fields are effectively left-anchored, so no action now — revisit if a future
  template uses centered point-type.
- Deliberate `any` at cross-env canvas boundaries (`Ctx2D`, `BackgroundSource`,
  ag-psd styleRuns) — justified for DOM-vs-napi portability, lint-clean, contained.

## Skill candidate (surfaced to Orchestrator)

"Injected-measurer pattern for canvas-independent text layout" — pure layout
functions taking `(text, font) => width` so geometry is Node-unit-testable and the
app passes `ctx.measureText`. Reusable across any canvas-render project. Candidate
for **universal** skill classification.
