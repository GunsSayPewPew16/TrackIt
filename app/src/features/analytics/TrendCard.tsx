import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { motion } from "framer-motion"

import { Tile, tileTitle } from "@/features/analytics/Tile"
import { balanceModel } from "@/lib/analytics"
import { join } from "@/lib/classes"
import { money, wholeMoney } from "@/lib/format"
import { lightTap } from "@/lib/haptics"
import type { Row } from "@/lib/types"

const H = 168 // plot height
const TOP = 16 // headroom above the plot, for the tooltip
const AXIS = 52 // the left column the money scale is written in
/** A label every fifth day, starting on the 1st. */
const EVERY = 5
/** A flat month still gets a scale of this many paise to draw in. */
const MIN_RANGE = 10_000
const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const
/** While a finger or pointer is down the markers sit exactly on the line, with no spring to lag or overshoot. */
const INSTANT = { duration: 0 } as const

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

export function TrendCard({ rows, now }: { rows: Row[]; now: number }) {
  const gradId = useId().replace(/:/g, "")
  const plot = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)
  const model = useMemo(() => balanceModel(rows, now), [rows, now])
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

  const [idx, setIdx] = useState(today)
  const [dragging, setDragging] = useState(false)
  /** Where the marker sits on the drawn line, in plot coordinates. `null` until a pointer or key moves it. */
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const focusIndex = Math.min(idx, today)

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

  const focus = (i: number) => {
    const next = Math.max(0, Math.min(today, i))
    if (next === focusIndex) return
    setIdx(next)
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

  const p = cursor ?? pts[focusIndex]
  const bubbleX = Math.max(30, Math.min(width - 30, p.x))
  // The scale run backwards: the height of the marker on the line is the money it stands for.
  const focusedCents = cursor ? low + ((H - cursor.y) / H) * (high - low) : (model.days[focusIndex].cents as number)
  const month = new Date(now).toLocaleDateString("en-US", { month: "long" })

  // The labels: every fifth day from the 1st, which is what the card writes under the line.
  const labels = Array.from({ length: Math.ceil(dayCount / EVERY) }, (_, k) => k * EVERY)

  return (
    <Tile className="flex flex-col gap-2">
      <h2 className={tileTitle}>
        Total balance <span className="text-ink2">· {month}</span>
      </h2>

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
          tabIndex={0}
          aria-label={`Total balance, ${month}`}
          aria-valuemin={1}
          aria-valuemax={today + 1}
          aria-valuenow={focusIndex + 1}
          aria-valuetext={`${money(focusedCents)} on day ${dayNumber(focusIndex)}`}
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
                <stop offset="0" style={{ stopColor: "var(--ink)", stopOpacity: 0.18 }} />
                <stop offset="1" style={{ stopColor: "var(--ink)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {/* the guides at every label day, which is what the labels read against */}
            {labels.map((i) => (
              <line key={i} x1={xOf(i)} x2={xOf(i)} y1={0} y2={H} className="stroke-line" strokeWidth={1} />
            ))}
            <path d={AREA} fill={`url(#${gradId})`} />
            <motion.path
              ref={pathRef}
              d={LINE}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="stroke-ink"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </svg>

          {/* the focus bar: translucent gold, fading toward the baseline */}
          <motion.span
            aria-hidden
            className="absolute w-2 -translate-x-1/2 bg-gradient-to-b from-data-gold/70 to-data-gold/0"
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

      {/* The day labels: every fifth day from the 1st, placed on the same scale as the plot. */}
      <div className="relative h-4 text-[10px] leading-4 tracking-[0.01em] text-ink2" style={{ marginLeft: AXIS }}>
        {labels.map((i) => (
          <span
            key={i}
            className={join(
              "absolute -translate-x-1/2",
              Math.abs(focusIndex - i) < EVERY / 2 ? "font-bold text-ink" : "text-ink2",
            )}
            style={{ left: xOf(i) }}
          >
            {dayNumber(i)}
          </span>
        ))}
      </div>
    </Tile>
  )
}
