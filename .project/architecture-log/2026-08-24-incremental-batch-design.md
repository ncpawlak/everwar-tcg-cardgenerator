# Architecture Log — Incremental Batch CLI Design

**Date:** 2026-08-24  
**Author:** Senior Coder  
**Gate:** Feasibility / design only  
**Status:** PROPOSAL — no production code changed.

---

## 1. Verdict

**Feasible. Recommend adding an opt-in `--incremental` mode that uses the existing
`<out>/manifest.json` as the prior state.**

The shipped batch flow already maps every Hero row into a deterministic manifest payload and then
renders from the same value payload:

```text
xlsx Hero row
  -> mapRow(row)
  -> card.values used by renderCard(...)
  -> card.manifest written to manifest.json
```

For spreadsheet edits, the manifest contains the complete row-derived fingerprint of the rendered
card:

- `name`
- `level`, `hp`, `dmg`, `acc`, `armor`, `armorBars`
- `unitType`, `faction`
- `commander`, `unique`
- `abilities: [{ name, body }]`

`species` is omitted, but it is currently hard-coded to `"HUMAN"` in `mapRow`, so it is not a
spreadsheet-varying input. If species becomes editable later, it must be added to the manifest and
the incremental fingerprint in the same story.

Important scope boundary: the current manifest is sufficient to detect **meaningful spreadsheet-row
changes**. It does not detect render-affecting changes outside the sheet, such as PSD/template
updates, font changes, renderer code changes, or layout config changes. Those should continue to use
a normal full run unless a future manifest schema adds renderer/template metadata.

---

## 2. Baseline source

### Recommended baseline

Use the existing `manifest.json` in `--out` as the prior state.

Benefits:

- No second state file to keep in sync with emitted assets.
- Human-readable and already part of the batch output.
- Easy recovery: deleting `manifest.json` or running without `--incremental` produces a full rebuild.
- Works with the current shipped output shape.

Trade-offs:

- If a user hand-edits or corrupts the manifest, incremental diffing cannot be trusted.
- The manifest currently has no schema/version or render-template fingerprint.
- An output directory reused for another sheet can look like a valid baseline if names overlap.
- Partial runs can leave manifest entries whose PNG files are missing.

### Separate state/lock file alternative

A separate `.batch-state.json` or lock file could store schema version, source workbook identity,
template hash, renderer version, and row identities without overloading the public manifest.
However, it creates two sources of truth: PNGs + public manifest may say one thing while private
state says another. For STORY-18, that extra complexity is not justified.

Recommendation: use `manifest.json` now; consider adding optional top-level metadata only if future
incremental mode needs to invalidate on PSD/font/renderer changes.

---

## 3. Determinism and manifest completeness

`mapRow.ts` is deterministic:

- Hero detection trims and lowercases `Type`.
- `Name` is trimmed.
- numeric stats are coerced through `Number(...).trim()` and `Math.round`.
- `SubType` and `Allegiance` are trimmed and uppercased.
- `Unique` and `Commander` are coerced from `0`/`1` to booleans.
- abilities split on the first `:`; surrounding whitespace is trimmed.
- blank ability slots are omitted from the manifest.

The renderer consumes the corresponding `values` keys:

- text fields: `name`, `level`, `hp`, `armor`, `dmg`, `acc`, `unitType`, `faction`, `species`
- dynamic graphics: `armorBars`, `commander`, `unique`
- abilities: `ability1/2/3-name`, `ability1/2/3-body`

Therefore, for spreadsheet-driven inputs, two rows that map identically should produce identical
manifest entries except for `file`.

One nuance: omitted blank ability slots mean moving the same non-empty ability from Ability 2 to
Ability 1 produces the same manifest. That also renders the same today because blank slots are
skipped before layout, so this is acceptable.

---

## 4. Row identity key

Use `Name.trim()` as the row identity key.

Behavior:

- Same trimmed name + same fingerprint => `UNCHANGED`.
- Same trimmed name + changed fields => `CHANGED`.
- Name appears in new sheet but not prior manifest => `NEW`.
- Name appears in prior manifest but not new sheet => `REMOVED`.
- Rename => old name is `REMOVED`, new name is `NEW`.

Do **not** use the sanitized filename as identity. Multiple names can sanitize to the same slug
(`"A B"`, `"A-B"`, `"A/B"`), and the current filename suffixer is intentionally output-file logic,
not data identity.

Required guardrails:

- Fail loud on duplicate trimmed `Name` values in the current Hero rows.
- Fail loud on duplicate `name` values in the prior manifest.
- Keep filename collision handling separate and deterministic.

Case sensitivity: prefer exact trimmed names for v1. A case-only rename is therefore remove+add. If
that proves too strict, introduce a dedicated stable card id column later rather than guessing.

---

## 5. Change detection model

Build a candidate manifest entry for every valid Hero row, assign/retain a `file`, then deep-compare
the candidate against the prior entry with `file` ignored.

