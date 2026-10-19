/**
 * What the screens render — one shape, two producers.
 *
 * The dashboard and the ledger do not read rows. They read these models, which
 * `lib/demo.ts` fills from the artboards' own values (so a device-only first visit
 * looks exactly like the design) and `lib/derive.ts` fills from the owner's rows (so
 * the same screens show real money — including an account with none, which draws
 * empty). Keeping both behind one shape is what lets that switch happen without the
 * screens knowing which one they got.
 *
 * Every string here is already formatted: `format.ts` owns rupees, clocks and
 * "Yesterday", and a screen never divides by 100.
 */

import type { CardStyle } from "./types"

/** One card in the ledger list, and one row in the dashboard's recent list. */
export type LedgerCard = {
  id: string
  /** The merchant or the source — what the row *is*. */
  title: string
  /** The line under it: the category, in the structural sans. */
  sub: string
  /**
   * The note after the bullet, drawn in the editorial serif's italic — the app's way of
   * saying "this part is context, not data". Absent when the row has no note.
   */
  subNote?: string
  /** The pill above the card's notch: the category, `Income`, or `High expense`. */
  tag: string
  /** Already signed and in rupees: `−₹5.50`, `+₹3,210.00`. */
  amount: string
  /** The row's clock, `8:05 AM`. */
  time: string
  /** The account the row moved through, by its name: `UPI` or `Cash`. */
  account: string
  /** Initials of the person or merchant paid, for the face at the top of the card: `CP`. */
  payee: string
  /** How much of the category's budget this row's category has used, 0–100. */
  pct: number
  /** The same figure as the card prints it, `62%`. */
  pctLabel: string
  /** What the bar means, for a screen reader — budget where there is one, the
   *  month's spending where there is not. */
  pctAria: string
  /** Which of the artboard's three card treatments this row is drawn with. */
  style: CardStyle
  /**
   * The tile's glyph: a Lucide icon name (`coffee`, `bus`, `laptop`) when the row
   * names its own, otherwise a category id, which `RowIcon` draws from the
   * category markers. One string, one component, no union to thread through.
   */
  icon: string
  /**
   * Initials of whoever is in on it. The artboard stacks up to three 32px faces
   * and cycles their tint through sage, clay and ink by the card's index, so the
   * screen does the cycling and this only carries who.
   */
  people: string[]
}

/** A day the ledger's wheel can land on, and that day's cards. */
export type LedgerDay = {
  /** Midnight local, epoch ms. */
  at: number
  /** That day's rows, newest first, already cards. */
  cards: LedgerCard[]
}

/**
 * Everything the dashboard draws, in the order it draws it.
 *
 * The greeting is deliberately not in here. It is not derived from anything the owner
 * has — it is a different language every open (`lib/greetings.ts`) — so it arrives at the
 * screen as its own prop rather than as a field of a model that is otherwise the owner's
 * own money.
 */
export type DashboardModel = {
  /**
   * One card per account, in `lib/accounts.ts`'s order — the stack the dashboard's
   * first band draws, front card first. The front card's own figures are what the
   * header used to call "the balance": the account's opening, plus its income, minus
   * its expenses, and what has gone out of it this month.
   */
  cards: BalanceCard[]
  quickLog: {
    title: string
    /** `Morning` — the tray is a guess about *now*, so it says which now. */
    context: string
    /**
     * The predictive actions, the first one filled. Each carries the category its own
     * rows were filed under, because the tray opens the manual entry with that category
     * already chosen — an action is a door, not a label.
     */
    actions: { label: string; primary: boolean; category: string }[]
  }
  velocity: {
    /** `BURNING FAST` — how the pace reads, not just its number. */
    badge: string
    title: string
    value: string
    caption: string
    /** The sparkline, as SVG `points` in the artboard's own 174×56 box. */
    points: string
  }
  topCategory: {
    badge: string
    name: string
    /** A Lucide icon name for the 32px mark beside the name. */
    icon: string
    value: string
    caption: string
  }
  /**
   * The dashboard's budget carousel, in the order the cards are drawn. It is never empty:
   * a fresh store holds the F&B envelope and the owner adds to it from there.
   */
  envelopes: EnvelopeModel[]
  /**
   * What just happened. There is no "See all" action here on purpose: the ledger
   * is opened from the dashboard's header now, so the card holds the rows and
   * nothing else.
   */
  recent: {
    title: string
    /** `sub` is the category; `subNote` is the clock that follows it, in serif italic. */
    rows: { id: string; title: string; sub: string; subNote?: string; amount: string }[]
  }
}

/**
 * One budget card on the dashboard: what the owner calls it, what it has taken this month,
 * what it allows and where the money went.
 */
export type EnvelopeModel = {
  /** The store's id for this envelope; the carousel and its hold address it by this. */
  id: string
  /** `F&B Budget` — the envelope's own name, see `lib/budget.ts`. */
  title: string
  /** What the envelope's categories have taken this month, `₹1,624`. */
  spent: string
  /** What it allows — the owner's own limit, `₹1,500` until they change it. */
  limit: string
  /** `32% USED`. */
  badge: string
  /** 0–100: the gauge's filled segments and the marker's position. */
  pct: number
  /**
   * The subcategories the envelope counted, biggest first, as the artboard's little pills
   * say them: `Groceries: 37% of spend` — each one's share of what it has cost this month.
   */
  chips: string[]
}

/**
 * The ledger screen, as one object: the wheel's window and what each day holds.
 *
 * There is no title here on purpose: the wheel is a calendar, so the month above it
 * is whatever the selected capsule is in, and the screen derives it from the day
 * rather than reading a stale string from a model that cannot see the selection.
 */
/**
 * One account as a card in the dashboard's stack.
 *
 * The artboard draws each card with its own balance and the amount spent from it this
 * month — "₹3,240 spent out of ₹18,420.50" — so the stack is where the app finally
 * shows the accounts separately instead of only their sum.
 */
export type BalanceCard = {
  /** The account id from `lib/accounts.ts`; the stack is keyed by it. */
  id: string
  /** The account's name in Wallet, which is also its label on the card: `UPI`. */
  name: string
  /** Which glyph the card carries in its top-left: the UPI code, or a banknote. */
  icon: "qr" | "cash"
  /** The account's own balance in paise: what the figure counts up to. */
  cents: number
  /** The account's own balance, `₹18,420.50`. */
  balance: string
  /** What has gone out of that account this month, `₹3,240`. */
  spent: string
}

export type LedgerModel = {
  /**
   * Every capsule, oldest first: the days of one month, from its 1st to today (or
   * the month's last day, for a month already behind us). A day with no rows is
   * still a day — the wheel is a calendar, not a list.
   */
  days: LedgerDay[]
  /**
   * Which capsule the wheel opens on: the anchor's own day, which is the newest row
   * in the month (or today, with nothing imported), not the last capsule.
   */
  selected: number
  /** What to say when a day has no rows, in the artboard's own voice. */
  emptyNote: string
  /**
   * The months the history touches, newest first, each anchored on the newest row
   * *in that month*.
   *
   * The wheel holds one month, so this is the way back through the rest of the
   * history: picking one rebuilds the window for that month, opening on the day its
   * newest row happened rather than on its end — landing on a month someone stopped
   * spending in the middle of would open the ledger on an empty sheet.
   */
  months: { key: string; label: string; anchor: number }[]
}
