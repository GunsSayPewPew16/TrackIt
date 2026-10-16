import { Moon, Sun } from "lucide-react"

import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/utils"

/**
 * The light/dark switch — built and wired, and **not rendered anywhere yet**.
 *
 * When the owner wants it, it goes in the header's right-hand side; nothing else
 * has to change for it, because the theme lives on `<html>` and the stylesheet
 * does the rest. It is a `button` with `role="switch"` rather than a checkbox so
 * a screen reader reads "Dark mode, switch, on", and the 44px disc is the whole
 * target while the pill inside it is only the drawing of one.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === "dark"
  const Icon = dark ? Moon : Sun

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggleTheme}
      className={cn(
        "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-canvas outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tangerine",
        className,
      )}
    >
      <span className="sr-only">Dark mode</span>
      <span
        aria-hidden="true"
        className="relative flex h-7 w-12 items-center rounded-full border border-ink/10 bg-well"
      >
        <span
          className={cn(
            "absolute flex size-5 items-center justify-center rounded-full bg-tangerine text-ink transition-transform duration-300 ease-out motion-reduce:transition-none",
            dark ? "translate-x-6" : "translate-x-1",
          )}
        >
          <Icon className="size-3" />
        </span>
      </span>
    </button>
  )
}
