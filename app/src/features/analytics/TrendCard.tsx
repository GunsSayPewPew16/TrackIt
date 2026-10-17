import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { motion } from "framer-motion"

import { Tile, tileTitle } from "@/features/analytics/Tile"
import { trendModel } from "@/lib/analytics"
import { join } from "@/lib/classes"
import { wholeMoney } from "@/lib/format"
import { lightTap } from "@/lib/haptics"
import type { Row } from "@/lib/types"

const W = 111 // plot width
const H = 96 // plot height
const TOP = 24 // headroom for the tooltip
const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const

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
  const model = useMemo(() => trendModel(rows, now), [rows, now])
  const last = model.days.length - 1
  const [idx, setIdx] = useState(last)

  const pts = model.days.map((day, i) => ({ x: (i * W) / last, y: H - (day.cents / model.max) * H }))
  const LINE = splinePath(pts)
  const AREA = `${LINE}L${W} ${H}L0 ${H}Z`
  const AXIS = [
    { label: wholeMoney(model.max), y: 0 },
    { label: wholeMoney(model.max / 2), y: H / 2 },
    { label: wholeMoney(0), y: H },
  ]

  const dayOf = (i: number) => new Date(model.days[i].at).getDate()

  const focus = (i: number) => {
    const next = Math.max(0, Math.min(last, i))
    if (next === idx) return
    setIdx(next)
    lightTap() // a light click each time the focus snaps to a new point
  }
  const fromPointer = (e: PointerEvent) => {
    const r = plot.current!.getBoundingClientRect()
    focus(Math.round(((e.clientX - r.left) / r.width) * last))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") focus(idx + 1)
    if (e.key === "ArrowLeft") focus(idx - 1)
  }

  const p = pts[idx]
  const bubbleX = Math.max(22, Math.min(W - 22, p.x))

  return (
    <Tile className="flex h-56 flex-col gap-2">
      <h2 className={tileTitle}>Spend velocity</h2>

      <div className="relative h-[120px]">
        {AXIS.map((a) => (
          <span
            key={a.y}
            className="absolute left-0 -translate-y-1/2 text-[10px] leading-3 tracking-[0.01em] text-ink2"
            style={{ top: TOP + a.y }}
          >
            {a.label}
          </span>
        ))}

        <div
          ref={plot}
          role="slider"
          tabIndex={0}
          aria-label={`Daily spend, last ${model.days.length} days`}
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={idx}
          aria-valuetext={`${wholeMoney(model.days[idx].cents)} on day ${dayOf(idx)}`}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            pressed.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            fromPointer(e)
          }}
          onPointerMove={(e) => pressed.current && fromPointer(e)}
          onPointerUp={() => (pressed.current = false)}
          onPointerCancel={() => (pressed.current = false)}
          className="absolute top-0 right-0 h-full w-[111px] touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute left-0 overflow-visible" style={{ top: TOP }} aria-hidden>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
                <stop offset="0" style={{ stopColor: "var(--ink)", stopOpacity: 0.2 }} />
                <stop offset="1" style={{ stopColor: "var(--ink)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <path d={AREA} fill={`url(#${gradId})`} />
            <motion.path
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
            transition={SPRING}
          />
          <motion.span
            aria-hidden
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-card"
            initial={false}
            animate={{ left: p.x, top: TOP + p.y }}
            transition={SPRING}
          />
          <motion.span
            aria-hidden
            className="absolute top-0 -translate-x-1/2 rounded-full bg-black px-2 text-[10px] leading-5 font-bold tracking-[0.01em] whitespace-nowrap text-[#F4F0EA]"
            initial={false}
            animate={{ left: bubbleX }}
            transition={SPRING}
          >
            {wholeMoney(model.days[idx].cents)}
          </motion.span>
        </div>
      </div>

      <div className="relative ml-7 h-4 text-[10px] leading-4 tracking-[0.01em]">
        {[0, 4, 8, last].map((i) => (
          <span
            key={i}
            className={join("absolute -translate-x-1/2", Math.abs(idx - i) < 2 ? "font-bold text-ink" : "text-ink2")}
            style={{ left: pts[i].x }}
          >
            {dayOf(i)}
          </span>
        ))}
      </div>
    </Tile>
  )
}
