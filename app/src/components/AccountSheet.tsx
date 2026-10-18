import { AnimatePresence, motion } from "framer-motion"
import { LogOut, X } from "lucide-react"
import { useEffect, useState } from "react"

import { useAuth } from "@/hooks/useAuth"
import { pendingWrites, subscribeSync } from "@/lib/cloud"
import { mediumClick } from "@/lib/haptics"

/**
 * The account panel: who is signed in, what is still waiting to go up, and the way out.
 *
 * **Where it is opened from.** Not a circle in the header — the dashboard's masthead has
 * one 28px line and a 48px theme toggle, and a third control there would have shortened
 * the greeting for every language in the list. The trigger is the **name itself**
 * (`DashboardScreen`): the greeting already says whose vault this is, so tapping the name
 * to see the account is the design's own affordance rather than a button bolted beside
 * it.
 *
 * **What it has to answer before it offers the door.** Signing out is the one action in
 * the app that can separate a row from the account it belongs to, so the panel says, in
 * words, which of two things is true:
 *
 * - **Nothing is waiting** — every change is on the server, and *"A copy is kept here, so
 *   the ledger opens without a signal."* Signing out loses nothing.
 * - **Writes are waiting** — the count, and *"They stay on this phone and go up the next
 *   time you sign in."* That is exactly what `lib/cloud.ts` does: `signOut` flushes first,
 *   a failure keeps the queue at `trackit-cloud-queue:<uuid>`, and the next sign-in drains
 *   it before anything else.
 *
 * The count is live (`subscribeSync`), so a queue that drains while the panel is open
 * stops saying it is waiting. Nothing here is a spinner: a number and a sentence.
 *
 * The surface is the budget editor's (`features/budget/BudgetSheet.tsx`) — same 28px top
 * radius, same 380/32/0.8 spring, same dim layer, same 48px confirm — because it is the
 * same kind of thing, a panel that rose from the bottom of the screen. The sign-out
 * capsule is **not** sage, though: sage is the app's yes, and this is a door.
 */

const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const

/** How many writes the account is still holding, kept current as the queue drains. */
function useWaitingWrites(): number {
  const [waiting, setWaiting] = useState(() => pendingWrites())
  useEffect(() => subscribeSync(() => setWaiting(pendingWrites())), [])
  return waiting
}

export function AccountSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { name, email, signOut } = useAuth()
  const waiting = useWaitingWrites()

  useEffect(() => {
    if (!isOpen) return
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

  /**
   * The door, and the order it is walked in: the panel goes down first (260ms — the
   * spring's own settle), then the session ends, so the screen the owner signs out of is
   * not one with a sheet still rising off it. `signOut` itself flushes the queue first.
   */
  const leave = () => {
    mediumClick()
    onClose()
    window.setTimeout(() => void signOut(), 260)
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
            aria-label="Account"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING}
            className="fixed inset-x-0 bottom-0 z-[55] mx-auto w-full max-w-[390px] rounded-t-[28px] border-t border-line bg-card px-4 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] leading-4 font-bold tracking-[0.03em] text-ink2 uppercase">
                  Signed in as
                </p>
                {/* The app's split header, one size down: the sentence, then the noun. */}
                <h2 className="mt-1 text-[22px] leading-7 text-ink">
                  <span className="font-display font-bold tracking-tight-title">
                    {name ?? "This vault"}
                  </span>
                </h2>
                {email && <p className="mt-1 truncate text-[12px] leading-4 text-ink2">{email}</p>}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  mediumClick()
                  onClose()
                }}
                className="grid size-10 flex-none place-items-center rounded-2xl border border-line bg-transparent text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <X strokeWidth={1.5} className="size-5" aria-hidden="true" />
              </button>
            </div>

            {/*
              The one fact the door needs: what signing out would leave behind. A hairline
              rule rather than a card, so it reads as a line in a ledger and not as a
              second panel inside this one.
            */}
            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <span className="text-[10px] leading-4 font-bold tracking-[0.03em] text-ink2 uppercase">
                Sync
              </span>
              <span className="text-right text-[13px] leading-5 text-ink" aria-live="polite">
                {waiting === 0
                  ? "Everything is on the server"
                  : `${waiting} ${waiting === 1 ? "change" : "changes"} waiting`}
              </span>
            </div>
            <p className="mt-1 font-editorial text-[12px] leading-5 italic text-ink2">
              {waiting === 0
                ? "This phone also keeps a copy, so the ledger opens without a signal."
                : "They stay on this phone and go up the next time you sign in — signing out now loses nothing."}
            </p>

            <button
              type="button"
              onClick={leave}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-transparent px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-ink outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ink"
            >
              <LogOut className="size-4" strokeWidth={1.5} aria-hidden="true" />
              Sign out
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
