import { AnimatePresence, motion, type Variants } from "framer-motion"
import { CalendarDays, Wallet, X } from "lucide-react"
import { useLayoutEffect, useRef, useState, type PointerEventHandler, type Ref } from "react"

import { handOffToUpiApp, type UpiPayee } from "@/features/upi/upi"
import { ACCOUNTS } from "@/lib/accounts"
import { join } from "@/lib/classes"
import { clock, dayLabel, minutesOfDay, momentOn, startOfDay } from "@/lib/format"
import { heavyThud, lightTap } from "@/lib/haptics"
import type { Kind } from "@/lib/types"
import { CategoryMatrix } from "./CategoryMatrix"
import { DateDialog } from "./DateDialog"
import { Keypad } from "./Keypad"
import type { ManualEntry } from "./types"
import { formatRaw, rawFromCents, useAmountInput } from "./useAmountInput"

/** The sheet's own spring: heavy enough to feel attached to the tap, quick enough not to lag. */
const SPRING = { type: "spring", stiffness: 400, damping: 34, mass: 0.8 } as const

/**
 * The rail's capsule, and its own spring.
 *
 * It is snappier than the sheet (450/28 against 400/34): the capsule is 40px of travel that has
 * to read as *instant* — a sluggish thumb is the difference between a segmented control and a
 * slider — while the sheet is a whole screen moving and wants its weight.
 */
const SEGMENT = { type: "spring", stiffness: 450, damping: 28 } as const

/**
 * The column arriving after the sheet: each row 12px low and transparent, then in place, top to
 * bottom, 50ms apart, 350ms each, once the sheet's own spring has mostly landed.
 *
 * This is the one orchestrated moment on the screen. Everything else that moves here answers a
 * thumb — a key, a rail, the mosaic — and a second entrance animation somewhere else would
 * turn "premium" into "restless".
 */
const REVEAL: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.12, staggerChildren: 0.05 } },
}
const REVEAL_ROW: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
}

const collapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
} as const

/** What the kind rail offers, in the order it offers them. */
const KINDS: readonly { id: Kind; name: string }[] = [
  { id: "expense", name: "Expense" },
  { id: "income", name: "Income" },
]

/**
 * One segmented rail: the account tray and the kind switch are this component twice.
 *
 * They are the same control — a 48px row split in two, a hairline box, one capsule that glides
 * — so they are the same code: the account rail is `UPI | CASH` and the kind rail is
 * `EXPENSE | INCOME`, and neither can drift from the other's geometry, type or physics.
 *
 * **The clothes.** Full width, `rounded-[20px]`, a 1px `border-line`, `bg-card` — the app's own
 * card, not a dropdown. Labels are the reading face at 11px, **bold, uppercase, tracked 0.04em**:
 * a segment is a label on a surface that is already the size of a button, and the case and the
 * tracking are what keep two short words from reading as loose text inside a box. The unselected
 * label is `text-ink2`, which is the ink token at 60% — the same 60% the rest of the app's
 * secondary text uses, so "quieter" is one decision in one place.
 *
 * **`layoutId` is per rail, on purpose.** One capsule that could glide *between* rails would be
 * a shared-layout animation across two unrelated questions — pressing Income would appear to
 * throw the account selection sideways. The id is `activeSegmentIndicator-<rail>` so the glide
 * happens where the choice did.
 */
function SegmentRow<T extends string>({
  rail,
  label,
  value,
  options,
  onSelect,
  innerRef,
}: {
  /** Names the capsule's `layoutId`; one per rail. */
  rail: string
  /** What the rail is asking, announced to a reader. */
  label: string
  value: T
  options: readonly { id: T; name: string }[]
  onSelect: (id: T) => void
  /** The column measures its rails to size the mosaic's room, so one may hand back its box. */
  innerRef?: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={innerRef}
      role="radiogroup"
      aria-label={label}
      className="grid shrink-0 grid-cols-2 rounded-[20px] border border-line bg-card p-1"
    >
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(option.id)}
            className={join(
              "relative h-12 rounded-2xl border-0 bg-transparent px-3 font-sans text-[11px] leading-4 font-bold tracking-[0.04em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink",
              active ? "text-ink" : "text-ink2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`activeSegmentIndicator-${rail}`}
                transition={SEGMENT}
                className="absolute inset-0 rounded-2xl bg-canvas"
              />
            )}
            <span className="relative z-10">{option.name}</span>
          </button>
        )
      })}
    </div>
  )
}