Statuses:

| Status | Meaning | Render? |
|---|---|---|
| `UNCHANGED` | Same identity and same manifest payload ignoring `file`; prior PNG exists. | No |
| `CHANGED` | Same identity but at least one fingerprint field changed, or prior PNG is missing. | Yes |
| `NEW` | Identity not present in prior manifest. | Yes |
| `REMOVED` | Prior identity not present in current sheet. | No render; handle deletion/pruning |

Ignoring `file` is important: a card's output filename is not a visual input. For unchanged cards,
retain the prior `file` value to avoid needless file churn.

Spreadsheet noise is correctly ignored when it normalizes to the same mapped manifest. Examples:

- `240.0`, `"240"`, and `240` all become `240`.
- `" coalition "` and `"COALITION"` both become `COALITION`.
- `"1"` and `1` both become `true` for boolean flags.
- incidental whitespace around ability name/body is trimmed before comparison.

Recommended comparison implementation:

- Use an explicit canonical object shape, not raw `JSON.stringify` of arbitrary objects.
- Compare arrays in order.
- Compare only the known fields listed above.

---

## 6. Deletions

Default: **prune removed cards from the manifest and delete their previously-manifested PNG files**.

Rationale:

- The output directory should represent the current sheet.
- Keeping removed entries in `manifest.json` makes future incremental runs ambiguous.
- Deleting only files named by the prior manifest is bounded and avoids deleting unrelated files in
  a mixed directory.

Recommended optional flag:

- `--keep-orphans`: drop removed cards from the new manifest but leave their old PNG files on disk.

Do not keep removed cards in the manifest by default. If a user wants archival output, they should
copy the directory or use `--keep-orphans`.

---

## 7. Fail-loud validation

Incremental mode should still validate **all** current Hero rows before writing anything.

Reasoning:

- Preserves the existing contract: validate-all, then write-nothing if any row is invalid.
- Prevents an unchanged-but-now-invalid row from being silently retained forever.
- The abilities-overflow check depends on real model geometry and font measurement; if a current
  row overflows, the batch should fail even if the prior PNG exists.

Only after all rows pass mapping and overflow validation should the CLI diff, delete, render, and
write the new manifest.

This also means `--dry-run --incremental` should validate all current Hero rows before printing the
diff summary. It writes nothing regardless of success.

---

## 8. CLI surface and output

Recommended flags:

- `--incremental`: opt in; default off so existing full-render behavior is unchanged.
- `--dry-run`: print planned statuses and write nothing. Most useful with `--incremental`, but safe
  to support for full mode as "all rows would render".
- `--keep-orphans`: in incremental mode, do not delete PNGs for removed manifest entries.

Recommended summary format:

```text
Read 50 Hero row(s) from "full Set Table v2 - stat adjust".
Incremental diff against "<out>\manifest.json":
  UNCHANGED 47
  CHANGED    2
  NEW        1
  REMOVED    0
  RENDER     3

Cards:
  = Goliath -> goliath.png
  ~ Echo 2: Kodiak -> echo-2-kodiak.png
  + New Hero -> new-hero.png
  - Retired Hero -> retired-hero.png (delete)

Wrote 3 rendered/updated PNG(s), skipped 47 unchanged, removed 0, updated manifest.json.
```

Dry run should end with:

```text
Dry run: no files written.
```

If there is no prior manifest:

```text
No prior manifest at "<out>\manifest.json"; incremental run will render all 50 card(s).
```

---

## 9. Manifest update semantics

Recommended merge:

1. Parse prior manifest into a `Map<Name, ManifestEntry>`.
2. Validate duplicate names and entry shape before using it.
3. Map and validate all current Hero rows.
4. Compute diff statuses.
5. For `UNCHANGED`, keep the prior entry verbatim, including `file`.
6. For `CHANGED`, keep the prior `file` when possible and replace all fingerprint fields.
7. For `NEW`, allocate a filename using existing retained filenames plus deterministic suffixing.
8. For `REMOVED`, omit from the new manifest; delete its prior PNG unless `--keep-orphans`.
9. Write `manifest.json` only after all required PNG writes/deletes succeed.

Stable ordering:

- Sort the final manifest by `name` using a simple deterministic comparator.
- Allocate filenames for new entries in that same sorted order.
- Preserve prior filenames for unchanged/changed entries to prevent churn.

This makes sheet row reordering produce no manifest diff, and keeps generated diffs reviewable.

Atomicity note: write the new manifest last. If a render fails midway, the prior manifest remains
the baseline for the next run. A subsequent incremental run should also treat any missing prior PNG
as `CHANGED`/repair-needed.

---

## 10. STORY-18 implementation breakdown

### STORY-18a — Pure incremental diff module

Add a pure module, for example `src/batch/incremental.ts`.

Responsibilities:

