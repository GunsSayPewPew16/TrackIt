import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion"
import { Home, Plus, TrendingUp, type LucideIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { lightTap, primeHaptics } from "@/lib/haptics"

/**
 * The dock: the app's way between screens, and the way to make something new.
 *
 * This is the imported `BottomNav.tsx` — the pill with the hump, the clay circle
 * travelling inside it, the icons and the spring on every press — rebuilt against
 * this app's three screens and its own tokens.
 *
 * **The circle marks the page you are on, and the hump travels with it.** The
 * imported component parks the clay circle in the middle as the Create button and
 * leaves the hump drawn over it for good. Here there is one circle and one hump:
 * both are drawn at the slot of whichever page is on screen — Home, Create or
 * Ledger — and they slide between slots on the dock's own spring. The scanner is
 * Create's own flow, so the circle waits on Create while it is up rather than
 * sitting on whichever tab happened to open it, and every way in and out of it
 * slides. Pressing Create counts too: the circle comes to the middle, the hump
 * rises over it, and the panel opens above it.
 *
 * **The slide is not optional.** `useReducedMotion` shortens it to a 200ms glide
 * rather than removing it: the movement is the dock's whole answer to "which page
 * am I on", and a jump would read as the indicator resetting itself. What the
 * preference takes away is the spring's overshoot.
 *
 * **Icons, not labels.** The imported component sets a 10px title under each icon.
 * The owner has taken the words out and asked for bigger marks, so each slot is a
 * single 28px icon, its name kept as the button's accessible name, and the label
 * and the icon's colour transition are gone with it — the mark changes colour the
 * instant the circle arrives instead of fading under it.
 *
 * **The hump is wider than the imported one** (76px, over a 44px circle, against
 * 112px over a circle that never moved), and its shoulders give way to the pill's
 * rounded ends: at the outer slots it starts exactly where the cap's arc meets the
 * top edge, which is the one place a wider bump can join the outline without a
 * kink. That makes it a few pixels lopsided at those slots and perfectly centred in
 * the middle, and lets the dock take a fourth tab later without a second shape.
 *
 * **It is modular in one place.** `TABS` is the whole of the navigation and
 * `CREATE_AT` says which gap the Create circle sits in, so adding a screen is one
 * line there. Nothing assumes four tabs or a middle one: the slots are flex-1 and
 * the circle's position is arithmetic on the slot index.
 *
 * **The class names are joined here, not with `cn`.** `lib/utils.ts` was `clsx` +
 * `tailwind-merge`, and the dock was the only module in the entry chunk that used
 * it: importing `cn` cost **27.9 kB minified** of the first load (measured by
 * inlining a three-line join: 457.69 kB → 429.80 kB) to merge class names that are
 * already written so that the last one wins. With that gone the whole dock is
 * **6.4 kB** over a build with no dock at all (430.76 kB against 424.41 kB).
 *
 * **The panel is not the imported one either.** The original opens a Radix
 * `Popover`, and Radix's popper stack — popper, floating-ui, the dismissable layer,
 * the focus guards, remove-scroll — measured at **~98 kB** of the entry chunk for a
 * menu of quick actions, which cannot be lazily loaded the way the screens are.
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
  /** The slot's accessible name. Nothing is drawn with it. */
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
/** What a reduced-motion preference gets: the same slide, without the overshoot. */
const GLIDE = { duration: 0.2, ease: "easeOut" } as const

// Dock geometry (px). The SVG is RISE px taller than the bar: that headroom is the hump.
const BAR_H = 72
const RISE = 10
const R = BAR_H / 2 // fully rounded ends
const PAD = 8 // the bar's own inset, from the `px-2` the slots sit inside
const CIRCLE = 44 // the travelling circle's diameter
const HUMP_HALF = 38 // the hump reaches this far either side of the circle
const HUMP_HANDLE = 14 // larger = softer shoulders

/**
 * Pill with a hump in its top edge, over `c` — the circle's centre.
 *
 * Each shoulder ends where it runs out of pill: `xL`/`xR` are the hump's ends, and
 * the caller clamps them to the tops of the rounded caps. The handles stop short of
 * the crossing point so the two curves can never fight over the same few pixels.
 */
function dockPath(w: number, c: number, xL: number, xR: number) {
  const top = RISE
  const bottom = RISE + BAR_H
  const hl = Math.min(HUMP_HANDLE, (c - xL) / 2)
  const hr = Math.min(HUMP_HANDLE, (xR - c) / 2)
  return [
    `M${R} ${top}`,
    `H${xL}`,
    `C${xL + hl} ${top} ${xL + hl} 0 ${c} 0`,
    `C${xR - hr} 0 ${xR - hr} ${top} ${xR} ${top}`,
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

/**
 * The dock's own class-name join. `cn` would be `clsx` + `tailwind-merge`, and the
 * 28 kB that buys is a merge of conflicts these strings already avoid by hand.
 */
const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ")

/**
 * A slot's icon. One mark, 28px, centred in the bar; `transition-none` is what keeps
 * it from fading between the two inks as the circle arrives under it.
 */
const iconClass = "absolute top-1/2 left-1/2 z-[2] size-7 -translate-x-1/2 -translate-y-1/2 transition-none"

interface BottomNavProps {
  /**
   * The screen on show. `"scan"` parks the circle on Create — the scanner is that
   * flow's destination — and `null` leaves the circle where it was.
   */
  active: NavTab | "scan" | null
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
  const reduceMotion = useReducedMotion()

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
  /** A slot's centre, in the container's own coordinates — the `PAD` is the ul's `px-2`. */
  const centreOf = (slot: number) => PAD + ((width - PAD * 2) * (slot + 0.5)) / slots

  /**
   * Which slot the circle is in: the panel's own slot while it is open, the slot of
   * the tab on screen, Create's slot on the scanner, and the last one anywhere the
   * dock has no opinion.
   */
  const tabIndex = TABS.findIndex((tab) => tab.key === active)
  const activeSlot = open
    ? CREATE_AT
    : tabIndex >= 0
      ? tabIndex < CREATE_AT
        ? tabIndex
        : tabIndex + 1
      : active === "scan"
        ? CREATE_AT
        : null

  /** The circle's animated left edge, and the hump drawn over its centre. */
  const circleX = useMotionValue(centreOf(0) - CIRCLE / 2)
  const hump = useTransform(circleX, (left) => {
    const centre = left + CIRCLE / 2
    return dockPath(
      width,
      centre,
      Math.max(R, centre - HUMP_HALF),
      Math.min(width - R, centre + HUMP_HALF),
    )
  })

  /** Whether the circle has been placed once: the first slot is a seat, not a slide. */
  const seated = useRef(false)
  useEffect(() => {
    if (activeSlot === null) return
    const target = centreOf(activeSlot) - CIRCLE / 2
    if (!seated.current) {
      seated.current = true
      circleX.set(target)
      return
    }
    const controls = animate(circleX, target, reduceMotion ? GLIDE : SPRING)
    return () => controls.stop()
    // `centreOf` is derived from the width above; naming it here would rebuild the
    // effect on every render and restart the slide on every frame it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot, width, circleX, reduceMotion])

  const slot = (tab: NavItem) => {
    const isActive = !open && tab.key === active
    const Icon = tab.icon
    return (
      <li key={tab.key} className="relative flex-1">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={SPRING}
          aria-label={tab.label}
          aria-current={isActive ? "page" : undefined}
          onClick={() => {
            lightTap() // must run synchronously inside the tap for iOS
            setOpen(false)
            onChange(tab.key)
          }}
          className="absolute inset-0 rounded-2xl"
        >
          <Icon
            strokeWidth={1.5}
            aria-hidden="true"
            className={join(iconClass, isActive ? "text-on-clay" : "text-ink2")}
          />
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
          <motion.path
            d={hump}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="fill-card stroke-line"
          />
        </svg>

        {/* The circle, under the icon of the page on screen, behind every mark. */}
        <motion.span
          aria-hidden="true"
          style={{ x: circleX }}
          className="absolute top-6 left-0 z-[1] size-11 rounded-full bg-clay"
        />

        <ul className="absolute inset-x-0 bottom-0 flex h-[72px] items-stretch px-2 py-3">
          {TABS.slice(0, CREATE_AT).map(slot)}

          <li className="relative flex-1">
            {/* The whole slot is the touch target; the circle it sits over is the page marker. */}
            <motion.button
              ref={trigger}
              type="button"
              aria-label="Create"
              aria-expanded={open}
              aria-haspopup="menu"
              whileTap="tap"
              onClick={() => {
                lightTap()
                setOpen((was) => !was)
              }}
              className="absolute inset-0 rounded-2xl"
            >
              <motion.span
                variants={{ tap: { scale: 0.92 } }}
                transition={SPRING}
                className={join(iconClass, "flex")}
              >
                <motion.span animate={{ rotate: open ? 45 : 0 }} transition={SPRING} className="flex">
                  {/*
                    The colour is set on the drawing rather than inherited from the
                    span: an inherited colour change transitions on *every* element
                    that inherits it, so a mark that only listened to its parent
                    would still fade through the two intermediate spans.
                  */}
                  <Plus
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className={join("size-7 transition-none", open ? "text-on-clay" : "text-ink2")}
                  />
                </motion.span>
              </motion.span>
            </motion.button>

            {open && (
              <motion.div
                ref={panel}
                role="menu"
                aria-label="Create"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                // 30px above the slot's own top edge, which is where the original's
                // 20px `sideOffset` from its button lands.
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

          {TABS.slice(CREATE_AT).map(slot)}
        </ul>
      </div>
    </nav>
  )
}
