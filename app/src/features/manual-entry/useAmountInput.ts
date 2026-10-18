import { useCallback, useState } from "react"

/**
 * The keypad's state machine: digits, one decimal point, two decimals, no leading zeros.
 *
 * It counts **rupees**, because that is what the digits on screen are, and it keeps the
 * raw string so the display can show what is still being typed (`1,250.` keeps its
 * point). The conversion to the app's integer paise happens once, in the sheet's
 * `onSubmit`.
 *
 * `initialRaw` is how a scanned code that carried its own amount arrives: the merchant has
 * already named the figure, so the keypad starts on it rather than on an empty canvas.
 */
export function useAmountInput(initialRaw = "", maxInt = 9) {
  const [raw, setRaw] = useState(initialRaw)

  const press = useCallback(
    (key: string) => {
      setRaw((previous) => {
        if (key === "back") return previous.slice(0, -1)
        if (key === ".") return previous.includes(".") ? previous : previous === "" ? "0." : previous + "."
        if (previous.includes(".")) return previous.split(".")[1].length >= 2 ? previous : previous + key
        if (previous === "0") return key === "0" ? previous : key
        return previous.length >= maxInt ? previous : previous + key
      })
    },
    [maxInt],
  )

  const value = raw === "" || raw === "." ? 0 : Number(raw)
  /** Clear the line, or start it on another figure — the budget editor re-opens on its limit. */
  const reset = useCallback((next = "") => setRaw(next), [])
  return { raw, value, press, reset }
}

/**
 * `20900` paise → `209`, `1250` → `12.50` — the keypad's own raw string, without the
 * trailing zeros a printed amount carries when it is a whole number of rupees.
 */
export function rawFromCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "")
}

/** `1234567.5` → `12,34,567.5` — Indian grouping, keeping the digits after the point. */
export function formatRaw(raw: string): string {
  if (!raw) return "0"
  const [whole, fraction] = raw.split(".")
  const grouped = Number(whole || "0").toLocaleString("en-IN")
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}
