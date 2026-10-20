import { BarcodeDetector } from "barcode-detector/ponyfill"
import { useEffect, useRef, useState, type RefObject } from "react"

/**
 * Every number the scanner's behaviour depends on, in one place to tune against a real phone.
 *
 * The loop decodes at most once per `scanIntervalMs` (≈30 per second) and never overlaps two
 * decodes. A code that is in frame but unread for `stuckMs` steps the zoom one rung up, so the
 * camera punches in on a code held too far away; the ladder resets to 1.0 once a code reads, and
 * when the frame has been empty for `resetAfterMs`, which is the owner pulling the phone away.
 */
export const SCAN_CONFIG = {
  /** The zoom rungs, as multiples of the full frame. Rung 0 is the baseline 1.0. */
  zoomLadder: [1, 1.5, 2, 2.5, 3],
  /** Decode attempts per second, as the gap between them in milliseconds (≈30 fps). */
  scanIntervalMs: 33,
  /** How long a busy frame may go unread before the zoom steps up one rung. */
  stuckMs: 400,
  /** The least time between two rungs, so a zoom has settled before it is judged again. */
  stepCooldownMs: 600,
  /** How long the frame may stay empty before the zoom goes back to 1.0. */
  resetAfterMs: 1200,
  /**
   * How much the centre of the frame must vary (standard deviation of luminance, 0–255) to count
   * as holding a code. A code is high-contrast, so a plain wall or a dark sleeve falls under it.
   */
  busyDeviation: 28,
  /** The widest the decoder is given a frame, in pixels. A wider frame costs time for no read. */
  scanWidth: 960,
  /** The camera resolution asked for. The browser gives the nearest it has. */
  idealWidth: 1280,
  idealHeight: 720,
  /** Decoder failures in a row before the scanner stops and says so. */
  maxDecodeFailures: 30,
} as const

/** Why the camera could not be used, in words the screen can show. */
export type ScanErrorKind =
  | "permission-denied"
  | "no-camera"
  | "in-use"
  | "overconstrained"
  | "insecure-context"
  | "unsupported"
  | "unknown"

/** The parts of a track's capabilities this file reads. The DOM typings leave most of them out. */
type TrackCapabilities = {
  zoom?: { min: number; max: number }
  torch?: boolean
}

