# Changelog

## Versioning Scheme

**Format:** `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

| Position | When to increment | Example |
|----------|-------------------|---------|
| **PATCH** (0.0.X) | Minor revision, bug fix, hot-patch, small change | `0.0.1` → `0.0.2` |
| **MINOR** (0.X.0) | Major feature addition, significant new functionality | `0.1.0` → `0.2.0` |
| **MAJOR** (X.0.0) | Full version release — a component of all accumulated changes, milestone delivery | `0.2.3` → `1.0.0` |

## Ownership

- The **Learner** updates this file after every cycle (Gate 3)
- The **Orchestrator** approves version number increments
- Version bumps are committed alongside learnings and docs

---

## [Unreleased]

---

## [0.2.0] — 2026-08-24

Card Generator feature release: dynamic frame elements, automatic title casing, and
spreadsheet-driven batch generation with incremental re-rendering. Reviewer PASS,
145/145 tests green, fidelity 0.914%.

### Added
- **Batch generation from spreadsheet (STORY-17)** — a Node CLI (`npm run batch -- --input <xlsx> --sheet "<name>" --out <dir>`) that reads the Hero rows, maps each to card values, and renders every card through the shared production pipeline (bake once + `renderCard` per row), writing one PNG per card plus a `manifest.json`. Pure, unit-tested `src/batch/` modules: `mapRow` (row→values+manifest with multi-error collection), `filename` (slug + collision suffix), `overflow` (abilities-overflow detector), `nodeCanvas` (napi/font/PSD bootstrap), thin `cli` glue. Fail-loud: a full validation pass (field errors + abilities overflow attributed to the offending Ability slot) runs first; any error prints all problems and exits non-zero writing nothing. Added `xlsx` dep; promoted `@napi-rs/canvas` to `dependencies`.
- **Incremental batch mode (STORY-18)** — opt-in `--incremental` diffs the sheet against the prior `<out>/manifest.json` and re-renders only CHANGED + NEW cards; `--dry-run` prints the plan and writes nothing. Pure fs-free planner `src/batch/incremental.ts` keys identity on `name.trim()` and compares a fixed-shape canonical fingerprint over all fields except `file` (sheet noise like `240.0`→`240`, case/whitespace, `"1"`→`true` normalizes to no-change). Retained cards keep their filename; NEW files are allocated collision-safe only after reserving retained names; the manifest is written last for crash-safety.
- **Archive-not-delete** — superseded (CHANGED) and removed (REMOVED) cards' prior PNGs are moved to a versioned `<out>/archive/<stem>-<compactUTC>.png` instead of being deleted; the `archive/` subfolder is excluded from the existing-PNG scan.
- **Dynamic COMMANDER/UNIQUE chips (STORY-16)** — per-card checkboxes hide the baked chip pills via donor-strip reconstruction (`src/config/chips.ts`, `src/render/patchChip.ts`); default shown so fidelity stays honest.

### Changed
- **Automatic small-caps title casing (STORY-16b/16c)** — edited titles now render true all-caps with an enlarged first glyph per word (matching the template), while authored titles are left untouched. Dispatch is by exact match against the authored text (`authoredText?` param) instead of string length, fixing a collision where 8 of 50 Hero names were exactly 18 chars and would have mis-routed to mixed-case.

### Fixed
- **Batch xlsx read under vite-node (STORY-17a)** — the SheetJS ESM build doesn't auto-bind Node `fs`, so `XLSX.readFile` threw; now reads bytes with `readFileSync` and parses the buffer with `XLSX.read`.
- **Batch baked a transparent frame (STORY-17b)** — the CLI read the PSD with `readPsd(..., {useImageData:true})`, populating layer `.imageData` instead of `.canvas`, so `bakeBackground` composited nothing and every card rendered as a blank frame. Now loads via the app's `readPsdBuffer`. Strengthened the smoke test to assert opaque frame pixels + a transparent interior cutout (the old "buffer non-empty" check couldn't catch this).

---

## [0.1.1] — 2026-08-24

First versioned card-generator baseline (MVP + structured abilities), previously logged under Unreleased.

### Added
- **EverWar TCG Card Generator MVP** — Vite + TypeScript local browser app using `ag-psd` for PSD reads, a cached baked background, canvas-rendered editable text, live preview, and PNG export. Includes 9 layer-backed editable text fields plus authored abilities, strict allow-list extraction, FontFace loading for Square721BT, File System Access export with fallback, and headless fidelity coverage.
- **Structured abilities (Variant D)** — Replaced the single free-text abilities field with up to 3 `{name, body}` ability rows. Ability names render inline in Square721BT-BoldCondensed, bodies render in Square721BT-RomanCondensed, mixed-weight lines wrap inside the box, blank/partial slots are skipped gracefully, and a dormant shrink-to-fit fallback preserves overflow safety.
- **Fleet mode (auto-scaled parallel execution)** — the Orchestrator now automatically decides whether to run a fleet of parallel Coder ↔ Reviewer loops based on the work: engaged for large *and* shardable tasks (codebase deep-dive, large Finalize, broad refactor/migration, test backfill, multi-repo propagation), single-track for small or tightly-coupled work. Uses exclusive per-loop file ownership (conflict prevention by partition), proportional concurrency, and draft-PR-only rails (never merges). New `.agent/skills/fleet.md`, "Fleet Mode" section in `agents.md`, Constraint #25, Orchestrator routing row + "Automatic Fleet Scaling" section, README "Automatic Behaviors", and a fleet-economics note in `model-config.md`.
- `.project/STATE.md` — a live "where are we" snapshot (current gate, in-flight story, branch, last milestone) the Orchestrator maintains and `boot` reads first, so context recovery is instant instead of reconstructed from git log.
- `.agent/tools/harness-check.mjs` — a zero-dependency, cross-platform integrity checker (mode↔routing parity, skill frontmatter, referenced-path existence, contiguous constraint numbering). Wired into Boot and Nightwatch.
- README "Adopt this harness" quickstart — explicit *copy in → run `boot` first → vision → work the flow* onboarding.
- Categorized index over the Constraints list (by theme) without renumbering, so references stay stable as the list grows.

### Changed
- **Abilities box layout** — Removed the baked ABILITIES badge from the static background with an opaque black patch over its interior-only rect `{left:33,top:771,right:254,bottom:816}` and reclaimed the freed vertical space by raising authored ability text from y=824 to y=780 (usable height 144px → 191px).
- Finalize now treats **security** as a first-class audit dimension (injection, authz, secrets, unsafe deserialization, SSRF/path-traversal, supply-chain, sensitive-data exposure) in both `agents.md` and the Senior Coder role — was a single thin bullet.
- Skill auto-load scan now explicitly **excludes `README.md`** (it documents the format; it is not a loadable skill) in Constraint #4 and the skills README.
- Fixed the stale README structure diagram (removed a dead `.agent/vision/` path; added `.project/vision.md`, `STATE.md`, `backlog/`, and `.agent/tools/`).

### Fixed
- **Text fit resilience** — Added single-line shrink-to-fit and preview composition coverage, then corrected title fitting to use the title-bar inner-right edge (`x=512`) instead of tight title ink bounds so titles only shrink when they reach the actual slot edge.
- **Gate 3 validation snapshot** — Reviewer PASS, 76 tests green, and fidelity remains **0.914%** versus the PSD composite.

---

## [0.1.0] — 2026-08-17

First versioned baseline of the Agent Harness. Backfilled from 40 prior commits
(2026-07-06 → 2026-08-17) that were never logged — see
`.project/learnings/2026-08-17-changelog-gate-skipped.md`.

### Added — Agents & core workflow
- Six-agent gated workflow: Orchestrator, Planner, Senior Coder, Coder, Reviewer, Learner.
- Six flow gates (1 → 1.5 → 2 → 2.5 → 2.75 → 3) with the user as the merge gate (Gates 2.5 & 2.75).
- Per-agent model recommendations tuned for Opus 4.8 (`.agent/model-config.md`).
- Orchestrator personality (chill surf-bro) and the Agent Visibility Protocol (announce every handoff).

### Added — User-invoked modes
- **Boot** — run-first ingestion ritual: deep-read the harness + project, repo-type detection, harness integrity check, self-verifying Boot Report, commit to the workflow.
- **Finalize** — multi-Senior-Coder read-only codebase audit → one prioritized report.
- **Nightwatch** — scheduled trunk guardian: full suite + mutation on unchanged trunk, drafts fixes (never merges, never weakens a test), morning digest.
- **Retro** — process retrospective that mines logs + corrections and curates skills.
- **Grill Me** — Planner deep requirement interrogation.
- **Regroup** — Planner + Senior Coder joint review.
- **Hot-path** — lightweight route for small fixes.

### Added — Enforcement (Constraints #1–#24)
- Auto-engage Senior Coder on any code-related request — the user never prompts for it (#20).
- Regression guardrail — coupled unit + driver suites run green on every code change; opt-in mutation testing for high-risk modules (#21).
- No Orchestrator drift — delegation does not decay over long sessions (#22).
- Corrections are training data — captured automatically and promoted to skills (#23).
- Gate 3 never skipped — every landed change (incl. Orchestrator-direct harness edits) closes with the Learner: CHANGELOG + learnings (#24).
- Documentation-as-blocking-gate, mandatory review-loop logging, Planner proactive questioning, universal request routing, state tracking, "no shortcuts / workflow is law."

### Added — Skills system
- Skills auto-load by frontmatter (`name`/`description`/`load_when`/`upstream`) description match.
- Universal skills upstream to the `agent-harness` source-of-authority branch.
- Skills: `commit-and-push`, `senior-coder-checklist`, `harness-doc-merge`, `mutation-testing`, `nightwatch`, `boot`, `retro`, `changelog-and-learn`.

### Added — Structure
- `.agent/` (agents.md, roles, skills, model-config), `.project/` (vision, spec, planner-tasks, taskboard + architecture-log / reviewer-log / learnings / backlog / planning-sessions), `.client-docs/` (operator + technical).

### Changed
- Flattened `.project/vision/vision.md` → `.project/vision.md` so the three singular planning docs sit flat while folders stay reserved for multi-entry logs.
- Promotion model: `agent-harness` is the source of authority; `master` mirrors it (harness/workflow-only, identical tree).

### Removed
- Stripped the original lane-config application code to make the repo a generic, reusable harness; scrubbed stale untracked build artifacts from the worktree.