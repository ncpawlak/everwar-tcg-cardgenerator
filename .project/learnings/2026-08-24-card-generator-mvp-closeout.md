# Learning: PSD-backed canvas editor close-out

**Date:** 2026-08-24
**Cycle:** EverWar TCG Card Generator MVP / Gate 3 close-out
**Surfaced by:** Learner after Reviewer PASS

## Context

The cycle shipped the local Vite + TypeScript card editor: `ag-psd` reads
`assets/Card_1.psd`, non-editable layers bake once, editable text re-renders on canvas
with live preview, and export writes a 690×1020 PNG. Post-review work added
single-line shrink-to-fit, corrected title fitting, removed the baked ABILITIES badge,
and replaced free-text abilities with up to 3 structured `{name, body}` rows. Final
state: Reviewer PASS, 76 tests green, fidelity 0.914%, branch committed locally and not
pushed.

## Durable lessons

1. **PSD text is data, not a renderer.** `ag-psd` can expose text metadata and a composite,
   but it does not re-render edited type. Correct architecture: bake locked/non-editable
   layers once, then redraw only editable text in Canvas.
2. **Small-caps fidelity needs run-level style data.** Faux small-caps should preserve or
   synthesize per-run `styleRuns` sizes, advancing each run by measured width instead of
   treating a title as one font size.
3. **Inject the measurer.** Text layout functions should accept
   `measure(text, font) => width`; this keeps wrapping, fitting, and inline mixed-weight
   layout canvas-free and unit-testable.
4. **Headless pixels are a real QA tool.** `@napi-rs/canvas` can drive the production
   render path with real fonts for fidelity screenshots and pixel diffs without bundling
   native canvas into the browser app.
5. **Measure before patching baked art.** Badge/frame removal strategy depends on whether
   the art is interior-only or crosses a border. The ABILITIES badge sat entirely inside
   the black box, so a flat opaque-black fill was simpler and safer than donor/banded
   border reconstruction.
6. **Re-measure layout after removing art.** Removing the badge reclaimed ~47px; raising
   ability text from y=824 to y=780 made three abilities fit at native scale instead of
   relying on shrink.
7. **Mixed-weight inline wrapping belongs in pure layout.** Tokenize bold ability names
   and regular bodies into measured runs first; draw later. This keeps line breaks,
   paragraph gaps, clipping, and fallback shrink deterministic.

## Taskboard / planning notes

- The original 13-story MVP plan landed as scoped, then expanded with tightly-coupled
  post-review fixes and STORY-14. The explicit story checklist made reviewer validation
  straightforward.
- The highest-value adjustment was treating the badge-removal measurement as a prerequisite
  to the structured-abilities layout; it converted a likely fitting problem into a native
  scale layout.
- Future canvas/PSD plans should include an early "measure actual usable bounds after any
  baked-art removal" checkpoint before finalizing text geometry.

## Skill candidates surfaced to Orchestrator

- **PSD canvas editor architecture:** bake non-editable PSD layers once; re-render only
  allow-listed editable text with injected-measurer layout.
- **Headless visual QA:** use real fonts + `@napi-rs/canvas` screenshots + pixel-diff
  thresholds to review canvas apps without a browser GUI.
- **Frame-patch decision rule:** first classify baked art as interior-only vs
  border-straddling; use flat fill for interior-only art and donor reconstruction only
  when frame/border pixels are affected.
