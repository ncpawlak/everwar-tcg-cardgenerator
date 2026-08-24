# 001 — Card Generator MVP (Operator Guide)

**What it is:** a local, browser-based editor for the EverWar trading-card template.
It loads `Card_1.psd`, shows a faithful rendered card, lets you edit its text fields with
a live preview, and exports a PNG you save wherever you like.

> Use a **Chromium-based browser (Chrome or Edge)** — the Save dialog needs it.

## Running the app

```
npm install      # first time only
npm run dev      # start the dev server, then open the printed URL (e.g. http://localhost:5173/)
```

For a production build: `npm run build`, then `npm run preview` to serve it.

The app loads the fonts and PSD on startup. The first render is blocked until the card's
own fonts are ready, so text never flashes in the wrong font. If a font or the PSD fails
to load, the screen shows a clear red error instead of a wrong-looking card.

## The screen

- **Left — Card preview:** the card at its true 690×1020 resolution (shown scaled). The
  checkerboard shows where the card is transparent. Below it: the **Export PNG…** button
  and a status line.
- **Right — Card Fields panel:** one control per editable field, pre-filled with the
  card's current values.

## Editable fields

| Field | Notes |
|-------|-------|
| Card Name / Title | Big small-caps title (first letter of each word larger). |
| Level, HP, Armor, DMG, ACC | The stat numbers. |
| Unit Type, Faction, Species / Tag | The lower tag row. |
| Abilities (body) | Multi-line box text — wraps automatically and is clipped to the abilities box. |

Everything else (labels like LEVEL/HP, the COMMANDER/UNIQUE chips, all art and the frame)
is locked and part of the fixed background — it can't be edited in v1.

## Editing

Type in any field. The preview updates **automatically** a fraction of a second after you
stop typing — there's no "apply" button. The title keeps its small-caps look as you edit;
the abilities text re-wraps and stays inside its box (text past the bottom is hidden).

## Exporting

1. Click **Export PNG…**.
2. Your browser's **Save** dialog opens — choose the folder and filename each time.
3. The card is saved as a PNG at 690×1020, matching the preview, with transparency kept
   where the card is transparent. The status line shows **Saved.**

If you cancel the dialog, the status shows **Export cancelled** — nothing is written.

## Troubleshooting

- **Red error on load** — a font file or the PSD couldn't be fetched. Confirm
  `assets/Card_1.psd` and both OTFs under `assets/fonts/` are present, then reload.
- **Export button does nothing / errors** — you're likely not on Chrome/Edge. The Save
  dialog (`showSaveFilePicker`) is Chromium-only; other browsers fall back to a plain
  download if available.
- **Text looks like the wrong font** — the required fonts failed to load; the app fails
  loudly rather than substituting a font, so reload after confirming the OTFs are present.
