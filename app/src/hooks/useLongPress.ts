import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import { mediumClick } from "@/lib/haptics"

/** How long a finger has to stay still for a press to become a hold. */
const HOLD_MS = 500
/**
 * How far a finger may wander and still be a hold: below this it is a press that has not
 * finished, above it the owner is scrolling or dragging and did not mean this at all.
 */
const SLOP = 10

/**
 * A long press, as the six handlers an element needs.
 *
 * Three things are deliberate:
 *
 * - **Movement cancels it.** A screen that scrolls under the thumb is common here — the
 *   dashboard is longer than a phone — and a 10px slop is what keeps "scroll the page"
 *   from opening an editor halfway down.
 * - **The tick plays when the hold fires**, through `lib/haptics.ts`, so the phone says
 *   "something happened" at the moment the editor is about to appear rather than when the
 *   finger lands. It is the medium weight: this is a held thing being unlocked, not a digit
 *   on a keypad.
 * - **`contextmenu` is the desk's hold, and the accessible one.** Right-clicking (or the
 *   menu key) opens the same editor without waiting, and `Enter`/`Space` on a focused
 *   element do too — so a hold is never the *only* way in. Android raises its own context
 *   menu after a long press, so a menu arriving within a second of the hold is the same
 *   gesture counted twice and is swallowed.
 *
 * iOS plays a haptic only inside a real gesture, and the hold's moment is a timer rather
 * than a touch, so that tick can be silent there — `lib/haptics.ts` already treats a silent
 * phone as the accepted fallback, and nothing waits on it.
 */
export function useLongPress(
  onLongPress: () => void,
  { disabled = false, ms = HOLD_MS }: { disabled?: boolean; ms?: number } = {},
) {
  // The callback is re-read on every fire, so a caller may pass an inline arrow without
  // re-arming anything: a hold outlives the render it started in.
  const callback = useRef(onLongPress)
  useEffect(() => {
    callback.current = onLongPress
  }, [onLongPress])

  const timer = useRef<number | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const firedAt = useRef(0)

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
  }, [])

  const fire = useCallback(() => {
    clear()
    firedAt.current = Date.now()
    mediumClick()
    callback.current()
  }, [clear])

  const onPointerDown = (event: ReactPointerEvent) => {
    if (disabled || event.button !== 0) return
    clear()
    origin.current = { x: event.clientX, y: event.clientY }
    timer.current = window.setTimeout(fire, ms)
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!origin.current) return
    const moved = Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y)
    if (moved > SLOP) clear()
  }

  const onContextMenu = (event: ReactMouseEvent) => {
    if (disabled) return
    event.preventDefault()
    if (Date.now() - firedAt.current < 1000) return
    mediumClick()
    callback.current()
  }

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (disabled) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    mediumClick()
    callback.current()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu,
    onKeyDown,
  }
}
