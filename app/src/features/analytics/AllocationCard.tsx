import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

import { Tile, tileTitle } from "@/features/analytics/Tile"
import { allocationModel } from "@/lib/analytics"
import { wholeMoney } from "@/lib/format"
import type { Row } from "@/lib/types"

const TICKS = [100, 80, 60, 40, 20]
/** How long a breakdown stays up after a press, unless the owner presses the bar again first. */
const POPUP_MS = 3200
/** The breakdown's width: enough for a category name and a rupee figure on one line. */
const POPUP_W = 176

/** The bar that is open, and where its breakdown sits over the chart, in px from the left. */
type Open = { index: number; left: number }

export function AllocationCard({ rows, now }: { rows: Row[]; now: number }) {
  const model = useMemo(() => allocationModel(rows, now), [rows, now])
  const [open, setOpen] = useState<Open | null>(null)

  // Each press starts a fresh clock, and the breakdown leaves on its own once it has been read.
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => setOpen(null), POPUP_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  /** Press a bar to open its breakdown; press the same bar again to close it. */
  const press = (index: number, bar: HTMLButtonElement) => {
    if (open?.index === index) {
      setOpen(null)
      return
    }
    // The bar and the breakdown share the chart's box, so the bar's offset is the same as the popup's.
    const chart = bar.offsetParent as HTMLElement
    const centre = bar.offsetLeft + bar.offsetWidth / 2
    const left = Math.max(0, Math.min(centre - POPUP_W / 2, chart.clientWidth - POPUP_W))
    setOpen({ index, left })
  }

  const shown = open ? model.months[open.index] : null

  return (
    <Tile className="flex h-[360px] flex-col gap-2">
      <h2 className={tileTitle}>Monthly allocation</h2>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] leading-4 tracking-[0.01em] text-ink2">
        {model.segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1">
            <span className="size-2 rounded-sm" style={{ backgroundColor: segment.color }} aria-hidden />
            {segment.label}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex min-h-0 flex-1">
        {/* bars and guides */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1">
            {TICKS.map((tick) => (
              <span key={tick} className="absolute inset-x-0 h-px bg-line" style={{ top: `${100 - tick}%` }} aria-hidden />
            ))}
            <div className="absolute inset-0 flex items-stretch justify-between pr-2">
              {model.months.map((month, i) => (
                <motion.button
                  type="button"
                  key={month.at}
                  aria-label={`${month.name}: ${
                    month.total === 0
                      ? "nothing spent"
                      : model.segments
                          .flatMap((segment, k) => (month.cents[k] > 0 ? [`${segment.label} ${wholeMoney(month.cents[k])}`] : []))
                          .join(", ")
                  }`}
                  aria-expanded={open?.index === i}
                  onClick={(e) => press(i, e.currentTarget)}
                  whileTap={{ scaleX: 0.8 }}
                  className="flex w-4 cursor-pointer origin-bottom flex-col-reverse gap-0.5 overflow-hidden rounded-[3px] border-0 bg-transparent p-0"
                  initial={false}
                >
                  {/* The first child sits at the bottom of a column-reversed stack: the biggest spend. */}
                  {month.order.map((k) => (
                    <span
                      key={model.segments[k].key}
                      className="basis-0"
                      style={{ flexGrow: month.shares[k], backgroundColor: model.segments[k].color }}
                    />
                  ))}
                </motion.button>
              ))}
            </div>

            <AnimatePresence>
              {open && shown && (
                <motion.div
                  key={open.index}
                  role="status"
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  style={{ left: open.left, width: POPUP_W }}
                  className="absolute top-0 z-10 rounded-[16px] border border-dock-line bg-dock p-3"
                >
                  <p className="text-[11px] leading-4 tracking-[0.01em] text-ink2">{shown.name}</p>
                  <p className="font-display text-xl leading-7 font-bold tracking-[-0.03em] tabular-nums">
                    {wholeMoney(shown.total)}
                  </p>
                  {shown.order.length === 0 ? (
                    <p className="mt-2 text-[11px] leading-4 text-ink2">Nothing spent that month</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1.5 text-[11px] leading-4 tracking-[0.01em]">
                      {shown.order.map((k) => (
                        <li key={model.segments[k].key} className="flex items-center gap-2">
                          <span
                            className="size-2 flex-none rounded-sm"
                            style={{ backgroundColor: model.segments[k].color }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate text-ink2">{model.segments[k].label}</span>
                          <span className="tabular-nums">{wholeMoney(shown.cents[k])}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-2 flex h-8 items-start justify-between pr-2 text-[10px] leading-4 tracking-[0.01em] text-ink2">
            {model.months.map((month) => (
              <span key={month.at} className="grid w-4 justify-center [writing-mode:vertical-rl]">
                {month.label}
              </span>
            ))}
          </div>
        </div>

        {/* the y axis, flush right */}
        <div className="relative w-9 text-right text-[10px] leading-4 tracking-[0.01em] text-ink2" aria-hidden>
          <div className="absolute inset-x-0 top-0 bottom-10">
            {TICKS.map((tick) => (
              <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - tick}%` }}>
                {tick}%
              </span>
            ))}
          </div>
        </div>
      </div>
    </Tile>
  )
}
