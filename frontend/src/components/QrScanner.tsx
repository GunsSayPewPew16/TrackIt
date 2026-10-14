import { Scanner } from '@yudiel/react-qr-scanner'
import type { IDetectedBarcode, IScannerError, ScannerErrorKind } from '@yudiel/react-qr-scanner'
import { useCallback, useRef, useState } from 'react'
import { parseUpiCode, UPI_PARSE_MESSAGE, type UpiPayee } from '../lib/upi'
import styles from './scan.module.css'

/*
 * One thing this screen does not control: the decoder's own WASM. On a phone
 * without a native `BarcodeDetector` — an iPhone — the library fetches that
 * file from the jsDelivr CDN on the first scan. Its `prepareZXingModule` hook,
 * and the `locateFile` override that goes with it, were tried and did not reach
 * the read path the scanner actually uses, so the app ships the library's
 * default rather than a setting that looks like it works and does not. The
 * scanner still decodes offline once that file has been fetched once.
 */

/**
 * The camera, pointed at a merchant's QR code.
 *
 * `@yudiel/react-qr-scanner` decodes with the browser's own `BarcodeDetector`
 * where it exists (Chrome on Android) and falls back to a WASM build of ZXing
 * where it does not (Safari on iOS), so one component covers both phones. Only
 * the `qr_code` format is asked for: this is a UPI scanner, not a barcode app.
 *
 * The screen is a full-screen overlay and the camera is released when it
 * unmounts — the parent unmounts it the moment a payee is found, so the camera
 * light goes out as the pay sheet appears rather than staying on behind it.
 */

type Props = {
  /** A valid UPI code was read. The parent takes over from here. */
  onPayee: (payee: UpiPayee) => void
  /** The owner backed out, or there is nothing this screen can do. */
  onCancel: () => void
}

/**
 * Every way the camera can fail, in words the owner can act on. The kinds come
 * from the library's own union, so a new one added upstream fails the build
 * here rather than showing an empty error.
 */
const CAMERA_MESSAGE: Record<ScannerErrorKind, string> = {
  'permission-denied':
    'TrackIt needs permission to use the camera. Allow it for this site in your browser settings, then try again.',
  'no-camera': 'No camera was found on this device.',
  'in-use': 'Another app is using the camera. Close it and try again.',
  overconstrained: 'This camera cannot do what the scanner asked of it.',
  'insecure-context': 'The camera only works over HTTPS, or on localhost.',
  unsupported: 'This browser cannot scan QR codes.',
  aborted: 'The camera stopped before it started. Try again.',
  security: 'The browser blocked the camera for this page.',
  'type-error': 'The camera could not be started.',
  unknown: 'The camera could not be started.',
}

export function QrScanner({ onPayee, onCancel }: Props) {
  const [message, setMessage] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  // A camera holds a code in front of it for many frames, and this screen can
  // see the same value dozens of times a second. The first read wins and the
  // rest are ignored, so a payee can never be opened twice.
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
      // Not a payment code: say so and keep looking, because a phone often
      // catches whatever else is printed beside the QR code.
      setMessage(`${UPI_PARSE_MESSAGE[result.reason]} Move a little closer and hold still.`)
    },
    [onPayee],
  )

  const handleScan = useCallback((codes: IDetectedBarcode[]) => {
    const value = codes[0]?.rawValue
    if (value) accept(value)
  }, [accept])

  const handleError = useCallback((error: IScannerError) => {
    setMessage(CAMERA_MESSAGE[error.kind] ?? CAMERA_MESSAGE.unknown)
  }, [])

  const submitManual = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      accept(manual)
    },
    [accept, manual],
  )

  return (
    <section className={styles.overlay} aria-label="Scan a UPI code">
      <div className={styles.head}>
        <button type="button" className={styles.back} onClick={onCancel} aria-label="Close the scanner">
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
        <h1 className={styles.heading}>Scan to pay</h1>
      </div>

      <div className={styles.frame}>
        <Scanner
          onScan={handleScan}
          onError={handleError}
          // The back camera, because a merchant's code is across the counter.
          constraints={{ facingMode: 'environment' }}
          formats={['qr_code']}
          // No beep, no zoom control: the frame is the whole interface. The
          // torch stays, because a QR code in a dim shop needs it.
          sound={false}
          components={{ finder: false, zoom: false, torch: true }}
          // A short pause between reads is enough to stop a burst of callbacks
          // without making the scan feel slow.
          scanDelay={600}
          styles={{
            container: { width: '100%', height: '100%' },
            video: { width: '100%', height: '100%', objectFit: 'cover' },
          }}
        />
      </div>

      <p className={`${styles.status} ${message ? styles.error : ''}`} role="status">
        {message ?? 'Point the camera at the merchant’s UPI QR code.'}
      </p>

      <form className={styles.manual} onSubmit={submitManual}>
        <label className={styles.fieldLabel} htmlFor="scan-manual">
          No camera, or a code that will not scan?
        </label>
        <div className={styles.manualRow}>
          <input
            id="scan-manual"
            className={styles.manualInput}
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="pa=name@bank — or the whole upi:// link"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
          />
          <button type="submit" className={styles.manualButton}>
            Use it
          </button>
        </div>
      </form>
    </section>
  )
}
