import { motion } from "framer-motion"
import { Home, Plus, TrendingUp, type LucideIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { lightTap, primeHaptics } from "@/lib/haptics"
import { cn } from "@/lib/utils"

/**
 * The dock: the app's way between screens, and the way to make something new.
 *
 * This is the imported `BottomNav.tsx` — the pill with the shallow hump, the clay
 * Create circle sitting in it, and the slots around it — rebuilt against this app's
 * screens and its own tokens. Everything geometric is the original's: a 72px bar,
 * a 10px rise, fully rounded ends, a 56px hump with 24px handles, the spring on the
 * press, and the 3px sage indicator under the current tab.
 *
 * **It is modular in one place.** `TABS` is the whole of the navigation: adding a
 * screen is one line there, and `CREATE_AT` says which gap the Create circle is
 * dropped into. The hump is not a fixed shape any more — it is drawn **over the
 * Create slot**, wherever that slot lands (the path below is the original's, with
 * its centre passed in rather than assumed to be `w / 2`), so three tabs and five
 * tabs both put the circle in the middle of the rise instead of under its shoulder.
 * The slots are flex-1, so their centres are just arithmetic on the index.
 *
 * **Why three and not the original's five.** This app has a dashboard, a ledger and
 * a scanner. There is no search screen and no profile screen to point the other two
 * at, and a dock that offers a room the house does not have is worse than a shorter
 * dock — so Home, Create and Ledger it is, with the scanner as the Create panel's
 * first action. When a screen is added, `TABS` gains a line and the dock grows
 * around it.
 *
 * **The Create panel is the one part that is not the original's.** The imported
 * component opens a Radix `Popover`; Radix's popper stack (popper, floating-ui, the
 * dismissable layer, the focus guards, remove-scroll) measured at **~98 kB of the
 * entry chunk** for a menu of quick actions, and the dock cannot be lazily loaded the
 * way the other screens are. The panel is therefore drawn here — see the note at the
 * slot — and the entry chunk stays where it was.
 *
 * **Haptics.** Every press plays `lightTap()` — a buzz on Android, the system's
 * switch click on iOS — fired synchronously inside the tap, which is the only place
 * iOS will tick for its hidden switch. The switch is primed on mount rather than on
 * first use, so the first tab of a session is not the one that pays for the DOM.
 */

/** The dock's destinations. These are `App`'s view names, so a tab is a screen. */
export type NavTab = "dashboard" | "ledger"

export interface NavItem {
  key: NavTab
  label: string
  icon: LucideIcon
}

/** What the Create circle offers. Adding another entry is the whole of adding an action. */
export interface QuickAction {
  id: string
  label: string
  icon: LucideIcon
  onSelect: () => void
}

/** The tabs, in the order they sit around Create. Add a screen here and it appears. */
const TABS: NavItem[] = [
  { key: "dashboard", label: "Home", icon: Home },
  { key: "ledger", label: "Ledger", icon: TrendingUp },
]

/** Which gap the Create circle goes in: `1` is between the first and second tabs. */
const CREATE_AT = 1

const SPRING = { type: "spring", stiffness: 300, damping: 25 } as const

// Dock geometry (px). The SVG is RISE px taller than the bar: that headroom is the shallow hump.
const BAR_H = 72
const RISE = 10
const R = BAR_H / 2 // fully rounded ends
const HUMP_HALF = 56 // the hump starts and ends this far either side of the Create circle
const HUMP_HANDLE = 24 // larger = softer shoulders

/** Pill with a gentle hump in the middle of the top edge, sitting over the Create circle. */
function dockPath(w: number, c: number) {
  const top = RISE
  const bottom = RISE + BAR_H
  return [
    `M${R} ${top}`,
    `H${c - HUMP_HALF}`,
    `C${c - HUMP_HALF + HUMP_HANDLE} ${top} ${c - HUMP_HALF + HUMP_HANDLE} 0 ${c} 0`,
    `C${c + HUMP_HALF - HUMP_HANDLE} 0 ${c + HUMP_HALF - HUMP_HANDLE} ${top} ${c + HUMP_HALF} ${top}`,
    `H${w - R}`,
    `A${R} ${R} 0 0 1 ${w - R} ${bottom}`,
    `H${R}`,
    `A${R} ${R} 0 0 1 ${R} ${top}`,
    "Z",
  ].join("")
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(358)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

const labelClass = "font-sans text-[10px] font-bold uppercase leading-4 tracking-[0.03em]"

interface BottomNavProps {
  /** The tab whose screen is showing; `null` on a screen no tab owns (the scanner). */
  active: NavTab | null
  onChange: (tab: NavTab) => void
  /** Shown when Create is pressed. */
  actions: QuickAction[]
}

export function BottomNav({ active, onChange, actions }: BottomNavProps) {
  const [open, setOpen] = useState(false)
  const [ref, width] = useWidth<HTMLDivElement>()
  /** The Create button and its panel: what focus returns to, and what "outside" is not. */
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    primeHaptics()
  }, [])

  /** The two ways an open menu goes away: a press anywhere else, and Escape. */
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const slots = TABS.length + 1
  /** The Create slot's centre, which is where the hump is drawn. */
  const center = (width * (CREATE_AT + 0.5)) / slots

  const tab = ({ key, label, icon: Icon }: NavItem) => {
    const isActive = active === key
    return (
      <li key={key} className="flex flex-1 justify-center">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={SPRING}
          aria-current={isActive ? "page" : undefined}
          onClick={() => {
            lightTap() // must run synchronously inside the tap for iOS
            onChange(key)
          }}
          className={cn(
            "relative flex h-12 w-full min-w-12 flex-col items-center justify-center gap-1 rounded-2xl",
            isActive ? "text-ink" : "text-ink2",
          )}
        >
          <Icon strokeWidth={1.5} className="size-6" aria-hidden="true" />
          <span className={labelClass}>{label}</span>
          {isActive && (
            <motion.span
              layoutId="dock-active"
              transition={SPRING}
              className="absolute -bottom-2 left-1/2 -ml-2 h-[3px] w-4 rounded-full bg-sage"
            />
          )}
        </motion.button>
      </li>
    )
  }

  return (
    <nav
      aria-label="Primary"
      // Sits about 24px above the bottom edge, just clear of the iPhone home indicator.
      // z-40 keeps it under the money sheet and the data sheet, which are both full-screen.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[390px] px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)_-_0.5rem))]"
    >
      <div ref={ref} className="pointer-events-auto relative h-[82px]">
        <svg
          width={width}
          height={BAR_H + RISE}
          viewBox={`0 0 ${width} ${BAR_H + RISE}`}
          aria-hidden="true"
          className="absolute inset-0 overflow-visible"
        >
          <path
            d={dockPath(width, center)}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="fill-card stroke-line"
          />
        </svg>

        <ul className="absolute inset-x-0 bottom-0 flex h-[72px] items-stretch px-2 py-3">
          {TABS.slice(0, CREATE_AT).map(tab)}

          <li className="relative flex flex-1 justify-center">
            {/*
              The whole circle + label column is the 48px+ touch target; the circle
              sits inside the bar, under the hump.

              This panel is the one place the dock is not the imported component. The
              original opens a Radix `Popover`, and Radix's popper stack — popper,
              floating-ui, the dismissable layer, the focus guards, remove-scroll —
              is about **98 kB of the entry chunk** for a menu of quick actions. The
              dock has to be in the entry chunk (it is on screen before anything else
              is), so the panel is drawn here instead: absolutely positioned over the
              bar, closed by a press outside or Escape, and sound to a screen reader
              without the machinery.
            */}
            <motion.button
              ref={trigger}
              type="button"
              aria-expanded={open}
              aria-haspopup="menu"
              whileTap="tap"
              onClick={() => {
                lightTap()
                setOpen((was) => !was)
              }}
              className="absolute inset-x-0 top-[-10px] flex h-14 flex-col items-center justify-between rounded-2xl"
            >
              <motion.span
                variants={{ tap: { scale: 0.92 } }}
                transition={SPRING}
                className="grid size-10 place-items-center rounded-full bg-clay text-on-clay"
              >
                <motion.span animate={{ rotate: open ? 45 : 0 }} transition={SPRING} className="flex">
                  <Plus strokeWidth={1.5} className="size-5" aria-hidden="true" />
                </motion.span>
              </motion.span>
              <span className={cn(labelClass, open ? "text-ink" : "text-ink2")}>Create</span>
            </motion.button>

            {open && (
              <motion.div
                ref={panel}
                role="menu"
                aria-label="Create"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                // 30px above the trigger's own top edge, which is where the original's
                // 20px `sideOffset` from that button lands.
                className="absolute bottom-full left-1/2 z-50 mb-[30px] w-56 -translate-x-1/2 rounded-2xl border border-line bg-card p-2 text-ink"
              >
                {actions.map(({ id, label, icon: Icon, onSelect }) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      lightTap()
                      setOpen(false)
                      onSelect()
                    }}
                    className="flex h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-[13px] leading-4 hover:bg-canvas"
                  >
                    <Icon strokeWidth={1.5} className="size-6 text-sage" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </li>

          {TABS.slice(CREATE_AT).map(tab)}
        </ul>
      </div>
    </nav>
  )
}
