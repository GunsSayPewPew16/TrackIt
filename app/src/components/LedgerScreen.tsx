import { motion, type PanInfo } from "framer-motion"
import { ArrowLeft, Check, ChevronDown, Plus } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { useCallback, useRef, useState } from "react"

import { RowIcon } from "@/components/RowIcon"
import { ThemeToggle } from "@/components/ThemeToggle"
import { dayOfWeek, dayNumber, monthKey, monthLabel } from "@/lib/format"
import type { Theme } from "@/lib/theme"
import type { CardStyle } from "@/lib/types"
import type { LedgerCard, LedgerModel } from "@/lib/view"

/**
 * Screen 2 of the design: one day's ledger, chosen on a wheel.
 *
 * Everything here is `Ledger.dc.html`, including the two pieces that are geometry
 * rather than styling:
 *
 * - **The notched card.** A card is a 358×128 SVG with a step cut out of its
 *   top-left corner — the tag sits in the cut, the faces sit on the step, and the
 *   rest of the card carries the row. The path is the artboard's, character for
 *   character; the three treatments (plain, clay, sage) are the artboard's own
 *   `std` / `alt` / `inc`, which is why a card's style is a domain value rather
 *   than a class name.
 * - **The wheel.** A capsule is drawn at `translate(x, y) rotateY(-9°×offset)
 *   rotate(4.95°×offset) scale(s)` where `x = 800·sin(0.0863·offset)` and
 *   `y = 800·(1 − cos(0.0863·offset))` — a circle of radius 800 turned on its side,
 *   so the capsules curve away from the middle one the way a physical wheel does.
 *   Only ±3 capsules are reachable; past that they have faded out entirely.
 *
 * The gesture is Framer Motion's. Dragging the wheel pulls the whole row sideways
 * (with a little resistance) and, on release, the capsules spring to their new
 * places — stiffness 300, damping 30 — while a drag of over 24px steps the day,
 * one step per 60px and up to three at a time, which is the artboard's own
 * arithmetic down to its threshold. A drag also fires a click on whatever capsule
 * the finger landed on, so that click is swallowed once per drag; otherwise
 * flicking the wheel would also jump to a neighbouring day.
 *
 * The month above the wheel is the one control the artboard drew but could not
 * use: it is a chevron beside a month name, and the wheel is a fifteen-day window,
 * so on its own it can only ever reach the last fortnight. It is a Radix menu of
 * the months the history touches (`LedgerModel.months`), and picking one moves the
 * window to end on the newest row in it — the wheel's geometry untouched.
 *
 * Two notes on the artboard's behaviour that were kept deliberately: a drag moves
 * *forward* in time when it goes left (the newer days are to the right), and the
 * month above the wheel follows the selected day, so a window that spans a month
 * boundary says which month it is in.
 */

/** The spring every capsule settles on. Stiffness and damping are the spec's. */
const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const

/** How far a drag has to travel before it counts as a swipe rather than a tap. */
const DRAG_THRESHOLD = 24

/** How many days a swipe may cross at once, which is what the artboard allows. */
const MAX_STEPS = 3

/** The wheel's own radius, in pixels, from the artboard's geometry. */
const RADIUS = 800

/** Radians of turn per capsule — one fifteenth of the visible arc. */
const ARC = 0.0863

/** A capsule's scale by how far it is from the middle, again from the artboard. */
const SCALE = [1.15, 1, 0.9, 0.78]
const SCALE_BEYOND = 0.7

/** And its opacity: the middle one is solid, its neighbours are not. */
const OPACITY = [1, 0.6, 0.6, 0.3]

/** The three card treatments, and every colour each one uses. */
const TREATMENTS: Record<
  CardStyle,
  { shape: string; fg: string; tile: string; glyph: string; bar: string }
