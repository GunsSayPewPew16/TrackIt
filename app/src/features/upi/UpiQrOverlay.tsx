import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { useEffect, useMemo } from "react"

import { UPI_QR_MATRIX } from "@/features/upi/upiQrMatrix"
import { lightTap } from "@/lib/haptics"
import { paletteOnDocument } from "@/lib/theme"

/**
 * The owner's payment code, on its own over the page.
 *
 * The code is drawn from `upiQrMatrix.ts` rather than from the screenshot it was read off:
 * each dark module becomes a rounded square, so the code matches the app's rounded surfaces,
 * and nothing moves — a module keeps its cell, so the payload a UPI reader decodes is unchanged.
 *
 * **The colour is the theme's, chosen for the mode.** In a dark palette the modules are the
 * *lightest* token of the palette; in a light palette they are the *darkest*. The candidates are
 * read from the live stylesheet on every open, so a palette change is picked up without a reload.
 * There is no picker and no paper behind the code: the code is the only thing in the panel.
 *
 * Light modules on a dark field are an inverted code. Some readers refuse those, so this is a
 * deliberate choice the owner made, not a default this file would pick.
 */

const QUIET_ZONE = 4
/** Corner radius of each module, in module widths. Small enough that a module keeps its shape. */
const MODULE_RADIUS = 0.32

/**
 * The tokens the code may take its colour from. The canvas is left out on purpose: it is the
 * field the code sits on, and a code drawn in the field's own colour is invisible.
 */
const CODE_TOKENS = [
  "--ink",
  "--sage",
  "--chart",
  "--clay",
  "--data-teal",
  "--data-gold",
  "--data-red",
  "--data-indigo",
] as const

/**
 * A colour as its three channels. The stylesheet writes tokens as `#rrggbb`, and a browser may
 * hand them back as `rgb()`, so both are read. Anything else is `null` and is never chosen.
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

/** Relative luminance (WCAG): 0 is black, 1 is white. */
function luminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/**
 * The colour the code is drawn in: the palette's lightest token in a dark theme, its darkest in a
 * light one. Falls back to the first readable token, and to the stylesheet's ink if none reads.
 */
export function codeColour(theme: "light" | "dark"): string {
  const style = getComputedStyle(document.documentElement)
  const candidates = CODE_TOKENS.flatMap((token) => {
    const color = style.getPropertyValue(token).trim()
    const rgb = channels(color)
    return rgb ? [{ color, lum: luminance(rgb) }] : []
  })
  if (candidates.length === 0) return "currentColor"
  candidates.sort((a, b) => a.lum - b.lum)
  return theme === "dark" ? candidates[candidates.length - 1].color : candidates[0].color
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
  // Read on every open, so the colour follows the palette the owner has on now.
  const moduleColor = useMemo(() => {
    if (!isOpen) return "currentColor"
    const theme = paletteOnDocument()?.theme ?? "dark"
    return codeColour(theme)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    lightTap()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  const label = `Payment code for ${name}`

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
            className="fixed top-1/2 left-1/2 z-[55] flex w-[min(86vw,340px)] -translate-x-1/2 -translate-y-1/2 flex-col"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate font-editorial text-[18px] leading-7 italic text-ink">Pay {name}</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="grid size-9 flex-none place-items-center rounded-2xl border border-line bg-transparent text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <X strokeWidth={1.5} className="size-4" aria-hidden="true" />
              </button>
            </div>

            <svg
              role="img"
              aria-label={label}
              viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
              className="mt-4 aspect-square w-full"
              shapeRendering="geometricPrecision"
            >
              <path d={CODE_PATH} fill={moduleColor} />
            </svg>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
