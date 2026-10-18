import { useCallback, useEffect, useState } from "react"

import {
  applyPalette,
  defaultPaletteOf,
  paletteFor,
  paletteOnDocument,
  rememberedPalette,
  storedPalette,
  type Palette,
  type Theme,
} from "@/lib/theme"

/**
 * The palette as state, and the two actions a control needs: pick one, or flip to the other
 * theme.
 *
 * It starts from what the document is already wearing rather than from a fresh preference —
 * the boot script in `index.html` has been there since before the first paint — so a control
 * rendered from this never disagrees with the screen it sits on for a frame.
 *
 * **`choosePalette` is the theme picker's whole interface.** It takes an id (the string the
 * register stores) rather than a `Palette`, so a list rendered from `PALETTES` can hand back
 * `palette.id` and nothing has to hold the object; an id the register does not know is
 * ignored rather than applied, because the stylesheet would fall back to the default table
 * and the app would disagree with its own state.
 *
 * **The toggle is theme-shaped, not palette-shaped.** It asks the register for the palette
 * the owner last used in the other theme, and that theme's default only on the first visit
 * to it — so flipping to light and back returns to the palette that was chosen, rather than
 * quietly resetting to the artboard's own.
 */
export function useTheme() {
  const [palette, setPalette] = useState<Palette>(() => paletteOnDocument() ?? storedPalette())

  // Every change goes out through `applyPalette`, so the attribute, the remembered choice
  // and this state can never drift apart.
  useEffect(() => {
    applyPalette(palette)
  }, [palette])

  /** Wear a palette by id — what a theme picker calls. */
  const choosePalette = useCallback((id: string) => {
    const next = paletteFor(id)
    if (next) setPalette(next)
  }, [])

  /** The other theme's palette: the last one used there, or its default. */
  const toggleTheme = useCallback(() => {
    setPalette((current) => {
      const other: Theme = current.theme === "dark" ? "light" : "dark"
      return rememberedPalette(other) ?? defaultPaletteOf(other)
    })
  }, [])

  return {
    palette,
    /** Every palette drawn for a theme, for a picker's two groups. */
    theme: palette.theme,
    isDark: palette.theme === "dark",
    choosePalette,
    toggleTheme,
  }
}
