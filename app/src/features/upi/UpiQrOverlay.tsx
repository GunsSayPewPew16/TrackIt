import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { UPI_QR_MATRIX } from "@/features/upi/upiQrMatrix"
import { lightTap } from "@/lib/haptics"

/**
 * The owner's payment code, in a square of its own.
 *
 * The code is drawn from `upiQrMatrix.ts` rather than from the screenshot it was read off:
 * each dark module becomes a rounded square, so the code matches the app's rounded surfaces,
 * and nothing moves — a module keeps its cell, so the payload a UPI reader decodes is unchanged.
 *
 * **Why the paper is light.** A QR is read by contrast, and most readers are built for dark
 * modules on a light field. A palette colour on a dark card would be an inverted code, which
 * some readers refuse, so the square is a light paper and the modules are the palette's colour.
 * The swatches are the theme's own tokens, and any token that is too pale to read against that
 * paper is shown disabled rather than offered — a colour that does not scan is not a choice.
 */

const QUIET_ZONE = 4
/** Corner radius of each module, in module widths. Small enough that a module keeps its shape. */
const MODULE_RADIUS = 0.32
/** Below this, a reader on a phone camera misses the code. WCAG's 3:1 for graphics. */
const MIN_CONTRAST = 3

const PAPER = "#fbfaf6"
/** Drawn only if no palette colour reads on the paper, which the current palettes never leave us in. */
const SAFE_MODULE = "#1b1b1b"

/** Theme tokens offered as module colours, in the order they are shown. */
const PALETTE_TOKENS = [
  { token: "--ink", label: "Ink" },
  { token: "--sage", label: "Sage" },
  { token: "--chart", label: "Chart" },
  { token: "--clay", label: "Clay" },
  { token: "--data-teal", label: "Teal" },
  { token: "--data-gold", label: "Gold" },
  { token: "--data-red", label: "Red" },
  { token: "--data-indigo", label: "Indigo" },
  { token: "--canvas", label: "Canvas" },
] as const

type Swatch = { label: string; color: string; readable: boolean }

/**
 * A palette colour as its three channels. The browser hands custom properties back as `rgb()` /
 * `rgba()` once they are resolved, and the source writes them as `#rrggbb`, so both are read.
 * Anything else is `null`, which the contrast check treats as unreadable.
 */
function channels(color: string): [number, number, number] | null {
  const text = color.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(text)
  if (hex) {
    const value = parseInt(hex[1], 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(text)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** WCAG contrast ratio between two palette colours, or `0` when either cannot be read. */
export function contrastRatio(a: string, b: string): number {
  const ca = channels(a)
  const cb = channels(b)
  if (!ca || !cb) return 0
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The palette, read from the live theme, with each swatch marked readable or not on the paper. */
function readPalette(): Swatch[] {
  const style = getComputedStyle(document.documentElement)
  return PALETTE_TOKENS.map(({ token, label }) => {
    const color = style.getPropertyValue(token).trim()
    const readable = contrastRatio(color, PAPER) >= MIN_CONTRAST
    return { label, color, readable }
  })
}

/**
 * The module grid as one path. Each dark module is its own closed rounded square; they touch at
 * their edges, so a run of dark modules reads as one soft shape and the corners where four meet
 * stay open. Coordinates are in modules, so the path is scaled by the SVG's `viewBox`.
 */
export function roundedModulesPath(rows: readonly string[], radius: number): string {
  const r = radius
  const parts: string[] = []
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "1") continue
      const left = x + QUIET_ZONE
      const top = y + QUIET_ZONE
      const right = left + 1
      const bottom = top + 1
      parts.push(
        `M${left + r} ${top}H${right - r}Q${right} ${top} ${right} ${top + r}V${bottom - r}` +
          `Q${right} ${bottom} ${right - r} ${bottom}H${left + r}Q${left} ${bottom} ${left} ${bottom - r}` +
          `V${top + r}Q${left} ${top} ${left + r} ${top}Z`,
      )
    }
  })
  return parts.join("")
}

const CODE_PATH = roundedModulesPath(UPI_QR_MATRIX, MODULE_RADIUS)
const VIEW_SIZE = UPI_QR_MATRIX.length + QUIET_ZONE * 2

export type UpiQrOverlayProps = {
  isOpen: boolean
  /** The account's name, as the greeting says it. */
  name: string
  onClose: () => void
}

export function UpiQrOverlay({ isOpen, name, onClose }: UpiQrOverlayProps) {
  const [palette, setPalette] = useState<Swatch[]>([])
  /** The swatch's label, not its colour: two tokens can resolve to the same value in one theme. */
  const [chosen, setChosen] = useState<string | null>(null)

  // Every open reads the theme as it is now, so a palette change is picked up without a reload.
  useEffect(() => {
    if (!isOpen) return
    const swatches = readPalette()
    setPalette(swatches)
    setChosen((current) => {
      const stillReadable = swatches.find((s) => s.label === current && s.readable)
      return stillReadable ? current : (swatches.find((s) => s.readable)?.label ?? null)
    })
    lightTap()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  const moduleColor = palette.find((s) => s.label === chosen && s.readable)?.color ?? SAFE_MODULE
  const label = useMemo(() => `Payment code for ${name}`, [name])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-canvas"
          />

          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
            className="fixed top-1/2 left-1/2 z-[55] flex aspect-square w-[min(86vw,340px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[28px] border border-line bg-card p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate font-editorial text-[18px] leading-7 italic text-ink">
                Pay {name}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="grid size-9 flex-none place-items-center rounded-2xl border border-line bg-transparent text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <X strokeWidth={1.5} className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 items-center justify-center">
              <div
                className="grid aspect-square h-full max-h-full w-full max-w-full place-items-center rounded-[22px] p-2"
                style={{ backgroundColor: PAPER }}
              >
                <svg
                  role="img"
                  aria-label={label}
                  viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
                  className="size-full"
                  shapeRendering="geometricPrecision"
                >
                  <path d={CODE_PATH} fill={moduleColor} />
                </svg>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2" role="radiogroup" aria-label="Code colour">
              {palette.map((swatch) => {
                const selected = swatch.label === chosen
                return (
                  <button
                    key={swatch.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={swatch.readable ? swatch.label : `${swatch.label} (too pale to scan)`}
                    disabled={!swatch.readable}
                    onClick={() => setChosen(swatch.label)}
                    className="size-7 rounded-full border border-line outline-none transition-transform disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ink aria-checked:scale-110 aria-checked:ring-2 aria-checked:ring-ink"
                    style={{ backgroundColor: swatch.color }}
                  />
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
