# QA Review — 001 Card Generator MVP

**Feature:** EverWar TCG Card Generator (MVP)
**Reviewed by:** Reviewer agent
**Date:** 2026-08-23
**Iteration:** Round 1
**Branch:** `npawlakel-psd-card-editor` (local, not pushed)
**Commit under review:** `2ec151a` (feat: app state, UI, PNG export — STORY-10..12 + docs)
**Verdict:** **PASS — signed off for Gate 2.5** (with one non-blocking Low finding logged for backlog).

---

## What was actually run

### 1. Test suite — `npx vitest run`
- **Result: 46/46 passed, 13/13 files, 0 failed** (Duration ~5s).
- Core-logic coverage confirmed present and green:
  - **Extraction** — `extractModel.test.ts` (6): allow-list coverage, per-run styleRuns `[1@45.83, 8@37.5, 1@45.83, 8@37.5]`, single-line props, synthesized abilities field.
  - **Small-caps title layout** — `layoutTitle.test.ts` (4) + fidelity small-caps invariant (initial-cap ascent > body ascent).
  - **Abilities wrap/clip** — `wrapText.test.ts` (4) + `renderCard`/`fidelity` clip invariants (nothing below y=968).
  - **Export** — `exportPng.test.ts` (3): toBlob PNG, picker path, fallback.
  - **State debounce** — `appState.test.ts` (3): synchronous `get`, debounced single notify on burst.
  - Plus `loadPsd`, `bakeBackground`, `renderCard`, `fieldPanel`, `loadFonts`, `config`, `scaffold`.
- **Fidelity baseline:** mismatch ratio **0.914%** vs PSD composite (threshold 3%), mean|err|=0.809. Well within tolerance.

### 2. Build — `npm run build` (`tsc --noEmit && vite build`)
- **Result: SUCCESS.** 81 modules transformed, no type errors. Bundle: `index-*.js` 305.52 kB (gzip 93.53 kB), CSS 1.91 kB, both OTFs + PSD emitted to `dist/assets/`.

### 3. Dev server — `npm run dev`
- **Boots successfully.** Port 5173 in use → served on **http://localhost:5174/** (as anticipated). `GET /` → 200 (renders `#app` + `<title>`); `GET /src/main.ts` → 200. Confirmed live and serving.

### 4. Rendered visual verification (Constraint #14 — MANDATORY)
Rendered through the **exact production render path** (`extractModel → bakeBackground → renderCard → drawText → layoutTitle/wrapText`) with the real bundled OTFs — the same harness the project's own fidelity suite uses (spike-sanctioned, spec §2/§4.4). This is the substantive RENDERED check; the environment is headless (no browser GUI), but pixels were produced by the shipping code path and inspected.

PNGs written to the session files dir and visually inspected:
- `C:\Users\NoahPawlak\.copilot\session-state\7a783953-edce-422a-b099-c63d178dd06b\files\review-default.png` (session files dir) — default/original values.
- `...\review-edited.png` — edited title + stat + long wrapping abilities.
- `...\review-edge.png` — edge cases (very long title, very long faction, empty fields).

All three verified **690×1020, Format32bppArgb** (alpha channel present). Top-left corner pixel **alpha=0** (transparent, matches PSD — export is NOT flattened opaque).

**Visual-fidelity judgment (blunt):**
- **Fonts: correct.** Square721BT — title in BoldCondensed, labels/tags/abilities in RomanCondensed. No fallback substitution.
- **Small-caps title: correct.** "Ironfist Commander" default and "Stormbringer Vanguard" edited both show large initial caps + smaller body glyphs, per-run sizing preserved on edited text.
- **Positioning: correct.** Stats (LEVEL/HP/ARMOR/DMG/ACC), faction/species/unit-type sit in their frame slots; title baseline anchored correctly.
- **Abilities wrap + clip: correct.** Long body word-wraps inside the black box in white and is CLIPPED at the box bottom (cut mid-sentence after "confirm the text") — verified programmatically too: max pixel delta below y=972 vs background = **0**. Nothing spills past the box.
- **Live editing: works.** Changed title/HP/faction/unit-type/abilities all reflected in the render. HP=999 rendered cleanly.
- **Export: matches spec §7.** 690×1020, `toBlob('image/png')`, transparency preserved, `showSaveFilePicker` (folder+filename each time) with `<a download>` fallback + loud throw when unavailable; AbortError treated as non-fatal cancel.

---

## Findings

### Issue #1 — Long single-line / title text overflows card horizontally (no clip/truncate/shrink)
- **Severity:** Low (non-blocking; graceful-degradation gap on pathological input, not normal card data).
- **Found by:** Reviewer, Round 1.
- **Introduced by:** Coder — `src/render/drawText.ts` single-line + title branches draw with `fillText` at the anchor with **no clip region and no max-width fit** (unlike the abilities branch, which clips to its box).
- **Repro:** Set `name` to a ~60-char string and/or `faction` to a very long string → in `review-edge.png` the title runs off the right edge over the LEVEL box and past the card boundary; the long faction "THE UNENDING CRIMSON DOMINION OF THE SHATTERED N…" runs off the right edge past the card.
- **Expected vs actual:** Spec §3/§10 define these as point-type single lines that "do not wrap"; spec does **not** mandate clipping, so this is **out-of-scope for MVP correctness**, not a spec violation. Real card values are short (the default template values all render perfectly). Actual: no crash, renders without error — but ungraceful for absurd input.
- **Recommendation (backlog, not a Gate-2.5 blocker):** add a per-field clip rect and/or auto-shrink-to-fit for the title and single-line values, mirroring the abilities clip. Surfaced to Orchestrator as a backlog candidate.
- **Verified:** N/A (logged, deferred — does not block sign-off).

### Edge cases exercised (results)
- **Empty fields** (`level`, `species`, `abilities` blank): render gracefully, no crash, empty slots. PASS.
- **Empty abilities:** empty box (correct — matches default/no-PSD-layer baseline). PASS.
- **Very long abilities:** wraps + clips inside box, no overflow. PASS.
- **Very long title / faction:** renders without error but overflows card bounds — see Issue #1. Non-blocking.

---

## TDD / process notes
- Tests exist for every core module and are green; TDD structure (Red→Green) evident in commit history (STORY-ordered commits with "TDD green" messages).
- No test weakening observed; fidelity threshold (3%) is documented and justified in-file.

## Pattern / skill candidates surfaced to Orchestrator
- **Testing technique (reusable):** driving the shipping render path headlessly via `@napi-rs/canvas` + real OTFs to emit inspectable PNGs is an effective visual-verification method for canvas apps on headless CI — candidate QA skill.
- **Recurring gap class:** "clip/fit applied to one text region but not the others" — candidate coder checklist item (apply the same overflow discipline to ALL text fields, not just the wrapping one).

## Sign-off
**PASS.** All 46 tests green, build clean, dev server boots, rendered output is faithful (fonts, small-caps, positioning, wrap/clip, transparency, live edit, export all correct). The single finding (#1) is a Low-severity graceful-degradation gap on pathological input, out of MVP scope — logged to backlog, **not** a blocker. **Signed off for Gate 2.5 (user push approval).**
