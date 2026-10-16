/**
 * The theme, in one place.
 *
 * `index.css` defines both palettes and switches between them on one thing only:
 * `data-theme` on `<html>`. Nothing here paints anything — these are the reads and
 * writes of that attribute, plus the choice being remembered, so that whatever
 * renders a switch has one function to call.
 *
 * Dark is the default: it is the theme both artboards are drawn in, and the one
 * `:root` in `index.css` carries.
 */

/** The two themes `index.css` defines. */
export type Theme = "light" | "dark"

/**
 * Where the choice is remembered. `index.html` reads this key in a boot script
 * before the first paint, so it is hard-coded there too — keep the two in step.
 */
export const THEME_STORAGE_KEY = "trackit-theme"

/** What the app wears when nobody has chosen. */
export const DEFAULT_THEME: Theme = "dark"

/**
 * Each theme's canvas, which is what the browser paints its own chrome with —
 * the address bar on Android, the toolbar tint on iOS. `index.html` writes the
 * same two values into `<meta name="theme-color">` before the first paint.
 */
export const THEME_COLORS: Record<Theme, string> = {
  dark: "#0A0F0D",
  light: "#F8F6F2",
}

export const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark"

/**
 * The theme the document already wears, if it wears one. The boot script in
 * `index.html` is what puts it there, which is why this reads the DOM rather than
 * storage: the two must agree, and the DOM is the one the user can see.
 */
export function themeOnDocument(): Theme | null {
  const attribute = document.documentElement.dataset.theme
  return isTheme(attribute) ? attribute : null
}

/**
 * The remembered choice, or the default. It never throws: Safari in private mode
 * refuses `localStorage`, and a refused read is not worth failing a render over.
 */
export function storedTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * Put a theme on the document and remember it. Setting the attribute is the whole
 * of applying a theme — every colour comes from the stylesheet — and the browser's
 * own chrome is told too, by hand, because a `<meta>` tag does not react to CSS.
 * A browser that refuses to remember the choice still gets to make it for this
 * session.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme])
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // No memory, but the theme is applied either way.
  }
}
