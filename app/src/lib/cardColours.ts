/**
 * The colour sheet for balance cards: five colours for every palette, written out here so each
 * can be read against its palette at a glance.
 *
 * **How to read it.** Each palette has a row of five colours, written **lightest to darkest**. A
 * card the owner makes stores only its *slot* (`tone-1` … `tone-5`), never a hex value. When the
 * card is drawn, its slot is looked up in the palette that is on screen *now*, so a card that shows
 * slot 2 on Alpine Willows shows slot 2 of whichever palette is chosen next. The picker in the
 * card sheets reads the same slots.
 *
 * **Which end a slot takes follows the mode.** Slot 1 is always the colour *nearest the canvas*:
 * in a light palette the lightest of the row, and in a dark palette the darkest. So the scale runs
 * away from the background in both modes, and a stack of cards reads the same direction in either —
 * the lightest tone in light mode is the darkest tone in dark mode, which is what `cardToneSlots`
 * below decides. A row is therefore authored once, lightest to darkest, and never per mode.
 *
 * **Where each colour comes from.** Every colour is one of the palette's own tokens in
 * `src/index.css`, named in the comment beside it. The category colours (`--data-*`) are left out:
 * they are the same in every palette, so they would put one palette's colours into another's row.
 *
 * Text colours (`--ink`) are included only where a palette's text is also a fill; otherwise the ink
 * that sits on each fill is chosen by luminance in `applyPalette` (`lib/theme.ts`).
 */

/** Five colours, authored lightest to darkest. */
export type CardColourRow = readonly [string, string, string, string, string]

/* ------------------------------------------------------------------ *
 * Dark palettes
 * ------------------------------------------------------------------ */
export const DARK_CARD_COLOURS: Record<string, CardColourRow> = {
  /* Archival Earth — dark. */
  "sage-dark": [
    "#84968c", // 1  --chart
    "#a27b5c", // 2  --clay
    "#536768", // 3  --line
    "#4a5a5b", // 4  --dock
    "#3f4e4f", // 5  --card
  ],
  /* Kyoto Atelier — dark. The five swatches of the red palette, lightest to darkest. */
  "kyoto-dark": [
    "#fff9f2", // 1  Floral White
    "#ffcad0", // 2  Pastel Pink
    "#f10222", // 3  Racing Red
    "#892325", // 4  Crushed Berry
    "#250202", // 5  Rich Mahogany
  ],
  /* Alpine Willows — dark. */
  "basel-dark": [
    "#9fc3b2", // 1  --clay
    "#4f8f75", // 2  --chart
    "#316851", // 3  --line
    "#275e48", // 4  --dock
    "#1f4d3a", // 5  --card
  ],
  /* Terra di Siena — dark. */
  "british-dark": [
    "#f1e4d2", // 1  --ink
    "#e0a17a", // 2  --clay
    "#d4a24c", // 3  --chart
    "#2e211b", // 4  --card
    "#1e1512", // 5  --canvas
  ],
  /* Titanium & Monaco Blue — dark. */
  "monaco-dark": [
    "#b3cfe5", // 1  --chart
    "#4a7fa7", // 2  --clay
    "#2b527e", // 3  --line
    "#22496f", // 4  --dock
    "#1a3d63", // 5  --card
  ],
  /* Nordic Obsidian — dark. The Space Indigo table's dark column, lightest to darkest. */
  "nordic-dark": [
    "#f2f5ea", // 1  Ivory
    "#ffb49a", // 2  Powder Blush
    "#ff4f79", // 3  Bubblegum Pink
    "#232554", // 4  Elevated Indigo
    "#17183b", // 5  Space Indigo
  ],
}

/* ------------------------------------------------------------------ *
 * Light palettes
 * ------------------------------------------------------------------ */
export const LIGHT_CARD_COLOURS: Record<string, CardColourRow> = {
  /* Archival Earth — light. */
  "sage-light": [
    "#ffffff", // 1  --card
    "#faf7f0", // 2  --canvas
    "#e8e2d6", // 3  --line
    "#a27b5c", // 4  --clay
    "#5a6b62", // 5  --chart
  ],
  /* Kyoto Atelier — light. The same five swatches, lightest to darkest. */
  "kyoto-light": [
    "#fff9f2", // 1  Floral White
    "#ffcad0", // 2  Pastel Pink
    "#f10222", // 3  Racing Red
    "#892325", // 4  Crushed Berry
    "#250202", // 5  Rich Mahogany
  ],
  /* Alpine Willows — light. */
  "basel-light": [
    "#ffffff", // 1  --card
    "#e9efea", // 2  --canvas
    "#d5dfd7", // 3  --line
    "#366e57", // 4  --chart
    "#1f4d3a", // 5  --clay
  ],
  /* Terra di Siena — light. */
  "british-light": [
    "#fffbf5", // 1  --card
    "#f4ede2", // 2  --canvas
    "#e2d5c3", // 3  --line
    "#a4472a", // 4  --clay
    "#2b1d16", // 5  --ink
  ],
  /* Titanium & Monaco Blue — light. */
  "monaco-light": [
    "#ffffff", // 1  --card
    "#e6eef4", // 2  --canvas
    "#cfdeea", // 3  --line
    "#4a7fa7", // 4  --chart
    "#2b527e", // 5  --clay
  ],
  /* Nordic Obsidian — light. The Space Indigo table's light column, lightest to darkest. */
  "nordic-light": [
    "#ffffff", // 1  Pure White
    "#f2f5ea", // 2  Ivory
    "#ffb49a", // 3  Powder Blush
    "#a11692", // 4  Dark Magenta
    "#17183b", // 5  Space Indigo
  ],
}

/**
 * A palette's five colours in **slot order**: slot 1 first, slot 5 last.
 *
 * The rows are authored lightest to darkest, so a light palette uses them as they are — slot 1 is
 * the lightest, nearest a light canvas — and a dark palette takes them backwards, which makes
 * slot 1 its darkest and the lightest colour land on slot 5. That is the whole of the mode's
 * difference: a card's slot means the same thing on either side of the toggle, and only the
 * colours it resolves to mirror.
 *
 * `null` for a palette with no row, which leaves its slots to whatever was last set.
 */
export function cardToneSlots(paletteId: string, theme: "light" | "dark"): CardColourRow | null {
  const row = (theme === "dark" ? DARK_CARD_COLOURS : LIGHT_CARD_COLOURS)[paletteId]
  if (!row) return null
  return theme === "dark" ? ([...row].reverse() as unknown as CardColourRow) : row
}
