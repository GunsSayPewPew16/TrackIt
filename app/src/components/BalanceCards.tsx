import { animate, motion, motionValue, useReducedMotion, type MotionValue } from "framer-motion"
import { Banknote, Plus, QrCode } from "lucide-react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { CountUp } from "@/components/CountUp"
import { useTick } from "@/hooks/useTick"
import { money } from "@/lib/format"
import type { BalanceCard } from "@/lib/view"

/**
 * The dashboard's first band: one card per account, in a stack you pull down.
 *
 * This is the newer dashboard artboard's replacement for the single "total available
 * balance" box, and the balance box's figures are gone with it — the money is shown
 * per account now, which is what `lib/accounts.ts` has always known and the screen
 * never said.
 *
 * **The stack.** A 224px band holds the cards at its own 40px offset, each 358×184
 * with a step cut out of its bottom-right corner. The card behind is lifted 40px so it
 * peeks above the front one — the artboard's two treatments, not a shadow. Pulling the
 * front card down shows the next one; pull it past 40px and it **goes to the back of
 * the stack**, while the card behind rises into the front seat. Under 40px it springs
 * back. The band's first 40px — the strip where the card behind is visible — is the
 * artboard's own tap target for the same move.
 *
 * **A card's colour belongs to the account, not to the seat.** The artboard paints
 * whichever card is in front in ink and whichever is behind in clay, so cycling the
 * stack made UPI and Cash swap colours — the owner read that as the cards changing
 * under them. Now UPI is always the ink card and Cash always the clay one, whichever
 * seat they are in: `SKIN_OF` is the whole of that decision, the text and the shape
 * travel with it, and the only thing a seat still decides is depth — `y`, the z-order,
 * and which card the thumb can grab.
 *
 * **The Add card pill stays put.** In the artboard each card draws its own pill in the
 * notch at its bottom-right, so the pill travels with the card. The owner asked for the
 * opposite: the cards move, the pill does not — so it is one element, pinned to the
 * band at the artboard's own 8px inset, above the cards. It is drawn where the artboard
 * draws it and has no flow behind it yet.
 *
 * **Nothing is ever drawn below the band.** The artboard's own cycle drops the front
 * card 160px over the quick-log row and only re-indexes 300ms later, which reads as the
 * card falling out of the stack and onto the rest of the page — that is what it looked
 * like on the owner's phone. Here the release *is* the re-stack: the pulled card travels
 * up to the back seat (−40px) while the card behind travels into the front seat (0), in
 * one movement. There is no drop, no timer, and no intermediate "falling" state, so no
 * frame of the cycle draws a card below its seat.
 *
 * **The movement starts on the frame the finger lifts.** The seats are motion values
 * this component writes directly, and the release starts them in the handler *and* in a
 * layout effect (which runs before the browser paints the new front card), so there is no
 * frame where the colours and the z-order have swapped but the cards have not moved.
 * The seats then travel with the artboard's own overshoot,
 * `cubic-bezier(.34,1.3,.5,1)` over 0.55s.
 *
 * **The detent.** Every crossing of the 40px threshold plays the same light haptic the
 * date wheel plays (`hooks/useTick.ts` — a buzz on Android, the system's switch click on
 * iOS), and the tap strip plays it too. It is fired from the pointer handler itself,
 * which is the only place iOS will tick for its hidden switch.
 */

/** The two card treatments, as the colours each one's parts wear. */
type Skin = {
  /** The card's fill and hairline. */
  shape: string
  /** The glyph and the account's name in the top corner. */
  title: string
  /** The word "Balance". */
  label: string
  /** The money. */
  figure: string
  /** The "spent out of" line. */
  foot: string
}

const SKINS: Record<"ink" | "clay", Skin> = {
  ink: {
    shape: "fill-card stroke-line",
    title: "text-ink2",
    label: "text-ink2",
    figure: "text-ink",
    foot: "text-ink",
  },
  clay: {
    shape: "fill-clay stroke-clay",
    title: "text-on-clay",
    label: "text-on-clay",
    figure: "text-on-clay",
    foot: "text-on-clay",
  },
}

/**
 * Which account wears which treatment. The two accounts the owner keeps are named
 * here rather than inferred from their seat, and an account this table has never
 * heard of wears the ink one — the card a new balance would look right on.
 */
const SKIN_OF: Record<string, keyof typeof SKINS> = { upi: "ink", cash: "clay" }

const skinOf = (id: string) => SKINS[SKIN_OF[id] ?? "ink"]

/** The artboard's card outline: a 358×184 card with the notch for the pill. */
const CARD_PATH =
  "M20 0H338Q358 0 358 20V100Q358 120 338 120H234Q214 120 214 140V164Q214 184 194 184H20Q0 184 0 164V20Q0 0 20 0Z"

