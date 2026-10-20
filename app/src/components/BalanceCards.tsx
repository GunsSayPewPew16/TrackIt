import { animate, motion, motionValue, useReducedMotion, type MotionValue } from "framer-motion"
import {
  Banknote,
  Coins,
  CreditCard,
  Gift,
  Landmark,
  PiggyBank,
  Plane,
  Plus,
  QrCode,
  ShoppingBag,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { CountUp } from "@/components/CountUp"
import { useLongPress } from "@/hooks/useLongPress"
import { useTick } from "@/hooks/useTick"
import { money } from "@/lib/format"
import type { CardIconName, CardTone } from "@/lib/customCards"
import type { BalanceCard } from "@/lib/view"

/**
 * The dashboard's first band: one card per account, and the owner's own cards after them,
 * in a stack you pull down.
 *
 * **The stack.** A 224px band holds the cards. The front card is 358×184 at the band's 40px
 * top inset; every card behind it peeks out above the front one. The peek is **fixed at
 * 40px**, however many cards there are: with two cards the one behind peeks the whole 40px,
 * and each extra card shares that same 40px, so more cards means less of each and fewer
 * means more. `restFor` is the whole of that rule — card `rank` behind the front sits at
 * `-40 × rank / (count − 1)`, so the furthest one is always at the top of the band and the
 * nearest one always just above the front card.
 *
 * **A card's colour belongs to the card, not the seat.** UPI is always the ink card and Cash
 * always the clay one; a card the owner made wears the palette colour it was given. The text
 * and the shape travel together (`skinOf`), and the only thing a seat decides is depth — its
 * `y`, its z-order, and which card the thumb can grab.
 *
 * **The pill stays put.** "Add Record" is one element pinned to the band, in the notch at the
 * front card's bottom-right, so a drag cannot carry it. It opens the manual-entry sheet.
 *
 * **Nothing is ever drawn below the band.** A release is the re-stack: the pulled card travels
 * to the back seat while the card behind travels into the front one, in one movement with no
 * drop and no timer.
 *
 * **The movement starts on the frame the finger lifts.** The seats are motion values written
 * directly; the release starts them in the handler *and* in a layout effect that runs before
 * the browser paints the new front card, so colours and z-order never change before the cards
 * move. The movement uses the artboard's own overshoot, `cubic-bezier(.34,1.3,.5,1)` over
 * 0.55s.
 *
 * **The detent.** Each crossing of the 40px threshold plays the light haptic the date wheel
 * plays (`hooks/useTick.ts`), fired from the pointer handler, which is the only place iOS will
 * tick for its hidden switch.
 *
 * **A hold opens the card's choice.** The front card is also the way in to the balance editor
 * and to adding a card: a 500ms hold (or a right-click, or Enter on the focused card) calls
 * `onHoldCard` with the card's id, and the app decides what that opens
 * (`features/balance/CardSheets.tsx`). The hold shares the card's pointer handlers and cancels
 * on the same 10px of travel (`hooks/useLongPress.ts`), so a pull is still a pull.
 */

/** The icons a card of the owner's own can wear, by the names `lib/customCards.ts` stores. */
export const CARD_ICONS: Record<CardIconName, LucideIcon> = {
  Wallet,
  CreditCard,
  PiggyBank,
  Landmark,
  Coins,
  Gift,
  Plane,
  ShoppingBag,
}

/**
 * The colours a card of the owner's own can be, each a token of the current palette. `ink` is
 * what sits on the fill; it is the palette's own pairing where there is one (`--on-sage`,
 * `--on-clay`), and the canvas for the two data colours, which are light enough to read dark on.
 */
export const TONES: Record<CardTone, { fill: string; ink: string }> = {
  sage: { fill: "var(--sage)", ink: "var(--on-sage)" },
  clay: { fill: "var(--clay)", ink: "var(--on-clay)" },
  gold: { fill: "var(--data-gold)", ink: "var(--canvas)" },
  red: { fill: "var(--data-red)", ink: "var(--canvas)" },
}

/**
 * The colours a card is drawn in, as CSS values: the shape's fill and hairline, the accent (the
 * glyph, the account name and the word "Balance"), and the money and its "spent out of" line.
 */
type Skin = {
  fill: string
  stroke: string
  accent: string
  figure: string
  foot: string
}

const INK: Skin = {
  fill: "var(--card)",
  stroke: "var(--line)",
  accent: "var(--ink2)",
  figure: "var(--ink)",
  foot: "var(--ink)",
}

const CLAY: Skin = {
  fill: "var(--clay)",
  stroke: "var(--clay)",
  accent: "var(--on-clay)",
  figure: "var(--on-clay)",
  foot: "var(--on-clay)",
}

/** The two accounts Wallet imported wear fixed treatments; any other account wears ink. */
const ACCOUNT_SKIN: Record<string, Skin> = { upi: INK, cash: CLAY }

/** Which treatment a card wears. A card of the owner's own wears the colour it was given. */
function skinOf(card: BalanceCard): Skin {
  if (card.tone) {
    const tone = TONES[card.tone]
    return { fill: tone.fill, stroke: tone.fill, accent: tone.ink, figure: tone.ink, foot: tone.ink }
  }
  return ACCOUNT_SKIN[card.id] ?? INK
}

/** The glyph a card carries in its top-left corner. */
function glyphOf(card: BalanceCard): LucideIcon {
  if (card.icon === "qr") return QrCode
  if (card.icon === "cash") return Banknote
  return CARD_ICONS[card.icon] ?? Wallet
}

/** The artboard's card outline: a 358×184 card with the notch for the pill. */
const CARD_PATH =
  "M20 0H338Q358 0 358 20V100Q358 120 338 120H234Q214 120 214 140V164Q214 184 194 184H20Q0 184 0 164V20Q0 0 20 0Z"

/** The whole band's peek, in pixels above the front card. It is fixed; the cards share it. */
const PEEK = 40

/** How far the pulled card is allowed to travel before it stops following. */
const PULL = 120

/** How far it has to be pulled, on release, to count as "next card". */
const THRESHOLD = 40

/** The artboard's re-stack: 0.55s with a little overshoot at the end. */
const STACK = { duration: 0.55, ease: [0.34, 1.3, 0.5, 1] } as const

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** How many places a card is behind the front one: 0 is the front, `count - 1` the furthest. */
const rankOf = (position: number, front: number, count: number): number => (position - front + count) % count

/**
 * Where a card of a given rank sits. The front card is at 0; the rest share the band's fixed
 * peek, so the nearest one is `PEEK / (count − 1)` above the front and the furthest is at
 * `-PEEK`, the top of the band.
 */
const restFor = (rank: number, count: number): number =>
  rank === 0 || count < 2 ? 0 : -(PEEK * rank) / (count - 1)

export function BalanceCards({
  cards,
  onAddRecord,
  onHoldCard,
}: {
  cards: BalanceCard[]
  onAddRecord?: () => void
  /** A hold on the front card, by its id. The app opens the choice for it. */
  onHoldCard?: (cardId: string) => void
}) {
  const count = cards.length
  const [index, setIndex] = useState(0)
  /** The card drawn in front. Guarded, because the list can shrink under the stack. */
  const front = count === 0 ? 0 : index % count

  const tick = useTick()
  const reduceMotion = useReducedMotion()

  /**
   * The hold, armed once for whichever card is in front. The card it fires for is read at the
   * moment it fires, so a stack that has cycled since the finger landed still acts on the card
   * that is actually under it.
   */
  const hold = useLongPress(
    () => {
      const card = cards[front]
      if (card) onHoldCard?.(card.id)
    },
    { disabled: !onHoldCard },
  )

  /**
   * One `y` per card, kept across renders. Each card travels between its seats on its own, so
   * a single shared value could not show the old card leaving while the new one arrives.
   */
  const [seats] = useState(() => new Map<string, MotionValue<number>>())
  /** The pointer's first `clientY`, while a pull is in progress. */
  const grabbedAt = useRef<number | null>(null)
  /** Whether the last `pointermove` was past the threshold, so the tick fires once. */
  const pastThreshold = useRef(false)

  const seatOf = useCallback(
    (id: string, initial: number) => {
      let seat = seats.get(id)
      if (!seat) {
        seat = motionValue(initial)
        seats.set(id, seat)
      }
      return seat
    },
    [seats],
  )

  /**
   * Every card travels to the seat its rank gives it under `frontIndex`.
   *
   * Called from the release handler *and* from the layout effect below. The handler starts the
   * movement without waiting for React; the effect re-targets the same seats once the new front
   * is rendered, before the frame paints. Both name the same destinations, so the second call is
   * the same movement, not a second animation.
   */
  const settle = useCallback(
    (frontIndex: number) => {
      cards.forEach((card, position) => {
        const target = restFor(rankOf(position, frontIndex, cards.length), cards.length)
        const seat = seatOf(card.id, target)
        if (reduceMotion) {
          seat.stop()
          seat.set(target)
          return
        }
        animate(seat, target, STACK)
      })
    },
    [cards, reduceMotion, seatOf],
  )

  // Before paint, so the frame that shows the new front card already has it moving. It also runs
  // when a card is added, so the stack re-spaces itself to the fixed peek.
  useLayoutEffect(() => {
    settle(front)
  }, [settle, front])

  /** The next card. Its seat change is what animates the whole stack. */
  const cycle = useCallback(() => {
    if (count < 2) return
    const next = (front + 1) % count
    settle(next)
    setIndex(next)
  }, [count, front, settle])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>, seat: MotionValue<number>) => {
    grabbedAt.current = event.clientY
    pastThreshold.current = false
    seat.stop()
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>, seat: MotionValue<number>) => {
    if (grabbedAt.current === null) return
    const pulled = clamp(event.clientY - grabbedAt.current, 0, PULL)
    seat.set(pulled)

    // The 40px detent, fired from the gesture itself: this is the one place iOS plays its switch
    // click for us. Crossing it either way is a border, not a release.
    const over = pulled > THRESHOLD
    if (over !== pastThreshold.current) {
      pastThreshold.current = over
      tick()
    }
  }

  /**
   * The finger leaves. Past the threshold the card is demoted, under it the card goes back where
   * it was — either way on this frame, never after a timer.
   */
  const release = (commit: boolean) => {
    if (grabbedAt.current === null) return
    grabbedAt.current = null
    pastThreshold.current = false
    const card = cards[front]
    if (!card) return
    const seat = seatOf(card.id, 0)
    if (commit && count > 1 && seat.get() > THRESHOLD) {
      cycle()
      return
    }
    if (reduceMotion) {
      seat.stop()
      seat.set(0)
      return
    }
    animate(seat, 0, STACK)
  }

  const next = count > 1 ? cards[(front + 1) % count] : undefined

  return (
    // The band is the card's own 224px (40px of card behind, then 184 of card). The pill lives
    // inside that footprint, in the notch, so it neither spills onto the quick-log row below nor
    // adds a gap of its own between the two bands.
    <div role="group" aria-label="Accounts" className="relative h-[224px]">
      {cards.map((card, position) => {
        const rank = rankOf(position, front, count)
        const isFront = rank === 0
        const seat = seatOf(card.id, restFor(rank, count))
        const Glyph = glyphOf(card)
        const skin = skinOf(card)
        return (
          <motion.div
            key={card.id}
            aria-hidden={!isFront}
            style={{ y: seat, zIndex: count - rank }}
            role={isFront && onHoldCard ? "button" : undefined}
            tabIndex={isFront && onHoldCard ? 0 : undefined}
            aria-label={
              isFront && onHoldCard
                ? `${card.name} balance ${card.balance}. Hold to edit or add a card, drag down for the next account`
                : undefined
            }
            title={isFront && onHoldCard ? "Hold to edit this card or add one" : undefined}
            onPointerDown={
              isFront
                ? (event) => {
                    hold.onPointerDown(event)
                    onPointerDown(event, seat)
                  }
                : undefined
            }
            onPointerMove={
              isFront
                ? (event) => {
                    hold.onPointerMove(event)
                    onPointerMove(event, seat)
                  }
                : undefined
            }
            onPointerUp={
              isFront
                ? () => {
                    hold.onPointerUp()
                    release(true)
                  }
                : undefined
            }
            onPointerCancel={
              isFront
                ? () => {
                    hold.onPointerCancel()
                    release(false)
                  }
                : undefined
            }
            onPointerLeave={isFront ? hold.onPointerLeave : undefined}
            onContextMenu={isFront ? hold.onContextMenu : undefined}
            onKeyDown={isFront ? hold.onKeyDown : undefined}
            className={`absolute inset-x-0 top-10 h-[184px] touch-none select-none ${
              isFront ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
            }`}
          >
            <svg
              width="358"
              height="184"
              viewBox="0 0 358 184"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full overflow-visible"
              preserveAspectRatio="none"
            >
              <path d={CARD_PATH} strokeWidth={1} fill={skin.fill} stroke={skin.stroke} />
            </svg>

            <div
              className="absolute inset-x-4 top-4 flex h-6 items-center justify-between"
              style={{ color: skin.accent }}
            >
              <span className="flex">
                <Glyph className="size-6" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span className="max-w-[60%] truncate text-[13px] leading-4">{card.name}</span>
            </div>

            <div
              className="absolute top-12 left-4 font-display text-sm leading-5 font-medium tracking-[-0.01em]"
              style={{ color: skin.accent }}
            >
              Balance
            </div>

            <div
              className="absolute top-[68px] left-4 font-display text-[40px] leading-[48px] font-medium tracking-[-0.03em] whitespace-nowrap"
              style={{ color: skin.figure }}
            >
              <CountUp cents={card.cents} format={money} />
            </div>

            {/*
              The card's bottom row: the money that has gone out of this account on the left, and
              the Add Record capsule's own slot on the right. It is a flex row that does not wrap,
              the left frame truncates rather than pushing the capsule, and the right frame is a
              reserved 136px — the pill's own width plus its 8px inset — so the capsule is never
              covered by the figures.
            */}
            <div
              className="absolute inset-x-0 bottom-2 flex w-full flex-nowrap items-center justify-between gap-3 px-4"
              style={{ color: skin.foot }}
            >
              <div className="flex max-w-[60%] min-w-0 flex-1 items-baseline justify-start select-none">
                <p className="truncate font-sans text-[13px] leading-4">
                  {card.spent}{" "}
                  <span className="font-serif italic opacity-60">spent out of</span> {card.balance}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center">
                <span aria-hidden="true" className="h-12 w-[8.5rem]" />
              </div>
            </div>
          </motion.div>
        )
      })}

      {/*
        The add-record pill, pinned: 128×48 as the artboard draws it, outside every card so a drag
        cannot carry it, and on the card's bottom edge. Its 8px right inset is the artboard's and
        keeps it inside the notch, whose step begins at the card's 120th pixel.
      */}
      <button
        type="button"
        aria-label="Add Record"
        onClick={() => {
          tick()
          onAddRecord?.()
        }}
        className="absolute right-2 bottom-2 z-[6] flex h-12 w-32 shrink-0 items-center gap-1.5 rounded-3xl border border-line bg-pill pr-2 pl-2 text-[13px] leading-4 font-medium whitespace-nowrap text-ink"
      >
        <span className="flex size-8 items-center justify-center rounded-2xl bg-sage text-pill">
          <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
        Add Record
      </button>

      {/* The artboard's tap strip above the cards, which shows the card behind. */}
      {next && (
        <button
          type="button"
          aria-label={`Show ${next.name} card`}
          onClick={() => {
            tick()
            cycle()
          }}
          className="absolute inset-x-0 top-0 z-[5] h-10 border-0 bg-transparent p-0"
        />
      )}
    </div>
  )
}
