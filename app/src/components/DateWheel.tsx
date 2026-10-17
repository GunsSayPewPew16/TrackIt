import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { memo, useCallback, useMemo, useRef, useState } from "react"

import { useTick } from "@/hooks/useTick"
import { dayNumber, dayOfWeek, monthLabel } from "@/lib/format"
import type { LedgerDay } from "@/lib/view"

/**
 * The ledger's date container — a row of day capsules curved around a circle, dragged
 * sideways to change the day.
 *
 * This is the owner's newer date container, and it replaces the previous wheel. The
 * difference is not cosmetic: **the capsules were animated; now the row is a scroll.**
 *
 * - **One virtual scroll offset.** `x` is a distance, not a selection: 0 puts the first
 *   day on the focal axis and `-(n−1)·PITCH` puts the last one there. Every capsule
 *   derives its seat from `x` on every frame (`index + x / PITCH`), so a finger moves
 *   the row one-to-one and nothing springs separately from anything else. The old wheel
 *   stepped the selection on release and then let fifteen capsules spring to new seats;
 *   this one is a single object being pulled.
 * - **The drag ends in inertia, snapped to a capsule.** `modifyTarget` rounds the
 *   engine's projected end-point onto the nearest multiple of `PITCH`, so a flick
 *   travels as far as it was thrown and then stops *on a day* rather than between two.
 *   There is no threshold and no step count any more: the one quantity is how far the
 *   row moved, and the day is whatever is nearest the middle when it comes to rest.
 * - **The tick.** Every capsule that crosses the axis plays a light haptic while the
 *   row moves (`hooks/useTick.ts` — a buzz on Android, the system's switch click on
 *   iOS), which is what makes a drag feel like a detent rather than a slide.
 * - **The track itself does not move.** The track carries `perspective` and stays put
 *   (`transformTemplate` → `none`); only the capsules are transformed, which is what
 *   keeps the vanishing point and the focal axis fixed while the row travels.
 *
 * The geometry is the artboard's: radius 800, one fifteenth of the arc per capsule,
 * `rotateY(−9°·n)` with a `rotate(4.95°·n)` that keeps a capsule facing outward, scales
 * 1.15/1/0.9/0.78/0.7 and opacities 1/1/0.8/0.4/0, flat beyond the end of either curve.
 * A capsule more than three seats from the middle is inert, as in the artboard.
 */

/** The wheel's own radius, in pixels, from the artboard's geometry. */
const RADIUS = 800

/** Radians of turn per capsule — one fifteenth of the visible arc. */
const STEP = 0.0863

/** How far the row travels for one capsule, in pixels (~69px). */
const PITCH = RADIUS * STEP

/** Capsules further than this from the middle are not reachable. */
const REACH = 3

/** A capsule's scale by how far it is from the middle, from the artboard. */
const SCALE = [1.15, 1, 0.9, 0.78, 0.7]

/** And its opacity: the middle one and its nearest neighbour are solid. */
const OPACITY = [1, 1, 0.8, 0.4, 0]

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** A point on one of the artboard's curves, interpolated and flat past the end. */
function sample(curve: number[], distance: number): number {
  if (distance >= curve.length - 1) return curve[curve.length - 1]
  const index = Math.floor(distance)
  return curve[index] + (curve[index + 1] - curve[index]) * (distance - index)
}

/**
 * Where a capsule drawn `offset` capsules from the middle sits.
 *
 * It is a circle of radius 800 turned on its side: `x = R·sin(θ)` swings it along the
 * row, `y = R·(1 − cos(θ))` drops it away from the middle, and the two rotations turn
 * its face with it. Beyond the reach of the curve the scale and opacity flatten, which
 * is why a capsule that has been dragged off screen costs nothing.
 */
function seat(offset: number): string {
  const radians = offset * STEP
  const x = RADIUS * Math.sin(radians)
  const y = RADIUS * (1 - Math.cos(radians))
  const degrees = (radians * 180) / Math.PI
  const scale = sample(SCALE, Math.abs(offset))
  return `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotateY(${(-offset * 9).toFixed(1)}deg) rotate(${degrees.toFixed(2)}deg) scale(${scale.toFixed(3)})`
}

/** The nearest capsule's centre, for Framer's `modifyTarget` to land the flick on. */
function snapTo(target: number, last: number): number {
  return -clamp(Math.round(-target / PITCH), 0, last) * PITCH
}

/**
 * One day. Memoised because it re-renders only when its *active* flag changes — its
 * seat is a motion value it reads for itself, so dragging the row never re-renders
 * fifteen buttons.
 */
