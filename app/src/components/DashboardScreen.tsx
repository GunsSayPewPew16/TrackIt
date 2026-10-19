import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, Camera, Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { BalanceCards } from "@/components/BalanceCards"
import { RowIcon } from "@/components/RowIcon"
import { ThemeToggle } from "@/components/ThemeToggle"
import { useLongPress } from "@/hooks/useLongPress"
import type { GreetingLine } from "@/lib/greetings"
import { heavyThud, lightTap, mediumClick } from "@/lib/haptics"
import type { Theme } from "@/lib/theme"
import type { DashboardModel, EnvelopeModel } from "@/lib/view"

/**
 * Screen 1 — the bento dashboard.
 *
 * This is `Main.dc.html`, the design export's "Finance dashboard", rebuilt with
 * Tailwind utilities. Every height, radius, padding, gap, font size, line height,
 * letter spacing and colour below is that artboard's own value; the only things
 * that are this app's are the *data* (everything comes from `DashboardModel`, which
 * the artboard's own figures fill on a first visit and the owner's imported history
 * fills after that) and the **scan square's door** — the one control that leaves this
 * screen for a room the dock does not open. Nothing about the design is re-tuned
 * here: if a number is not in the artboard it is not in this file.
 *
 * The header used to carry a second circle of its own — the app's way in to the
 * daily ledger, `ArrowDownUp` beside the theme toggle. The dock opens the ledger
 * now, so the owner has taken it out and the greeting has the room it was sharing;
 * the theme toggle, which is the artboard's own control, stays.
 *
 * The layout is the artboard's four bands, in its order:
 *
 * 1. the greeting, with the artboard's theme toggle;
 * 2. the stack of account cards, which replaced the single balance box — see
 *    `components/BalanceCards.tsx`;
 * 3. a 104px band pairing the scan square with the predictive quick-log tray;
 * 4. four cards on the 8px grid: pace and top category side by side, the envelope
 *    carousel, then the recent rows.
 *
 * The page column is the artboard's 390px with its 24/16/32 padding and its 8px
 * rhythm, centred rather than pinned left, so the same screen fits a phone exactly
 * and sits in the middle of a desktop window instead of stretching a mobile design
 * across it.
 */

/** The artboard's small letterspaced label, which every chip and pill wears. */
const pill =
  "inline-flex items-center h-6 rounded-xl px-2 text-[10px] leading-4 font-bold tracking-[0.03em] whitespace-nowrap"
/** The money figures, which are the display face at its tightest tracking. */
const figure = "font-display text-[40px] leading-[48px] font-bold tracking-[-0.03em]"
/** A card's title, at the reading face's medium weight. */
const cardTitle = "font-display text-[14px] leading-5 font-medium tracking-[-0.01em]"