/** Where a card sits when it is not the front one, in pixels above it. */
const REST = -40

/** How far the pulled card is allowed to travel before it stops following. */
const PULL = 120

/** How far it has to be pulled, on release, to count as "next card". */
const THRESHOLD = 40

/** The artboard's re-stack: 0.55s with a little overshoot at the end. */
const STACK = { duration: 0.55, ease: [0.34, 1.3, 0.5, 1] } as const

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export function BalanceCards({ cards }: { cards: BalanceCard[] }) {
  const count = cards.length
  const [index, setIndex] = useState(0)
  /** The card drawn in front. Guarded, because the list can shrink under the stack. */
  const front = count === 0 ? 0 : index % count

  const tick = useTick()
  const reduceMotion = useReducedMotion()

  /**
   * One `y` per card, kept across renders. A card's seat changes when it becomes the
   * front one or when it is demoted, and each card has to travel between those seats on
   * its own — a single shared value could not show the old card leaving while the new
   * one arrives.
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
   * Every card travels to its seat: 0 for the front one, `REST` for the rest.
   *
   * Called from the release handler *and* from the layout effect below. The handler
   * starts the movement without waiting for React at all; the effect re-targets the
   * same seats once the new front is rendered, before the frame paints. Both calls
   * name the same destination, so the second one is the same movement, not a second
   * animation.
   */
  const settle = useCallback(
    (frontIndex: number) => {
      cards.forEach((card, position) => {
        const target = position === frontIndex ? 0 : REST
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

  // Before paint, so the frame that shows the new front card already has it moving.
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

    // The 40px detent, fired from the gesture itself: this is the one place iOS plays
    // its switch click for us. Crossing it either way is a border, not a release.
    const over = pulled > THRESHOLD
    if (over !== pastThreshold.current) {
      pastThreshold.current = over
      tick()
    }
  }

  /**
   * The finger leaves. Past the threshold the card is demoted, under it the card goes
   * back where it was — either way on this frame, never after a timer.
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
    <div role="group" aria-label="Accounts" className="relative h-[224px]">
      {cards.map((card, position) => {
        const isFront = position === front
        const seat = seatOf(card.id, position === 0 ? 0 : REST)
        const Glyph = card.icon === "qr" ? QrCode : Banknote
        // Fixed to the account, never to `isFront`: the colour is the card's identity.
        const skin = skinOf(card.id)
        return (
          <motion.div
            key={card.id}
            aria-hidden={!isFront}
            style={{
              y: seat,
              zIndex: isFront ? 3 : position === (front + 1) % count ? 2 : 1,
            }}
            onPointerDown={isFront ? (event) => onPointerDown(event, seat) : undefined}
            onPointerMove={isFront ? (event) => onPointerMove(event, seat) : undefined}
            onPointerUp={isFront ? () => release(true) : undefined}
            onPointerCancel={isFront ? () => release(false) : undefined}
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
              <path d={CARD_PATH} strokeWidth={1} className={skin.shape} />
            </svg>

            <div className={`absolute inset-x-4 top-4 flex h-6 items-center justify-between ${skin.title}`}>
              <span className="flex">
                <Glyph className="size-6" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span className="text-[13px] leading-4">{card.name}</span>
            </div>

            <div
              className={`absolute top-12 left-4 font-display text-sm leading-5 font-medium tracking-[-0.01em] ${skin.label}`}
            >
              Balance
            </div>

            <div
              className={`absolute top-[68px] left-4 font-display text-[40px] leading-[48px] font-medium tracking-[-0.03em] whitespace-nowrap ${skin.figure}`}
            >
              <CountUp cents={card.cents} format={money} />
            </div>

            <div className={`absolute bottom-4 left-4 text-[13px] leading-4 whitespace-nowrap ${skin.foot}`}>
              {card.spent}{" "}
              <span className="font-serif italic">spent out of</span> {card.balance}
            </div>
          </motion.div>
        )
      })}

      {/*
        The Add card pill, pinned: the same 8px inset and 128×48 the artboard gives the
        one it draws inside the card, but outside every card so a drag cannot carry it.
        It has no flow behind it yet — the artboard draws it, nothing has been asked of
        it — so it is the design's control, waiting.
      */}
      <button
        type="button"
        aria-label="Add card"
        className="absolute right-2 bottom-2 z-[6] flex h-12 w-32 items-center gap-2 rounded-3xl border border-line bg-pill pr-3 pl-2 text-[13px] leading-4 font-medium text-ink"
      >
        <span className="flex size-8 items-center justify-center rounded-2xl bg-sage text-pill">
          <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
        Add card
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