interface ManualEntryScreenProps {
  /**
   * The category the entry starts on: a quick-log chip's own envelope, or `null` when the
   * sheet was opened from the add-record pill. The mosaic reads it like any other choice,
   * so a preset `restaurant` opens the closed row on *Food & Beverages • Restaurants*.
   */
  initialCategory?: string | null
  /**
   * The merchant a scanned code named, when the sheet came from the scanner: see
   * `SheetProps.payee`. It swaps the account tray for the payee's own box and the confirm
   * for **Pay and Log Transaction**; everything else about the screen is unchanged.
   */
  payee?: UpiPayee | null
  onClose: () => void
  onSubmit?: (entry: ManualEntry) => void
  /** Wired by the sheet so a drag that starts on the header can dismiss it. */
  onHeaderPointerDown?: PointerEventHandler
}

/**
 * One hairline-ruled journal line.
 *
 * The line is the field: there is no box, no fill and no radius, only a 1px rule under 48px
 * of type, which is what keeps two fields from reading as two more cards in a column that
 * already has three. The placeholder is the **editorial** serif in italic at 40%-ish — it is a
 * prompt, not content — and the moment a character arrives the input switches to the upright
 * structural sans at full ink. That switch is a state decision (`value !== ""`), not a CSS
 * `:placeholder-shown` trick, because it is the *typed* line that has to change face while it
 * is still focused, and a browser only re-evaluates the pseudo-element when the field empties.
 */
