# Architecture Log — Batch Card Generation Feasibility

**Date:** 2026-08-24  
**Author:** Senior Coder  
**Gate:** 1 feasibility / architecture consult  
**Status:** PROPOSAL — assessment only. No production code changed.

---

## 1. Verdict

**FEASIBLE. Recommend a headless Node CLI batch renderer.**

The current architecture already proves the hard part: the production render path can run headlessly in Node with real fonts. The tests parse the real PSD, register the real OTFs through `@napi-rs/canvas`, bake the static background, call `renderCard`, and pixel-diff output against the PSD composite.

Recommended architecture:

```text
spreadsheet rows
  -> normalized row values
  -> CardModel value map
  -> renderCard(ctx, cachedBackground, model, values)
  -> fs.writeFile(outputDir / safeName.png)
  -> manifest/report
```

Compare options:

| Option | Assessment |
|---|---|
| **A. Headless Node CLI + `@napi-rs/canvas` + `fs`** | **Recommended.** Unattended, agent-runnable, no browser, no picker, no per-card clicking. Reuses the proven Node test harness and shared render modules. Can run in CI/local terminal and dump a directory of PNGs deterministically. |
| **B. In-browser batch + File System Access directory picker** | Feasible for a human-operated browser workflow, but wrong for this request. `showDirectoryPicker` still requires interactive permission, browser startup, and user activation constraints. It is not reliable for unattended agent/headless batch output. |

Decision: **build the batch path as a Node CLI, not as browser UI first.** Browser batch can remain a future convenience wrapper if the user later wants manual spreadsheet import.

---

## 2. Code reuse and refactor requirements

### Reuse as-is

- `src/psd/loadPsd.ts`
  - `readPsdBuffer(buffer)` already accepts bytes, no browser `fetch` required.
  - `flattenLayers(psd)` is shared by extraction and baking.
- `src/psd/extractModel.ts`
  - Builds the serializable `CardModel` from the parsed PSD.
- `src/psd/types.ts`
  - `CardModel`, field models, ability shape, and `isAbilities`.
- `src/config/editableLayers.ts`
  - Field ids, editable layer allow-list, ability slots, and ability geometry.
- `src/render/bakeBackground.ts`
  - Already injects `createCanvas`; Node can pass `@napi-rs/canvas.createCanvas`.
  - Its default `document.createElement` path is browser-only, but not evaluated if the CLI passes the factory.
- `src/render/renderCard.ts`
  - Environment-agnostic orchestrator: draw background, then fields.
- `src/render/drawText.ts`
  - Uses loose `Ctx2D`, `ctx.measureText`, `fillText`, and guarded `letterSpacing`; intended for DOM or napi canvas.
- `src/render/drawAbilities.ts`
  - Reuses `layoutAbilities` and `ctxMeasure`; Node-safe with napi context.
- Pure layout core:
  - `src/render/layoutTitle.ts`
  - `src/render/fitText.ts`
  - `src/render/abilitiesLayout.ts`
  - `src/render/wrapText.ts` if needed by future text paths.
- `src/app/seedValues.ts`
  - Useful base map from the extracted model before row overrides.

### Do not reuse in the CLI

- `src/main.ts`
  - Browser composition root; imports Vite asset URLs and `document`.
- `src/fonts/loadFonts.ts`
  - Browser `FontFace`/`document.fonts` loader. Import is mostly safe, but the CLI should use a Node-specific font registration helper.
- `src/export/exportPng.ts`
  - Browser export path: `canvas.toBlob`, `showSaveFilePicker`, `<a download>`. Not suitable for unattended batch output.
- `src/ui/*`, `src/app/livePreview.ts`
  - DOM/UI and debounced edit loop only.

### Required environment-specific glue

Add a Node-only CLI layer, likely outside the browser composition path, that:

1. Imports `initializeCanvas` from `ag-psd`.
2. Imports `createCanvas` and `GlobalFonts` from `@napi-rs/canvas`.
3. Calls `initializeCanvas((w, h) => createCanvas(w, h) as HTMLCanvasElement)` before `readPsdBuffer`.
4. Registers:
   - `assets/fonts/Square721BT-BoldCondensed.otf` as `Square721BT-BoldCondensed`
   - `assets/fonts/Square721BT-RomanCondensed.otf` as `Square721BT-RomanCondensed`
5. Reads `assets/Card_1.psd` from disk.
6. Extracts model once and bakes background once.
7. Creates one output canvas per row or clears/reuses a single canvas safely.
8. Encodes with napi canvas PNG APIs, not browser `toBlob`.

Dependency note: `@napi-rs/canvas` is currently `devDependency` because it is test-only. If batch generation becomes a shipped CLI, move it to `dependencies` or explicitly document the CLI as a dev/operator script requiring dev deps. Keep it out of the Vite browser bundle by isolating imports in Node-only files.

---

## 3. Spreadsheet ingest

Recommended v1 ingest: **CSV first, XLSX optional.**

- CSV is easiest for agents and CI: plain text, diffable, no Excel binary ambiguity.
- Do **not** hand-roll CSV beyond trivial prototypes; quoted commas/newlines will appear in ability text. Use a small CSV parser (`csv-parse` style) or a tested equivalent.
- If the user requires native `.xlsx`, add `xlsx` or `exceljs`. `xlsx` is simpler for read-only sheets; `exceljs` is heavier but more structured.

Suggested columns:

```text
name, level, hp, armor, dmg, acc, unit_type, faction, species,
ability1_name, ability1_text,
ability2_name, ability2_text,
ability3_name, ability3_text
```

