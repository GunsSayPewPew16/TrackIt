import { useCallback, useEffect, useState } from "react"

import {
  applyPalette,
  defaultPaletteOf,
  paletteFor,
  paletteOnDocument,
  rememberedPalette,
  storedPalette,
  themeChoice,
  themeOfPalette,
  type Palette,
  type Theme,
  type ThemeChoice,
} from "@/lib/theme"

/**
 * The palette as state, and the two actions a control needs: pick one, or flip to the other side
 * of the theme being worn.
 *
 * It starts from what the document is already wearing rather than from a fresh preference —
 * the boot script in `index.html` has been there since before the first paint — so a control
 * rendered from this never disagrees with the screen it sits on for a frame.
 *
 * **`chooseTheme` is the settings selector's whole interface.** It takes an id and wears what
 * that id means: a *theme*'s table for the mode on screen (`Titanium & Monaco Blue` in dark mode
 * is `monaco-dark`), or — for the one case a theme cannot answer, a table no name in the register
 * owns — the palette itself, so a kept table can still be worn from a list. An id the register
 * does not know is ignored rather than applied, because the stylesheet would fall back to the
 * default table and the app would disagree with its own state.
 *
 * **The toggle is the other side of the same name.** Flipping while Monaco Blue is worn lands on
 * Monaco's light companion, not on Archival Earth's light side: a theme is an identity, and the sun/moon is
 * asking for that identity in the other mode. Only a table no theme names falls back to the old
 * rule — the palette the owner last used in that theme, or that theme's default.
 */
export function useTheme() {
  const [palette, setPalette] = useState<Palette>(() => paletteOnDocument() ?? storedPalette())

  // Every change goes out through `applyPalette`, so the attribute, the remembered choice
  // and this state can never drift apart.
  useEffect(() => {
    applyPalette(palette)
  }, [palette])

  /** Wear a theme by id — or, failing that, the palette that id names. */
  const chooseTheme = useCallback((id: string) => {
    setPalette((current) => {
      const choice = themeChoice(id)
      if (choice) return paletteFor(choice[current.theme]) ?? current
      return paletteFor(id) ?? current
    })
  }, [])

  /** Wear a palette by id, for the callers that hold a table rather than a name. */
  const choosePalette = useCallback((id: string) => {
    const next = paletteFor(id)
    if (next) setPalette(next)
  }, [])

  /** The other side of the theme on screen. */
  const toggleTheme = useCallback(() => {
    setPalette((current) => {
      const other: Theme = current.theme === "dark" ? "light" : "dark"
      const choice = themeOfPalette(current.id)
      // The name decides what the other side is: Archival Earth flips to its light side, Monaco to its own.
      if (choice) return paletteFor(choice[other]) ?? current
      // A table no theme names keeps the old rule.
      return rememberedPalette(other) ?? defaultPaletteOf(other)
    })
  }, [])

  return {
    palette,
    /** The theme the screen is wearing, when a name in the register owns that table. */
    choice: themeOfPalette(palette.id) as ThemeChoice | null,
    /** Which of the two modes that table is. */
    theme: palette.theme,
    isDark: palette.theme === "dark",
    chooseTheme,
    choosePalette,
    toggleTheme,
  }
}
