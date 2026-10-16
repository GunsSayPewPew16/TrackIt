import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  Scanner,
  type IDetectedBarcode,
  type IScannerError,
  type IScannerHandle,
  type ScannerErrorKind,
} from "@yudiel/react-qr-scanner"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { parseUpiCode, UPI_PARSE_MESSAGE, type UpiPayee } from "@/lib/upi"

/** Every way the camera can fail, in words the owner can act on. */
const CAMERA_MESSAGE: Record<ScannerErrorKind, string> = {
  "permission-denied":
    "TrackIt needs permission to use the camera. Allow it for this site in your browser settings, then try again.",
  "no-camera": "No camera was found on this device.",
  "in-use": "Another app is using the camera. Close it and try again.",
  overconstrained: "This camera cannot do what the scanner asked of it.",
  "insecure-context": "The camera only works over HTTPS, or on localhost.",
  unsupported: "This browser cannot scan QR codes.",
  aborted: "The camera stopped before it started. Try again.",
  security: "The browser blocked the camera for this page.",
  "type-error": "The camera could not be started.",
  unknown: "The camera could not be started.",
}

/**
 * How the camera is getting on, which this sheet has to say out loud.
 *
 * The scanner library bounds the *playing* of a stream — its own `startTimeoutMs`
 * — but nothing bounds the request *for* one. `getUserMedia` is allowed to never
 * settle at all: a permission prompt left open, a camera another app is holding,
 * a browser that has stopped answering. Nothing reports that, so a viewfinder sits
 * there looking like it is about to work while the owner waits for a picture that
 * is not coming. So the sheet watches for **frames**, not for the promise, and
 * says what it knows while the manual entry below stays a complete way to pay.
 *
 * The wait never unmounts the scanner: giving up while a request is still open
 * would let a stream that later resolves go live with nothing holding it, which
 * is a camera light left on rather than a bug report. It only changes the copy.
 */
const CAMERA_SLOW_MS = 10_000
const CAMERA_POLL_MS = 250

/**
 * How long the sheet waits for the browser to answer about the camera.
 *
 * The camera is not requested until the answer is in — a `denied` camera must
 * never be asked for, because that request can hang — but a browser that will not
 * answer must not hold the camera up either, so the wait is a moment, not a
 * second and a half of the owner's time.
 */
const CAMERA_ANSWER_MS = 1200

/** A camera that has produced nothing yet — including one waiting on a prompt. */
const CAMERA_SLOW =
  "The camera has not started yet. If a permission prompt is open, answer it — or type the code below."

/** And one the browser has already refused, which no amount of waiting fixes. */
const CAMERA_BLOCKED =
  "The browser is blocking the camera for this site. Allow it in the browser’s settings and reload, or type the code below."

/**
 * What the browser says about the camera before we ask for it.
 *
 * `denied` is the one answer worth acting on: it is the request that can only hang
 * or fail, so it is never made. `prompt` and `granted` mean the request is worth
 * making; `unknown` is every browser that will not say (Safari does not answer for
 * `camera` at all), and that is not treated as a refusal.
 */
type CameraPermission = "unknown" | PermissionState

/**
 * A camera that throws must not take the sheet with it.
 *
 * The manual entry below is a complete way to pay, so a scanner that crashes while
 * rendering is a fallback rather than a dead end — which is the whole point of
 * this boundary: it renders nothing in the camera's place, instead of unmounting
 * the page the owner is standing on.
 */
class CameraBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(): void {
    this.props.onFail()
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

type Props = {
  /** A valid UPI code was read. The parent takes over from here. */
  onPayee: (payee: UpiPayee) => void
  /** The owner backed out. */
  onClose: () => void
}

export function UpiScanSheet({ onPayee, onClose }: Props) {
  const [message, setMessage] = useState<string | null>(null)
  const [manual, setManual] = useState("")
  /** Whether a frame has ever arrived, and whether we have waited long enough to say so. */
  const [live, setLive] = useState(false)
  const [slow, setSlow] = useState(false)
  const [permission, setPermission] = useState<CameraPermission>("unknown")
  /** The camera element the scanner is driving, so its frames can be watched. */
  const scanner = useRef<IScannerHandle | null>(null)
  // A camera can see the same code dozens of times a second; the first valid
  // read wins so a payee can never be opened twice.
  const handled = useRef(false)

  const accept = useCallback(
    (raw: string) => {
      if (handled.current) return
      const result = parseUpiCode(raw)
      if (result.ok) {
        handled.current = true
        onPayee(result.payee)
        return
      }
      setMessage(UPI_PARSE_MESSAGE[result.reason])
    },
    [onPayee],
  )

  const handleScan = useCallback(
    (codes: IDetectedBarcode[]) => {
      const value = codes[0]?.rawValue
      if (value) accept(value)
    },
    [accept],
  )

  const handleError = useCallback((error: IScannerError) => {
    setMessage(CAMERA_MESSAGE[error.kind] ?? CAMERA_MESSAGE.unknown)
  }, [])

  // Ask the browser, once, whether the camera is worth requesting at all, and do
  // not touch the camera until it answers.
  useEffect(() => {
    let cancelled = false
    const answer = (state: CameraPermission) => {
      if (!cancelled) setPermission((current) => (current === "unknown" ? state : current))
    }
    // A browser that never answers still gets a camera; it just waits a moment.
    const impatient = setTimeout(() => answer("prompt"), CAMERA_ANSWER_MS)
    try {
      navigator.permissions
        ?.query({ name: "camera" as PermissionName })
        // A browser that will not answer is not a browser that has refused.
        .then((status) => answer(status.state))
        .catch(() => answer("prompt"))
    } catch {
      answer("prompt")
    }
    return () => {
      cancelled = true
      clearTimeout(impatient)
    }
  }, [])

  // Frames are the evidence that the camera started. A request that never settles
  // and a stream that delivers nothing look identical without watching for them.
  useEffect(() => {
    if (live || permission === "denied") return
    const startedAt = Date.now()
    const id = setInterval(() => {
      const video = scanner.current?.getVideoElement() ?? null
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        setLive(true)
        return
      }
      if (Date.now() - startedAt >= CAMERA_SLOW_MS) setSlow(true)
    }, CAMERA_POLL_MS)
    return () => clearInterval(id)
  }, [live, permission])

  function submitManual(event: React.FormEvent) {
    event.preventDefault()
    accept(manual)
  }

  // What the sheet says under the viewfinder, in the order the owner needs it: a
  // problem the camera reported, then a refusal we already know about, then our
  // own "nothing has arrived yet", and only then the plain instruction.
  const status =
    message ??
    (permission === "denied"
      ? CAMERA_BLOCKED
      : slow && !live
        ? CAMERA_SLOW
        : "Point the camera at the merchant’s UPI QR code.")

  const statusClass =
    message || permission === "denied"
      ? "text-[11px] font-medium tracking-wide text-alert uppercase"
      : "text-[11px] font-medium tracking-wide uppercase opacity-70"

  return (
    <section aria-label="Scan a UPI code" className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close the scanner">
          <ArrowLeft />
        </Button>
        <h2 className="font-display text-2xl font-bold tracking-tight">Scan to pay</h2>
      </div>

      {/* The camera's letterbox stays ink: it frames a live video, not a box on
          the page, and a bright one would flash around the viewfinder. */}
      <div className="relative h-[320px] shrink-0 overflow-hidden rounded-[32px] bg-ink">
        {permission === "denied" ? (
          <p className="flex h-full items-center justify-center px-8 text-center text-[11px] font-medium tracking-wide text-cream/80 uppercase">
            No camera access
          </p>
        ) : permission === "unknown" ? (
          <p className="flex h-full items-center justify-center px-8 text-center text-[11px] font-medium tracking-wide text-cream/80 uppercase">
            Starting the camera
          </p>
        ) : (
          <CameraBoundary onFail={() => setMessage(CAMERA_MESSAGE.unknown)}>
            <Scanner
              ref={scanner}
              onScan={handleScan}
              onError={handleError}
              // The back camera, because a merchant's code is across the counter.
              constraints={{ facingMode: "environment" }}
              formats={["qr_code"]}
              sound={false}
              components={{ finder: false, zoom: false, torch: true }}
              scanDelay={600}
              styles={{
                container: { width: "100%", height: "100%" },
                video: { width: "100%", height: "100%", objectFit: "cover" },
              }}
            />
          </CameraBoundary>
        )}
        {/* The viewfinder says so itself once it has waited long enough, because a
            black rectangle that never fills in is the whole problem being fixed. */}
        {slow && !live && permission !== "denied" && (
          <p className="pointer-events-none absolute inset-x-4 bottom-4 text-center text-[11px] font-medium tracking-wide text-cream/85 uppercase">
            No camera frames yet
          </p>
        )}
      </div>

      <p role="status" className={statusClass}>
        {status}
      </p>

      <form onSubmit={submitManual} className="flex flex-col gap-2">
        <label htmlFor="scan-manual" className="text-[11px] font-medium tracking-wide uppercase">
          No camera, or a code that will not scan?
        </label>
        <div className="flex gap-2">
          <input
            id="scan-manual"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="pa=name@bank, or the whole upi:// link"
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-full border border-ink/10 bg-card px-4 text-sm text-ink outline-none placeholder:text-ink/55 focus-visible:outline-2 focus-visible:outline-ink"
          />
          <Button type="submit" variant="default" className="h-11">
            Use it
          </Button>
        </div>
      </form>
      </div>
    </section>
  )
}
