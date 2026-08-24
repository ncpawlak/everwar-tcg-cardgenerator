# Planner Task List

_Last updated: 2026-08-23 — Gate 1 spec drafted from fully-gathered requirements._

## Done

- [x] Vision captured (`.project/vision.md`) — local web app, iteration-speed
      priority, exact-fidelity via bundled fonts, text-only v1.
- [x] Spec written (`.project/spec.md`) — overview, tech stack, editable-field
      table (9 layers + new abilities body), render pipeline, live-preview,
      export, fonts, non-goals, success criteria, assumptions.
- [x] Feasibility confirmed by Senior Coder (green-lit) — see architecture-log
      entries 2026-08-23 (feasibility + spike results, near pixel-parity).
- [x] Rendering architecture locked: bake static layers, re-render editable text
      on Canvas; honor per-run sizing (`styleRuns`) for the title.
- [x] Editable field set finalized (9 named PSD layers + authored ABILITIES body).
- [x] Export UX decided: File System Access "Save As", user picks folder+filename
      every export; native 690×1020 PNG, PSD-matching transparency.
- [x] Backlog notes filed for all deferred items (art placement, hi-res export,
      multi-template/batch, editing locked labels).

## Open

- (none)

## Questions

- (none blocking Gate 1)

## Resolved (previously open, now decided)

The Senior Coder's 10 pre-spec open questions are all answered by the gathered
requirements:

1. Editable layers → explicit allow-list of 9 named layers + 1 authored region. ✅
2. Point vs box text → single-line values; title uses per-run sizing; abilities
   body is box-type wrapping. ✅
3. Fonts → two OTFs supplied and bundled; loaded via FontFace at startup. ✅
4. Text effects → none present on sampled layers; blend modes `normal`. ✅
5. Template stability → one frozen template (`Card_1.psd`) for v1. ✅
6. Fidelity bar → exact/near pixel-parity expected and confirmed. ✅
7. Output → native 690×1020 PNG, PSD-matching transparency, user-chosen
   folder+filename each export. ✅
8. Delivery target → local web app; no desktop packaging. ✅
9. Batch vs single → single-card interactive; batch deferred to backlog. ✅
10. Non-text edits → text-only v1; art placement deferred to backlog. ✅

## Bookmarked (Deferred → backlog)

- Artwork placement into the white art panel (v2).
- Higher-resolution / print-quality export multiplier & DPI control.
- Multiple/other card templates & batch generation from CSV/JSON.
- Editing locked labels/chips.

## Needs Elaboration

- (none)

---

**Gate 1 status:** Deliverables complete; **no open questions block Gate 1.**
Awaiting user approval of the spec and Senior Coder's final feasibility sign-off
to close the gate.
