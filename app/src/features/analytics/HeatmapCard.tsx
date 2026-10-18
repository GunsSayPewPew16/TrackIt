import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react"

import { Tile, tileTitle } from "@/features/analytics/Tile"
import { SHEET_WEEKS, heatmapModel, type HeatCell } from "@/lib/analytics"
import { join } from "@/lib/classes"
import { wholeMoney } from "@/lib/format"
import { lightTap } from "@/lib/haptics"
import type { Row } from "@/lib/types"

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]

/**
 * How light the least-spent square is. Any day with spending is at least this far toward the
 * full hue, so a small day still reads as a colour rather than vanishing into the card.
 */
const FLOOR = 0.14

/**
 * A square's fill: the palette's chart hue, mixed into the card by how much was spent. The
 * card is the lightest end and the full hue the heaviest, so the scale runs in one direction
 * and needs no legend. A day with nothing is an outline, not a tint. The hue is the theme's,
 * not the category's: the heatmap answers "how much", and the two greens, blues and olives in
 * the register are what make the same grid feel like the same app on six different screens.
 */
function fillFor(intensity: number): string {
  const mix = Math.round((FLOOR + (1 - FLOOR) * intensity) * 100)
  return `color-mix(in oklab, var(--chart) ${mix}%, var(--card))`
}

const shortDate = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
const monthDay = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
const longDate = (at: number) =>
  new Date(at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

/** A 48px circle: the touch target the design asks for, with its own hairline. */
const stepButton =
  "flex size-12 shrink-0 items-center justify-center rounded-full border border-line text-ink disabled:opacity-40"

export function HeatmapCard({ rows, now }: { rows: Row[]; now: number }) {
  /** 0 is the newest weeks; each page further back is one more window. */
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const model = useMemo(() => heatmapModel(rows, page, now), [rows, page, now])

  const step = (delta: number) => {
    lightTap()
    setPage((was) => Math.max(0, was + delta))
  }

  return (
    <Tile className="flex flex-col gap-2">
      <h2 className={tileTitle}>
        <button
          type="button"
          onClick={() => {
            lightTap()
            setExpanded(true)
          }}
          aria-haspopup="dialog"
          className="flex items-center gap-2 rounded-lg text-left"
        >
          Daily spend
          <Maximize2 className="size-4 text-ink2" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </h2>

      <div className="flex gap-2">
        <div className="grid grid-rows-7 gap-[2px] text-[10px] leading-[10px] tracking-[0.01em] text-ink2" aria-hidden>
          {DAY_LABELS.map((label, i) => (
            <span key={i} className="grid h-[10px] items-center">
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
              style={cell.future || cell.intensity === 0 ? undefined : { backgroundColor: fillFor(cell.intensity) }}
              className={join(
                "size-[10px] rounded-[3px]",
                cell.future ? "invisible" : cell.intensity === 0 ? "border border-line" : "",
              )}
            />
          ))}
        </div>
      </div>

      <p className="text-center text-[12px] leading-4 tracking-[0.01em]">
        <span className="italic">{monthDay(model.start)}</span> — <span className="italic">{shortDate(model.end)}</span>
      </p>

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
        <button type="button" onClick={() => step(-1)} disabled={page === 0} aria-label="Later weeks" className={stepButton}>
          <ChevronRight strokeWidth={1.5} className="size-5" aria-hidden="true" />
        </button>
      </div>

      <AnimatePresence>
        {expanded && <DailySpendSheet rows={rows} now={now} onClose={() => setExpanded(false)} />}
      </AnimatePresence>
    </Tile>
  )
}

/**
 * The two-month overlay: the same grid as the card, drawn with wider squares. Pressing a day
 * reads out that day's total and nothing else. Escape, the close button and a tap on the
 * backdrop all close it, and the page underneath does not scroll while it is open.
 */
function DailySpendSheet({ rows, now, onClose }: { rows: Row[]; now: number; onClose: () => void }) {
  // Portalled to the body: the screen's cards are transformed, which would otherwise pin the overlay to them.
  return createPortal(<DailySpendOverlay rows={rows} now={now} onClose={onClose} />, document.body)
}

function DailySpendOverlay({ rows, now, onClose }: { rows: Row[]; now: number; onClose: () => void }) {
  const [page, setPage] = useState(0)
  const [picked, setPicked] = useState<HeatCell | null>(null)
  const model = useMemo(() => heatmapModel(rows, page, now, SHEET_WEEKS), [rows, page, now])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const step = (delta: number) => {
    lightTap()
    setPicked(null)
    setPage((was) => Math.max(0, was + delta))
  }

  const press = (cell: HeatCell) => {
    lightTap()
    setPicked(cell)
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-spend-title"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="relative w-full max-w-[366px] rounded-[20px] border border-line bg-card p-4"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="daily-spend-title" className="font-display text-lg leading-6 font-medium tracking-[-0.01em]">
              Daily spend
            </h2>
            <p className="font-serif text-[15px] leading-5 text-ink2 italic">The last two months</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close daily spend" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line text-ink">
            <X strokeWidth={1.5} className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="mt-4 flex gap-2">
          <div className="grid grid-rows-7 gap-[3px] text-[10px] leading-[32px] tracking-[0.01em] text-ink2" aria-hidden>
            {DAY_LABELS.map((label, i) => (
              <span key={i} className="grid h-8 items-center">
                {label}
              </span>
            ))}
          </div>
          <div
            role="group"
            aria-label={`Days from ${shortDate(model.start)} to ${shortDate(model.end)}`}
            className="grid grid-flow-col grid-rows-7 gap-[3px]"
          >
            {model.cells.map((cell, i) => {
              const isPicked = picked?.key === cell.key
              return (
                <motion.button
                  type="button"
                  key={cell.key}
                  disabled={cell.future}
                  onClick={() => press(cell)}
                  aria-label={`${longDate(cell.at)}: ${wholeMoney(cell.cents)}`}
                  aria-pressed={isPicked}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, ease: "easeOut", delay: Math.floor(i / 7) * 0.02 }}
                  style={cell.future || cell.intensity === 0 ? undefined : { backgroundColor: fillFor(cell.intensity) }}
                  className={join(
                    "size-8 rounded-[6px] p-0",
                    cell.future ? "invisible" : cell.intensity === 0 ? "border border-line" : "",
                    isPicked && "ring-2 ring-ink ring-offset-2 ring-offset-card",
                  )}
                />
              )
            })}
          </div>
        </div>

        <div className="mt-4 min-h-[68px]" aria-live="polite">
          {picked ? (
            <>
              <p className="text-[12px] leading-4 text-ink2">{longDate(picked.at)}</p>
              <p className="font-display text-3xl leading-9 font-bold tracking-[-0.03em] tabular-nums">
                {wholeMoney(picked.cents)}
              </p>
            </>
          ) : (
            <p className="pt-2 text-[13px] leading-5 text-ink2">Press a day to see what it came to.</p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!model.canGoEarlier}
            aria-label="Earlier two months"
            className={stepButton}
          >
            <ChevronLeft strokeWidth={1.5} className="size-5" aria-hidden="true" />
          </button>
          <p className="text-[12px] leading-4 tracking-[0.01em]">
            <span className="italic">{monthDay(model.start)}</span> — <span className="italic">{shortDate(model.end)}</span>
          </p>
          <button type="button" onClick={() => step(-1)} disabled={page === 0} aria-label="Later two months" className={stepButton}>
            <ChevronRight strokeWidth={1.5} className="size-5" aria-hidden="true" />
          </button>
        </div>
      </motion.section>
    </motion.div>
  )
}
