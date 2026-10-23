/**
 * The keypad's click: a short, dry tick, the way an iPhone keyboard sounds on a key press.
 *
 * It is synthesised rather than shipped as a file, so there is nothing to fetch and nothing to
 * cache: a burst of filtered noise, about 18ms long and falling away fast, through a band-pass
 * that puts the energy in the mid-high range where a key's click sits. One `AudioContext` is
 * made on the first press and reused. Browsers only let audio start from a gesture, and a
 * keypad press is one, so the first click is never silent.
 *
 * It is quiet by design (the gain is low). It plays whenever the keypad is pressed; the haptic
 * from `lib/haptics.ts` is the separate feedback for devices that have one.
 */

const CLICK_SECONDS = 0.018
const GAIN = 0.22

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (context) return context
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  context = new Ctor()
  return context
}

/** Play one keypad click. Silent if audio is unavailable or refused; never throws. */
export function keyClick(): void {
  try {
    const ctx = audio()
    if (!ctx) return
    if (ctx.state === "suspended") void ctx.resume()

    const length = Math.floor(ctx.sampleRate * CLICK_SECONDS)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      // White noise under an exponential decay: a sharp onset that dies in a few milliseconds.
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004))
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer

    const band = ctx.createBiquadFilter()
    band.type = "bandpass"
    band.frequency.value = 2400
    band.Q.value = 1.2

    const gain = ctx.createGain()
    gain.gain.value = GAIN

    source.connect(band).connect(gain).connect(ctx.destination)
    source.start()
  } catch {
    // A device that refuses audio gets the haptic and nothing else; the key still works.
  }
}
