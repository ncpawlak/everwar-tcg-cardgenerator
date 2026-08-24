# Learning: batch generation + incremental re-render close-out

**Date:** 2026-08-24
**Cycle:** EverWar TCG Card Generator — dynamic frame + batch + incremental / Gate 3 close-out
**Surfaced by:** Learner after Reviewer PASS

## Context

Building on the MVP, this cycle shipped four features on top of the card editor:
dynamic COMMANDER/UNIQUE chips (hide-only), automatic small-caps title casing, a
spreadsheet-driven batch CLI that renders all 50 Hero cards, and an opt-in incremental
mode that re-renders only changed/new rows and archives (never deletes) superseded
output. Final state: Reviewer PASS, 145 tests green, fidelity 0.914%, branch committed
locally.

## Durable lessons

1. **"Non-empty buffer" is a worthless render assertion.** The batch smoke test passed
   while every card was a blank frame — the abilities text alone made the PNG non-empty.
   A render test must sample known-opaque FRAME pixels (specific colors at alpha 255) and
   a known-transparent interior cutout, so an empty background fails hard.
2. **One PSD-load flag silently breaks baking.** `readPsd(..., {useImageData:true})`
   populates each layer's `.imageData` instead of `.canvas`; `bakeBackground` composites
   via `.canvas`/`drawImage`, so the frame bakes transparent with no error. Always load
   through the app's `readPsdBuffer` (keeps `.canvas`). Path parity with the validated app
   path beats re-deriving loader options in a second entry point.
3. **The manifest IS the incremental baseline.** Because `mapRow` is deterministic, the
   emitted `manifest.json` is a complete row fingerprint. Diffing against it needs no
   second state file — deleting the manifest or dropping `--incremental` cleanly forces a
   full rebuild.
4. **Compare a fixed-shape canonical object, never a raw stringify.** Change detection
   builds an explicit canonical `{stats…, abilities:[{name,body}]}` with fixed key order and
   ordered arrays, ignoring `file`. This makes sheet noise (`240.0`→`240`, case/whitespace,
   `"1"`→`true`) normalize to no-change while real edits register.
5. **Identity ≠ filename.** Row identity is `name.trim()`; the sanitized filename is output
   logic (multiple names can collide to one slug). Diffing on the slug would corrupt change
   detection. Keep the two concerns separate.
6. **Reserve retained filenames before allocating new ones.** NEW cards allocate collision-safe
   names only after every UNCHANGED/CHANGED filename is reserved, so a new card can never steal
   a kept card's file and retained cards never churn.
7. **Order writes for crash-safety.** Validate ALL rows first (even in dry-run), then archive
   old PNGs, then render, then write the manifest LAST. A mid-run crash leaves the prior
   manifest intact as the next run's baseline; a missing prior PNG is treated as CHANGED so the
   next run self-heals.
8. **Archive-not-delete was a product call, not a default.** The Senior design defaulted to
   deleting removed cards; the product owner chose a versioned `<out>/archive/` folder instead.
   The `archive/` subfolder must be excluded from the existing-PNG scan so it is never treated
   as card output or re-archived.

## Taskboard / planning notes

- Every feature followed the same split: a pure, fs/canvas-free core module (`mapRow`,
  `filename`, `overflow`, `incremental`) with heavy unit coverage, then a thin Node CLI wrapper.
  This kept the hard logic (mapping, diffing, filename allocation) fully unit-testable and made
  reviewer validation fast.
- Two of the cycle's three bugs (xlsx fs-binding, transparent frame) were in the Node/CLI glue,
  not the pure modules — reinforcing that the glue layer needs its own end-to-end assertion, not
  just green unit tests.
- Live end-to-end demonstration on the real 50-card sheet (full → all-UNCHANGED re-run → dry-run
  → doctored CHANGED/NEW/REMOVED) was the fastest way to build confidence in the diff behavior.

## Skill candidates surfaced to Orchestrator

- **Render regression assertion:** sample opaque frame pixels + a transparent cutout; never
  assert "buffer non-empty" for a canvas render.
- **Deterministic-manifest incremental diffing:** use the emitted manifest as the baseline,
  diff a fixed-shape canonical fingerprint (ignoring output filename), key identity on a stable
  data field, reserve retained filenames before new allocation, write the manifest last.
- **Two-entry-point loader parity:** when a second entry point (CLI) loads the same asset as the
  app, reuse the app's loader rather than re-specifying options — divergent flags cause silent
  data-shape bugs.
