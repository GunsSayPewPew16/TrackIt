import { useId, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Switch } from "radix-ui"

import { CountUp } from "@/components/CountUp"
import { Tile } from "@/features/analytics/Tile"
import { gaugeModel } from "@/lib/analytics"
import { wholeMoney } from "@/lib/format"
import { lightTap } from "@/lib/haptics"
import type { Row } from "@/lib/types"

const N = 60 // tick count
const C = 69.5 // centre of the 139px dial
const R1 = 60
const R2 = 68
const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const

/** One path holding every 1px radial tick, starting at 12 o'clock. */
const TICKS = Array.from({ length: N }, (_, i) => {
  const a = ((-90 + (i * 360) / N) * Math.PI) / 180
  const p = (r: number) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`
  return `M${p(R1)}L${p(R2)}`
}).join("")

export function GaugeCard({ rows, now }: { rows: Row[]; now: number }) {
  const maskId = useId().replace(/:/g, "")
  const [lastMonth, setLastMonth] = useState(false)
  const model = useMemo(() => gaugeModel(rows, now), [rows, now])
  const spent = lastMonth ? model.lastMonth : model.thisMonth
  const fraction = model.target > 0 ? Math.min(1, spent / model.target) : 0

  return (
    <Tile className="flex h-56 flex-col">
      <div className="relative size-[139px]">
        <svg viewBox="0 0 139 139" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            {/* A thick arc sweeps clockwise to reveal the ticks the spend has reached. */}
            <mask id={maskId}>
              <motion.circle
                cx={C}
                cy={C}
                r={64}
                fill="none"
                stroke="white"
                strokeWidth={14}
                transform={`rotate(-90 ${C} ${C})`}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: fraction }}
                transition={SPRING}
              />
            </mask>
          </defs>
          <path d={TICKS} fill="none" strokeWidth={1} className="stroke-line" />
          <path d={TICKS} fill="none" strokeWidth={1} className="stroke-sage" mask={`url(#${maskId})`} />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {/* The dial is the F&B budget, so it says so: a bare "spent this month" over
              five thousand rupees would be read as all the month's spending. */}
          <p className="w-[88px] text-[10px] leading-3 tracking-[0.01em] text-ink2">
            {lastMonth ? "F&B last month" : "F&B this month"}
          </p>
          <CountUp
            cents={spent}
            format={wholeMoney}
            className="block font-display text-2xl leading-7 font-bold tracking-[-0.03em]"
          />
          <p className="text-[11px] leading-3 tracking-[0.01em] text-ink2">/ {wholeMoney(model.target)}</p>
        </div>
      </div>

      <label className="flex h-12 items-center justify-between gap-2 text-[10px] leading-3 tracking-[0.01em] text-ink2">
        Show last month
        <Switch.Root
          checked={lastMonth}
          onCheckedChange={(v) => {
            lightTap()
            setLastMonth(v)
          }}
          className="relative h-4 w-7 shrink-0 rounded-full bg-line outline-none transition-[background-color] duration-[350ms] ease-[ease] focus-visible:ring-2 focus-visible:ring-ink data-[state=checked]:bg-sage"
        >
          <Switch.Thumb className="block size-3 translate-x-0.5 rounded-full bg-ink transition-[transform,background-color] duration-[350ms] ease-[ease] data-[state=checked]:translate-x-[14px] data-[state=checked]:bg-card" />
        </Switch.Root>
      </label>
    </Tile>
  )
}
