import { Scanner } from "@yudiel/react-qr-scanner"
import type { IDetectedBarcode, IScannerError, ScannerErrorKind } from "@yudiel/react-qr-scanner"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import { PaySheet } from "@/components/PaySheet"
import { ThemeToggle } from "@/components/ThemeToggle"
import type { PaidDraft } from "@/features/upi/logScan"
import { parseUpiCode, UPI_PARSE_MESSAGE, type UpiPayee } from "@/features/upi/upi"
import type { Theme } from "@/lib/theme"

/**
 * Screen 3 — scan to pay.
 *
 * This is `Scanner.dc.html`, the design export's "Scan to pay" artboard, rebuilt
 * with Tailwind utilities in the app's own tokens. The screen is the artboard's
 * four bands, at its own coordinates: the 48px header (a back circle, the title and
 * the theme toggle); the hint in muted ink 88px down; the 358×358 viewfinder at
 * 224px, hairline in sage with its four corner brackets and the travelling line —
 * every one of those offsets plus `--safe-top`, which is 0 on a desktop;
 * then, 700px down, the little letterspaced label and the manual row — a 7fr/3fr
 * grid of the field and the clay **Use it** button.
 *
 * Three things are this app's rather than the artboard's, and they are deliberate:
 *
 * - **The frame holds a camera, not a drawing.** The artboard paints a stylised
 *   code inside the viewfinder — three finder squares and a generated 13×13 mark,
 *   with a sage line sweeping across it — because a mockup cannot hold a camera.
 *   Here the same frame holds the real feed (`@yudiel/react-qr-scanner`, which
 *   decodes with the browser's own `BarcodeDetector` where there is one and a WASM
 *   ZXing build where there is not, so one component covers both phones), and the
 *   corner brackets and the sweeping line are kept over it. The code-shaped
 *   placeholder is the one part of the artboard *not* rebuilt: a fake code is a
 *   stand-in for the thing this screen is for.
 * - **The status line.** The artboard's paragraph is the hint. It is also the only
 *   place the screen can say what just happened, so a camera that failed, a code
 *   that was not a payment and a row that was just logged all read there, in the
 *   artboard's own muted ink — the design draws no second treatment, and inventing
 *   one would be this app's taste rather than the artboard's. It carries
 *   `role="status"` so the words are announced as well as drawn.
 *
 * - **The money screen** (`components/PaySheet.tsx`), which most scanned codes need: a
 *   merchant's code usually carries no amount, because the amount is the merchant's to ask
 *   for and the owner's to choose. Those codes open it rather than being refused — the one
 *   number this app will not guess is the money.
 *
 * The artboard's scrim — a full-bleed mask with a square hole punched where the
 * camera is — composites to `--canvas` at 87% over `--card`, which is the canvas to
 * within two levels of red per channel, so the screen simply stands on the canvas
 * (the body's own background) and the frame is drawn `bg-card` on it. Nothing else
 * in the artboard's stack of layers has to be reproduced to get the same pixels.
 *
 * What a read code becomes is `features/upi/logScan.ts`: a code that carries an amount logs
 * a row under **Wallet - OneClick record** on the spot, a code without one opens the money
 * screen and is logged when the owner confirms it, and `features/upi/upi.ts` holds the
 * `upi://` builders both halves hand to another app.
 *
 * One thing the screen does not control: the decoder's own WASM. On a phone without
 * a native `BarcodeDetector` — an iPhone — the library fetches that file from the
 * jsDelivr CDN on the first scan. Its `prepareZXingModule` hook, and the
 * `locateFile` override that goes with it, were tried and did not reach the read
 * path the scanner actually uses, so the app ships the library's default rather than
 * a setting that looks like it works and does not. The scanner still decodes offline
 * once that file has been fetched once.
 */

/**
 * What this screen is given. Named and exported because the screen is fetched rather than
 * imported (`App.tsx` holds it as a `ComponentType<Props>`), and a type is the only thing
 * about it that can be in the entry chunk without dragging the decoder back in with it.
 */
