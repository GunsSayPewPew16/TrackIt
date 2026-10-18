/**
 * Pinch and double-tap zoom are turned off for the whole app.
 *
 * TrackIt is a phone layout: one 390px column, fixed heights and a dock pinned to the
 * bottom edge. A zoom is never something a finger here *means* to do — it happens when a
 * second thumb rests on the screen while a date is dragged, or when a tap on a category
 * lands twice — and the result is worse than on a normal page: inside the installed PWA
 * there is no URL bar and no zoom-out affordance, so the canvas stays cropped until the
 * app is killed.
 *
 * Three layers, because no one of them covers every browser:
 *
 * - `index.html`'s viewport is `maximum-scale=1, user-scalable=no`. Chrome and the
 *   installed iOS web app honour that; Safari on iOS deliberately ignores it.
 * - `index.css` sets `touch-action: pan-x pan-y` on `html`, which is the standards way to
 *   refuse pinch-zoom (the property is the *intersection* of every ancestor, so nothing
 *   below can widen it again) and also cancels the double-tap-to-zoom gesture.
 * - This module, for Safari: iOS still fires its proprietary `gesturestart` /
 *   `gesturechange` events for a pinch, and preventing those is what stops the page
 *   scaling there. A multi-finger `touchmove` is the fallback for the same gesture on a
 *   browser that has gesture events but does not cancel the scroll.
 *
 * What is deliberately *not* touched: single-finger scrolling, the ledger's horizontal
 * drag, the manual-entry sheet's drag-down, and the pinch-free `touch-action` utilities
 * (`touch-none`, `touch-pan-y`) that individual components already set. Desktop
 * Ctrl/⌘ + / − is the browser's own zoom and is out of reach of a page, on purpose.
 */
export function lockZoom() {
  const stop = (event: Event) => event.preventDefault()

  // Safari's pinch events. `passive: false` because a passive listener's preventDefault
  // is ignored — and Safari treats touch listeners as passive by default.
  document.addEventListener("gesturestart", stop, { passive: false })
  document.addEventListener("gesturechange", stop, { passive: false })
  document.addEventListener("gestureend", stop, { passive: false })

  // The same gesture where it arrives as two fingers on the glass. One-finger touches are
  // left alone, so every scroll and drag in the app behaves as it did.
  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1) event.preventDefault()
    },
    { passive: false },
  )
}
