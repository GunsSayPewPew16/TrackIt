import { useCallback, useEffect, useId, useRef } from "react"

/**
 * The click a control plays under the thumb as it passes a step.
 *
 * The date wheel changes its value while a finger is moving, so the only usable
 * confirmation is the one that does not need looking at: a light tap. Two platforms
 * offer it two different ways, and neither is an API this app can rely on being
 * there:
 *
 * - **Android, and Chrome on a desktop** — `navigator.vibrate(8)`. Eight
 *   milliseconds is the shortest buzz most phones will play; anything longer reads
 *   as an alert rather than as a detent.
 * - **iOS** — Safari has never implemented `vibrate`. What it does have is the
 *   haptic the system plays when a switch is flipped, so the trick is to keep a
 *   `<input type="checkbox" switch>` in the document and click its label: iOS
 *   plays the system click and toggles a checkbox nobody ever sees.
 *
 *   The input has to stay **rendered**. It used to be `display: none`, which is a
 *   control iOS never lays out and therefore never ticks for — the wheel was silent
 *   on the owner's phone. It is now a 1×1 transparent switch in the corner of the
 *   page: invisible, out of the way, and real as far as the system is concerned.
 *
 *   This is a side effect of a control rather than a documented API, and it is
 *   version-sensitive: the scripted `click()` has been reported to stop producing
 *   haptics from iOS 26.5, where only a real tap on a real switch ticks. Nothing in
 *   the app depends on the tick having happened, so a silent wheel on those versions
 *   degrades to the same thing as a desktop: a wheel that simply does not buzz.
 *
 * The pair of elements is created once per mounted wheel and removed with it, so
 * no other screen carries a stray input around. Nothing is played where
 * `navigator.vibrate` does not exist and the switch has not taken — a desktop
 * Safari, for instance — and that is deliberate: a mouse click already has its own
 * feedback.
 */
export function useTick() {
  const uid = useId()
  const label = useRef<HTMLLabelElement | null>(null)
  /**
   * iOS is asked for the switch whatever its navigator says: no Safari there has ever
   * implemented `vibrate`, and an in-app browser that exposes a stub would take this
   * branch and tick silently forever. iPadOS reports itself as a Mac, so the touch
   * points are what name it.
   */
  const isIos =
    typeof navigator !== "undefined" &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /macintosh/i.test(navigator.userAgent)))
  /** Whether this browser plays a buzz itself, which is the branch with no DOM. */
  const vibrates = !isIos && typeof navigator !== "undefined" && typeof navigator.vibrate === "function"

  useEffect(() => {
    if (vibrates) return undefined

    // `useId` is not required to be a valid HTML id on its own; the label's `for`
    // is matched as a string, so anything outside that set is stripped for safety.
    const id = `tick-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`

    // One pixel, fully transparent, and on screen: iOS ticks for a switch it has laid
    // out, and `display: none` is a switch it has not. `pointer-events: none` keeps it
    // out of the way of a thumb without taking it out of the page.
    const hidden = "position:fixed;top:0;left:0;width:1px;height:1px;margin:0;padding:0;border:0;opacity:0;pointer-events:none;"

    const input = document.createElement("input")
    input.type = "checkbox"
    input.setAttribute("switch", "")
    input.id = id
    input.tabIndex = -1
    input.setAttribute("aria-hidden", "true")
    input.style.cssText = hidden

    const host = document.createElement("label")
    host.htmlFor = id
    host.setAttribute("aria-hidden", "true")
    host.style.cssText = hidden

    document.body.append(input, host)
    label.current = host
    return () => {
      label.current = null
      input.remove()
      host.remove()
    }
  }, [uid, vibrates])

  return useCallback(() => {
    if (vibrates) navigator.vibrate(8)
    else label.current?.click()
  }, [vibrates])
}
