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
 *   hidden `<input type="checkbox" switch>` in the document and click its label:
 *   iOS plays the system click and toggles a checkbox nobody ever sees. This is a
 *   side effect of a control rather than a documented API, so Apple could take it
 *   away; the fallback then is simply a silent wheel, which is why nothing here
 *   depends on the tick having happened.
 *
 * The pair of elements is created once per mounted wheel and removed with it, so
 * no other screen carries a hidden input around. Nothing is played where
 * `navigator.vibrate` does not exist and the switch trick has not taken — a desktop
 * Safari, for instance — and that is deliberate: a mouse click already has its own
 * feedback.
 */
export function useTick() {
  const uid = useId()
  const label = useRef<HTMLLabelElement | null>(null)
  /** Whether this browser plays a buzz itself, which is the branch with no DOM. */
  const vibrates = typeof navigator !== "undefined" && typeof navigator.vibrate === "function"

  useEffect(() => {
    if (vibrates) return undefined

    // `useId` is not required to be a valid HTML id on its own; the label's `for`
    // is matched as a string, so anything outside that set is stripped for safety.
    const id = `tick-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`

    const input = document.createElement("input")
    input.type = "checkbox"
    input.setAttribute("switch", "")
    input.id = id
    input.tabIndex = -1
    input.setAttribute("aria-hidden", "true")
    input.style.display = "none"

    const host = document.createElement("label")
    host.htmlFor = id
    host.setAttribute("aria-hidden", "true")
    host.style.display = "none"

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
