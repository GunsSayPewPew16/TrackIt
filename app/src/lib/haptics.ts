/**
 * The engine behind every tick, click and thud in the app.
 *
 * Three weights, because a keypad has three kinds of key and a thumb can feel the
 * difference without looking:
 *
 * - **light** — 8ms: a digit, a category, a tab, a capsule crossing the wheel.
 * - **medium** — 20ms: backspace, the decimal point, a dismissed sheet.
 * - **heavy** — 45ms: confirming an entry. It is the only one that should ever read as
 *   a thud rather than a detent.
 *
 * **Android/Chromium** play exactly that, through `navigator.vibrate(ms)`.
 *
 * **iOS has never implemented `vibrate`.** What it does have is the haptic the system
 * plays when a switch is flipped, so the engine keeps one `<input type="checkbox"
 * switch>` in the document root and `.click()`s it. The input has to stay **rendered** —
 * a `display: none` switch is a control iOS never lays out and therefore never ticks
 * for — so it is a 1×1, fully transparent switch parked at the root with
 * `pointer-events: none`. `opacity: 0` rather than `visibility: hidden` is the same
 * point: the system still has a laid-out control to play.
 *
 * iOS cannot vary the length of that tick. A heavier pulse is therefore approximated
 * with extra clicks a few frames apart — one for light, two for medium, three for
 * heavy — which is the only tuning the platform exposes. It is a side effect of a
 * control rather than a documented API, so it is version-sensitive: scripted switch
 * clicks have been reported to stop ticking from iOS 26.5, where only a real tap does.
 * Nothing in the app waits on a tick; a silent phone is the accepted fallback.
 *
 * Call these **synchronously inside a user gesture** (click, pointerdown, keydown).
 * iOS ignores them outside one, which is why a drag can be silent until it is released.
 * A desktop with neither path simply gets nothing, which is the right amount of feedback
 * for a mouse.
 */
const COOLDOWN = 40

let switchLabel: HTMLLabelElement | null = null
let lastPlayedAt = 0

/** iPadOS reports itself as a Mac; the touch points are what name it. */
const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /macintosh/i.test(navigator.userAgent)))

/**
 * Create the hidden switch, once. `lightTap` does this on its first call anyway; the dock
 * also does it on mount so that the very first tap of a session is not the one that pays
 * for the DOM insert.
 */
export function primeHaptics(): void {
  ensureSwitch()
}

function ensureSwitch(): HTMLLabelElement | null {
  if (switchLabel || typeof document === "undefined") return switchLabel
  const label = document.createElement("label")
  label.setAttribute("aria-hidden", "true")
  label.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;margin:0;padding:0;border:0;opacity:0;pointer-events:none;overflow:hidden"
  const input = document.createElement("input")
  input.type = "checkbox"
  input.setAttribute("switch", "") // the attribute that makes WebKit play the haptic
  input.tabIndex = -1
  input.setAttribute("aria-hidden", "true")
  label.appendChild(input)
  document.documentElement.appendChild(label)
  switchLabel = label
  return label
}

function pulse(ms: number, clicks: number): void {
  if (typeof navigator === "undefined") return

  // One gesture, one pulse: two weights fired by the same tap would smear into one
  // broken buzz, and a keypad can easily call two handlers before it settles.
  const now = Date.now()
  if (now - lastPlayedAt < COOLDOWN) return
  lastPlayedAt = now

  if (!isIos() && typeof navigator.vibrate === "function") {
    navigator.vibrate(ms)
    return
  }

  const label = ensureSwitch()
  if (!label) return
  label.click()
  for (let i = 1; i < clicks; i += 1) {
    // iOS ignores a second scripted click in the same frame; ~30ms is the gap at which
    // the system plays another tick.
    window.setTimeout(() => label?.click(), i * 30)
  }
}

/** 8ms — a digit, a category, a tab, a capsule. */
export function lightTap(): void {
  pulse(8, 1)
}

/** 20ms — backspace, decimal point, a dismissed sheet. */
export function mediumClick(): void {
  pulse(20, 2)
}

/** 45ms — the final submission, and nothing else. */
export function heavyThud(): void {
  pulse(45, 3)
}
