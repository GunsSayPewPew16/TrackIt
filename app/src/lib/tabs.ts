/**
 * The screens the dock can take you to, in the order it draws them.
 *
 * It is a module of its own because two things read it: the dock (`components/BottomNav.tsx`)
 * draws its slots in this order, and the sideways swipe (`hooks/useSwipeScreens.ts`, through
 * `App.tsx`) pages in the same one. A screen added to the dock is then a screen the thumb can
 * reach without a second list to remember. The scanner is deliberately not here: it is not a
 * tab, and a swipe on it belongs to the camera.
 */
export type NavTab = "dashboard" | "ledger" | "stats" | "settings"

/** The tab order, Home first and Settings last. */
export const TAB_VIEWS: NavTab[] = ["dashboard", "ledger", "stats", "settings"]
