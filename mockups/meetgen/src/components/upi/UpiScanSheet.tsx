import { useCallback, useRef, useState } from "react"
import {
  Scanner,
  type IDetectedBarcode,
  type IScannerError,
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

type Props = {
  /** A valid UPI code was read. The parent takes over from here. */
  onPayee: (payee: UpiPayee) => void
  /** The owner backed out. */
  onClose: () => void
}

export function UpiScanSheet({ onPayee, onClose }: Props) {
  const [message, setMessage] = useState<string | null>(null)
  const [manual, setManual] = useState("")
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

  function submitManual(event: React.FormEvent) {
    event.preventDefault()
    accept(manual)
  }

  return (
    <section aria-label="Scan a UPI code" className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close the scanner">
          <ArrowLeft />
        </Button>
        <h2 className="text-2xl font-bold tracking-tight">Scan to pay</h2>
      </div>

      <div className="relative h-[320px] shrink-0 overflow-hidden rounded-[32px] bg-ink">
        <Scanner
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
      </div>

      <p
        role="status"
        className={
          message
            ? "font-mono text-[11px] tracking-wide text-tangerine uppercase"
            : "font-mono text-[11px] tracking-wide uppercase opacity-70"
        }
      >
        {message ?? "Point the camera at the merchant’s UPI QR code."}
      </p>

      <form onSubmit={submitManual} className="flex flex-col gap-2">
        <label htmlFor="scan-manual" className="font-mono text-[11px] tracking-wide uppercase">
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
            className="h-11 min-w-0 flex-1 rounded-full border border-ink/10 bg-paper px-4 text-sm outline-none focus-visible:outline-2 focus-visible:outline-ink"
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
