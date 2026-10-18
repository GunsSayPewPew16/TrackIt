/**
 * The palettes, in one place.
 *
 * `index.css` defines every colour the app paints with, one **palette** to a block, and
 * switches between them on one thing only: `data-palette` on `<html>`. A palette is a
 * complete table — surfaces, ink, the two accents, the dock, the data colours — and it
 * declares which of the two **themes** it is, dark or light. Nothing here paints
 * anything; this is the reads and writes of that attribute, the remembered choice, and
 * the register a theme picker reads to build its list.
 *
 * **Why a register and not just the attribute.** The stylesheet and the script each need
 * to know the palette's *canvas*: the CSS paints the page with it, and the script hands it
 * to the browser's own chrome (the address bar on Android, the toolbar tint on iOS) as
 * `<meta name="theme-color">`, which no stylesheet can reach. `index.html`'s boot script
 * needs the same two facts before the first paint, so its copy of the table is written out
 * longhand there — **three places to keep in step, and this module is the one to edit
 * first**: the ids, the labels, the themes and the canvas colours all start here.
 *
 * **Adding a palette** is one block in `index.css` (`:root[data-palette="…"]`, carrying
 * every token — a missing one would fall back to another palette's value) plus one row
 * here, plus the id and canvas in `index.html`'s boot table. Nothing else in the app knows
 * a palette's name, which is what makes the picker a list over `PALETTES`.
 *
 * **The theme is the palette's, not the document's.** There is no `data-theme` any more:
 * a document wears one palette, and the switch's old question ("dark or light?") is now
 * answered by what the chosen palette is. The toggle flips to the palette the owner last
 * used in the other theme, or that theme's default the first time — so choosing Midnight
 * and pressing the toggle lands on Paper, and pressing it again comes back to Midnight
 * rather than resetting to Ink.
 */

/** The two themes the palettes are drawn for. A component that draws a sun or a moon needs this. */
export type Theme = "light" | "dark"

/** One complete table of the app's colours, and what `data-palette` names it by. */
export type Palette = {
  /** The `data-palette` value `index.css` files the table under, and the stored choice. */
  id: string
  /** What a picker calls it, and what its swatch sits under. */
  label: string
  /** Which of the two themes the table is. */
  theme: Theme
  /**
   * The palette's canvas — a **mirror of `--canvas`** in `index.css`, and the value the
   * browser's own chrome is painted with. It is the one colour the script cannot read back
   * from the stylesheet in time, so it is stated twice on purpose.
   */
  canvas: string
}

/**
 * Every palette the app can wear, **dark ones first** and the artboard's own two leading
 * each group: `ink` and `paper` are the design of record's tables, and the defaults.
 *
 * `midnight` and `parchment` are the register's samples, there so the picker has something
 * to choose and so the machinery is exercised by more than one table per theme. They are
 * the owner's palettes to keep or cut — deleting one is its `index.css` block, its row
 * here and its line in `index.html`.
 */
export const PALETTES: Palette[] = [
  { id: "ink", label: "Ink", theme: "dark", canvas: "#0a0f0d" },
  { id: "midnight", label: "Midnight", theme: "dark", canvas: "#080c14" },
  { id: "paper", label: "Paper", theme: "light", canvas: "#f8f6f2" },
  { id: "parchment", label: "Parchment", theme: "light", canvas: "#f4efe6" },
]

/**
 * Where the chosen palette is remembered, and the key the theme it replaced was stored
 * under. `index.html` reads both in a boot script before the first paint, so they are
 * hard-coded there too — keep the two in step.
 */
export const PALETTE_STORAGE_KEY = "trackit-palette"

/** The key the app remembered a *theme* under before palettes existed. Read once, never written. */
export const LEGACY_THEME_STORAGE_KEY = "trackit-theme"

/** The palette `data-palette` carries when the document says nothing: the artboard's dark. */
export const DEFAULT_PALETTE: Palette = PALETTES[0]

/** The name a theme's own remembered palette is kept under. */
const schemeKey = (theme: Theme): string => `${PALETTE_STORAGE_KEY}-${theme}`

/** The palette an id names, or `null` when nothing has that id. */
export function paletteFor(id: unknown): Palette | null {
  return typeof id === "string" ? (PALETTES.find((palette) => palette.id === id) ?? null) : null
}

/** Every palette drawn for a theme, in the register's order — what the picker lists under a heading. */
export function palettesOf(theme: Theme): Palette[] {
  return PALETTES.filter((palette) => palette.theme === theme)
}

/**
 * The palette a theme falls back to: its first in the register. The artboard's own two are
 * first in each group, so the design is what a theme means until the owner says otherwise.
 */
export function defaultPaletteOf(theme: Theme): Palette {
  return palettesOf(theme)[0] ?? DEFAULT_PALETTE
}

/** The palette the owner last chose in a theme, if this browser remembers one. */
export function rememberedPalette(theme: Theme): Palette | null {
  try {
    return paletteFor(window.localStorage.getItem(schemeKey(theme)))
  } catch {
    return null
  }
}

/**
 * The palette the document already wears, if it wears one. The boot script in `index.html`
 * is what puts it there, which is why this reads the DOM rather than storage: the two must
 * agree, and the DOM is the one the user can see.
 */
export function paletteOnDocument(): Palette | null {
  return paletteFor(document.documentElement.dataset.palette)
}

/**
 * The remembered choice, or the default. It never throws: Safari in private mode refuses
 * `localStorage`, and a refused read is not worth failing a render over.
 *
 * A browser that chose before the picker existed stored a **theme** rather than a palette,
 * and that choice is honoured rather than overwritten: `light` becomes the light theme's
 * default palette, `dark` the dark one's.
 */
export function storedPalette(): Palette {
  try {
    const chosen = paletteFor(window.localStorage.getItem(PALETTE_STORAGE_KEY))
    if (chosen) return chosen
    const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
    if (legacy === "light" || legacy === "dark") return defaultPaletteOf(legacy)
  } catch {
    return DEFAULT_PALETTE
  }
  return DEFAULT_PALETTE
}

/**
 * Put a palette on the document and remember it.
 *
 * Setting the attribute is the whole of applying a palette — every colour comes from the
 * stylesheet — and the browser's own chrome is told too, by hand, because a `<meta>` tag
 * does not react to CSS. Two things are written: the choice itself, and the same id under
 * the palette's own theme, which is what the toggle returns to when it comes back to this
 * theme. A browser that refuses to remember still gets the palette for this session.
 */
export function applyPalette(palette: Palette): void {
  document.documentElement.dataset.palette = palette.id
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.canvas)
  try {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, palette.id)
    window.localStorage.setItem(schemeKey(palette.theme), palette.id)
  } catch {
    // No memory, but the palette is applied either way.
  }
}
