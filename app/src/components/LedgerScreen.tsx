import { motion } from "framer-motion"
import { Check, ChevronDown, Plus } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { useState } from "react"

import { DateWheel } from "@/components/DateWheel"
import { RowIcon } from "@/components/RowIcon"
import { ThemeToggle } from "@/components/ThemeToggle"
import { monthKey, monthLabel } from "@/lib/format"
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
 *   top-left corner — the faces sit on the step and the rest of the card carries
 *   the row. The cut stays empty: the artboard's category tag in it was removed at
 *   the owner's request. The path is the artboard's, character for character; the
 *   three treatments (plain, clay, sage) are the artboard's own `std` / `alt` /
 *   `inc`, which is why a card's style is a domain value rather than a class name.
 * - **The date container.** The capsules and their geometry live in
 *   `components/DateWheel.tsx`: a row on a circle of radius 800 that is dragged
 *   sideways, snapped to whichever capsule is nearest the middle, with a haptic tick
 *   as each one crosses. It is the owner's newer container, and unlike the wheel it
 *   replaced, the row travels with the finger rather than stepping on release.
 *
 * The month above the wheel is the one control the artboard drew but could not use:
 * it is a chevron beside a month name, and the wheel holds **one month**, so on its
 * own it can only reach the month it is in. It is a Radix menu of the months the
 * history touches (`LedgerModel.months`), and picking one rebuilds the wheel for that
 * month, opening on the day its newest row happened — the geometry untouched.
 *
 * Two notes on the artboard's behaviour that were kept deliberately: a drag moves
 * *forward* in time when it goes left (the newer days are to the right), and the
 * month above the wheel follows the selected day, which now only matters while a
 * month change is being rebuilt behind it.
 */

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

      {/* The faces on the notch's step. The category's own label is not drawn: the
          owner asked for the top of the card to carry nothing. */}
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
  /** Move the wheel's window to end on the day the picked month's newest row is. */
  onPickMonth: (anchor: number) => void
}

export function LedgerScreen({ model, theme, onToggleTheme, onPickMonth }: Props) {
  const [selected, setSelected] = useState(model.selected)

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

  return (
    <div className="relative min-h-dvh w-full bg-canvas text-ink">
      {/*
        The header's own shape: a filled panel whose lower edge bows upwards.

        The space the header sits down the panel is the column's own **padding**
        (`pt-safe` — the artboard's 24px, plus the notch), not the header's margin, and
        that is load-bearing: the panel is absolutely positioned against this column's
        padding box, so a margin here would collapse out of the column and push the
        whole screen — panel, wheel and rows — down the viewport instead of down the
        panel. The panel itself deliberately stays at the top of the page: it is a
        surface the notch can sit over, and the header is what has to keep clear of it.

        **The arc travels with the notch.** The panel is a fixed 276px drawing measured
        from the top of the page, but everything the design aligned it *with* — the
        header, the month and the wheel — starts one safe-area inset lower on a phone.
        On a desk the inset is zero and the capsules sit above the curve, as the
        artboard draws them; on the owner's iPhone the wheel dropped ~47px while the
        curve stayed put, so the capsules fell below it. The panel therefore keeps its
        geometry and is moved down by `safe-area-inset-top` itself: a strip of the card
        colour still covers the notch at the top of the page, and the drawing below it
        is the artboard's, unchanged in size and curvature.

        **The strip is fixed, and that is the whole point.** iOS 26 does not paint the
        status bar with `theme-color`; Safari samples the page along the top edge and
        tints the bar with what it finds. The centre point is hit-tested, and only a
        `fixed` or `sticky` element may answer, and only if it spans the viewport's
        width and is more than 10px tall. An `absolute` strip is invisible to that
        lookup, so the bar fell through to the page background — the canvas — and the
        owner saw a canvas band above a card-coloured panel. Fixed, full-width and
        `safe-area-inset-top` tall, the strip is the top edge Safari finds, and the
        status bar wears the panel's colour. `pointer-events: none` keeps it out of
        the thumb's way; it is decoration, not a control.
      */}
      <div className="relative mx-auto w-full max-w-[390px] pt-safe">
        {/* The part of the panel that sits under the status bar and the notch. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 bg-card"
          style={{ height: "env(safe-area-inset-top, 0px)" }}
        />
        <svg
          width="390"
          height="276"
          viewBox="0 0 390 276"
          aria-hidden="true"
          className="absolute inset-x-0 h-[276px] w-full"
          style={{ top: "env(safe-area-inset-top, 0px)" }}
          preserveAspectRatio="none"
        >
          <path d="M0 0H390V273Q195 231 0 273Z" className="fill-card" />
          <path d="M0 273Q195 231 390 273" strokeWidth={1} className="fill-none stroke-line" />
        </svg>

        <header className="relative flex h-12 items-center justify-between px-4">
          {/* The same heading as the greeting and the analytics screen: the serif at 28px, with its first word in italic. */}
          <h1 className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.01em] text-ink">
            <em className="italic">Daily</em> ledger
          </h1>
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
         * The date container. Its `key` is the window's first day, so picking a month
         * remounts the row at the new window's end rather than dragging the old one
         * across months it does not hold. Everything else — the drag, the snap, the
         * tick — is the container's own (`components/DateWheel.tsx`).
         */}
        <DateWheel
          key={model.days[0]?.at ?? 0}
          days={model.days}
          initialIndex={model.selected}
          onActiveChange={setSelected}
          className="mt-2"
        />

        {/*
          The day's rows, fading up together each time the wheel lands — the
          artboard's own `inA`/`inB` keyframes, which it re-runs on every change of
          day. The `key` is what restarts that animation: the container is rebuilt
          for the new day, so the old rows leave at once and the new ones rise into
          the space. There is deliberately no exit animation, because the design has
          none — a `mode="wait"` swap would leave the sheet empty for as long as a
          fade lasts, which is the one thing the artboard never does.
        */}
        <div className="relative mt-11 flex flex-col gap-2 px-4 pb-nav">
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
