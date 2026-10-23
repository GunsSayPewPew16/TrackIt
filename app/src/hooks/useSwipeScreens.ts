import { useEffect, useRef } from "react"

/**
 * A sideways swipe, as the thumb's way between screens.
 *
 * The dock is still the app's frame; this is the same movement with a thumb, so a phone can
 * page through Home → Ledger → Stats → Settings without reaching for the bottom of the screen.
 * The screens follow the finger while it moves (`onDrag`), and the gesture ends with one answer
 * (`onSettle`): the direction it turned to, or `null` when it did not turn. The rules it keeps
 * are the ones a phone already taught the owner:
 *
 * - **A page is paged, a control is not.** A gesture that starts inside a horizontally
 *   scrollable region belongs to that region — the budget carousel, the quick-log tray, the
 *   gauge's months — and a gesture that starts on a control which reads sideways itself (the
 *   ledger's date wheel, the trend plot) is that control's. Those elements say so with
 *   `data-swipe-ignore` where their scrolling is not CSS (`DateWheel`, `TrendCard`); everything
 *   native is found by walking up to the first ancestor whose `overflow-x` scrolls.
 * - **A gesture is a direction before it is a distance.** The first 10px decide: if the finger
 *   is mostly travelling down, this is a scroll and the swipe lets go for good — a page that
 *   scrolls a little and then changes screens is the worst of both.
 * - **A press is not a swipe.** The click a sideways gesture ends with is swallowed, so a card
 *   that was under the thumb does not open as well.
 * - **Nothing pages under a sheet.** A modal is the only thing on screen while it is up; its
 *   scrim is not a navigation surface. The dock is excluded for the same reason — its own
 *   press is the tab.
 * - **A gesture that is cancelled settles where it is.** A lost pointer, a second finger or a
 *   blur reports `null`, so the screens snap back rather than being left half-way.
 *
 * **Touch is read as touch events, not as pointer events.** A browser that starts panning a
 * page may cancel the pointer stream, and then a perfectly ordinary sideways swipe would end
 * in `pointercancel` before the thumb lifts. `touchstart`/`touchmove`/`touchend` keep arriving
 * (passively — this never prevents the page's own scroll), so a phone gets the same gesture a
 * mouse drag gets on a desk. Pointer events are therefore only for the mouse and the pen; a
 * touch pointer is ignored so one gesture cannot be counted twice. The callbacks are read
 * through refs, so a caller may pass an inline arrow without re-arming the listeners on every
 * render.
 */

/** How far a finger must travel before it is a page turn rather than a press. */
const DISTANCE = 56
/**
 * A flick: a shorter, faster brush. A phone does not need 56px if it was going somewhere, and
 * waiting for the distance to arrive would make a quick page turn feel ignored.
 */
const FLICK_DISTANCE = 28
const FLICK_SPEED = 0.5 // px per ms
/** The first movement that makes a gesture sideways, rather than a press or a scroll. */
const DECIDE = 10

/** Which way the thumb went: `1` is the next screen, `-1` the one before it. */
export type SwipeDirection = 1 | -1

type SwipeOptions = {
  /** Off on a screen that is not a page in the order (the scanner). */
  enabled?: boolean
  /**
   * Whether there is a screen in that direction. Without it a gesture toward the end of the
   * order still follows the thumb (the caller decides how far), but settles as `null`.
   */
  canSwipe?: (direction: SwipeDirection) => boolean
  /**
   * Every move of a sideways gesture, with the finger's travel since it began in pixels: negative
   * is leftward. This is what lets a screen follow the thumb.
   */
  onDrag?: (dx: number) => void
  /**
   * The end of a sideways gesture, once: the direction it turned to, or `null` when it did not
   * turn (too short, too slow, toward no screen) or was cancelled.
   */
  onSettle: (direction: SwipeDirection | null) => void
}

/** Whether an element is, or sits inside, something that scrolls sideways for its own reasons. */
function inHorizontalScroller(element: Element): boolean {
  let node: Element | null = element
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node)
    if (
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      node.scrollWidth > node.clientWidth + 2
    ) {
      return true
    }
    node = node.parentElement
  }
  return false
}

/** Where a gesture must not become a page turn, in one selector. */
const IGNORE =
  'nav[aria-label="Primary"], [role="dialog"], [role="menu"], [aria-modal="true"], ' +
  '[data-swipe-ignore], input, textarea, select, [contenteditable="true"]'