export function DashboardScreen({
  model,
  greeting,
  theme,
  onToggleTheme,
  onScan,
  onAddRecord,
  onQuickLog,
  activeEnvelopeId,
  onViewEnvelope,
  onEditBudget,
  onCreateBudget,
  onMoveBudget,
  onDeleteBudget,
  onEditBalance,
}: {
  model: DashboardModel
  /**
   * This open's greeting, which is nobody's data: it comes from the twenty words this part
   * of the day owns in `lib/greetings.ts`, or from the greetings table the server draws one
   * row from (`hooks/useGreeting.ts`).
   */
  greeting: GreetingLine
  theme: Theme
  onToggleTheme: () => void
  onScan: () => void
  /** The add-record pill on the account stack opens the manual entry sheet. */
  onAddRecord: () => void
  /**
   * A quick-log chip opens the same sheet with the category that chip's own rows were
   * filed under already chosen — `Log Restaurants` arrives on *Food & Beverages •
   * Restaurants*, so the common entry is a figure and a confirm rather than a walk
   * through the mosaic.
   */
  onQuickLog: (category: string) => void
  /**
   * The envelope the carousel was last on, from the budget store. The screen opens there
   * instead of always on the first card, so a reload puts the owner back on their card.
   */
  activeEnvelopeId: string
  /** The carousel's own choice of card: a swipe, a dot, or a hold on a card. */
  onViewEnvelope: (id: string) => void
  /**
   * A long press on an envelope offers **Edit**, which opens that budget's editor
   * (`features/budget/BudgetSheet.tsx`). Every envelope's limit, name and categories are
   * the owner's own numbers, and the card drawing them is the only place they change.
   */
  onEditBudget: (id: string) => void
  /**
   * The same hold's **Create new**: adds an envelope to the carousel and opens its editor, so
   * the owner names the card they just made instead of being handed a mystery figure.
   */
  onCreateBudget: () => void
  /** Move one envelope one place earlier or later in the carousel. */
  onMoveBudget: (id: string, direction: -1 | 1) => void
  /** Delete one envelope after the menu has asked once more; the last one is refused. */
  onDeleteBudget: (id: string) => void
  /**
   * A hold on the front account card opens that account's balance editor
   * (`features/balance/BalanceSheet.tsx`). The stack is a drag, a tap and a hold at once —
   * all three are told apart by the same 10px of travel (`hooks/useLongPress.ts`).
   */
  onEditBalance: (accountId: string) => void
}) {
  /**
   * The envelope whose hold is showing its two options. It is an id rather than the card, so
   * a store write behind the menu cannot make it stale; the card is looked up for its name.
   */
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const menuEnvelope = model.envelopes.find((envelope) => envelope.id === menuFor) ?? null
  /** The carousel's scroll box and the card the store says is open. */
  const scroller = useRef<HTMLDivElement>(null)
  const count = model.envelopes.length
  const activeIndex = Math.max(
    0,
    model.envelopes.findIndex((envelope) => envelope.id === activeEnvelopeId),
  )
  /** The order as one string, so reorders, inserts and deletes are the only things it sees. */
  const orderKey = model.envelopes.map((envelope) => envelope.id).join("|")
  const lastOrder = useRef("")

  /**
   * **Open where the owner left off, and follow a reorder.** This runs when the cards' order
   * changes — on mount, after Create new, and after a move or a delete — and scrolls to the
   * active card at its new index. It deliberately does not run when a swipe changes the active
   * card: the finger is already doing the scrolling, and a second smooth scroll would fight
   * the flick instead of letting it land.
   */
  useLayoutEffect(() => {
    if (orderKey === lastOrder.current) return
    const first = lastOrder.current === ""
    lastOrder.current = orderKey
    const box = scroller.current
    if (!box) return
    const card = box.firstElementChild as HTMLElement | null
    const step = card ? card.offsetWidth + 8 : box.clientWidth
    box.scrollTo({ left: activeIndex * step, behavior: first ? "instant" : "smooth" })
  }, [orderKey, activeIndex])

  /** Which card the thumb is nearest, so the store and the dots follow a drag. */
  const syncActive = () => {
    const box = scroller.current
    if (!box) return
    const first = box.firstElementChild as HTMLElement | null
    const step = first ? first.offsetWidth + 8 : box.clientWidth
    const next = Math.max(0, Math.min(count - 1, Math.round(box.scrollLeft / step)))
    const id = model.envelopes[next]?.id
    if (id && id !== activeEnvelopeId) onViewEnvelope(id)
  }

  /** A dot is a way to reach a card without a swipe, at the same 8px gap the cards use. */
  const showEnvelope = (index: number) => {
    const box = scroller.current
    const id = model.envelopes[index]?.id
    if (!box || !id) return
    lightTap()
    onViewEnvelope(id)
    const first = box.firstElementChild as HTMLElement | null
    const step = first ? first.offsetWidth + 8 : box.clientWidth
    box.scrollTo({ left: index * step, behavior: "smooth" })
  }

  /** A hold both opens the menu and makes that card the remembered one. */
  const holdEnvelope = (id: string) => {
    onViewEnvelope(id)
    setMenuFor(id)
  }

  /** Where the menu's envelope sits, for the two move buttons' disabled states. */
  const menuIndex = menuEnvelope
    ? model.envelopes.findIndex((envelope) => envelope.id === menuEnvelope.id)
    : -1

  return (
    <div className="mx-auto flex w-full max-w-[390px] flex-col gap-2 px-4 pt-safe pb-nav">
      {/*
        The header is the artboard's own row: the greeting, and its 48px theme
        toggle. The app's second circle — the ledger's door — is gone, and the
        greeting is the width of the screen for it; the ledger is one tap away in the
        dock, which is where the owner asked for it.
      */}
      <div className="mb-2 flex h-12 items-center justify-between">
        {/*
          The greeting is two drawings of one family on one line: the word in Anthropic
          Serif Display's Medium Italic (a real italic file, not a slanted roman) and the
          name in its Medium roman — see `index.css` and `lib/owner.ts`. The artboard sets
          the line in Playfair Display at the reading weight; both halves here are 500,
          because the two static cuts the owner supplied are Medium and a 400 request
          would simply pick them anyway.

          The word is a different language every open, so the heading has to carry that
          without drawing it — the artboard's header is one 48px line with no room for a
          caption. It says so three other ways instead: `lang` on the word, so a screen
          reader pronounces `Nǐ hǎo` as Mandarin rather than as English letters; a `title`,
          so a pointer that rests on the line is told what it means; and a sr-only phrase
          after the name for the same reason. `data-greeting` is not for a reader at all —
          it is how a browser check can tell whether the greeting's server answered or the
          copy in the bundle did.
        */}
        <h1
          title={`hello in ${greeting.language}`}
          data-greeting={greeting.source}
          className="m-0 min-w-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.01em] text-ink"
        >
          <em lang={greeting.lang} className="italic">
            {greeting.word}
          </em>{" "}
          {/*
            **The name is a word again.** It used to be the account's door — a control drawn
            around nothing but a name, so the greeting also had to explain what a tap on it did.
            The sign-out has a tab of its own now (`components/SettingsScreen.tsx`), which is a
            better home for a door than a name that does not look like one, and the masthead is
            back to being one line and a theme toggle.
          */}
          <span>{greeting.name}</span>
          <span className="sr-only"> (in {greeting.language})</span>
        </h1>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      {/* The accounts, as the newer artboard's stack of cards. */}
      <BalanceCards cards={model.cards} onAddRecord={onAddRecord} onEditBalance={onEditBalance} />

      {/* The scan square and the tray of things the owner probably just did. */}
      <div className="grid h-[104px] grid-cols-[104px_1fr] gap-2">
        <button
          type="button"
          onClick={onScan}
          aria-label="Scan a receipt"
          className="flex size-[104px] flex-col items-start justify-between rounded-[20px] border border-line bg-card p-4 text-left text-sage"
        >
          <Camera strokeWidth={1.5} className="size-6" aria-hidden="true" />
          <span className={`${pill} bg-sage text-on-sage`}>SCAN</span>
        </button>

        <div className="flex min-w-0 flex-col justify-between rounded-[20px] border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <span className={`${cardTitle} text-[14px] leading-4`}>{model.quickLog.title}</span>
            <span className="text-ink2">{model.quickLog.context}</span>
          </div>
          {/*
            A tray, so it scrolls sideways without a bar the way the artboard's does. An
            account with nothing on it has no habits to guess at yet, so the tray says so
            rather than leaving a blank row where the chips would be.
          */}
          {model.quickLog.actions.length === 0 ? (
            <p className="font-editorial text-xs leading-4 italic text-ink2">
              Your habits show up here after a few records.
            </p>
          ) : (
            <div className="hide-scrollbar flex gap-2 overflow-x-auto">
              {model.quickLog.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    lightTap() // must run synchronously inside the tap for iOS
                    onQuickLog(action.category)
                  }}
                  className="h-12 flex-none border-0 bg-transparent p-0"
                >
                  <span
                    className={`${pill} h-8 rounded-2xl px-3 ${
                      action.primary ? "bg-sage text-on-sage" : "border border-sage bg-transparent text-sage"
                    }`}
                  >
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The pace of the last week, and where the money actually went. */}
      <div className="grid grid-cols-2 gap-2">
        <section className="relative flex h-44 flex-col justify-between overflow-hidden rounded-[20px] border border-line bg-card p-4">
          {/*
            The sparkline is drawn into the artboard's own 174×56 box and stretched
            across the card's width, so the line's shape is the design's whatever the
            figures are. It sits 88px down a 176px card with 16px of padding, which
            is where the artboard's `top:88px` puts it — level with the value's
            baseline, behind both.
          */}
          <svg
            className="absolute top-[88px] left-0 h-14 w-full"
            viewBox="0 0 174 56"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              className="stroke-sage"
              fill="none"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              points={model.velocity.points}
            />
          </svg>
          <div className="relative flex flex-col items-start">
            <span className={`${pill} bg-clay text-on-clay`}>{model.velocity.badge}</span>
            <div className={`mt-2 ${cardTitle}`}>{model.velocity.title}</div>
          </div>
          <div className="relative">
            <div className={`${figure} text-ink`}>{model.velocity.value}</div>
            {/* The soft line under a hero figure: editorial serif, italic, quiet. */}
            <div className="font-editorial text-xs leading-4 italic text-ink2">{model.velocity.caption}</div>
          </div>
        </section>

        <section className="flex h-44 flex-col justify-between rounded-[20px] border border-line bg-card p-4">
          <div className="flex flex-col items-start">
            <span className={`${pill} bg-clay text-on-clay`}>{model.topCategory.badge}</span>
            <div className="mt-2 flex items-center gap-2">
              <RowIcon name={model.topCategory.icon} className="size-8 text-clay" />
              <span className={cardTitle}>{model.topCategory.name}</span>
            </div>
          </div>
          <div>
            <div className={`${figure} text-ink`}>{model.topCategory.value}</div>
            <div className="font-editorial text-xs leading-4 italic text-ink2">{model.topCategory.caption}</div>
          </div>
        </section>
      </div>

      {/*
        The envelopes — the dashboard's budgets, as a carousel.

        **Each card is one budget** (`lib/budget.ts`): the categories it counts, out of the
        owner's own limit (the first starts at Food & Beverages, ₹1,500), and the chips below
        the bar are what it spent them on — the figures come from `derive.ts`'s `envelope`,
        not from an imported Wallet budget. The carousel is deliberately **not** the stats
        dial, which answers the whole month against ₹5,000 on another screen.

        **A hold offers the card's two answers.** `hooks/useLongPress.ts` gives the hold, the
        tick and a keyboard / right-click path; the menu it opens offers **Edit** (the editor
        whose first field is this card's name) and **Create new** (adds an envelope after the
        last card and opens its editor). A scroll cancels the hold, and the hold's 10px slop
        is what keeps the carousel's own sideways swipe from opening the menu.

        **The cards snap one at a time**, and the dots below are the count and a way to reach
        a card without a swipe. A single envelope draws no dots: there is nothing to page.

        The artboard splits the card `2fr 3fr`, which is a ratio drawn around its own
        `$240` and `/ $600`. A rupee figure carries a symbol and thousands separators, so
        `/ ₹1,500` at the design's 40px is 135px — wider than the 124px track that ratio
        gives it — and the line broke onto a third row, which the card's fixed 160px then
        clipped. Nothing about the type changes here: both money lines stay 40px on a 48px
        line, one under the other, and the column is simply sized by what it holds while
        the gauge takes what is left, which is the artboard's own intent. `whitespace-nowrap`
        is what keeps a longer number from ever doing that again.
      */}
      <div className="flex flex-col gap-1.5">
        <div
          ref={scroller}
          onScroll={syncActive}
          aria-label="Budget envelopes"
          className="hide-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain"
        >
          {model.envelopes.map((envelope, index) => (
            <EnvelopeCard
              key={envelope.id}
              envelope={envelope}
              index={index}
              count={count}
              onHold={holdEnvelope}
            />
          ))}
        </div>

        {count > 1 && (
          <div
            role="group"
            aria-label="Budget envelope pages"
            className="flex items-center justify-center gap-1"
          >
            {model.envelopes.map((envelope, index) => (
              <button
                key={envelope.id}
                type="button"
                aria-current={index === activeIndex ? "true" : undefined}
                aria-label={`${envelope.title} (${index + 1} of ${count})`}
                onClick={() => showEnvelope(index)}
                className="grid size-6 place-items-center rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${
                    index === activeIndex ? "w-4 bg-clay" : "w-1.5 bg-line"
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {menuEnvelope && (
          <BudgetMenu
            envelope={menuEnvelope}
            onClose={() => setMenuFor(null)}
            onEdit={() => {
              const id = menuEnvelope.id
              setMenuFor(null)
              onEditBudget(id)
            }}
            onCreate={() => {
              setMenuFor(null)
              onCreateBudget()
            }}
            canMoveLeft={menuIndex > 0}
            canMoveRight={menuIndex >= 0 && menuIndex < count - 1}
            canDelete={count > 1}
            onMove={(direction) => onMoveBudget(menuEnvelope.id, direction)}
            onDelete={() => {
              const id = menuEnvelope.id
              setMenuFor(null)
              onDeleteBudget(id)
            }}
          />
        )}
      </AnimatePresence>

      {/*
        What just happened. The artboard puts a "See all" button in this header and
        the owner has taken it out: the ledger has its own tab in the dock now, so the
        control would have been a second door to the same room. The row keeps the
        artboard's 48px and the card its 280px, so nothing below it moves.
      */}
      <section className="h-[280px] rounded-[20px] border border-line bg-card p-4">
        <div className="flex h-12 items-center">
          <span className={cardTitle}>{model.recent.title}</span>
        </div>
        {model.recent.rows.length === 0 && (
          <p className="py-8 text-center text-ink2">Nothing logged yet.</p>
        )}
        {model.recent.rows.map((row) => (
          <div key={row.id} className="flex h-16 items-center justify-between border-t border-line">
            <div className="min-w-0">
              <div className="truncate font-bold text-ink">{row.title}</div>
              {/* Category in the sans, the clock after it in the editorial serif. */}
              <div className="truncate whitespace-nowrap text-ink2">
                <span className="font-sans">{row.sub}</span>
                {row.subNote && (
                  <>
                    <span aria-hidden="true" className="mx-1 opacity-60">
                      ·
                    </span>
                    <span className="font-editorial italic opacity-70">{row.subNote}</span>
                  </>
                )}
              </div>
            </div>
            <div className="shrink-0 text-ink tabular-nums">{row.amount}</div>
          </div>
        ))}
      </section>
    </div>
  )
}

/**
 * One card in the envelope carousel.
 *
 * It is a component of its own because `hooks/useLongPress.ts` is a hook: every card needs
 * its own hold, and a hold on one card must know which budget it was made on. The card keeps
 * the artboard's geometry — a 160px card split into the money column and the gauge — and its
 * width is the carousel's own, so one card fills the band and the next waits off the right
 * edge.
 */
function EnvelopeCard({
  envelope,
  index,
  count,
  onHold,
}: {
  envelope: EnvelopeModel
  index: number
  count: number
  onHold: (id: string) => void
}) {
  const hold = useLongPress(() => onHold(envelope.id))
  // The gauge is twenty segments with a 2px gap, and each 5% fills one of them.
  const filled = Math.round(envelope.pct / 5)

  return (
    <section
      {...hold}
      role="group"
      tabIndex={0}
      aria-label={`${envelope.title}: ${envelope.spent} spent of ${envelope.limit}. ${index + 1} of ${count}. Hold to edit, arrange or delete it`}
      title="Hold to edit, arrange or delete"
      className="grid h-40 w-full flex-none snap-start grid-cols-[auto_1fr] gap-4 rounded-[20px] border border-line bg-card p-4 select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
    >
      <div className="flex flex-col justify-between whitespace-nowrap">
        <div className={cardTitle}>{envelope.title}</div>
        <div>
          <div className={`${figure} text-ink`}>{envelope.spent}</div>
          <div className={`${figure} text-ink2`}>/ {envelope.limit}</div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-between">
        <span className={`${pill} self-start bg-clay text-on-clay`}>{envelope.badge}</span>
        {/*
          The gauge is twenty 2px-gapped segments with a 4px needle at the same percentage
          the `N% USED` pill says, so the pill and the line can never disagree. The needle's
          left offset is the one value here that cannot be a utility: it is the model's own
          percentage, and a class built from data would not exist in the stylesheet.
        */}
        <div
          className="relative flex h-8 gap-0.5"
          role="img"
          aria-label={`${envelope.spent} spent of ${envelope.limit} — ${envelope.badge}`}
        >
          {Array.from({ length: 20 }, (_, segment) => (
            <span
              key={segment}
              className={`flex-1 rounded-xs ${segment < filled ? "bg-clay" : "bg-line"}`}
              aria-hidden="true"
            />
          ))}
          <span
            className="absolute -top-1 -ml-0.5 h-10 w-1 rounded-xs bg-ink"
            style={{ left: `${envelope.pct}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="hide-scrollbar flex gap-2 overflow-x-auto">
          {envelope.chips.map((chip) => {
            // `Groceries: 80% of spend` — the category in the structural sans, the share
            // after it in the editorial serif's italic.
            const cut = chip.lastIndexOf(": ")
            const name = cut > 0 ? chip.slice(0, cut) : chip
            const detail = cut > 0 ? chip.slice(cut + 2) : ""
            return (
              <span
                key={chip}
                className="inline-flex h-6 flex-none items-center gap-1 rounded-xl bg-line px-2 whitespace-nowrap"
              >
                <span className="font-sans text-[11px] leading-4 text-ink">{name}</span>
                {detail && (
                  <span className="font-editorial text-[11px] leading-4 italic text-ink2">{detail}</span>
                )}
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/**
 * What a held envelope offers, in the same small panel a held ledger row uses.
 *
 * **Edit** is the card's own editor and **Create new** adds an envelope and opens its editor.
 * Under them are the two ways to arrange the carousel — earlier and later — and **Delete**,
 * which asks once more before it writes. The last envelope cannot be deleted: the dashboard
 * always needs a card. The menu writes nothing itself, so closing it with the dim layer or
 * Escape leaves the store exactly as it was.
 */
function BudgetMenu({
  envelope,
  onClose,
  onEdit,
  onCreate,
  onMove,
  onDelete,
  canMoveLeft,
  canMoveRight,
  canDelete,
}: {
  envelope: EnvelopeModel
  onClose: () => void
  onEdit: () => void
  onCreate: () => void
  /** `-1` is one place earlier, `1` one place later. */
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
  canMoveLeft: boolean
  canMoveRight: boolean
  canDelete: boolean
}) {
  /** The panel's second page: the delete question, which is the only write in here. */
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  /** One of the three small arrangement buttons under the two main answers. */
  const arrange =
    "flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-transparent font-sans text-[11px] leading-4 font-medium tracking-[0.01em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-35"

  return (
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

      <div className="pointer-events-none fixed inset-0 z-[55] grid place-items-center px-4">
        <motion.div
          key="panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="envelope-actions-title"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="pointer-events-auto w-full max-w-[358px] rounded-[20px] border border-line bg-card p-4"
        >
          {confirming ? (
            <>
              <div className="flex items-center gap-3">
                <span className="grid size-10 flex-none place-items-center rounded-2xl bg-clay text-on-clay">
                  <Trash2 strokeWidth={1.5} className="size-5" aria-hidden="true" />
                </span>
                <h2
                  id="envelope-actions-title"
                  className="min-w-0 flex-1 font-editorial text-[18px] leading-7 italic text-ink"
                >
                  Delete {envelope.title}?
                </h2>
              </div>

              <p className="mt-3 text-[11px] leading-4 text-ink2">
                Its limit and the categories it tracks go with it. The expenses already logged
                stay in the ledger. This cannot be undone.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    mediumClick()
                    setConfirming(false)
                  }}
                  className="h-12 rounded-2xl border border-line bg-transparent font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  Keep It
                </button>
                <button
                  type="button"
                  onClick={() => {
                    heavyThud()
                    onDelete()
                  }}
                  className="h-12 rounded-2xl border-0 bg-clay font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-clay outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <h2
                id="envelope-actions-title"
                className="truncate font-editorial text-[18px] leading-7 italic text-ink"
              >
                {envelope.title}
              </h2>
              <p className="mt-2 text-[11px] leading-4 text-ink2">
                Edit changes this envelope's name, limit and what counts. Create new adds another
                one beside it. The row below moves it, or deletes it.
              </p>

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
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    lightTap() // must run synchronously inside the tap for iOS
                    onCreate()
                  }}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl border-0 bg-sage font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-sage outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <Plus strokeWidth={1.5} className="size-4" aria-hidden="true" />
                  Create new
                </button>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={!canMoveLeft}
                  aria-label={`Move ${envelope.title} left`}
                  onClick={() => {
                    mediumClick()
                    onMove(-1)
                  }}
                  className={arrange}
                >
                  <ArrowLeft strokeWidth={1.5} className="size-3.5" aria-hidden="true" />
                  Move left
                </button>
                <button
                  type="button"
                  disabled={!canMoveRight}
                  aria-label={`Move ${envelope.title} right`}
                  onClick={() => {
                    mediumClick()
                    onMove(1)
                  }}
                  className={arrange}
                >
                  Move right
                  <ArrowRight strokeWidth={1.5} className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={!canDelete}
                  aria-label={`Delete ${envelope.title}`}
                  onClick={() => {
                    lightTap()
                    setConfirming(true)
                  }}
                  className={`${arrange} text-clay`}
                >
                  <Trash2 strokeWidth={1.5} className="size-3.5" aria-hidden="true" />
                  Delete
                </button>
              </div>

              {!canDelete && (
                <p className="mt-2 text-[10px] leading-4 text-ink2">
                  The last envelope stays — create another before deleting this one.
                </p>
              )}
            </>
          )}
        </motion.div>
      </div>
    </>
  )
}
