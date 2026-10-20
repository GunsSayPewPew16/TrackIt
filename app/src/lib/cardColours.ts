/**
 * The colour sheet for balance cards: five colours for every palette, written out here so each
 * can be read against its palette at a glance.
 *
 * **How to read it.** Each palette has a row of five colours, numbered **1 to 5 by darkness**:
 * 1 is the darkest of the five and 5 the lightest. A card the owner makes stores only its number
 * (`tone-1` … `tone-5`), never a hex value. When the card is drawn, its number is looked up in the
 * palette that is on screen *now*, so a card that shows colour 2 on Alpine Willows shows colour 2 of
 * whichever palette is chosen next. The picker in the new-card sheet reads the same row.
 *
 * **Where each colour comes from.** Every colour is one of the palette's own tokens in
 * `src/index.css`, named in the comment beside it. The dark palettes use the card, the dock, the
 * hairline, the warning accent and the chart. The light palettes use the card, the canvas, the
 * hairline, the warning accent and the chart, because their dock and card are both white. The
 * category colours (`--data-*`) are left out: they are the same in every palette, so they would
 * put one palette's colours into another's row.
 *
 * Text colours (`--ink`) are left out too: a card is a fill, and the ink that sits on each fill is
 * chosen by luminance in `applyPalette` (`lib/theme.ts`).
 */

/** Five colours, darkest (1) to lightest (5). */
export type CardColourRow = readonly [string, string, string, string, string]

/* ------------------------------------------------------------------ *
 * Dark palettes
 * ------------------------------------------------------------------ */
export const DARK_CARD_COLOURS: Record<string, CardColourRow> = {
  /* Archival Earth — dark. */
  "sage-dark": [
    "#3f4e4f", // 1  --card
    "#4a5a5b", // 2  --dock
    "#536768", // 3  --line
    "#a27b5c", // 4  --clay
    "#84968c", // 5  --chart
  ],
  /* Kyoto Atelier — dark. */
  "kyoto-dark": [
    "#541a2e", // 1  --chart
    "#242f49", // 2  --card
    "#2c3854", // 3  --dock
    "#384358", // 4  --line
    "#b51a2b", // 5  --clay
  ],
  /* Alpine Willows — dark. */
  "basel-dark": [
    "#1f4d3a", // 1  --card
    "#275e48", // 2  --dock
    "#316851", // 3  --line
    "#4f8f75", // 4  --chart
    "#9fc3b2", // 5  --clay
  ],
  /* Tuscany Terracotta — dark. */
  "british-dark": [
    "#a46447", // 1  --card
    "#b4734f", // 2  --dock
    "#bf7e61", // 3  --line
    "#88937b", // 4  --chart
    "#ceb59e", // 5  --clay
  ],
  /* Titanium & Monaco Blue — dark. */
  "monaco-dark": [
    "#1a3d63", // 1  --card
    "#22496f", // 2  --dock
    "#2b527e", // 3  --line
    "#4a7fa7", // 4  --clay
    "#b3cfe5", // 5  --chart
  ],
  /* Nordic Obsidian — dark. */
  "nordic-dark": [
    "#2b124c", // 1  --card
    "#351859", // 2  --dock
    "#522b5b", // 3  --line
    "#854f6c", // 4  --chart
    "#dfb6b2", // 5  --clay
  ],
}

/* ------------------------------------------------------------------ *
 * Light palettes
 * ------------------------------------------------------------------ */
export const LIGHT_CARD_COLOURS: Record<string, CardColourRow> = {
  /* Archival Earth — light. */
  "sage-light": [
    "#5a6b62", // 1  --chart
    "#a27b5c", // 2  --clay
    "#e8e2d6", // 3  --line
    "#faf7f0", // 4  --canvas
    "#ffffff", // 5  --card
  ],
  /* Kyoto Atelier — light. */
  "kyoto-light": [
    "#b51a2b", // 1  --clay
    "#c96e53", // 2  --chart
    "#e6ded1", // 3  --line
    "#f5f1eb", // 4  --canvas
    "#ffffff", // 5  --card
  ],
  /* Alpine Willows — light. */
  "basel-light": [
    "#1f4d3a", // 1  --clay
    "#366e57", // 2  --chart
    "#d5dfd7", // 3  --line
    "#e9efea", // 4  --canvas
    "#ffffff", // 5  --card
  ],
  /* Tuscany Terracotta — light. */
  "british-light": [
    "#5b6651", // 1  --chart
    "#a46447", // 2  --clay
    "#d6cdbc", // 3  --line
    "#e8e1d5", // 4  --canvas
    "#ffffff", // 5  --card
  ],
  /* Titanium & Monaco Blue — light. */
  "monaco-light": [
    "#2b527e", // 1  --clay
    "#4a7fa7", // 2  --chart
    "#cfdeea", // 3  --line
    "#e6eef4", // 4  --canvas
    "#ffffff", // 5  --card
  ],
  /* Nordic Obsidian — light. */
  "nordic-light": [
    "#854f6c", // 1  --clay
    "#a67e7a", // 2  --chart
    "#e4dce9", // 3  --line
    "#f3eff5", // 4  --canvas
    "#ffffff", // 5  --card
  ],
}
