# Spot-Check — Post-Review Fixes (FIX-1/2/3)

**Date:** 2026-08-23
**Reviewer:** Senior Coder (focused spot-check, not a full re-review)
**Branch:** `npawlakel-psd-card-editor` (local only — commit `f7b613d`, NOT pushed)
**Scope:** Only the 3 user-approved post-review fixes.

---

## Verdict: ✅ SIGN-OFF — fixes are sound, cleared for Reviewer

### Actuals (run by me)
- `npx vitest run` → **59 passed / 59 (16 files)**. Up from 46; +13 net new.
- `npm run build` (`tsc --noEmit && vite build`) → **clean**, built in ~1.7s.
- `npx eslint .` → **clean** (exit 0, zero findings).
- Fidelity baseline → **mismatch ratio = 0.914%** (threshold 3%) — unchanged. The
  ×1.15 allowance did NOT regress original-value fidelity.

### What I verified
1. **Pure, measurer-injected path** — `render/fitText.ts` (`computeFit`,
   `layoutSingleLine`) and the new `layoutTitle` shrink branch are canvas-free; all
   width queries go through an injected `measure`. Unit-tested with a deterministic
   stub. ✓
2. **Small-caps ratio preserved under shrink** — `layoutTitle` applies ONE `scale`
   to every run size (`seg.size * scale`), so the initial-cap/body ratio is
   invariant. Test asserts `big/small ≈ 45.83/37.5` after shrink. ✓
3. **Authored title guarded** — `runsCoverText` forces `effectiveAvail = Infinity`,
   so the baked PSD title never shrinks. Test: tiny available width leaves authored
   sizes intact. Fidelity render confirms it. ✓
4. **Fit strategy** — condense tracking up to `MAX_TRACK_RATIO` (8%/gap) first, then
   scale font, floored at `MIN_SCALE` (0.6). Tests assert `fittedWidth <= available`
   and floor clamping. ✓
5. **FIX-2 wiring** — `app/livePreview.ts` (`createLivePreview`) cleanly extracts the
   edit loop; `main.ts` delegates. Integration test proves edit → debounce → exactly
   one text-only re-render (fake timers, injected renderer). ✓
6. **FIX-3** — `preview.test.ts` smoke-tests `buildLayout` (shell + 690×1020 canvas +
   2D context). ✓
7. **Scope** — changes limited to the 3 approved fixes + docs. No scope creep. ✓
8. **Comments** — present and substantive throughout new/changed code. ✓

### Issues
- None blocking. Minor (informational): `drawText.ts:setLetterSpacing` relies on
  `ctx.letterSpacing` being reset to 0 before measuring — correctly handled (reset
  before measure, reset after draw), so no double-count. No action required.