function JournalLine({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const typed = value.length > 0
  return (
    <div className="border-b border-line transition-colors focus-within:border-sage">
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={join(
          "h-12 w-full bg-transparent text-[15px] leading-6 text-ink outline-none",
          typed
            ? "font-sans font-normal not-italic"
            : "font-editorial italic placeholder:text-ink2 placeholder:opacity-60",
        )}
      />
    </div>
  )
}

/**
 * The manual entry view: the amount canvas, the two selector rails, the journal lines, the
 * category mosaic, and the keypad card.
 *
 * **It records both directions.** An `EXPENSE | INCOME` rail sits between the account rail and
 * the merchant line — the order an entry is actually thought through — and the rail is the whole
 * difference: the same canvas, rails, journal lines and keypad write `kind: "income"` with an
 * income envelope instead of `kind: "expense"`. It is only here when the sheet is the
 * *add-record* screen: a scanned code is a payment and is always money out (`payee !== null`),
 * so it has no kind rail and keeps the plain `New expense` title. The header stays a title,
 * because it is also the sheet's drag handle.
 *
 * **The amount is the one hero.** 56px of Neue Haas Grotesk Display Bold at
 * `tracking-tight-hero` (−0.04em), with the rupee mark lifted into a superscript of its own —
 * 24px, high-desert clay, sitting on the top-left of the figure rather than in its baseline.
 * Long amounts step down in size (56 → 44 → 36) instead of wrapping or clipping, which is the
 * only thing on this screen that is arithmetic rather than design. The figure itself is the
 * display face's own 700 with nothing else stacked on it: no flashing caret, no thin weight,
 * no underline.
 *
 * **The column is one rhythm.** Two rails, two journal lines, the category row and the keypad
 * card, 8px apart, all inside the column's `px-4`: every row is a full-width 1px-bordered
 * surface or a full-width hairline, so the eye reads four questions and one keypad rather than
 * a stack of boxes. Nothing in the column is a floated or centred control.
 *
 * **The keypad and the mosaic share the room.** Opening the category matrix collapses
 * the journal lines and slides the keypad out of view; picking a category or closing the
 * mosaic brings them back. The amount stays on screen throughout, because it is the
 * thing being edited and the sheet is not a wizard.
 *
 * **The moment lives on the amount canvas.** A small pill under the header says *Today,
 * 2:14 PM* (or the day, once it has been changed) and opens `DateDialog`, so a forgotten
 * expense can be filed on the day — and at the hour — it happened. It is deliberately not a
 * row in the column: the closed column is exactly full on a 390×844 phone, and a date field
 * that pushed the keypad off the bottom would be a worse trade than the one this screen
 * already makes.
 *
 * **A scanned payment carries it too.** The pill used to be hidden when the sheet was opened
 * from a QR code, because the money was leaving *now*. It is not hidden any more: a receipt
 * is often typed up after the fact, and the scan screen hands the same amount, category and
 * moment here. It starts on the current moment either way — that is the default the owner
 * asked for, and it is what `confirm` writes when the pill is never touched.
 */
export function ManualEntryScreen({
  initialCategory = null,
  payee = null,
  onClose,
  onSubmit,
  onHeaderPointerDown,
}: ManualEntryScreenProps) {
  const { raw, value, press, reset } = useAmountInput(
    // A code that carried its amount starts on that figure: the merchant printed it, and
    // the owner still confirms it — see `SheetProps.payee`.
    payee?.amountCents != null ? rawFromCents(payee.amountCents) : "",
  )
  /** The moment this sheet was opened: the latest day the picker may offer, and the default
   *  moment a new row is filed at. Taking it once keeps the pill and that row in one frame. */
  const [now] = useState(() => Date.now())
  /**
   * Money out is what this sheet was built for and stays the default; the kind rail is the one
   * control that changes it. Switching clears the category with it, because an income cannot be
   * filed under a spending dimension — `CategoryMatrix` draws a different tree for each kind.
   */
  const [kind, setKind] = useState<Kind>("expense")
  const [account, setAccount] = useState(ACCOUNTS[0].id)
  const [merchant, setMerchant] = useState("")
  const [note, setNote] = useState("")
  const [category, setCategory] = useState<string | null>(initialCategory)
  const [expanded, setExpanded] = useState(false)
  /**
   * The moment the row will be filed at — the current one unless the picker was used.
   *
   * It is a whole moment rather than a day plus "the time the sheet opened": the picker sets
   * both halves now, so a backdated row carries the hour it actually happened at, and two
   * rows typed for the same forgotten day sort the way they happened rather than the way
   * they were typed.
   */
  const [at, setAt] = useState(() => momentOn(startOfDay(now), minutesOfDay(now)))
  const [dateOpen, setDateOpen] = useState(false)
  /**
   * How tall the category panel is allowed to be: the sheet's column, less every row that
   * stays above it and the one gap between them. Measured rather than guessed, because the
   * mosaic's height is what the whole expansion animates to and a hard-coded number would
   * drift with the safe-area inset, the height of the phone, and the rows themselves — the
   * account rail is 58px, and the kind rail under it is 58 more.
   */
  const [panelRoom, setPanelRoom] = useState(0)
  const column = useRef<HTMLDivElement>(null)
  /** The rail that opens the column: the account tray, or the payee's box when this is a payment. */
  const topCard = useRef<HTMLDivElement>(null)
  /** The kind rail under it, which is only on the add-record screen. */
  const kindRow = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = column.current
    if (!el) return
    const measure = () => {
      // Every row that stays above the mosaic, each with the column's own 8px gap: the
      // account card, and the kind rail when there is one. The journal lines are not
      // counted — they fold away as the mosaic opens, which is the room it grows into.
      const kindHeight = kindRow.current?.offsetHeight ?? 0
      const above = (topCard.current?.offsetHeight ?? 0) + kindHeight + (kindHeight > 0 ? 16 : 8)
      setPanelRoom(Math.max(0, el.clientHeight - above))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const text = formatRaw(raw)
  const digitSize = text.length <= 8 ? 56 : text.length <= 11 ? 44 : 36

  const confirm = () => {
    if (value <= 0) return
    heavyThud() // 45ms, and only here
    const written = note.trim()
    const amountCents = Math.round(value * 100)
    // The picker's moment, to the minute. Untouched, that is the moment the sheet opened.
    onSubmit?.({ kind, amount: value, account, merchant: merchant.trim(), note: written, category, at })
    /*
      **Logged first, handed to Google Pay second**, in that order and for a reason: the
      handoff is one-way, so a row written afterwards is a row that a crash, a back-swipe or a
      cancelled payment can lose. `onSubmit` above writes to the device synchronously, so by the
      time the app switch happens the money is on the ledger — a logged expense the owner
      decided not to pay is a row they can delete, and a payment with no row is the thing this
      app exists to prevent.

      The amount handed over is the one on screen, to the paise, and the note is the owner's
      own words; `features/upi/upi.ts` builds the link and decides what this device can open
      (nothing, on a desktop). `handOffToUpiApp` also covers the iPhone where Google Pay is
      not installed, where a custom scheme is silently ignored.
    */
    if (payee !== null) {
      handOffToUpiApp({
        pa: payee.pa,
        pn: payee.pn,
        amountCents,
        note: written,
      })
    }
    reset()
    setMerchant("")
    setNote("")
    setCategory(null)
    onClose()
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-ink">
      {/*
        The amount canvas: open space, and the header strip is the sheet's drag handle.

        Its height is the column's, not the artboard's: the column has a fixed set of rows —
        two rails, two journal lines, the category row and the keypad card — and those        rows are 555px whatever the window is. So the canvas takes 35% **or whatever the column can
        spare**, whichever is smaller, and never less than its 192px floor: on the artboard's
        390×844 that is 273 of the 295 it used to take, invisible, and on a 761px laptop window
        it gives up 74px so the whole column still fits. The percentage resolves against the
        sheet's padded box, so a notched phone's `env()` inset — which is part of that padding —
        is accounted for without naming it twice.
      */}
      <section className="relative h-[min(35%,calc(100%-34.6875rem))] min-h-48">
        <header
          onPointerDown={onHeaderPointerDown}
          className="absolute inset-x-0 top-0 flex h-14 cursor-grab touch-none items-center justify-between px-4"
        >
          <span aria-hidden="true" className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-line" />
          {/*
            The sheet's title — the editorial serif's reading size, 18px, one step up the
            ladder from the 15px captions the same face sets elsewhere.

            It is a title rather than a control: the kind rail lives in the column below, where
            an entry is actually thought through. In the header it would have had to fight the
            drag handle for every press, and the top of the screen is the last place that should
            change shape under a thumb.
          */}
          <span className="font-editorial text-[18px] leading-7 italic text-ink2">
            {payee === null && kind === "income" ? "New income" : "New expense"}
          </span>
          <button
            type="button"
            aria-label="Close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              lightTap()
              onClose()
            }}
            className="grid size-12 place-items-center rounded-full border-0 bg-transparent p-0 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <X strokeWidth={1.5} className="size-6" aria-hidden="true" />
          </button>
        </header>

        <p
          role="status"
          aria-label={`${kind === "income" ? "Income" : "Amount"} ${text} rupees`}
          className="absolute bottom-6 left-4 flex items-start font-display font-bold"
        >
          {/* The mark wears the direction: clay for money out, sage for money in, the same
              two accents a ledger card uses for the two kinds. It is lifted out of the
              figure's baseline into a 24px superscript of its own, which is what stops a
              five-figure amount from reading as six characters of one size. */}
          <span
            aria-hidden="true"
            className={join(
              "mr-1 font-sans text-2xl leading-none font-medium tracking-normal",
              kind === "income" ? "text-sage" : "text-clay",
            )}
            style={{ marginTop: digitSize * 0.12 }}
          >
            ₹
          </span>
          <motion.span
            aria-hidden="true"
            key={text.length /* a quick settle each time a digit arrives */}
            initial={{ opacity: 0.6, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className={join("leading-none tracking-tight-hero", raw ? "text-ink" : "text-ink2/50")}
            // The tracking is on the figure itself, not the row: an `em` resolved on a
            // 13px parent would compute to −0.5px and the 56px digits would inherit the
            // number rather than the ratio.
            style={{ fontSize: digitSize }}
          >
            {text}
          </motion.span>
        </p>

        {/*
          When this row belongs, on the amount canvas's free top-right: the header is its own
          strip and the amount owns the bottom-left, so this is the one corner that costs the
          column nothing. A scanned payment wears it too, now that a receipt can be typed up
          after the fact.
        */}
        <button
          type="button"
          aria-label={`Date and time: ${dayLabel(at, now)} at ${clock(at)}. Change`}
          onClick={() => {
            lightTap()
            setDateOpen(true)
          }}
          className="absolute right-4 top-16 inline-flex h-9 items-center gap-2 rounded-2xl border border-line bg-card px-3 font-sans text-[12px] leading-4 tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <CalendarDays strokeWidth={1.5} className="size-4 text-ink2" aria-hidden="true" />
          {/* The dot is a separator, not a caption: it keeps the day and the clock one
              phrase without a second label taking room on a 36px pill. */}
          {dayLabel(at, now)}{" "}
          <span aria-hidden="true" className="text-ink2">
            ·
          </span>{" "}
          {clock(at)}
        </button>
      </section>

      <motion.div
        ref={column}
        initial="hidden"
        animate="show"
        variants={REVEAL}
        className="relative flex min-h-0 flex-1 flex-col gap-2 px-4"
      >
        {/*
          The two rails, as one block: which account the money moved through, and which
          direction it moved. The journal lines below them are who and what — the four
          questions in the order an entry is thought through.

          The payee's box, when a scanned code sent us here, is 58px — the account rail's own
          height, border and padding included — rather than being added above it: the column is
          exactly full when the sheet is closed,
          so a box of its own would push the keypad off the bottom. It is also the honest swap —
          a payment to a UPI address is from the UPI account, and `logScan.rowFor` writes exactly
          that, so an account control here could only be a lie.
        */}
        <motion.div variants={REVEAL_ROW} className="flex shrink-0 flex-col gap-2">
          {payee !== null ? (
            <div
              ref={topCard}
              className="flex h-[58px] shrink-0 items-center gap-3 rounded-[20px] border border-line bg-card px-4"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-2xl bg-sage text-on-sage">
                <Wallet className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-display text-[13px] leading-4 font-medium tracking-[-0.01em]">
                  {payee.pn}
                </span>
                <span className="truncate text-[11px] leading-4 text-ink2">{payee.pa}</span>
              </span>
            </div>
          ) : (
            <SegmentRow
              rail="account"
              label="Account"
              value={account}
              options={ACCOUNTS}
              onSelect={(id) => {
                lightTap()
                setAccount(id)
              }}
              innerRef={topCard}
            />
          )}

          {payee === null && (
            <SegmentRow
              rail="kind"
              label="Record type"
              value={kind}
              options={KINDS}
              onSelect={(next) => {
                lightTap()
                if (next === kind) return
                setKind(next)
                // The two kinds have different trees, so a category picked in one cannot
                // mean anything in the other.
                setCategory(null)
              }}
              innerRef={kindRow}
            />
          )}
        </motion.div>

        {/*
          The journal lines, hidden while the mosaic needs their room.

          They stay in the flow on purpose. The two lines are the 92px the panel travels
          upward on its way open: the panel is the column's last item, so as the lines
          collapse the panel's top edge rises with them while its own height animation
          pushes the bottom edge down. That is the whole expansion in two layout
          numbers, with no shared-layout projection — a morph of that kind scales the
          mosaic's type non-uniformly for half a second, which is what made the tiles look
          smeared on the way in.
        */}
        <motion.div variants={REVEAL_ROW}>
          <AnimatePresence initial={false}>
            {!expanded && (
              <motion.div key="journal" {...collapse} transition={SPRING} className="overflow-hidden">
                <JournalLine
                  label={kind === "income" ? "From" : "Merchant"}
                  value={merchant}
                  onChange={setMerchant}
                  placeholder={kind === "income" ? "Who paid you?..." : "Who did you pay?..."}
                />
                <JournalLine
                  label="Notes"
                  value={note}
                  onChange={setNote}
                  placeholder={kind === "income" ? "What was it for?..." : "What did you purchase?..."}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div variants={REVEAL_ROW}>
          <CategoryMatrix
            // Remount per kind so the open tray and the pressed pill cannot survive a
            // switch into a tree that does not contain them.
            key={kind}
            kind={kind}
            value={category}
            expanded={expanded}
            room={panelRoom}
            onExpand={() => setExpanded(true)}
            onCollapse={() => setExpanded(false)}
            onSelect={setCategory}
          />
        </motion.div>

        {/*
          The keypad card and the confirm leave the room while the mosaic is open.

          `popLayout` is what makes the panel's opening one motion instead of two. An
          exiting child normally stays in the flow for the whole of its exit, so the
          keypad would keep its 203px for 400ms while the mosaic was trying to grow into
          them: the panel grew part of the way, stalled, then jumped the last 265px in a
          single frame when the exit finished. `popLayout` measures the leaving child and
          places it absolutely at once, so the column's free space is the full room from
          the first frame and the panel animates into it in one movement. The panel is
          given a stacking context above it, so the keypad sliding away is never drawn
          over the mosaic that is replacing it.
        */}
        <AnimatePresence initial={false} mode="popLayout">
          {!expanded && (
            <motion.div
              key="pad"
              initial={{ opacity: 0, y: 48 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 48 }}
              transition={SPRING}
              className="mt-auto flex shrink-0 flex-col gap-2"
            >
              <Keypad onKey={press} />
              {/*
                `transition-opacity` for the disabled state only: the button's ink is a
                token like the rest of the page's (`index.css`), so it switches with it.
              */}
              <button
                type="button"
                onClick={confirm}
                disabled={value <= 0}
                className="h-12 w-full rounded-2xl border-0 bg-sage px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-sage outline-none transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ink"
              >
                {payee !== null ? "Pay and Log Transaction" : kind === "income" ? "Add Income" : "Add Record"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <DateDialog
        isOpen={dateOpen}
        value={at}
        now={now}
        onClose={() => setDateOpen(false)}
        onPick={(picked) => {
          setAt(picked)
          setDateOpen(false)
        }}
      />
    </div>
  )
}
