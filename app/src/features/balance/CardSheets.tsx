import { AnimatePresence, motion } from "framer-motion"
import { Pencil, Plus, X } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { CARD_ICONS, TONES } from "@/components/BalanceCards"
import { CARD_ICON_NAMES, CARD_TONES, type CardIconName, type CardTone } from "@/lib/customCards"
import { heavyThud, lightTap, mediumClick, primeHaptics } from "@/lib/haptics"

/**
 * The two panels a hold on the balance stack can open, and the one this file's siblings share.
 *
 * A hold on the front card opens **the choice**: edit that card's balance, or add a card to the
 * stack. Edit hands over to the balance editor (`BalanceSheet.tsx`); Add opens **the card
 * sheet**, which names a card, picks one of eight icons and one of the palette's colours, and
 * adds it to the end of the stack (`lib/customCards.ts`).
 *
 * Both are the balance editor's own panel: the same 28px top radius, the same 380/32/0.8 spring,
 * the same dim layer, the same 48px sage confirm. They are fetched on the first hold, like every
 * other panel, so this module is not in the entry chunk.
 */

const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const

/** The bottom panel and its dim layer, with the body scroll locked and Escape closing it. */
function Panel({
  isOpen,
  label,
  onClose,
  children,
}: {
  isOpen: boolean
  label: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!isOpen) return
    // Laid out before the first tap, for iOS, as the balance editor does.
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
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING}
            className="fixed inset-x-0 bottom-0 z-[55] mx-auto w-full max-w-[390px] rounded-t-[28px] border-t border-line bg-card px-4 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/** The panel's title row: a heading, a line of explanation, and the close button. */
function Header({ title, note, onClose }: { title: string; note: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate font-editorial text-[18px] leading-7 italic text-ink">{title}</h2>
        <p className="mt-1 text-[11px] leading-4 text-ink2">{note}</p>
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
  )
}

/** The hold's first question: what to do with the card that was held. */
export function CardChoiceSheet({
  isOpen,
  name,
  onEdit,
  onAdd,
  onClose,
}: {
  isOpen: boolean
  /** The held card's name, which is what the title says. */
  name: string
  onEdit: () => void
  onAdd: () => void
  onClose: () => void
}) {
  return (
    <Panel isOpen={isOpen} label={`${name} card`} onClose={onClose}>
      <Header title={name} note="Change what this card holds, or put another card on the stack." onClose={onClose} />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            mediumClick()
            onEdit()
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-transparent font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <Pencil strokeWidth={1.5} className="size-4" aria-hidden="true" />
          Edit balance
        </button>
        <button
          type="button"
          onClick={() => {
            lightTap() // must run synchronously inside the tap for iOS
            onAdd()
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl border-0 bg-sage font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-sage outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <Plus strokeWidth={1.5} className="size-4" aria-hidden="true" />
          Add a card
        </button>
      </div>
    </Panel>
  )
}

/** What the add-card sheet hands back: the name as typed, and the two choices. */
export type NewCard = { label: string; icon: CardIconName; tone: CardTone }

const toneName = (tone: CardTone): string => tone.charAt(0).toUpperCase() + tone.slice(1)

/**
 * A new card: its name, one of the eight icons, and one of the palette's colours.
 *
 * Its balance is not asked for here. A card starts at zero and is given its figure the same way
 * the accounts are — by holding it and typing what it holds — so the sheet stays about the card
 * itself. The preview above the save button is the card as it will sit in the stack.
 */
export function AddCardSheet({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  onSave: (card: NewCard) => void
}) {
  const [label, setLabel] = useState("")
  const [icon, setIcon] = useState<CardIconName>("Wallet")
  const [tone, setTone] = useState<CardTone>("sage")

  /** Every open starts blank, including a second open in a row. */
  useEffect(() => {
    if (isOpen) {
      setLabel("")
      setIcon("Wallet")
      setTone("sage")
    }
  }, [isOpen])

  const name = label.trim()
  const Glyph = CARD_ICONS[icon]
  const colours = TONES[tone]

  const save = () => {
    if (!name) return
    heavyThud()
    onSave({ label: name, icon, tone })
  }

  return (
    <Panel isOpen={isOpen} label="New card" onClose={onClose}>
      <Header title="New card" note="Its own name, icon and colour. Hold it later to set what it holds." onClose={onClose} />

      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        maxLength={24}
        placeholder="Card name, e.g. Savings"
        aria-label="Card name"
        autoComplete="off"
        className="mt-4 h-12 w-full rounded-2xl border border-line bg-transparent px-4 font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink2 focus-visible:ring-2 focus-visible:ring-ink"
      />

      <p className="mt-4 font-sans text-[11px] leading-4 font-bold tracking-[0.08em] text-ink2 uppercase">Icon</p>
      <div role="radiogroup" aria-label="Icon" className="mt-2 grid grid-cols-4 gap-2">
        {CARD_ICON_NAMES.map((name) => {
          const Icon = CARD_ICONS[name]
          const chosen = name === icon
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={name}
              onClick={() => {
                lightTap()
                setIcon(name)
              }}
              className={`grid h-12 place-items-center rounded-2xl border outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                chosen ? "border-transparent bg-sage text-on-sage" : "border-line bg-transparent text-ink"
              }`}
            >
              <Icon strokeWidth={1.5} className="size-5" aria-hidden="true" />
            </button>
          )
        })}
      </div>

      <p className="mt-4 font-sans text-[11px] leading-4 font-bold tracking-[0.08em] text-ink2 uppercase">Colour</p>
      <div role="radiogroup" aria-label="Colour" className="mt-2 flex items-center gap-3">
        {CARD_TONES.map((option) => {
          const chosen = option === tone
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={toneName(option)}
              onClick={() => {
                lightTap()
                setTone(option)
              }}
              className="size-10 rounded-full border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-ink"
              style={{
                background: TONES[option].fill,
                boxShadow: chosen ? "0 0 0 2px var(--card), 0 0 0 4px var(--ink)" : undefined,
              }}
            />
          )
        })}
      </div>

      {/* The card as the stack will draw it: its colour, its glyph and the name it was given. */}
      <div
        aria-hidden="true"
        className="mt-4 flex h-12 items-center gap-3 rounded-2xl px-4"
        style={{ background: colours.fill, color: colours.ink }}
      >
        <Glyph strokeWidth={1.5} className="size-5" />
        <span className="truncate font-display text-[14px] font-medium">{name || "Card name"}</span>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={!name}
        className="mt-3 h-12 w-full rounded-2xl border-0 bg-sage px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-sage outline-none transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ink"
      >
        Add card
      </button>
    </Panel>
  )
}
