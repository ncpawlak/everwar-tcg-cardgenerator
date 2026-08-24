# Vision

> **This is the whiteboard in the middle of the office.** Every agent checks this document when they have a question about what we're building, why, and how the user wants things done. This is the source of truth for project direction and user preferences.

> This file is created collaboratively between the **Planner** and the **User** at the start of every new project.

## What is this project?

**EverWar TCG Card Generator** (working name) — a **local web app** (runs in the
browser) for authoring EverWar trading cards from a fixed Photoshop template.

The app loads the trading-card PSD (`assets/Card_1.psd`, 690×1020 px), displays
the rendered card faithfully, and lets the user edit a defined set of text fields
(card name, stats, tags, faction, and a wrapping abilities description). The
preview updates **live/automatically** as fields change, and the finished card is
exported as a **PNG** the user saves wherever they choose.

Rendering fidelity is the whole point: the exported card must look like it came
out of Photoshop. This is achieved by **baking every non-editable PSD layer into a
static background composite and re-rendering only the editable text on an HTML5
Canvas** over that background, using the card's own bundled fonts.

## Goals

- Load `Card_1.psd` in-browser and display a faithful rendered card.
- Let the user edit a fixed set of text fields, pre-filled with the PSD's current
  values, through a simple form/panel.
- Update the card preview **live** (debounced) on every edit.
- Author a **new** wrapping "abilities" text region that the PSD does not contain
  as a layer.
- Export a native-resolution (690×1020) PNG that visually matches the preview,
  with the user picking folder + filename on every export.
- Optimize the toolchain and workflow for **fast iteration** (Vite dev loop).

## Non-Goals

- **v1 is text-only.** No uploading or placing artwork into the white art panel
  (deferred to v2).
- No higher-resolution / print-quality export multiplier or DPI control (future).
- No support for multiple/other card templates, and no batch generation of many
  cards from a data file (CSV/JSON) (future).
- No editing of the currently-locked labels/chips (`LEVEL`, `HP`, `ARMOR`, `DMG`,
  `ACC`, the `ABILITIES` header, `COMMANDER`/`UNIQUE` chips) or any art/frame.
- No desktop packaging (Electron/Tauri) — local web app only for v1.

## Success Criteria

- Loads `Card_1.psd` and displays a faithful rendered card using the bundled
  Square721BT fonts.
- All 9 listed text fields **plus** the new ABILITIES body are editable, and edits
  reflect live in the preview.
- The exported PNG visually matches the preview and the card's Photoshop fidelity:
  correct fonts, faux small-caps title preserved, layout intact.
- On export the user chooses folder + filename, and the PNG is written there at
  native 690×1020 with transparency matching the PSD.

## User Preferences & Conventions

- **Delivery target:** Local **web app** running in the browser. No desktop
  wrapper, no server required for v1.
- **Iteration speed is the top priority.** Toolchain chosen for the fastest
  feedback loop (Vite + TypeScript + HMR). Prefer this over packaging/ceremony.
- **Exact fidelity is expected, and is achievable** — proven near pixel-parity in
  the spike once the real fonts were supplied. Fonts are bundled and loaded at
  startup; do not silently substitute fonts.
- **Text-only for v1.** Art placement, higher-res export, batch, and multi-template
  are explicitly deferred, not forgotten (tracked in `.project/backlog/`).
- **The renderer must honor per-run font sizing** (faux small-caps via
  `styleRuns`), not one size per text layer.
- **Export UX:** user picks folder AND filename every time (File System Access
  "Save As"), never a fixed output path.
