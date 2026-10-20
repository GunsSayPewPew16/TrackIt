/**
 * The palettes, in one place.
 *
 * `index.css` defines every colour the app paints with, one **palette** to a block, and
 * switches between them on one thing only: `data-palette` on `<html>`. A palette is a
 * complete table — canvas, surfaces and their 1px border, the two ink weights, the warning
 * accent, the chart hue, the dock, the data colours — and it declares which of the two
 * **themes** it is, dark or light. Nothing here paints anything; this is the reads and
 * writes of that attribute, the remembered choice, and the register a theme picker reads to
 * build its list.
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
 * answered by what the chosen palette is. The toggle flips to the other side of the name
 * being worn — so choosing Kyoto and pressing the toggle lands on Kyoto's light companion,
 * and pressing it again comes back to its dark one rather than resetting to Archival Earth.
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
  /**
   * The five colours a balance card of the owner's can be, drawn from this palette and no other.
   * `applyPalette` writes them to `--tone-1` … `--tone-5` (with a readable ink for each), so the
   * picker and the cards repaint with the theme and never mix in another palette's colours.
   */
  tones: readonly [string, string, string, string, string]
}

/**
 * Every table the app can wear, **dark ones first**, each named theme's two sides in the same
 * order as `THEME_CHOICES` below. `defaultPaletteOf` reads the first of each group, so the order
 * here is load bearing: Archival Earth — the app's own pair — leads both halves.
 *
 * A name in the settings selector is not one table but **two**, one per mode, and that is the
 * whole reason this register is a flat list of tables while the selector reads a list of names:
 * the pair is offered once, and the header's sun/moon moves between its two sides.
 */
export const PALETTES: Palette[] = [
  { id: "sage-dark", label: "Archival Earth", theme: "dark", canvas: "#2c3639", tones: ["#84968c", "#a3b19b", "#5f7a6e", "#6b8a9a", "#c95a49"] },
  { id: "kyoto-dark", label: "Kyoto Atelier", theme: "dark", canvas: "#161b2f", tones: ["#7a2e45", "#4f6ea8", "#9aa6c8", "#6f8f8a", "#c95a49"] },
  { id: "basel-dark", label: "Alpine Willows", theme: "dark", canvas: "#022e24", tones: ["#4f8f75", "#9fc3b2", "#3f7a68", "#2c5f78", "#6fae95"] },
  { id: "british-dark", label: "Tuscany Terracotta", theme: "dark", canvas: "#4c362d", tones: ["#88937b", "#a3b19b", "#6f7a6a", "#4f6670", "#9aa6a0"] },
  { id: "monaco-dark", label: "Titanium & Monaco Blue", theme: "dark", canvas: "#0a1931", tones: ["#b3cfe5", "#7fa6c6", "#4a7fa7", "#a3b19b", "#6c8ebf"] },
  { id: "nordic-dark", label: "Nordic Obsidian", theme: "dark", canvas: "#190019", tones: ["#854f6c", "#b08aa8", "#5e3a7a", "#6f8f8a", "#dfb6b2"] },
  { id: "sage-light", label: "Archival Earth", theme: "light", canvas: "#faf7f0", tones: ["#5a6b62", "#3b594c", "#7d9488", "#4f6d80", "#c95a49"] },
  { id: "kyoto-light", label: "Kyoto Atelier", theme: "light", canvas: "#f5f1eb", tones: ["#2e4a7a", "#3b594c", "#7a2e45", "#5b6f8f", "#c95a49"] },
  { id: "basel-light", label: "Alpine Willows", theme: "light", canvas: "#e9efea", tones: ["#366e57", "#1f4d3a", "#5f9a85", "#3b6a84", "#8fb8a6"] },
  { id: "british-light", label: "Tuscany Terracotta", theme: "light", canvas: "#e8e1d5", tones: ["#5b6651", "#3b594c", "#7d8a72", "#4a6070", "#8c9a8a"] },
  { id: "monaco-light", label: "Titanium & Monaco Blue", theme: "light", canvas: "#e6eef4", tones: ["#4a7fa7", "#2b527e", "#7fa6c6", "#3b594c", "#8fb0cc"] },
  { id: "nordic-light", label: "Nordic Obsidian", theme: "light", canvas: "#f3eff5", tones: ["#854f6c", "#5e3a7a", "#b08aa8", "#3b594c", "#7d6a8e"] },
]

/**
 * A readable ink for a tone: dark on a light fill, white on a dark one. The threshold is the
 * WCAG midpoint of relative luminance, which is where the two inks give about equal contrast.
 */
export function toneInk(hex: string): string {
  const value = parseInt(hex.slice(1), 16)
  const linear = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  return luminance > 0.18 ? "#16201c" : "#ffffff"
}