export function useSwipeScreens({ enabled = true, canSwipe, onDrag, onSettle }: SwipeOptions) {
  // The callbacks are re-read on every fire, not captured when the listeners were armed: App
  // passes inline arrows, and a re-render must not leave the last one in charge.
  const drag = useRef(onDrag)
  const settle = useRef(onSettle)
  const allowed = useRef(canSwipe)
  useEffect(() => {
    drag.current = onDrag
    settle.current = onSettle
    allowed.current = canSwipe
  }, [onDrag, onSettle, canSwipe])

  useEffect(() => {
    if (!enabled) return

    type Start = { x: number; y: number; at: number; horizontal: boolean }
    let start: Start | null = null
    /** The mouse/pen pointer the gesture belongs to; touch has no pointer id here. */
    let pointerId: number | null = null

    /** The click a sideways gesture ends with; swallowed once, and only for a little while. */
    const swallowNextClick = () => {
      const swallow = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
      }
      window.addEventListener("click", swallow, { capture: true, once: true })
      // A touch that ends over nothing may never fire a click. Do not leave the listener
      // waiting for the next, deliberate, tap.
      window.setTimeout(() => window.removeEventListener("click", swallow, true), 350)
    }

    const begin = (x: number, y: number, at: number, target: EventTarget | null) => {
      if (!(target instanceof Element)) return
      // A sheet owns the whole window while it is up; its scrim is not a page either.
      if (document.querySelector('[aria-modal="true"]')) return
      if (target.closest(IGNORE)) return
      if (inHorizontalScroller(target)) return
      start = { x, y, at, horizontal: false }
    }

    /** A sideways gesture that is cancelled settles where it is: a snap-back, never a turn. */
    const abandon = () => {
      if (start?.horizontal) settle.current(null)
      start = null
    }

    const move = (x: number, y: number) => {
      if (!start) return
      const dx = x - start.x
      const dy = y - start.y
      if (!start.horizontal) {
        // The first real movement decides the gesture. A downward one is a scroll, and the
        // page is left to it; this gesture cannot become a swipe later.
        if (Math.abs(dx) > DECIDE && Math.abs(dx) > Math.abs(dy) * 1.2) start.horizontal = true
        else if (Math.abs(dy) > DECIDE) start = null
      }
      if (start?.horizontal) drag.current?.(dx)
    }

    const end = (x: number, y: number, at: number) => {
      if (!start) return
      const gesture = start
      start = null
      if (!gesture.horizontal) return

      const dx = x - gesture.x
      const dy = y - gesture.y
      const elapsed = Math.max(1, at - gesture.at)
      const flick = Math.abs(dx) >= FLICK_DISTANCE && Math.abs(dx) / elapsed >= FLICK_SPEED
      let direction: SwipeDirection | null = null
      if (Math.abs(dy) <= DISTANCE && (Math.abs(dx) >= DISTANCE || flick)) {
        direction = dx < 0 ? 1 : -1
      }
      if (direction !== null && !(allowed.current?.(direction) ?? true)) direction = null

      // A sideways gesture was a drag, not a press: the click it would otherwise send is swallowed.
      swallowNextClick()
      window.getSelection()?.removeAllRanges()
      settle.current(direction)
    }

    const onPointerDown = (event: PointerEvent) => {
      // A touch is the touch listeners' gesture; counting both would page twice.
      if (event.pointerType === "touch") return
      if (!event.isPrimary || event.button !== 0) return
      pointerId = event.pointerId
      begin(event.clientX, event.clientY, event.timeStamp, event.target)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.pointerId !== pointerId) return
      move(event.clientX, event.clientY)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.pointerId !== pointerId) return
      pointerId = null
      end(event.clientX, event.clientY, event.timeStamp)
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        abandon()
        return
      }
      const touch = event.touches[0]
      if (touch) begin(touch.clientX, touch.clientY, event.timeStamp, event.target)
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!start) return
      if (event.touches.length !== 1) {
        abandon()
        return
      }
      const touch = event.touches[0]
      if (touch) move(touch.clientX, touch.clientY)
    }

    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0]
      if (touch) end(touch.clientX, touch.clientY, event.timeStamp)
    }

    /**
     * A canceled **touch pointer** is not a canceled touch. Chrome cancels the pointer stream
     * as soon as it decides the page may scroll, while the touch events this hook reads keep
     * arriving — so only the mouse/pen pointer may end the gesture here, and only the touch
     * stream may end a touch one.
     */
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.pointerId !== pointerId) return
      pointerId = null
      abandon()
    }

    const cancelTouch = () => {
      abandon()
    }

    const onBlur = () => {
      pointerId = null
      abandon()
    }

    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerCancel)
    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchmove", onTouchMove, { passive: true })
    window.addEventListener("touchend", onTouchEnd, { passive: true })
    window.addEventListener("touchcancel", cancelTouch, { passive: true })
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerCancel)
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
      window.removeEventListener("touchcancel", cancelTouch)
      window.removeEventListener("blur", onBlur)
    }
  }, [enabled])
}
