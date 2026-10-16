import { House, ReceiptText, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The screens the rail can show.
 *
 * It used to carry a third tab, **Scan and pay**, which opened the scanner rather
 * than a screen. The scanner is not a place in this app — it is something the owner
 * does *to* a screen — so it moved to the `+` the summaries already wear: the one
 * in the ledger's spend box, and now the one in the balance box on Home.
 */
export type RailTab = "home" | "ledger"

type Item = { id: RailTab; label: string; icon: LucideIcon }

const ITEMS: Item[] = [
  { id: "home", label: "Home", icon: House },
  { id: "ledger", label: "Ledger", icon: ReceiptText },
]

/*
 * Geometry, in px on a 340 x 72 pill. Every tab owns a centre x. The active
 * screen's centre cuts a scoop into the top edge; the tab's disc sits in the
 * scoop with a gap of canvas colour between the two, as in the reference.
 */
const WIDTH = 340
const HEIGHT = 72
const RADIUS = 36
const SCOOP_HALF = 50 // half the scoop's width along the top edge
const SCOOP_DEPTH = 43 // how far the scoop reaches down
const DISC = 48
const DISC_CENTRE_Y = 12 // the active disc's centre sits near the top edge

// Centres keep the whole scoop inside the straight part of the top edge. Two tabs
// sit either side of the middle, where the three used to be spread across it.
const CENTRES = [120, 220]

/** The pill's outline, with a scoop at `centre` (or none). */
function railPath(centre: number | null): string {
  const left = RADIUS
  const right = WIDTH - RADIUS
  const top =
    centre === null
      ? `H${right}`
      : [
          `H${centre - SCOOP_HALF}`,
          `C${centre - 28},0 ${centre - 26},${SCOOP_DEPTH} ${centre},${SCOOP_DEPTH}`,
          `C${centre + 26},${SCOOP_DEPTH} ${centre + 28},0 ${centre + SCOOP_HALF},0`,
          `H${right}`,
        ].join(" ")
  return [
    `M${left},0`,
    top,
    `A${RADIUS},${RADIUS} 0 0 1 ${right},${HEIGHT}`,
    `H${left}`,
    `A${RADIUS},${RADIUS} 0 0 1 ${left},0`,
    "Z",
  ].join(" ")
}

type Props = {
  /** The screen on show. It takes the scoop. */
  active: RailTab
  onSelect: (tab: RailTab) => void
}

export function BottomRail({ active, onSelect }: Props) {
  const activeIndex = ITEMS.findIndex((item) => item.id === active)
  const scoop = CENTRES[activeIndex] ?? null

  return (
    <nav
      aria-label="Screens"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-1/2 z-40 -translate-x-1/2"
      style={{ width: WIDTH, height: HEIGHT }}
    >
      <svg
        aria-hidden="true"
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="absolute inset-0 block"
      >
        {/* The pill is a box like the summaries — the loudest surface — so the
            icons on it are `on-box` and the active disc is the accent. */}
        <path d={railPath(scoop)} className="fill-box" />
      </svg>

      {ITEMS.map((item, i) => {
        const Icon = item.icon
        const isActive = item.id === active
        const centre = CENTRES[i]
        const top = isActive ? DISC_CENTRE_Y - DISC / 2 : HEIGHT / 2 - DISC / 2
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "absolute flex size-12 cursor-pointer items-center justify-center rounded-full outline-none transition-[left,top,background-color,color] duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-box motion-reduce:transition-none",
              isActive ? "bg-tangerine text-ink" : "bg-transparent text-on-box/60 hover:text-on-box",
            )}
            style={{ left: centre - DISC / 2, top }}
          >
            <Icon className="size-[22px]" aria-hidden="true" />
            <span className="sr-only">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
