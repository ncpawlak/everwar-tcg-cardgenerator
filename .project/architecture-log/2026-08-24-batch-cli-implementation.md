# 2026-08-24 — STORY-17 Batch CLI implementation note

## What shipped
A headless Node CLI (`src/batch/`) that renders every Hero card from the spreadsheet through
the exact production pipeline the browser app uses — no rendering logic is duplicated.

## Module layout (pure core + thin Node glue)
- `mapRow.ts` — PURE. Row (header-keyed) → `{ values, manifest }` overlay + per-row validation.
  Each field mapper (`coerceStatInt`, `upperTag`, `coerceBool01`, `splitAbilityCell`) throws an
  actionable message; `mapRow` funnels each independently so ONE row surfaces ALL its problems.
- `filename.ts` — PURE. `sanitizeCardName` (lowercase, non-alnum→`-`, trimmed) + `uniqueFilename`
  (collision `-2/-3…`, mutates a used-set for determinism).
- `overflow.ts` — PURE. `detectAbilitiesOverflow` reuses `layoutAbilities` with the real field
  geometry and an injected measurer; returns `{ overflow, scale, clippedAbilityIndex }`.
- `nodeCanvas.ts` — Node-only. `initializeCanvas` + `GlobalFonts` registration + PSD read,
  mirroring the test helper so `src/` never imports from `test/`.
- `cli.ts` — Node glue. Arg parse → read sheet (`xlsx`) → Hero filter → **validate ALL** →
  (on clean) bake ONCE → per row seed+overlay+`renderCard`+`toBuffer` → write PNGs + manifest.

## Key decisions
- **Overflow as attribution signal.** `AbilitiesLayout` gained `clippedAbilityIndex` (0-based into
  NON-EMPTY abilities). The batch treats any clip as a hard error naming the ability — an
  unattended batch must never silently drop ability text. Existing tests use partial assertions,
  so the new optional field is non-breaking; fidelity stays 0.914%.
- **Fail-loud, all-or-nothing.** Validation collects every error across every row and writes
  nothing if any exist. This keeps a 50-card run trustworthy: either the whole set is correct or
  the operator sees the full error list.
- **Runner = `vite-node`.** Resolves extensionless TS imports (`../src/...`) like Vite/vitest;
  no tsx/ts-node needed. Node's native TS strip would break extensionless relative imports.
- **`@napi-rs/canvas` promoted to `dependencies`.** The CLI is a first-class local Node tool, so
  the headless canvas + real OTFs must be installed in prod, not dev-only. It never enters the
  Vite browser bundle (only `cli.ts`/`nodeCanvas.ts` import it, and those are Node entry points).

## Known note
`xlsx@0.18.5` (SheetJS npm) has open advisories (prototype pollution / ReDoS). Acceptable for a
local operator CLI over a trusted, hand-authored sheet; revisit if inputs become untrusted.