> = {
  std: {
    shape: "fill-card stroke-line",
    fg: "text-ink",
    tile: "bg-canvas",
    glyph: "text-ink",
    bar: "bg-sage",
  },
  inc: {
    shape: "fill-sage stroke-sage",
    fg: "text-on-sage",
    tile: "bg-on-sage",
    glyph: "text-sage",
    bar: "bg-sage",
  },
  alt: {
    shape: "fill-clay stroke-clay",
    fg: "text-on-clay",
    tile: "bg-on-clay",
    glyph: "text-clay",
    bar: "bg-clay",
  },
}

/** The three tints a face on the stack cycles through, in the artboard's order. */
const FACES = ["bg-sage text-on-sage", "bg-clay text-on-clay", "bg-ink text-canvas"]

/** The notched card's outline, exactly as the artboard draws it. */
const CARD_PATH =
  "M0 20Q0 0 20 0H92C112 0 118 8 124 22C130 36 138 40 156 40H338Q358 40 358 60V108Q358 128 338 128H20Q0 128 0 108Z"

/**
 * Where a capsule sits, and how it looks, at `offset` days from the middle.
 *
 * The rotation is composed of the Y-turn that swings it around the wheel's axis
 * and the small Z-turn that keeps it facing outward, which is what the artboard's
 * `rotateY(-o*9deg) rotate(th)` does; it comes back as props because Framer Motion
 * animates those rather than a composed `transform` string.
 */
function capsule(offset: number) {
  const distance = Math.abs(offset)
  const radians = offset * ARC
  const x = RADIUS * Math.sin(radians)
  const y = RADIUS * (1 - Math.cos(radians))
  return {
    x,
    y,
    rotateY: -offset * 9,
    rotate: radians * (180 / Math.PI),
    scale: SCALE[distance] ?? SCALE_BEYOND,
    opacity: OPACITY[distance] ?? 0,
    zIndex: 10 - distance,
    reachable: distance <= 3,
  }
}

/** One notched card. */
function Card({ card, index }: { card: LedgerCard; index: number }) {
  const skin = TREATMENTS[card.style]
  return (
    <article className="relative h-32 w-full flex-none">
      <svg
        width="358"
        height="128"
        viewBox="0 0 358 128"
        aria-hidden="true"
        className="absolute inset-0 h-32 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <path d={CARD_PATH} strokeWidth={1} className={skin.shape} />
      </svg>

      {/* The pill in the notch, and the faces on its step. */}
      <div
        className={`absolute left-4 top-3 whitespace-nowrap text-[10px] font-bold uppercase leading-4 tracking-[0.03em] ${skin.fg}`}
      >
        {card.tag}
      </div>
      <div className="absolute left-[148px] top-0 flex items-center">
        {card.people.map((initials, position) => (
          <span
            key={initials}
            className={`-mr-2 flex size-8 items-center justify-center rounded-2xl border-2 border-canvas text-[10px] font-bold leading-4 ${FACES[(position + index) % FACES.length]}`}
          >
            {initials}
          </span>
        ))}
        <span className="flex size-8 items-center justify-center rounded-2xl border-2 border-canvas bg-card text-ink">
          <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </div>

      {/* How far into the category's budget this row is. */}
      <div
        role="img"
        aria-label={card.pctAria}
        className="absolute right-0 top-2 flex h-4 items-center gap-2"
      >
        <span className="relative h-1 w-14 rounded-xs bg-line">
          <span
            className={`absolute left-0 top-0 h-1 rounded-xs ${skin.bar}`}
            // The one value that cannot be a class: it comes from the data.
            style={{ width: `${card.pct}%` }}
          />
        </span>
        <span className="text-ink2">{card.pctLabel}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 top-10 flex items-center justify-between p-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative size-14 flex-none" aria-hidden="true">
            <span className={`absolute left-2 top-2 size-10 rotate-45 rounded-xl ${skin.tile}`} />
            <span className={`absolute left-4 top-4 flex ${skin.glyph}`}>
              <RowIcon name={card.icon} className="size-6" />
            </span>
          </span>
          <div className={`min-w-0 ${skin.fg}`}>
            <div className="truncate text-base font-bold leading-6">{card.title}</div>
            <div className="truncate">{card.sub}</div>
          </div>
        </div>
        <div className={`ml-4 flex-none text-right ${skin.fg}`}>
          <div className="font-display text-base font-bold leading-6 tabular-nums">{card.amount}</div>
          <div>{card.time}</div>
        </div>
      </div>
    </article>
  )
}

