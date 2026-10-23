import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { useEffect, useState } from "react"

import { Keypad } from "@/features/manual-entry/Keypad"
import { formatRaw, useAmountInput } from "@/features/manual-entry/useAmountInput"
import { ACCOUNTS } from "@/lib/accounts"
import { heavyThud, mediumClick, primeHaptics } from "@/lib/haptics"

/**
 * Move money into a held card from another account.
 *
 * It is the balance editor's own panel, with the same spring, dim layer and confirm, and it
 * asks for two things only: how much, and which account it leaves. There is no merchant, note,
 * category or kind, because a transfer is not spending or income. It writes no row, so the
 * ledger and the statistics never see it (`lib/balances.ts`, `addTransfer`).
 */

const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const

export type TransferSheetProps = {
  isOpen: boolean
  /** The account the money goes into, by the name the card prints. */
  toName: string
  /** The account the money goes into, by id. */
  toId: string
  /**
   * Every card in the stack, in the dock's order. The sources are all of them but the one the
   * money is going into: the owner can move money between their own cards as well as the two
   * accounts, so this is the stack rather than `lib/accounts.ts`.
   */
  cards?: readonly { id: string; name: string }[]
  onClose: () => void
  /** The amount in integer paise, and the id of the account it leaves. */
  onSave: (fromId: string, cents: number) => void
}

export function TransferSheet({ isOpen, toName, toId, cards = ACCOUNTS, onClose, onSave }: TransferSheetProps) {
  const { raw, value, press } = useAmountInput()
  const sources = cards.filter((card) => card.id !== toId)
  /** The account the money leaves, chosen by the owner; `null` means the first one that is not the card's. */
  const [chosen, setChosen] = useState<string | null>(null)
  const fromId = chosen !== null && sources.some((card) => card.id === chosen) ? chosen : (sources[0]?.id ?? "")

  useEffect(() => {
    if (!isOpen) return
    primeHaptics()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [isOpen, onClose])

  const save = () => {
    if (value <= 0 || !fromId) return
    heavyThud()
    onSave(fromId, Math.round(value * 100))
  }

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
            aria-label={`Transfer to ${toName}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING}
            className="fixed inset-x-0 bottom-0 z-[55] mx-auto w-full max-w-[390px] rounded-t-[28px] border-t border-line bg-card px-4 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-editorial text-[18px] leading-7 italic text-ink">Transfer to {toName}</h2>
                <p className="mt-1 text-[11px] leading-4 text-ink2">
                  Moves money between your accounts. It is not an expense, so it stays out of the ledger and stats.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close without transferring"
                onClick={() => {
                  mediumClick()
                  onClose()
                }}
                className="grid size-10 flex-none place-items-center rounded-2xl border border-line bg-transparent text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <X strokeWidth={1.5} className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3">
              <label htmlFor="transfer-from" className="font-sans text-[11px] leading-4 font-bold tracking-[0.08em] text-ink2 uppercase">
                From
              </label>
              <select
                id="transfer-from"
                value={fromId}
                onChange={(event) => setChosen(event.target.value)}
                className="mt-1 h-12 w-full rounded-2xl border border-line bg-card px-4 font-sans text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                {sources.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex items-baseline gap-1" aria-live="polite">
              <span className="font-display text-2xl leading-8 text-sage" aria-hidden="true">
                ₹
              </span>
              <span className="font-display text-[40px] leading-[48px] font-bold tracking-[-0.03em] tabular-nums text-ink">
                {formatRaw(raw)}
              </span>
            </div>

            <div className="mt-3">
              <Keypad onKey={press} />
            </div>

            <button
              type="button"
              onClick={save}
              disabled={value <= 0 || !fromId}
              className="mt-2 h-12 w-full rounded-2xl border-0 bg-sage px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-sage outline-none transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ink"
            >
              Transfer
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