export type Props = {
  theme: Theme
  onToggleTheme: () => void
  /** Back to the dashboard — the header's circle. */
  onBack: () => void
  /**
   * A valid UPI code was read **with its amount in it**, and its answer is what the status
   * line shows: `logScannedPayee` logs the row and returns the sentence, so the screen never
   * has to know whether a row was written or why it was not.
   */
  onPayee: (payee: UpiPayee) => string
  /**
   * What the money screen collected, when a code arrived without an amount: `logPaidPayee`
   * writes the row and returns the sentence, which the status line shows once the screen is
   * closed — the scanner is where the answer to "what did that do?" belongs.
   */
  onPaid: (payee: UpiPayee, draft: PaidDraft) => string
}

/**
 * Every way the camera can fail, in words the owner can act on. The kinds come from
 * the library's own union, so a new one added upstream fails the build here rather
 * than showing an empty error.
 */
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

/** The artboard's own hint, which is what the status line says until something happens. */
const HINT = "Point the camera at the merchant’s UPI QR code."

export function ScanScreen({ theme, onToggleTheme, onBack, onPayee, onPaid }: Props) {
  const [status, setStatus] = useState<string | null>(null)
  const [manual, setManual] = useState("")
  /**
   * The payee the money screen is open for, if any. A code with no amount in it comes here
   * rather than being refused, because the amount is the owner's to type.
   */
  const [paying, setPaying] = useState<UpiPayee | null>(null)
  /** What that screen's row was logged as, so the status line can say it on the way out. */
  const wrote = useRef<string | null>(null)
  /**
   * The last value the camera handed over, so a code held in front of it is one read
   * rather than dozens a second. Resetting on a *different* value is what lets the
   * screen scan one code, say what it did, and then read the next one — while holding
   * the phone still over the first keeps its answer on screen instead of flickering
   * between "Logged" and "already logged". Nothing remembers a code across a visit:
   * the ref dies with the screen, which is the right memory for it.
   */
  const lastRead = useRef<string | null>(null)
  /**
   * Whether the money screen is open, for `accept` to see. It is a `useCallback` whose only
   * dependency is `onPayee`, so it cannot read the state above without being rebuilt on
   * every render — a ref is what answers the same question for it.
   */
  const sheetOpen = useRef(false)

  const accept = useCallback(
    (raw: string) => {
      // A code read *behind* the money screen must not change what is on it: the camera runs
      // on under the sheet, and a second code in the frame would otherwise rewrite the payee
      // the owner is halfway through paying for.
      if (sheetOpen.current) return

      const result = parseUpiCode(raw)
      if (!result.ok) {
        // Not a payment code: say so and keep looking, because a phone often catches
        // whatever else is printed beside the QR code.
        setStatus(`${UPI_PARSE_MESSAGE[result.reason]} Move a little closer and hold still.`)
        return
      }

      // A code that carried its amount is logged on the spot — the merchant printed it.
      // A code that did not opens the money screen, which is the whole reason it is here.
      if (result.payee.amountCents === null) {
        wrote.current = null
        sheetOpen.current = true
        setStatus(null)
        setPaying(result.payee)
        return
      }

      setStatus(onPayee(result.payee))
    },
    [onPayee],
  )

  const handleScan = useCallback(
    (codes: IDetectedBarcode[]) => {
      const value = codes[0]?.rawValue
      if (!value || value === lastRead.current) return
      lastRead.current = value
      accept(value)
    },
    [accept],
  )

  const handleError = useCallback((error: IScannerError) => {
    setStatus(CAMERA_MESSAGE[error.kind] ?? CAMERA_MESSAGE.unknown)
  }, [])

  /**
   * The manual row is not gated the way the camera is: it is one deliberate press
   * with one value in it, so pressing **Use it** twice is worth answering twice —
   * the second answer being that the row was already there.
   */
  const submitManual = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      if (manual.trim()) accept(manual)
    },
    [accept, manual],
  )

  return (
    <div className="relative min-h-dvh w-full bg-canvas text-ink">
      <div className="relative mx-auto w-full max-w-[390px] px-4 pt-safe pb-nav">
        <header className="flex h-12 items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the dashboard"
            className="flex size-12 shrink-0 items-center justify-center rounded-3xl border border-line bg-card text-ink"
          >
            <ArrowLeft className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <h1 className="font-display text-base leading-6 font-medium tracking-[-0.01em]">Scan to pay</h1>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </header>

        {/*
          The hint, at the artboard's own `top: 88px` — below the header rather than
          beside it — and absolutely positioned so that a long sentence (a refusal, a
          camera failure) can wrap without pushing the viewfinder down the screen. The
          frame sits at a fixed 224px because the artboard fixes it, not because it
          follows the text.

          The offset carries `--safe-top` because absolute children are placed against
          the column's padding box, not inside its padding: without it the hint would
          stay at 88px while the header above it moved down for the notch, and the two
          would overlap on an iPhone.
        */}
        <p
          className="absolute inset-x-4 m-0 text-ink2"
          style={{ top: "calc(88px + var(--safe-top))" }}
          role="status"
        >
          {status ?? HINT}
        </p>

        <div
          role="img"
          aria-label="Camera viewfinder"
          className="relative mt-[152px] size-[358px] overflow-hidden rounded-[16px] border border-sage bg-card"
        >
          <Scanner
            onScan={handleScan}
            onError={handleError}
            // The back camera, because a merchant's code is across the counter.
            constraints={{ facingMode: "environment" }}
            formats={["qr_code"]}
            // No beep, no zoom control: the frame is the whole interface. The torch
            // stays, because a QR code in a dim shop needs it.
            sound={false}
            components={{ finder: false, zoom: false, torch: true }}
            // A short pause between reads is enough to stop a burst of callbacks
            // without making the scan feel slow.
            scanDelay={600}
            styles={{
              container: { width: "100%", height: "100%" },
              video: { width: "100%", height: "100%", objectFit: "cover" },
            }}
          />

          {/*
            The artboard's corner brackets: four 32px Ls drawn into its own 356×356
            box, so they land 16px in from each corner of the frame's inner edge.
          */}
          <svg
            viewBox="0 0 356 356"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full text-sage"
          >
            <g fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M16 48V16H48" />
              <path d="M308 16H340V48" />
              <path d="M340 308V340H308" />
              <path d="M48 340H16V308" />
            </g>
          </svg>

          {/*
            The line that sweeps the frame, 16px in from each side, 2px tall and
            travelling 24px to 332px on the artboard's 2.6s alternate curve
            (`@keyframes scan` in `index.css`). It is the screen's own promise that
            the camera is looking, so it runs whenever the screen does.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-4 left-4 h-0.5 animate-[scan_2.6s_ease-in-out_infinite_alternate] bg-sage"
          />
        </div>

        {/*
          The artboard's small letterspaced label at `top: 700px` — 118px below the
          frame — which is the manual field's label rather than a caption: the field
          below it is what answers the question it asks.
        */}
        <label
          htmlFor="scan-manual"
          // `block` is load-bearing rather than cosmetic: a label is inline, an inline
          // box ignores a vertical margin, and this one carries the artboard's 118px
          // that puts the row at its 700px. As an inline it sat 4px under the frame
          // and pulled the whole manual row up with it.
          className="mt-[118px] block text-[10px] leading-4 font-bold tracking-[0.03em] whitespace-nowrap text-ink2"
        >
          NO CAMERA, OR A CODE THAT WILL NOT SCAN?
        </label>

        {/* The field and the button, on the artboard's own 7fr/3fr grid, 8px apart. */}
        <form onSubmit={submitManual} className="mt-2 grid grid-cols-[7fr_3fr] gap-2">
          <input
            id="scan-manual"
            type="text"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="pa=name@bank — or the whole upi:"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full rounded-[16px] border border-line bg-card px-4 text-[13px] leading-4"
          />
          <button
            type="submit"
            className="flex h-12 items-center justify-center gap-2 rounded-[16px] border-0 bg-clay px-2 text-[13px] leading-4 font-bold whitespace-nowrap text-on-clay"
          >
            Use it
            <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </form>
      </div>

      {/*
        The money screen, over everything, for a code that carried no amount. The status
        line tells the story once it closes: what the row was logged as, or — if the owner
        left without paying — the artboard's own hint again, because nothing happened.
      */}
      {paying !== null && (
        <PaySheet
          payee={paying}
          onPay={(draft) => {
            wrote.current = onPaid(paying, draft)
            return wrote.current
          }}
          onClose={() => {
            sheetOpen.current = false
            setPaying(null)
            setStatus(wrote.current)
          }}
        />
      )}
    </div>
  )
}