/**
 * What this screen is given. Named and exported because the screen is fetched rather than
 * imported (`App.tsx` holds it as a `ComponentType<Props>`), and a type is the only thing
 * about it that can be in the entry chunk without dragging the screen back into one.
 */
export type Props = {
  model: LedgerModel
  theme: Theme
  onToggleTheme: () => void
  onBack: () => void
  /** Move the wheel's window to end on the day the picked month's newest row is. */
  onPickMonth: (anchor: number) => void
}

export function LedgerScreen({ model, theme, onToggleTheme, onBack, onPickMonth }: Props) {
  const [selected, setSelected] = useState(model.selected)
  /** Set by a drag, so the click it fires is swallowed instead of selecting. */
  const swiped = useRef(false)

  /**
   * A window the owner has just moved — they picked a month from the menu — opens
   * on its last capsule, which is where the wheel always starts: on what just
   * happened. The selection is adjusted **during render**, which is React's own
   * rule for state that a changed prop invalidates: the new window is drawn with
   * the new selection on its first pass rather than one render behind it. An
   * effect would work too, and would paint the old day's cards for a frame.
   */
  const [window, setWindow] = useState(model.days)
  if (window !== model.days) {
    setWindow(model.days)
    setSelected(model.selected)
  }

  const day = model.days[selected]

  /** Step the wheel, clamped to the window — the artboard's `clamp(9, 23)`. */
  const step = useCallback(
    (steps: number) =>
      setSelected((current) => Math.max(0, Math.min(model.days.length - 1, current + steps))),
    [model.days.length],
  )

  /**
   * A released drag: `offset.x` is how far the wheel was pulled, and the day moves
   * one step per 60px, up to three, with any movement at all counting as one step
   * in the direction it went.
   */
  const onDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      // Under the artboard's threshold a drag is not a swipe, and nothing moves.
      if (Math.abs(info.offset.x) <= DRAG_THRESHOLD) return
      swiped.current = true
      const steps = Math.round(-info.offset.x / 60) || (info.offset.x < 0 ? 1 : -1)
      step(Math.max(-MAX_STEPS, Math.min(MAX_STEPS, steps)))
    },
    [step],
  )

  return (
    <div className="relative min-h-dvh w-full bg-canvas text-ink">
      {/*
        The header's own shape: a filled panel whose lower edge bows upwards.

        The 24px the header sits down the panel is the column's own **padding**,
        not the header's margin, and that is load-bearing: the panel is absolutely
        positioned against this column's padding box, so a margin here would
        collapse out of the column and push the whole screen — panel, wheel and
        rows — 24px down the viewport instead of down the panel.
      */}
      <div className="relative mx-auto w-full max-w-[390px] pt-6">
        <svg
          width="390"
          height="276"
          viewBox="0 0 390 276"
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[276px] w-full"
          preserveAspectRatio="none"
        >
          <path d="M0 0H390V273Q195 231 0 273Z" className="fill-card" />
          <path d="M0 273Q195 231 390 273" strokeWidth={1} className="fill-none stroke-line" />
        </svg>

        <header className="relative flex h-12 items-center justify-between px-4">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the dashboard"
            className="flex size-12 items-center justify-center rounded-3xl border border-line bg-card text-ink"
          >
            <ArrowLeft className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <h1 className="font-display text-lg font-medium leading-6 tracking-[-0.01em]">Daily ledger</h1>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </header>

        {/*
          The month, and the way out of the window: the chevron the artboard draws
          opens the months the history actually touches. The row is the trigger, so
          the control is exactly where the design put it.
        */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={`Month: ${monthLabel(day.at)}. Choose another month`}
              className="relative mx-auto mt-4 flex h-10 items-center justify-center gap-2 border-0 bg-transparent p-0 font-display text-xl font-bold leading-7 tracking-[-0.01em]"
            >
              {monthLabel(day.at)}
              <ChevronDown className="size-5 text-sage" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="center"
              sideOffset={8}
              className="z-50 max-h-[60dvh] min-w-[200px] overflow-y-auto rounded-[20px] border border-line bg-card p-2 text-ink"
            >
              {/* Marked by the month the wheel is showing, which is the one the
                  label above it names. */}
              <DropdownMenu.RadioGroup
                value={monthKey(day.at)}
                onValueChange={(key) => {
                  const picked = model.months.find((month) => month.key === key)
                  if (picked && key !== monthKey(day.at)) onPickMonth(picked.anchor)
                }}
              >
                {model.months.map((month) => (
                  <DropdownMenu.RadioItem
                    key={month.key}
                    value={month.key}
                    className="flex h-10 cursor-pointer items-center justify-between gap-4 rounded-2xl px-3 outline-none data-[highlighted]:bg-line"
                  >
                    <span className="font-display text-sm font-medium tracking-[-0.01em]">
                      {month.label}
                    </span>
                    <DropdownMenu.ItemIndicator>
                      <Check className="size-4 text-sage" strokeWidth={1.5} aria-hidden="true" />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/*
         * The wheel. Framer Motion drags the row as a whole (so a flick feels like
         * pulling a wheel rather than pressing through it) and each capsule then
         * springs to the seat its offset gives it.
         */}
        <motion.div
          role="group"
          aria-label="Select a date"
          className="relative mt-2 h-[120px] overflow-hidden touch-pan-y"
          // A perspective on the container is what gives the Y-turn its depth.
          style={{ perspective: 900 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          dragMomentum={false}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") step(1)
            else if (event.key === "ArrowLeft") step(-1)
          }}
        >
          {model.days.map((entry, index) => {
            const seat = capsule(index - selected)
            const active = index === selected
            return (
              <motion.button
                key={entry.at}
                type="button"
                aria-label={`${dayOfWeek(entry.at)} ${dayNumber(entry.at)} ${monthLabel(entry.at)}`}
                aria-pressed={active}
                onClick={() => {
                  // The click a drag leaves behind is not a choice.
                  if (swiped.current) {
                    swiped.current = false
                    return
                  }
                  setSelected(index)
                }}
                className={`absolute left-[169px] top-4 flex h-20 w-[52px] origin-bottom flex-col items-center justify-center rounded-[26px] ${
                  active ? "bg-sage text-on-sage" : "bg-canvas text-ink"
                }`}
                // Capsules the wheel has turned too far away to reach are inert,
                // which is also what the artboard does.
                style={{ zIndex: seat.zIndex, pointerEvents: seat.reachable ? "auto" : "none" }}
                initial={false}
                animate={{
                  x: seat.x,
                  y: seat.y,
                  rotateY: seat.rotateY,
                  rotate: seat.rotate,
                  scale: seat.scale,
                  opacity: seat.opacity,
                }}
                transition={{ transform: SPRING, opacity: { duration: 0.3 } }}
              >
                <span className="font-display text-2xl font-bold leading-7 tracking-[-0.02em]">
                  {dayNumber(entry.at)}
                </span>
                <span>{dayOfWeek(entry.at)}</span>
              </motion.button>
            )
          })}
        </motion.div>

        {/*
          The day's rows, fading up together each time the wheel lands — the
          artboard's own `inA`/`inB` keyframes, which it re-runs on every change of
          day. The `key` is what restarts that animation: the container is rebuilt
          for the new day, so the old rows leave at once and the new ones rise into
          the space. There is deliberately no exit animation, because the design has
          none — a `mode="wait"` swap would leave the sheet empty for as long as a
          fade lasts, which is the one thing the artboard never does.
        */}
        <div className="relative mt-11 flex flex-col gap-2 px-4 pb-8">
          <motion.div
            key={day.at}
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {day.cards.map((card, index) => (
              <Card key={card.id} card={card} index={index} />
            ))}
            {day.cards.length === 0 && <p className="py-8 text-center text-ink2">{model.emptyNote}</p>}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
