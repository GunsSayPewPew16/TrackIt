import { useMemo } from "react"
import { motion } from "framer-motion"

import { Tile, tileTitle } from "@/features/analytics/Tile"
import { allocationModel } from "@/lib/analytics"
import type { Row } from "@/lib/types"

const TICKS = [100, 80, 60, 40, 20]

export function AllocationCard({ rows, now }: { rows: Row[]; now: number }) {
  const model = useMemo(() => allocationModel(rows, now), [rows, now])

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
                <motion.div
                  key={month.at}
                  role="img"
                  aria-label={`${month.label}: ${
                    model.segments.length === 0
                      ? "no spending"
                      : model.segments.map((s, k) => `${s.label} ${Math.round(month.shares[k] * 100)}%`).join(", ")
                  }`}
                  className="flex w-4 origin-bottom flex-col-reverse gap-0.5 overflow-hidden rounded-[3px]"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30, delay: i * 0.03 }}
                >
                  {month.shares.map((share, k) =>
                    share > 0 ? (
                      <span
                        key={model.segments[k].key}
                        className="basis-0"
                        style={{ flexGrow: share, backgroundColor: model.segments[k].color }}
                      />
                    ) : null,
                  )}
                </motion.div>
              ))}
            </div>
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