/**
 * The themes the selector offers, under the owner's own names — and **each name is a pair of
 * tables, one per mode**, because a theme is an identity rather than a single screen: Alpine
 * Willows is the same theme in its forest dark and its sage-mist light, and the sun/moon in
 * the header flips between those two rather than between the register's defaults
 * (`hooks/useTheme.ts`).
 *
 * **Archival Earth is the app's own** and the pair every fresh install wears.
 *
 * **A name is not a table.** A pair pointing at palettes that do not exist would be an option that
 * changes nothing when it is chosen, so a new theme arrives as this row *plus* its tables — a block
 * for each side in `index.css`, both canvases in `index.html`, and both rows in `PALETTES`.
 */
export type ThemeChoice = {
  /** The id the selector stores as its value. */
  id: string
  /** The pill's own word — short enough for a third of the tile. */
  label: string
  /** The full name, for the sentence under the row. */
  title: string
  /** The table to wear in dark mode. */
  dark: string
  /** …and in light mode. */
  light: string
}

/**
 * The six themes the selector offers, in the order it lists them.
 *
 * **The `id` is a key, and the `label` and `title` are what the owner reads.** Three of these
 * themes were renamed (`Sage` became Archival, `Basel` Alpine, `Racing` Tuscany) and **the ids
 * were deliberately left where they were**: `trackit-palette` holds a table id in the owner's
 * own browser, so an id is a promise and a name is a label — nobody sees an id, and a theme
 * can be renamed without a migration. `title` is the name in full, which the selector reads
 * out under the grid; `label` is the short form the capsule itself says.
 */
export const THEME_CHOICES: ThemeChoice[] = [
  { id: "sage", label: "Archival", title: "Archival Earth", dark: "sage-dark", light: "sage-light" },
  { id: "kyoto", label: "Kyoto", title: "Kyoto Atelier", dark: "kyoto-dark", light: "kyoto-light" },
  { id: "basel", label: "Alpine", title: "Alpine Willows", dark: "basel-dark", light: "basel-light" },
  { id: "british", label: "Tuscany", title: "Tuscany Terracotta", dark: "british-dark", light: "british-light" },
  { id: "monaco", label: "Monaco", title: "Titanium & Monaco Blue", dark: "monaco-dark", light: "monaco-light" },
  { id: "nordic", label: "Nordic", title: "Nordic Obsidian", dark: "nordic-dark", light: "nordic-light" },
]

/** The choice an id names, or `null` when nothing has it. */
export function themeChoice(id: unknown): ThemeChoice | null {
  return typeof id === "string" ? (THEME_CHOICES.find((choice) => choice.id === id) ?? null) : null
}

/**
 * The choice a table belongs to, or `null` for one no theme names — a table a previous release
 * stored. The selector needs it to answer "which name is the screen wearing?", and the toggle
 * needs it to know what the other side of the flip is.
 */
export function themeOfPalette(paletteId: string): ThemeChoice | null {
  return (
    THEME_CHOICES.find((choice) => choice.dark === paletteId || choice.light === paletteId) ?? null
  )
}

/**
 * Where the chosen palette is remembered, and the key the theme it replaced was stored
 * under. `index.html` reads both in a boot script before the first paint, so they are
 * hard-coded there too — keep the two in step.
 */
export const PALETTE_STORAGE_KEY = "trackit-palette"

/** The key the app remembered a *theme* under before palettes existed. Read once, never written. */
export const LEGACY_THEME_STORAGE_KEY = "trackit-theme"

/**
 * Table ids from releases before the register had six names. A browser that stored one of these
 * is moved to the pair that replaced it rather than dropped onto the default in the wrong mode:
 * `ink` and `paper` were the artboard's own pair (Archival Earth's), and the two samples land on the same
 * sides. This is read-only history; nothing writes these ids again.
 */
const LEGACY_PALETTES: Record<string, string> = {
  ink: "sage-dark",
  paper: "sage-light",
  midnight: "sage-dark",
  parchment: "sage-light",
}

/** The palette `data-palette` carries when the document says nothing: the app's own dark. */
export const DEFAULT_PALETTE: Palette = PALETTES[0]

/** The name a theme's own remembered palette is kept under. */
const schemeKey = (theme: Theme): string => `${PALETTE_STORAGE_KEY}-${theme}`

/** The palette an id names, or `null` when nothing has that id. */
export function paletteFor(id: unknown): Palette | null {
  if (typeof id !== "string") return null
  return PALETTES.find((palette) => palette.id === id) ?? paletteFor(LEGACY_PALETTES[id])
}

/** Every palette drawn for a theme, in the register's order — what the picker lists under a heading. */
export function palettesOf(theme: Theme): Palette[] {
  return PALETTES.filter((palette) => palette.theme === theme)
}

/**
 * The palette a theme falls back to: its first in the register. Archival Earth leads each
 * group, so the app's own design is what a theme means until the owner says otherwise.
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
  // The owner's card colours belong to the palette, so they are written here with it.
  palette.tones.forEach((tone, index) => {
    document.documentElement.style.setProperty(`--tone-${index + 1}`, tone)
    document.documentElement.style.setProperty(`--tone-${index + 1}-ink`, toneInk(tone))
  })
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.canvas)
  try {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, palette.id)
    window.localStorage.setItem(schemeKey(palette.theme), palette.id)
  } catch {
    // No memory, but the palette is applied either way.
  }
}