Map to internal values:

| Spreadsheet column | Internal value key |
|---|---|
| `name` / `title` | `name` |
| `level` | `level` |
| `hp` | `hp` |
| `armor` | `armor` |
| `dmg` | `dmg` |
| `acc` | `acc` |
| `unit_type` / `unitType` | `unitType` |
| `faction` | `faction` |
| `species` / `tag` | `species` |
| `ability1_name` | `ability1-name` |
| `ability1_text` / `ability1_body` | `ability1-body` |
| `ability2_name` | `ability2-name` |
| `ability2_text` / `ability2_body` | `ability2-body` |
| `ability3_name` | `ability3-name` |
| `ability3_text` / `ability3_body` | `ability3-body` |

Row handling:

- Start with `seedValues(model)`, then overlay row values.
- Trim headers and normalize case/underscores/hyphens.
- Treat blank optional cells as blank overrides only if the column exists; missing columns leave seeded defaults unless the spec says otherwise.
- Validate before rendering:
  - required `name`
  - unknown columns warned or failed depending strict mode
  - more than 3 abilities rejected
  - output filename collision handled deterministically
  - optional numeric-ish fields (`level`, `hp`, `armor`, `dmg`, `acc`) validated as non-empty strings or simple integer strings if the user wants strict stats

Default error mode for unattended agent runs: **fail loud by default** (`--strict`) so bad input does not silently produce a partial card set. Offer `--skip-invalid` to continue and write a report.

---

## 4. Output contract

Output: one native **690×1020 PNG per valid row** in a chosen directory.

CLI shape:

```text
npm run batch -- --input cards.csv --out dist/cards
```

Filename strategy:

1. Prefer explicit `filename` column if provided.
2. Else derive from card `name`.
3. Sanitize for Windows/macOS/Linux:
   - lowercase or preserve case by option
   - replace `<>:"/\|?*` and control chars
   - collapse whitespace to `-`
   - trim trailing spaces/dots
4. Collision handling:
   - `iron-commander.png`
   - `iron-commander-2.png`
   - `iron-commander-3.png`

Also write a run manifest/report, e.g. `manifest.json` and/or `summary.csv`:

- source input path
- timestamp
- PSD/template path
- total rows
- rendered count
- skipped/failed count
- row number → output filename
- validation errors/warnings
- render/layout warnings if exposed later, e.g. clipped abilities

---

## 5. Risks / unknowns

- **Per-card art/portrait:** current v1 is text-only. If each row needs custom art, that is a larger feature: image ingest, placement/crop rules, masking, and likely additional model/config.
- **Spreadsheet format:** CSV is the right first target, but the user may expect `.xlsx`.
- **Column contract:** needs user-approved names and required fields.
- **Validation behavior:** fail entire run vs skip bad rows with report.
- **Font licensing/distribution:** CLI must access the bundled OTFs and fail loudly if missing.
- **Packaging:** decide whether this is an npm script for repo operators or a user-facing packaged executable.
- **Performance:** likely fine. Bake PSD once, render rows many times. If thousands of rows, reuse model/background and consider limiting concurrent PNG encodes to avoid memory spikes.
- **Layout overflow observability:** existing render clips/shrinks, but batch should report when abilities clipped or fields hit minimum scale if those signals are exposed.
- **Template rigidity:** still one frozen `assets/Card_1.psd`; multi-template batch is separate scope.

---

## 6. Rough story breakdown

1. **Batch CLI foundation**
   - Node entrypoint, argument parsing, input/output path validation, no browser dependencies.
   - Acceptance: CLI can load PSD/fonts headlessly and render one seeded card PNG.

2. **Node render adapter**
   - Extract reusable helper mirroring `test/helpers/napiCanvas.ts` for production CLI use.
   - Acceptance: uses `readPsdBuffer`, `extractModel`, `bakeBackground`, `renderCard`; no duplicated layout logic.

3. **Spreadsheet parser + row mapper**
   - CSV parser, header normalization, row → value map overlay.
   - Acceptance: maps all editable fields and three ability slots.

4. **Validation and error policy**
   - Strict mode default, optional skip-with-report.
   - Acceptance: bad rows produce actionable row-numbered errors.

5. **PNG output + manifest**
   - Directory creation, safe filenames, collisions, manifest/summary.
   - Acceptance: multi-row input emits deterministic PNGs and report.

6. **Tests**
   - Unit: header normalization, row mapping, validation, filename collisions.
   - Integration: tiny CSV renders two PNGs through napi canvas using real PSD/fonts.
   - Regression: existing fidelity/render tests still green.

7. **Docs**
   - Operator doc for CSV schema and CLI examples.
   - Technical doc noting Node adapter and dependency boundary.

---

## 7. Open questions to grill the user on

1. Input format: CSV only for v1, or must `.xlsx` be supported immediately?
2. Exact spreadsheet columns and required fields?
3. Should blank cells mean "leave template default" or "render blank"?
4. Is there a per-card art/portrait column, or is batch text-only?
5. Filename convention: explicit column, card name, card id, set number, or combination?
6. Validation policy: stop the whole run on first error, collect all errors and fail, or skip bad rows?
7. Should overflow/clipping be considered a hard failure or just a warning in the manifest?
8. Expected batch size: dozens, hundreds, thousands?
9. Should the output directory be cleared before run, or should existing files be preserved with collision suffixes?
10. Is this for repo/operator use via npm script, or does the user need a packaged executable?