const Capsule = memo(function Capsule({
  day,
  index,
  x,
  active,
  distance,
  onPick,
  onPress,
}: {
  day: LedgerDay
  index: number
  x: MotionValue<number>
  active: boolean
  distance: number
  onPick: (index: number) => void
  onPress: () => void
}) {
  // Signed distance from the focal axis, live: the capsule's own index plus however
  // far the row has been dragged past it.
  const offset = useTransform(x, (value) => index + value / PITCH)
  const transform = useTransform(offset, seat)
  const opacity = useTransform(offset, (value) => sample(OPACITY, Math.abs(value)))

  return (
    <motion.button
      type="button"
      aria-label={`${dayOfWeek(day.at)} ${dayNumber(day.at)} ${monthLabel(day.at)}`}
      aria-pressed={active}
      tabIndex={active ? 0 : -1}
      // The thumb landing on a capsule is the gesture iOS needs before it will play
      // anything at all; the first tick of the drag then has a live switch behind it.
      onPointerDown={onPress}
      onClick={() => onPick(index)}
      style={{
        transform,
        opacity,
        zIndex: 10 - distance,
        pointerEvents: distance > REACH ? "none" : "auto",
      }}
      className={`absolute top-4 left-1/2 -ml-[26px] flex h-20 w-[52px] origin-bottom cursor-[inherit] flex-col items-center justify-center rounded-[26px] border p-0 ${
        active ? "border-transparent bg-sage text-on-sage" : "border-line bg-pill text-pill-ink"
      }`}
    >
      <span className="font-display text-2xl leading-7 font-bold tracking-[-0.02em]">
        {dayNumber(day.at)}
      </span>
      <span className="text-[13px] leading-4">{dayOfWeek(day.at)}</span>
    </motion.button>
  )
})

export type Props = {
  /** Every capsule, oldest first. */
  days: LedgerDay[]
  /** Which capsule starts on the focal axis. */
  initialIndex: number
  /** The capsule now under the middle of the wheel, for the screen's cards. */
  onActiveChange: (index: number) => void
  /** Placement on the screen; the wheel's own box is 120px tall. */
  className?: string
}

export function DateWheel({ days, initialIndex, onActiveChange, className = "" }: Props) {
  const last = days.length - 1
  const start = clamp(initialIndex, 0, last)

  const x = useMotionValue(-start * PITCH)
  const [active, setActive] = useState(start)
  /** The live index, for the callbacks below — state is a render behind them. */
  const current = useRef(start)
  const track = useRef<HTMLDivElement>(null)
  /** Set by a drag, so the pointerup click it fires is not taken as a choice. */
  const dragged = useRef(false)
  const reduceMotion = useReducedMotion()
  const tick = useTick()

  /**
   * A capsule crosses the middle: the screen shows its day and the thumb is told.
   *
   * This fires from the motion engine rather than from an event handler, so it also
   * fires for the tick of a flick's inertia and for a programmatic move — which is the
   * point: the haptic tracks the days passing under the axis, not the gestures.
   */
  useMotionValueEvent(x, "change", (value) => {
    const next = clamp(Math.round(-value / PITCH), 0, last)
    if (next === current.current) return
    current.current = next
    setActive(next)
    onActiveChange(next)
    tick()
  })

  const dragTransition = useMemo(
    () => ({
      power: 0.2,
      timeConstant: 200,
      modifyTarget: (target: number) => snapTo(target, last),
    }),
    [last],
  )

  /** Move the row itself, so the capsules travel rather than jump. */
  const goTo = useCallback(
    (index: number) => {
      const target = -clamp(index, 0, last) * PITCH
      if (reduceMotion) x.set(target)
      else animate(x, target, { type: "spring", stiffness: 320, damping: 28 })
    },
    [x, last, reduceMotion],
  )

  const pick = useCallback(
    (index: number) => {
      // A click that follows a drag is the tail of that drag, not a tap on a day.
      if (dragged.current) {
        dragged.current = false
        return
      }
      goTo(index)
    },
    [goTo],
  )

  /** The wheel is a slider: the arrows step it, Home and End go to either end. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const from = current.current
    const to =
      event.key === "ArrowRight"
        ? from + 1
        : event.key === "ArrowLeft"
          ? from - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null
    if (to === null) return
    event.preventDefault()
    const next = clamp(to, 0, last)
    goTo(next)
    // The focus follows the selection, so the next arrow press is still the wheel's.
    ;(track.current?.children[next] as HTMLElement | undefined)?.focus({ preventScroll: true })
  }

  return (
    <div
      role="group"
      aria-label="Select a date"
      onKeyDown={onKeyDown}
      className={`relative h-[120px] touch-pan-y overflow-hidden ${className}`}
    >
      <motion.div
        ref={track}
        drag="x"
        style={{ x, cursor: "grab" }}
        // The track is the window the row is seen through; it must not travel with
        // the row or the perspective origin would move with it.
        transformTemplate={() => "none"}
        dragConstraints={{ left: -last * PITCH, right: 0 }}
        dragElastic={0.1}
        dragTransition={dragTransition}
        whileTap={{ cursor: "grabbing" }}
        onPointerDown={() => {
          dragged.current = false
        }}
        onDragStart={() => {
          dragged.current = true
        }}
        className="absolute inset-0 [perspective:900px] select-none"
      >
        {days.map((day, index) => (
          <Capsule
            key={day.at}
            day={day}
            index={index}
            x={x}
            active={index === active}
            distance={Math.min(Math.abs(index - active), 4)}
            onPick={pick}
            onPress={tick}
          />
        ))}
      </motion.div>
    </div>
  )
}
