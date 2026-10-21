import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown } from "lucide-react"

import { Tile, tileTitle } from "@/features/analytics/Tile"
import { balanceModel } from "@/lib/analytics"
import { BALANCE_SPANS, rememberBalanceSpan, storedBalanceSpan, type BalanceSpan } from "@/lib/balanceRange"
import { join } from "@/lib/classes"
import { money, wholeMoney } from "@/lib/format"
import { lightTap } from "@/lib/haptics"
import type { Row } from "@/lib/types"

const H = 168 // plot height
const TOP = 16 // headroom above the plot, for the tooltip
const AXIS = 52 // the left column the money scale is written in
/** A label every fifth day, starting on the 1st, when the chart shows one month. */
const EVERY = 5
/** A flat month still gets a scale of this many paise to draw in. */
const MIN_RANGE = 10_000
const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const
/** While a finger or pointer is down the markers sit exactly on the line, with no spring to lag or overshoot. */
const INSTANT = { duration: 0 } as const

const shortMonth = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short" })

/** Catmull-Rom spline converted to cubic Béziers: smooth, and it passes through every point. */
function splinePath(pts: { x: number; y: number }[]): string {
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

export function TrendCard({
  rows,
  now,
  openingCents,
}: {
  rows: Row[]
  now: number
  /** What both accounts held before the first row — the dashboard's own openings, summed. */
  openingCents: number
}) {
  const gradId = useId().replace(/:/g, "")
  const plot = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)

  /** How many months the chart covers. Read once, so a reload opens on the range last picked. */
  const [span, setSpan] = useState<BalanceSpan>(storedBalanceSpan)
  const [menuOpen, setMenuOpen] = useState(false)

  const model = useMemo(() => balanceModel(rows, now, openingCents, span), [rows, now, openingCents, span])
  const dayCount = model.days.length
  const today = model.today

  // The plot is as wide as the card allows, so it is measured rather than drawn to a number.
  const [width, setWidth] = useState(300)
  useEffect(() => {
    const el = plot.current
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The dialogue closes on a tap outside it, or on Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: globalThis.PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  /** The day the marker is on, or `null` for today. Changing the range puts it back on today. */
  const [picked, setPicked] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  /** Where the marker sits on the drawn line, in plot coordinates. `null` until a pointer or key moves it. */
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const focusIndex = Math.min(picked ?? today, today)

  // The scale: the drawn range with 6% air above and below it, and a minimum span so a flat
  // month still draws a line rather than a flat edge.
  const range = Math.max(model.high - model.low, MIN_RANGE)
  const mid = (model.high + model.low) / 2
  const low = mid - range * 0.56
  const high = mid + range * 0.56
  const xOf = (i: number) => (i * width) / (dayCount - 1)
  const yOf = (cents: number) => H - ((cents - low) / (high - low)) * H

  const pts = model.days.slice(0, today + 1).map((day, i) => ({ x: xOf(i), y: yOf(day.cents as number) }))
  const LINE = splinePath(pts)
  const AREA = `${LINE}L${xOf(today).toFixed(1)} ${H}L0 ${H}Z`
  const dayNumber = (i: number) => new Date(model.days[i].at).getDate()
  const dateLabel = (i: number) =>
    new Date(model.days[i].at).toLocaleDateString("en-US", { day: "numeric", month: "short" })

  const focus = (i: number) => {
    const next = Math.max(0, Math.min(today, i))
    if (next === focusIndex) return
    setPicked(next)
    lightTap() // a light click each time the focus snaps to a new day
  }
  /**
   * The point on the drawn line at a given x. The curve is monotonic in x, so a bisection on its
   * length lands on the exact point the line passes through, not a day's point beside it.
   */
  const pointAtX = (px: number) => {
    const path = pathRef.current
    if (!path) return null
    let lo = 0
    let hi = path.getTotalLength()
    for (let step = 0; step < 32; step++) {
      const mid = (lo + hi) / 2
      if (path.getPointAtLength(mid).x < px) lo = mid
      else hi = mid
    }
    const at = path.getPointAtLength((lo + hi) / 2)
    return { x: at.x, y: at.y }
  }

  const fromPointer = (e: PointerEvent) => {
    const r = plot.current!.getBoundingClientRect()
    const px = Math.max(0, Math.min(xOf(today), e.clientX - r.left))
    setCursor(pointAtX(px))
    // The nearest day drives the labels, the aria value and the light tick; the marker itself does not snap.
    focus(Math.round(px / xOf(1)))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") focus(focusIndex + 1)
    if (e.key === "ArrowLeft") focus(focusIndex - 1)
    // A key puts the marker back on a day's own point.
    setCursor(null)
  }

  const choose = (next: BalanceSpan) => {
    setMenuOpen(false)
    if (next === span) return
    rememberBalanceSpan(next)
    setSpan(next)
    setPicked(null)
    setCursor(null)
  }

  const p = cursor ?? pts[focusIndex]
  const bubbleX = Math.max(30, Math.min(width - 30, p.x))
  // The scale run backwards: the height of the marker on the line is the money it stands for.
  const focusedCents = cursor ? low + ((H - cursor.y) / H) * (high - low) : (model.days[focusIndex].cents as number)
  const month = new Date(now).toLocaleDateString("en-US", { month: "long" })
  const title = span === 1 ? month : `${shortMonth(model.days[0].at)} – ${shortMonth(now)}`

  /*
   * The labels. One month: every fifth day from the 1st, as the card always wrote them. Several
   * months: each month's first day, named by its month, because five-day labels over six months
   * would crowd the scale. Each label owns the days from its own to the next label's.
   */
  const monthStarts = model.days.flatMap((day, i) => (new Date(day.at).getDate() === 1 ? [i] : []))
  const labels: { from: number; to: number; text: string }[] =
    span === 1
      ? Array.from({ length: Math.ceil(dayCount / EVERY) }, (_, k) => ({
          from: k * EVERY,
          to: k * EVERY + EVERY,
          text: String(dayNumber(k * EVERY)),
        }))
      : monthStarts.map((from, k) => ({
          from,
          to: monthStarts[k + 1] ?? dayCount,
          text: shortMonth(model.days[from].at),
        }))
  const focusedLabel = labels.find((label) => focusIndex >= label.from && focusIndex < label.to)

  return (
    <Tile className="flex flex-col gap-2">
      <div ref={menu} className="relative self-start">
        <h2 className={tileTitle}>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => {
              lightTap()
              setMenuOpen((open) => !open)
            }}
            className="inline-flex items-center gap-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            Total balance <span className="text-ink2">· {title}</span>
            <ChevronDown strokeWidth={1.5} className="size-4 text-ink2" aria-hidden="true" />
          </button>
        </h2>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="dialog"
              aria-label="Chart range"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full z-10 mt-2 flex w-[180px] flex-col gap-1 rounded-2xl border border-line bg-card p-1.5"
            >
              {BALANCE_SPANS.map((option) => {
                const active = option.months === span
                return (
                  <button
                    key={option.months}
                    type="button"
                    aria-pressed={active}
                    onClick={() => choose(option.months)}
                    className={join(
                      "h-9 rounded-xl px-3 text-left text-[12px] leading-4 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ink",
                      active ? "bg-sage text-on-sage" : "text-ink",
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative flex" style={{ height: H + TOP }}>
        {/* The money scale, flush left, at the top and bottom of the drawn range. */}
        <div className="relative shrink-0 text-[10px] leading-3 tracking-[0.01em] text-ink2" style={{ width: AXIS }} aria-hidden>
          <span className="absolute left-0 -translate-y-1/2" style={{ top: TOP + yOf(model.high) }}>
            {wholeMoney(model.high)}
          </span>
          <span className="absolute left-0 -translate-y-1/2" style={{ top: TOP + yOf(model.low) }}>
            {wholeMoney(model.low)}
          </span>
        </div>

        <div
          ref={plot}
          role="slider"
          // Scrubbing the plot is itself a sideways drag; the screen swipe leaves it alone.
          data-swipe-ignore
          tabIndex={0}
          aria-label={`Total balance, ${title}`}
          aria-valuemin={1}
          aria-valuemax={today + 1}
          aria-valuenow={focusIndex + 1}
          aria-valuetext={`${money(focusedCents)} on ${dateLabel(focusIndex)}`}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            pressed.current = true
            setDragging(true)
            e.currentTarget.setPointerCapture(e.pointerId)
            fromPointer(e)
          }}
          onPointerMove={(e) => pressed.current && fromPointer(e)}
          onPointerUp={() => {
            pressed.current = false
            setDragging(false)
          }}
          onPointerCancel={() => {
            pressed.current = false
            setDragging(false)
          }}
          className="relative h-full min-w-0 flex-1 touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="absolute left-0 overflow-visible" style={{ top: TOP }} aria-hidden>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
                <stop offset="0" style={{ stopColor: "var(--chart)", stopOpacity: 0.22 }} />
                <stop offset="1" style={{ stopColor: "var(--chart)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {/* the guides at every label, which is what the labels read against */}
            {labels.map((label) => (
              <line key={label.from} x1={xOf(label.from)} x2={xOf(label.from)} y1={0} y2={H} className="stroke-line" strokeWidth={1} />
            ))}
            <path d={AREA} fill={`url(#${gradId})`} />
            <motion.path
              ref={pathRef}
              d={LINE}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="stroke-chart"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </svg>

          {/* the focus bar: the theme's warning accent, fading toward the baseline */}
          <motion.span
            aria-hidden
            className="absolute w-2 -translate-x-1/2 bg-gradient-to-b from-clay/70 to-clay/0"
            initial={false}
            animate={{ left: p.x, top: TOP + p.y, height: H - p.y }}
            transition={dragging ? INSTANT : SPRING}
          />
          <motion.span
            aria-hidden
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-card"
            initial={false}
            animate={{ left: p.x, top: TOP + p.y }}
            transition={dragging ? INSTANT : SPRING}
          />
          {/*
            The one surface in the app that is **not** a palette token, on purpose: this
            bubble rides the chart wherever the finger is, so it has to be the highest
            contrast thing on the card in every palette. `--ink` over `--canvas` inverts
            per palette (dark text on a light one), and either half of that pair vanishes
            against the other on half the palettes, so it is the fixed black-and-cream
            pair the artboard drew — see the palettes in `index.css`.
          */}
          <motion.span
            aria-hidden
            className="absolute top-0 -translate-x-1/2 rounded-full bg-black px-2 text-[10px] leading-5 font-bold tracking-[0.01em] whitespace-nowrap text-[#F4F0EA]"
            initial={false}
            animate={{ left: bubbleX }}
            transition={dragging ? INSTANT : SPRING}
          >
            {money(focusedCents)}
          </motion.span>
        </div>
      </div>

      {/* The labels, placed on the same scale as the plot. */}
      <div className="relative h-4 text-[10px] leading-4 tracking-[0.01em] text-ink2" style={{ marginLeft: AXIS }}>
        {labels.map((label) => (
          <span
            key={label.from}
            className={join(
              "absolute -translate-x-1/2",
              label === focusedLabel ? "font-bold text-ink" : "text-ink2",
            )}
            style={{ left: xOf(label.from) }}
          >
            {label.text}
          </span>
        ))}
      </div>
    </Tile>
  )
}