- Define `ManifestEntry = CardManifest & { file: string }`.
- Parse/validate prior manifest shape.
- Index prior entries by trimmed `name`.
- Detect duplicate names.
- Canonicalize comparable fingerprints with `file` omitted.
- Compute statuses: `UNCHANGED`, `CHANGED`, `NEW`, `REMOVED`.
- Assign stable output filenames.
- Produce a planned final manifest and operation list.

Keep this module fs-free and canvas-free so it is easy to unit test.

Required tests:

- unchanged card => status `UNCHANGED`, render skipped, prior file retained.
- changed field => status `CHANGED`, render required, prior file retained.
- new row => status `NEW`, render required, new collision-safe file assigned.
- removed row => status `REMOVED`, final manifest omits it.
- float/noise normalization => no false change after both rows pass through `mapRow`.
- rename => old `REMOVED`, new `NEW`.
- duplicate current names => fail loud.
- duplicate prior manifest names => fail loud.
- no prior manifest signal => plan is equivalent to full render.
- missing prior PNG signal => mark card render-required even when manifest fingerprint matches.

### STORY-18b — Thin CLI wiring

Update `src/batch/cli.ts` only after the pure module is covered.

Responsibilities:

- Parse `--incremental`, `--dry-run`, and `--keep-orphans`.
- Continue reading/mapping/filtering rows as today.
- Continue validating all rows and overflow before any writes.
- In full mode, preserve current behavior.
- In incremental mode, load `<out>\manifest.json` if present and call the pure planner.
- Print the exact summary.
- If dry-run, exit before mkdir/render/delete/write.
- Render only `CHANGED` and `NEW` cards.
- Delete removed PNGs unless `--keep-orphans`.
- Write final manifest last.

Required CLI-level tests:

- `--dry-run --incremental` prints the summary and writes no PNG/manifest changes.
- no prior manifest with `--incremental` behaves like a full run and renders all cards.
- corrupt/old manifest causes a clear non-zero failure with no writes.
- validation failure in any Hero row causes no renders, no deletes, no manifest write.

---

## 11. Edge cases

### No existing manifest in `--out`

Treat as first incremental run: render all current Hero rows and write a fresh manifest. Print a
notice so the operator understands why nothing was skipped.

### Corrupt or old manifest schema

Fail loud and write nothing. The user can recover by running without `--incremental`, deleting the
bad manifest, or using a future explicit `--force-full` flag if added.

### Output directory contains cards from a different sheet

The manifest is the baseline. Incremental mode should only reason about files referenced by that
manifest. It must not scan and delete unrelated PNGs. If names overlap across sheets, false
UNCHANGED results are possible because the current manifest lacks source-sheet metadata; use a fresh
output directory or full run when changing source sheets.

### Partial prior run

If the prior manifest exists but a referenced PNG is missing, treat that card as render-required
even if the fingerprint is unchanged. Write the manifest last so future partial failures remain
recoverable.

### Filename collisions

Sanitized filename collisions are allowed and resolved by suffixing. They must not affect row
identity or change detection. New filenames should be allocated after reserving all filenames kept
from prior unchanged/changed entries.

### Template/font/renderer changes

The current manifest cannot detect these. Incremental mode should be documented as
spreadsheet-incremental only. A full render is required when non-sheet rendering inputs change.



---

## Implementation note (Coder, 2026-08-24)

Built as specified EXCEPT §6 deletion behavior, which the product owner overrode to **archive,
not delete**: superseded (CHANGED) and REMOVED PNGs are moved to `<out>/archive/` under a
versioned name `<stem>-<compactUTC>.png` (e.g. `goliath-20260824T180715Z.png`) before any new
write; nothing is ever deleted, and `--keep-orphans` was dropped. `archive/` is excluded from the
existing-PNG scan.

- Pure planner: `src/batch/incremental.ts` — `validatePriorManifest`, `planIncremental`. Fingerprint
  is a fixed-shape canonical object over every field except `file` (deterministic `JSON.stringify`),
  arrays compared in order. Retained cards keep prior `file`; NEW allocated collision-safe in
  sorted-name order after reserving retained names. Fails loud on malformed manifest / duplicate
  prior or current names.
- CLI: `--incremental` + `--dry-run`. Validate ALL rows first in every mode. Order: validate → plan
  → (dry-run exits) → archive → render CHANGED+NEW → write `manifest.json` LAST. Pipeline body
  extracted to exported `run(opts)` (throws on fail-loud) so tests drive it in-process; `main()`
  stays `VITEST`-guarded.
- Tests: `test/batch/incremental.test.ts` (14 pure) + `test/batch/cliIncremental.test.ts` (7
  in-process over xlsx fixtures + temp dirs). Suite 124 → 145 green; fidelity unchanged 0.914%.
  Verified end-to-end on the real 50-card sheet (full run, all-UNCHANGED re-run, dry-run, and a
  doctored CHANGED/NEW/REMOVED archive run).
