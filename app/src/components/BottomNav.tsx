import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion"
import { ArrowDownUp, BarChart3, Home, UserRound, type LucideIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { join } from "@/lib/classes"
import { lightTap, primeHaptics } from "@/lib/haptics"

/**
 * The dock: the app's way between screens.
 *
 * One clay circle and one hump, drawn under the mark of the screen on show. They are a
 * single motion value — the circle's left edge animates on the dock's spring, and the
 * hump path is a `useTransform` of that same value — so the bump cannot lag the circle or
 * drift off it. Switching screens, from the scanner or from a deep scroll, slides the
 * circle the same way every time: the dock is never reset.
 *
 * **The hump is rigid.** Its width, height and curve are constants; the same path is
 * moved to each slot and never reshaped. The one thing that could bend it is a slot whose
 * centre sits too near the pill's rounded ends, where the hump's feet would run past the
 * flat top. `slotInset` keeps every centre far enough in for that not to happen, so the
 * shape holds on every tab, through every slide and at every width the phone allows.
 *
 * **Icons, not labels.** Each slot is one 28px mark, its name kept as the button's
 * accessible name. The marks change ink on the same 120ms ease as every other piece of text,
 * so a theme change repaints the whole page as one.
 *
 * **The tabs.** Home, Ledger, Stats and Settings, in that order — four screens, and every one
 * of them a screen: nothing in the dock is a placeholder any more.
 *
 * **The surface.** The pill sits on a step-lighter dock fill with its own hairline, and
 * its backdrop is blurred and clipped to the pill's own outline, so the list scrolling
 * behind the dock is softly diffused and never bleeds past the curve.
 *
 * **Haptics.** Every press plays `lightTap()`, fired synchronously inside the tap, which
 * is the only place iOS will tick for its hidden switch. The switch is primed on mount.
 */

/** The screens the dock can take you to. A tab with no screen has no `to`. */
export type NavTab = "dashboard" | "ledger" | "stats" | "settings"

export interface NavItem {
  key: string
  /** The slot's accessible name. Nothing is drawn with it. */
  label: string
  icon: LucideIcon
  /** The screen this slot opens. Undefined for a placeholder. */
  to?: NavTab
}

/** The tabs, in the order they sit along the dock. Adding a screen is one line here. */
const TABS: NavItem[] = [
  { key: "home", label: "Home", icon: Home, to: "dashboard" },
  { key: "ledger", label: "Ledger", icon: ArrowDownUp, to: "ledger" },
  { key: "stats", label: "Stats", icon: BarChart3, to: "stats" },
  { key: "settings", label: "Settings", icon: UserRound, to: "settings" },
]

const SPRING = { type: "spring", stiffness: 300, damping: 25 } as const
/** What a reduced-motion preference gets: the same slide, without the overshoot. */
const GLIDE = { duration: 0.2, ease: "easeOut" } as const

// Dock geometry (px). The SVG is RISE px taller than the bar: that headroom is the hump.
const BAR_H = 72
const RISE = 10
const R = BAR_H / 2 // fully rounded ends
const CIRCLE = 44 // the travelling circle's diameter
const HUMP_HALF = 38 // the hump reaches this far either side of the circle's centre
const HUMP_HANDLE = 14 // the shoulders' handle length: larger is softer

/**
 * The pill with its hump, over `c`, the circle's centre. The shape depends on nothing but
 * the width and `c`: the same curve at every slot, only moved.
 */
function dockPath(w: number, c: number): string {
  const top = RISE
  const bottom = RISE + BAR_H
  const xL = c - HUMP_HALF
  const xR = c + HUMP_HALF
  return [
    `M${R} ${top}`,
    `H${xL}`,
    `C${xL + HUMP_HANDLE} ${top} ${xL + HUMP_HANDLE} 0 ${c} 0`,
    `C${xR - HUMP_HANDLE} 0 ${xR - HUMP_HANDLE} ${top} ${xR} ${top}`,
    `H${w - R}`,
    `A${R} ${R} 0 0 1 ${w - R} ${bottom}`,
    `H${R}`,
    `A${R} ${R} 0 0 1 ${R} ${top}`,
    "Z",
  ].join("")
}

/**
 * The smallest inset from each end that keeps the outermost slot's centre at least
 * `R + HUMP_HALF` from the edge — far enough that the hump's feet land on the flat top.
 * A centre sits `inset · (1 − 1/slots) + width / (2 · slots)` from the edge, so the
 * inset is solved for that. On the owner's 358px dock it comes out at 39px.
 */
function slotInset(width: number, slots: number): number {
  const need = R + HUMP_HALF - width / (2 * slots)
  return Math.max(0, Math.ceil(need / (1 - 1 / slots)))
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

/** A slot's icon: one mark, 28px, centred in its slot. */
const iconClass = "absolute top-1/2 left-1/2 z-[2] size-7 -translate-x-1/2 -translate-y-1/2"

interface BottomNavProps {
  /** The screen on show. `null` (the scanner) leaves the circle where it was. */
  active: NavTab | null
  onChange: (tab: NavTab) => void
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    primeHaptics()
  }, [])

  const slots = TABS.length
  const inset = slotInset(width, slots)
  /** A slot's centre, in the container's own coordinates. */
  const centreOf = (slot: number) => inset + ((width - inset * 2) * (slot + 0.5)) / slots

  const tabIndex = TABS.findIndex((tab) => tab.to !== undefined && tab.to === active)
  const activeSlot = tabIndex >= 0 ? tabIndex : null

  /** The circle's animated left edge, the one number the hump and the circle both follow. */
  const circleX = useMotionValue(centreOf(0) - CIRCLE / 2)
  const widthValue = useMotionValue(width)
  useEffect(() => {
    widthValue.set(width)
  }, [width, widthValue])
  const hump = useTransform([circleX, widthValue], ([left, w]) =>
    dockPath(w as number, (left as number) + CIRCLE / 2),
  )
  /** The blur is clipped to the same outline as the fill, so it never leaves the pill. */
  const outline = useTransform(hump, (d) => `path('${d}')`)

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
    // `centreOf` is derived from the width and inset; naming it here would rebuild the
    // effect on every render and restart the slide on every frame it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot, width, circleX, reduceMotion])

  const slot = (item: NavItem) => {
    const isActive = item.to !== undefined && item.to === active
    const Icon = item.icon
    return (
      <li key={item.key} className="relative flex-1">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={SPRING}
          aria-label={item.label}
          aria-current={isActive ? "page" : undefined}
          onClick={() => {
            lightTap() // must run synchronously inside the tap for iOS
            if (item.to) onChange(item.to)
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
        {/* The frosted backdrop, clipped to the pill and its hump. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 backdrop-blur-md"
          style={{ clipPath: outline }}
        />

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
            className="fill-dock/90 stroke-dock-line"
          />
        </svg>

        {/* The circle, under the mark of the screen on show and behind every mark. */}
        <motion.span
          aria-hidden="true"
          style={{ x: circleX }}
          className="absolute top-6 left-0 z-[1] size-11 rounded-full bg-clay"
        />

        <ul className="absolute inset-x-0 bottom-0 flex h-[72px] items-stretch py-3" style={{ paddingInline: inset }}>
          {TABS.map(slot)}
        </ul>
      </div>
    </nav>
  )
}
