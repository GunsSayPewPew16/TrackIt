import { Camera } from "lucide-react"

import { BalanceCards } from "@/components/BalanceCards"
import { RowIcon } from "@/components/RowIcon"
import { ThemeToggle } from "@/components/ThemeToggle"
import { useLongPress } from "@/hooks/useLongPress"
import type { GreetingLine } from "@/lib/greetings"
import { lightTap } from "@/lib/haptics"
import type { Theme } from "@/lib/theme"
import type { DashboardModel } from "@/lib/view"

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
 *    gauge, then the recent rows.
 *
 * The page column is the artboard's 390px with its 24/16/32 padding and its 8px
 * rhythm, centred rather than pinned left, so the same screen fits a phone exactly
 * and sits in the middle of a desktop window instead of stretching a mobile design
 * across it.
 */
export function DashboardScreen({
  model,
  greeting,
  theme,
  onToggleTheme,
  onScan,
  onAddRecord,
  onQuickLog,
  onSetBudget,
  onOpenAccount,
  hasAccount,
  onEditBalance,
}: {
  model: DashboardModel
  /**
   * This open's greeting, which is nobody's data: it comes from the fifty words in
   * `lib/greetings.ts`, or from the greetings table the server draws one row from
   * (`hooks/useGreeting.ts`).
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
   * A long press on the envelope card opens the budget editor
   * (`features/budget/BudgetSheet.tsx`). The F&B limit is the owner's own number, and the
   * card drawing it is the only place it can be changed.
   */
  onSetBudget: () => void
  /**
   * Tapping the name in the greeting opens the account panel (`components/AccountSheet.tsx`),
   * which is where the sign-out lives. The name *is* the account, so it is the door — no
   * extra circle in a header that has 28px of greeting and a 48px theme toggle in it.
   */
  onOpenAccount: () => void
  /**
   * Whether this build has an account behind the name. A device-only build has none, so the
   * panel it opens has nothing to sign out of — and the name must not promise that it does.
   */
  hasAccount: boolean
  /**
   * A hold on the front account card opens that account's balance editor
   * (`features/balance/BalanceSheet.tsx`). The stack is a drag, a tap and a hold at once —
   * all three are told apart by the same 10px of travel (`hooks/useLongPress.ts`).
   */
  onEditBalance: (accountId: string) => void
}) {
  // The hold that edits the F&B limit. Both the whole card and its chips answer to it; a
  // scroll cancels it (`hooks/useLongPress.ts`), which is what keeps the page draggable.
  const holdEnvelope = useLongPress(onSetBudget)

  /** The artboard's small letterspaced label, which every chip and pill wears. */
  const pill = "inline-flex items-center h-6 rounded-xl px-2 text-[10px] leading-4 font-bold tracking-[0.03em] whitespace-nowrap"
  /** The money figures, which are the display face at its tightest tracking. */
  const figure = "font-display text-[40px] leading-[48px] font-bold tracking-[-0.03em]"
  /** A card's title, at the reading face's medium weight. */
  const cardTitle = "font-display text-[14px] leading-5 font-medium tracking-[-0.01em]"

  // The gauge is twenty segments with a 2px gap, and 40% fills eight of them.
  const filled = Math.round(model.envelope.pct / 5)

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
            **The name is the account's door.** It wears the greeting's own roman cut and
            nothing else draws a control around it — no second circle in a 48px header, no
            chevron, no underline — because the line already says whose vault this is and a
            thumb on a name is the oldest affordance there is. The padding is negative on the
            left and right so the tap target is 8px wider than the word without moving it,
            and `aria-label` says what the tap does for a screen reader, which cannot infer
            it from a name.
          */}
          <button
            type="button"
            data-account-trigger=""
            onClick={() => {
              lightTap() // must run synchronously inside the tap for iOS
              onOpenAccount()
            }}
            title={hasAccount ? "Your account" : "This device's ledger"}
            aria-label={
              hasAccount
                ? `${greeting.name} — account and sign out`
                : `${greeting.name} — this device's ledger`
            }
            className="-mx-1 inline rounded-lg px-1 text-left align-baseline"
          >
            {greeting.name}
          </button>
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
          {/* A tray, so it scrolls sideways without a bar the way the artboard's does. */}
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
        The envelope — the F&B budget: what food has taken, what it allows, and where the line
        sits.

        **This card is the Food & Beverages budget** (`lib/budget.ts`): the dimension's own
        spend this month, out of the owner's own limit (₹1,500 until they change it), and the
        chips below the bar are its subcategories — the figures come from `derive.ts`'s
        `envelope`, not from an imported Wallet budget. It is deliberately **not** the same
        figure as the stats dial, which answers the whole month against ₹5,000.

        **A hold on the card opens the editor.** The limit is the owner's, so it is edited
        where it is drawn: `hooks/useLongPress.ts` gives the hold, the tick and a keyboard /
        right-click path to it, and `onSetBudget` opens the panel. A scroll cancels the hold,
        so the dashboard still scrolls under a thumb.

        The artboard splits the card `2fr 3fr`, which is a ratio drawn around its own
        `$240` and `/ $600`. A rupee figure carries a symbol and thousands separators, so
        `/ ₹1,500` at the design's 40px is 135px — wider than the 124px track that ratio
        gives it — and the line broke onto a third row, which the card's fixed 160px then
        clipped. Nothing about the type changes here: both money lines stay 40px on a 48px
        line, one under the other, and the column is simply sized by what it holds while
        the gauge takes what is left, which is the artboard's own intent. `whitespace-nowrap`
        is what keeps a longer number from ever doing that again.
      */}
      <section
        {...holdEnvelope}
        role="group"
        tabIndex={0}
        aria-label={`F&B Budget: ${model.envelope.spent} spent of ${model.envelope.limit}. Hold to change the budget`}
        title="Hold to change the budget"
        className="grid h-40 grid-cols-[auto_1fr] gap-4 rounded-[20px] border border-line bg-card p-4 select-none [-webkit-touch-callout:none]"
      >
        <div className="flex flex-col justify-between whitespace-nowrap">
          <div className={cardTitle}>{model.envelope.title}</div>
          <div>
            <div className={`${figure} text-ink`}>{model.envelope.spent}</div>
            <div className={`${figure} text-ink2`}>/ {model.envelope.limit}</div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-between">
          <span className={`${pill} self-start bg-clay text-on-clay`}>{model.envelope.badge}</span>
          {/*
            The gauge is twenty 2px-gapped segments with a 4px needle at the same
            percentage the `N% USED` pill says, so the pill and the line can never
            disagree. The needle's left offset is the one value here that cannot be a
            utility: it is the model's own percentage, and a class built from data
            would not exist in the stylesheet.
          */}
          <div
            className="relative flex h-8 gap-0.5"
            role="img"
            aria-label={`${model.envelope.spent} spent of ${model.envelope.limit} — ${model.envelope.badge}`}
          >
            {Array.from({ length: 20 }, (_, index) => (
              <span
                key={index}
                className={`flex-1 rounded-xs ${index < filled ? "bg-clay" : "bg-line"}`}
                aria-hidden="true"
              />
            ))}
            <span
              className="absolute -top-1 -ml-0.5 h-10 w-1 rounded-xs bg-ink"
              style={{ left: `${model.envelope.pct}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="hide-scrollbar flex gap-2 overflow-x-auto">
            {model.envelope.chips.map((chip) => {
              // `Groceries: 80% full` — the envelope's name in the structural sans,
              // the running figure after it in the editorial serif's italic.
              const cut = chip.lastIndexOf(": ")
              const name = cut > 0 ? chip.slice(0, cut) : chip
              const detail = cut > 0 ? chip.slice(cut + 2) : ""
              return (
                <button key={chip} type="button" className="h-12 flex-none border-0 bg-transparent p-0">
                  <span className="inline-flex h-6 items-center gap-1 rounded-xl bg-line px-2 whitespace-nowrap">
                    <span className="font-sans text-[11px] leading-4 text-ink">{name}</span>
                    {detail && (
                      <span className="font-editorial text-[11px] leading-4 italic text-ink2">{detail}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

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
