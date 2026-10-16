import { useCallback, useEffect, useState } from "react"

import { applyTheme, storedTheme, themeOnDocument, type Theme } from "@/lib/theme"

/**
 * The theme as state, and the one action a switch needs.
 *
 * It starts from what the document is already wearing rather than from a fresh
 * preference — the boot script in `index.html` has been there since before the
 * first paint — so a control rendered from this never disagrees with the screen
 * it sits on for a frame.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => themeOnDocument() ?? storedTheme())

  // Every change goes out through `applyTheme`, so the attribute and the
  // remembered choice can never drift apart from the state this returns.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"))
  }, [])

  return { theme, isDark: theme === "dark", setTheme, toggleTheme }
}
