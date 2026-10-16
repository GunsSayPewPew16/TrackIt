import { motion } from "framer-motion"
import { Moon, Sun } from "lucide-react"

import type { Theme } from "@/lib/theme"

/**
 * The one control in both headers: a 48px circle that hands the sun over to the
 * moon.
 *
 * Every number here is the artboard's. The circle is 48px with a hairline and a
 * 24px radius, the button's own ink is the icon's colour, and the swap is a
 * 450ms `cubic-bezier(.34,1.56,.64,1)` transform with a 250ms fade — a curve that
 * overshoots slightly, which is what makes the sun look thrown out of the way
 * rather than cross-faded. Framer Motion carries it: the two faces are one
 * `motion.span` each, and the theme is the only thing that decides which of them
 * is where, so the switch cannot half-apply.
 *
 * `aria-pressed` follows the *light* theme, as the artboard's does (the button is
 * pressed when light is on), and the label says what pressing it will do.
 */

/**
 * The turn, on the artboard's curve. It is written as a bezier rather than a
 * spring on purpose: this is a small hand-off between two icons, and the design's
 * own overshoot is what gives it its flick — a spring here would be this app's
 * taste rather than the artboard's.
 */
const TURN = { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }

/**
 * The fade behind it, which is shorter and never the thing being watched. Written
 * as CSS `ease`'s own bezier, since that is the curve the artboard's `opacity .25s
 * ease` resolves to.
 */
const FADE = { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const isLight = theme === "light"
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isLight}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-line bg-card text-ink"
    >
      <motion.span
        aria-hidden="true"
        className="absolute flex"
        initial={false}
        animate={
          isLight
            ? { opacity: 0, rotate: 90, scale: 0.4 }
            : { opacity: 1, rotate: 0, scale: 1 }
        }
        transition={{ rotate: TURN, scale: TURN, opacity: FADE }}
      >
        <Sun strokeWidth={1.5} className="size-6" />
      </motion.span>
      <motion.span
        aria-hidden="true"
        className="absolute flex"
        initial={false}
        animate={
          isLight
            ? { opacity: 1, rotate: 0, scale: 1 }
            : { opacity: 0, rotate: -90, scale: 0.4 }
        }
        transition={{ rotate: TURN, scale: TURN, opacity: FADE }}
      >
        <Moon strokeWidth={1.5} className="size-6" />
      </motion.span>
    </button>
  )
}
