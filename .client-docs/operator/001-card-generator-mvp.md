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
| Abilities (up to 3) | Three ability slots, each with a **name** and a **text** box. The name shows in **bold**, followed by its text, wrapping inside the abilities box. Leave a slot blank to skip it. |
| Armor bars (0–8) | How many green segments fill the armor bar on the right edge. Type a number 0–8 (default 8). 0 shows the empty recessed track. |
| Commander / Unique | Checkboxes for the two rarity chips at the top. Both are ticked by default (chips shown); untick one to hide just that chip. |

Everything else (labels like LEVEL/HP, all art and the frame) is locked and part of the
fixed background — it can't be edited in v1.

## Editing

Type in any field. The preview updates **automatically** a fraction of a second after you
stop typing — there's no "apply" button. The title keeps its small-caps look as you edit;
the abilities text re-wraps and stays inside its box (text past the bottom is hidden).

**Abilities.** You can add up to **three** abilities. Each has a *name* field (rendered
bold) and a *text* field. Fill in as many as you need — a blank slot is simply left out,
and the abilities stack from the top of the box. If you enter far more text than fits, the
whole abilities block shrinks slightly to keep everything visible.

**Armor bars.** The vertical armor bar on the right edge is driven by the **Armor bars**
number (0–8). Enter how many green segments you want: `8` fills it (the default look), `1`
is a single solid bar, and `0` leaves an empty recessed track. This is separate from the
printed **Armor** stat number. Out-of-range or decimal input is automatically rounded and
kept within 0–8.

**Commander / Unique chips.** The two chips at the top (COMMANDER and UNIQUE) each have a
checkbox. Both are ticked by default so the card looks like the template. Untick **Commander**
or **Unique** to hide that chip; the other one stays exactly where it is (hiding a chip does
not move the remaining one).

**Long text auto-shrinks.** If you type a name, faction, or stat that's wider than its
slot, it's automatically condensed (tightened, then scaled down) so it stays on the card
instead of spilling over. Very long entries stop shrinking at a readable minimum size.

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

## Generating all cards at once (batch)

You can render every Hero card from the spreadsheet in a single command instead of editing them
one by one in the app.

1. Open a terminal in the project folder.
2. Run:

   ```
   npm run batch -- --input "path\to\cards.xlsx" --sheet "full Set Table v2 - stat adjust" --out "path\to\output"
   ```

   `--sheet` is optional (it defaults to the Hero table). `--input` (the spreadsheet) and
   `--out` (a folder for the results) are required.

3. The tool checks every Hero row FIRST. If any row has a problem (a missing/typo stat, a
   Unique/Commander value that isn't 0 or 1, an ability that is missing its `Name: body` colon,
   or ability text too long to fit the card), it lists **all** the problems and stops **without
   creating any files**. Fix the spreadsheet and re-run.

4. When every row is clean, it writes one PNG per card (named after the card, e.g.
   `goliath.png`) plus a `manifest.json` (a list of what was generated) into your `--out` folder.

Tip: the pictures are full-resolution 690×1020 PNGs with transparent corners, identical to what
the app produces when you export a single card.
