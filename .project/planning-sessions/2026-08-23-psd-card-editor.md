# Planning Session — PSD Card Editor (EverWar TCG Card Generator)

Date: 2026-08-23
Participants: User, Orchestrator, Planner, Senior Coder

## Request
Build an app to edit specific text/label layers of a trading-card PSD, display the
card live, auto-update on edit, and export a PNG to a directory. User prioritized
an approach that is **easy to iterate on**. User asked to consult Senior Coder on
feasibility, then be grilled.

## Key Q&A / decisions
- **Fidelity:** User initially said "pixel-perfect." Clarified: non-editable layers
  are baked from the PSD (already pixel-perfect); only re-rendered edited text is at
  risk. Bar landed at "looks crisp and correct" — met via bundling the real fonts.
- **Feasibility spike:** Senior ran a throwaway spike on the real `Card_1.psd`.
  Proved load → read text layers → hide layer → recomposite → re-render text → export.
  Found the #1 risk = missing fonts (`Square721BT-BoldCondensed`, `-RomanCondensed`).
- **Fonts:** User supplied both OTFs. Re-render with real fonts = near pixel-parity.
  Title small-caps decoded as faux per-run sizing (45.83 / 37.5 px via `styleRuns`).
- **Editable fields (9 existing layers):** Name/title, Level (4), HP (40), Armor (25),
  DMG (30), ACC (75), INFANTRY, IRONWARD LEGION, HUMAN. Plus a NEW wrapping ABILITIES
  body block (no layer in PSD; box (37,808)-(664,968)).
- **Locked:** LEVEL/HP/ARMOR/DMG/ACC/ABILITIES labels; COMMANDER/UNIQUE chips; all art.
- **Delivery:** Local web app in the browser (Vite + TS + ag-psd + Canvas + FontFace +
  File System Access API).
- **Art panel:** deferred to v2 (backlog). Text-only for v1.
- **Export:** File System Access "Save As" — user picks folder + filename each export;
  PNG at native 690×1020.

## Outcome
Gate 1 spec written (vision.md, spec.md, planner-tasks.md, backlog notes).
No open questions blocking. Awaiting user spec approval to proceed to Gate 1.5.