export type ScanCamera = {
  /** The zoom rung the camera is on, as its multiple of the frame. */
  zoom: number
  /** Whether the camera's torch can be switched, and whether it is on. */
  torchAvailable: boolean
  torchOn: boolean
  setTorch: (on: boolean) => void
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** The camera error the browser reports, as the kind the screen words. */
export function scanErrorKind(error: unknown): ScanErrorKind {
  const name = (error as { name?: unknown } | null)?.name
  switch (name) {
    case "NotAllowedError":
      return "permission-denied"
    case "SecurityError":
      return "insecure-context"
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "no-camera"
    case "NotReadableError":
    case "TrackStartError":
      return "in-use"
    case "OverconstrainedError":
      return "overconstrained"
    default:
      return "unknown"
  }
}

/**
 * Stream the back camera into `videoRef` and read codes from it.
 *
 * **Hardware zoom (Chrome on Android).** If the track reports a `zoom` capability, each rung is
 * applied to the track itself, so the lens does the work and the frame stays sharp.
 *
 * **Digital zoom (Safari on iOS).** WebKit does not expose lens control, so the centre of the frame
 * is cropped and scaled up into a canvas, and that crop is what the decoder reads. The video is
 * scaled with a CSS transform on the same rung, so the picture the owner sees is the picture being
 * read.
 *
 * The decoder is the one the QR library already uses (`barcode-detector`): the browser's own
 * `BarcodeDetector` where there is one, and its ZXing WebAssembly build where there is not.
 */
export function useScanCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  onCode: (raw: string) => void,
  onError: (kind: ScanErrorKind) => void,
  active: boolean,
): ScanCamera {
  const [zoom, setZoom] = useState(1)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const applyTorch = useRef<((on: boolean) => void) | null>(null)

  // The latest callbacks, so the loop does not restart when the screen re-renders.
  const onCodeRef = useRef(onCode)
  const onErrorRef = useRef(onError)
  onCodeRef.current = onCode
  onErrorRef.current = onError

  useEffect(() => {
    const video = videoRef.current
    if (!active || !video) return

    let stopped = false
    let stream: MediaStream | null = null
    let frame = 0
    let busy = false
    let failures = 0
    let lastFrameAt = 0
    let busySince: number | null = null
    let quietSince: number | null = null
    let lastStepAt = 0
    let rung = 0
    let hardwareRange: { min: number; max: number } | null = null
    let torchCapable = false

    const canvas = document.createElement("canvas")
    const probe = document.createElement("canvas")
    probe.width = 48
    probe.height = 27
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    const probeCtx = probe.getContext("2d", { willReadFrequently: true })

    const ladder = SCAN_CONFIG.zoomLadder

    /** Put the camera on a rung: the track's zoom where it has one, the CSS punch-in otherwise. */
    const setRung = (next: number) => {
      rung = next
      const factor = ladder[next]
      setZoom(factor)
      if (hardwareRange) {
        const target = clamp(factor, hardwareRange.min, hardwareRange.max)
        const track = trackRef.current
        track?.applyConstraints({ advanced: [{ zoom: target } as MediaTrackConstraintSet] }).catch(() => {})
      } else {
        video.style.transform = factor === 1 ? "" : `scale(${factor})`
      }
    }

    /** Average and spread of the frame's centre, from a 48×27 sample. */
    const centreBusy = (source: HTMLCanvasElement): boolean => {
      if (!probeCtx) return false
      probeCtx.drawImage(source, 0, 0, probe.width, probe.height)
      const pixels = probeCtx.getImageData(0, 0, probe.width, probe.height).data
      let sum = 0
      let sumSquares = 0
      let count = 0
      for (let y = 6; y < 21; y++) {
        for (let x = 12; x < 36; x++) {
          const i = (y * probe.width + x) * 4
          const luminance = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
          sum += luminance
          sumSquares += luminance * luminance
          count++
        }
      }
      const mean = sum / count
      const deviation = Math.sqrt(Math.max(0, sumSquares / count - mean * mean))
      return deviation > SCAN_CONFIG.busyDeviation
    }

    /** The loop's per-frame judgement: a read resets, a stuck busy frame steps up, an empty one resets. */
    const judge = (raw: string | null, source: HTMLCanvasElement, now: number) => {
      if (raw !== null) {
        busySince = null
        quietSince = null
        onCodeRef.current(raw)
        if (rung !== 0) setRung(0)
        return
      }

      if (centreBusy(source)) {
        quietSince = null
        busySince ??= now
        const stuck = now - busySince > SCAN_CONFIG.stuckMs
        const cooled = now - lastStepAt > SCAN_CONFIG.stepCooldownMs
        if (stuck && cooled && rung < ladder.length - 1) {
          lastStepAt = now
          busySince = now
          setRung(rung + 1)
        }
        return
      }

      busySince = null
      quietSince ??= now
      if (rung !== 0 && now - quietSince > SCAN_CONFIG.resetAfterMs) {
        lastStepAt = now
        setRung(0)
      }
    }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (busy || stopped || !ctx) return
      if (now - lastFrameAt < SCAN_CONFIG.scanIntervalMs) return
      if (video.readyState < 2 || video.videoWidth === 0) return
      lastFrameAt = now

      const vw = video.videoWidth
      const vh = video.videoHeight
      // The digital crop is the frame's centre at 1/zoom of its size. With hardware zoom the track
      // already delivers the magnified frame, so the crop is the whole of it.
      const digital = hardwareRange === null ? ladder[rung] : 1
      const sw = vw / digital
      const sh = vh / digital
      const sx = (vw - sw) / 2
      const sy = (vh - sh) / 2
      const scale = Math.min(1, SCAN_CONFIG.scanWidth / sw)
      const cw = Math.round(sw * scale)
      const ch = Math.round(sh * scale)
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch)

      busy = true
      detector
        .detect(canvas)
        .then((codes) => {
          if (stopped) return
          failures = 0
          const raw = codes.find((code) => code.rawValue)?.rawValue ?? null
          judge(raw, canvas, now)
        })
        .catch(() => {
          if (stopped) return
          failures++
          if (failures >= SCAN_CONFIG.maxDecodeFailures) {
            stopped = true
            onErrorRef.current("unsupported")
          }
        })
        .finally(() => {
          busy = false
        })
    }

    const detector = new BarcodeDetector({ formats: ["qr_code"] })

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current(window.isSecureContext ? "unsupported" : "insecure-context")
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: SCAN_CONFIG.idealWidth },
            height: { ideal: SCAN_CONFIG.idealHeight },
            // Best effort: a camera without continuous focus simply ignores it.
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          },
        })
      } catch (error) {
        if (!stopped) onErrorRef.current(scanErrorKind(error))
        return
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const track = stream.getVideoTracks()[0]
      trackRef.current = track
      const capabilities = (track?.getCapabilities?.() ?? {}) as TrackCapabilities
      if (capabilities.zoom) hardwareRange = capabilities.zoom
      torchCapable = capabilities.torch === true
      setTorchAvailable(torchCapable)
      applyTorch.current = (on) => {
        if (!torchCapable || !track) return
        track
          .applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
          .then(() => setTorchOn(on))
          .catch(() => {})
      }

      video.srcObject = stream
      await video.play().catch(() => {})
      if (stopped) return
      frame = requestAnimationFrame(tick)
    }

    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
      video.srcObject = null
      video.style.transform = ""
      trackRef.current = null
      applyTorch.current = null
      setZoom(1)
      setTorchOn(false)
      setTorchAvailable(false)
    }
  }, [videoRef, active])

  return {
    zoom,
    torchAvailable,
    torchOn,
    setTorch: (on: boolean) => applyTorch.current?.(on),
  }
}
