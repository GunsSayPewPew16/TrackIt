/**
 * A light tap under the thumb, for the controls that have no time to be looked at.
 *
 * - **Android / Chromium** play it themselves: `navigator.vibrate(8)`, the shortest
 *   buzz most phones will make. Anything longer reads as an alert rather than a detent.
 * - **iOS** has never implemented `vibrate`. What it does have is the haptic the system
 *   plays when a switch is flipped, so one `<input type="checkbox" switch>` is kept in
 *   the document and `.click()`ed: the toggle plays the system click for a checkbox
 *   nobody ever sees. The input has to stay **rendered** — `display: none` is a control
 *   iOS never lays out and therefore never ticks for — so it is a 1x1 transparent switch
 *   parked off screen.
 *
 * The click goes to the input itself, not to a label wrapped around it: a label's
 * forwarding is a DOM convenience that WebKit has never promised to turn into a taptic
 * pulse. Both elements are kept so a real tap on either would work; a scripted tick
 * only ever clicks the switch.
 *
 * Call it **synchronously inside a user gesture** (click, pointerdown, keydown). iOS
 * ignores it outside one, so it stays silent during a drag. Where neither path exists —
 * a desktop browser, an older iOS — it does nothing at all, which is the right amount
 * of feedback for a mouse.
 *
 * One caveat, shared with the wheel's own tick (`hooks/useTick.ts`): scripted switch
 * clicks have been reported to stop producing haptics from iOS 26.5, where only a real
 * tap on a real switch ticks. Nothing in the app depends on the tick happening.
 */
let switchLabel: HTMLLabelElement | null = null

/**
 * Create the hidden switch, once. `lightTap` does this on its first call anyway; the
 * dock also does it on mount so that the very first tap of a session is not the one
 * that pays for the DOM insert.
 */
export function primeHaptics(): void {
  ensureSwitch()
}

function ensureSwitch(): HTMLLabelElement | null {
  if (switchLabel || typeof document === "undefined") return switchLabel
  const label = document.createElement("label")
  label.setAttribute("aria-hidden", "true")
  label.style.cssText =
    "position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden"
  const input = document.createElement("input")
  input.type = "checkbox"
  input.setAttribute("switch", "") // the attribute that makes Safari play the haptic
  input.tabIndex = -1
  label.appendChild(input)
  document.body.appendChild(label)
  switchLabel = label
  return label
}

export function lightTap(): void {
  if (typeof navigator === "undefined") return
  if ("vibrate" in navigator) {
    navigator.vibrate(8)
    return
  }
  ensureSwitch()?.click()
}
