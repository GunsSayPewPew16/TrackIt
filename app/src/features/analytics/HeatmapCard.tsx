import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Tile, tileTitle } from "@/features/analytics/Tile"
import { heatmapModel, type HeatLevel } from "@/lib/analytics"
import { join } from "@/lib/classes"
import { wholeMoney } from "@/lib/format"
import { lightTap } from "@/lib/haptics"
import type { Row } from "@/lib/types"

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]

/** Zero spend is an outline only; the four tiers are the data red at 20, 40, 75 and 100%. */
const LEVEL: Record<HeatLevel, string> = {
  0: "border border-line",
  1: "bg-data-red/20",
  2: "bg-data-red/40",
  3: "bg-data-red/75",
  4: "bg-data-red",
}

const shortDate = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
const monthDay = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })

/** A 48px circle: the touch target the design asks for, with its own hairline. */
const stepButton =
  "flex size-12 shrink-0 items-center justify-center rounded-full border border-line text-ink disabled:opacity-40"

export function HeatmapCard({ rows, now }: { rows: Row[]; now: number }) {
  /** 0 is the newest weeks; each page further back is one more window. */
  const [page, setPage] = useState(0)
  const model = useMemo(() => heatmapModel(rows, page, now), [rows, page, now])

  const step = (delta: number) => {
    lightTap()
    setPage((was) => Math.max(0, was + delta))
  }

  return (
    <Tile className="flex flex-col gap-2">
      <h2 className={tileTitle}>Daily spend</h2>

      <div className="flex gap-2">
        <div className="grid grid-rows-7 gap-[2px] text-[10px] leading-3 tracking-[0.01em] text-ink2" aria-hidden>
          {DAY_LABELS.map((label, i) => (
            <span key={i} className="grid h-3 items-center">
              {label}
            </span>
          ))}
        </div>
        <div
          role="img"
          aria-label={`Daily spending from ${shortDate(model.start)} to ${shortDate(model.end)}`}
          className="grid grid-flow-col grid-rows-7 gap-[2px]"
        >
          {model.cells.map((cell, i) => (
            <motion.span
              key={cell.key}
              title={cell.future ? undefined : `${monthDay(cell.at)}: ${wholeMoney(cell.cents)}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: Math.floor(i / 7) * 0.015 }}
              className={join("size-3 rounded-[3px]", cell.future ? "invisible" : LEVEL[cell.level])}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!model.canGoEarlier}
          aria-label="Earlier weeks"
          className={stepButton}
        >
          <ChevronLeft strokeWidth={1.5} className="size-5" aria-hidden="true" />
        </button>
        <p className="text-[13px] leading-4 tracking-[0.01em]">
          <span className="italic">{monthDay(model.start)}</span> — <span className="italic">{shortDate(model.end)}</span>
        </p>
        <button type="button" onClick={() => step(-1)} disabled={page === 0} aria-label="Later weeks" className={stepButton}>
          <ChevronRight strokeWidth={1.5} className="size-5" aria-hidden="true" />
        </button>
      </div>
    </Tile>
  )
}
