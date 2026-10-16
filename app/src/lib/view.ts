/**
 * What the screens render — one shape, two producers.
 *
 * The dashboard and the ledger do not read rows. They read these models, which
 * `lib/demo.ts` fills from the artboards' own values (so a first visit looks
 * exactly like the design) and `lib/derive.ts` fills from the owner's imported
 * history (so the same screens show real money). Keeping both behind one shape is
 * what lets that switch happen without the screens knowing which one they got.
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
  /** The line under it: the category, then the note when there is one. */
  sub: string
  /** The pill above the card's notch: the category, `Income`, or `High expense`. */
  tag: string
  /** Already signed and in rupees: `−₹5.50`, `+₹3,210.00`. */
  amount: string
  /** The row's clock, `8:05 AM`. */
  time: string
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

/** Everything the dashboard draws, in the order it draws it. */
export type DashboardModel = {
  /**
   * The greeting, as its two halves rather than as one line: `Hello,` and `Priyansh`
   * are different drawings of the same family (the italic cut and the roman, from
   * `lib/owner.ts`), so a single string could not say which half wears which. The
   * screen draws them, in this order, one space apart.
   */
  greeting: {
    /** The word in front, comma included: `Hello,`. */
    hello: string
    /** Whose name it says: `Priyansh`. */
    name: string
  }
  balance: {
    label: string
    /** The big figure: `₹24,860.40`. */
    value: string
  }
  cashFlow: {
    /** The pill beside the balance's footer: `MONTHLY CASH FLOW`. */
    chip: string
    /** This month's net, signed: `+₹1,240`. */
    delta: string
    /** Whether the arrow points up the way money in does. */
    deltaUp: boolean
    /** What the arrow means on screen readers and hover, `up`/`down` included. */
    deltaNote: string
    income: { label: string; value: string }
    spent: { label: string; value: string }
  }
  quickLog: {
    title: string
    /** `Morning` — the tray is a guess about *now*, so it says which now. */
    context: string
    /** The predictive actions, the first one filled. */
    actions: { label: string; primary: boolean }[]
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
  envelope: {
    title: string
    /** What has been spent against it, `₹240`. */
    spent: string
    /** What it allows, `₹600`. */
    limit: string
    /** `40% USED`. */
    badge: string
    /** 0–100: the gauge's filled segments and the marker's position. */
    pct: number
    /** The other envelopes, as the artboard's little pills say them. */
    chips: string[]
  }
  /**
   * What just happened. There is no "See all" action here on purpose: the ledger
   * is opened from the dashboard's header now, so the card holds the rows and
   * nothing else.
   */
  recent: {
    title: string
    rows: { id: string; title: string; sub: string; amount: string }[]
  }
}

/**
 * The ledger screen, as one object: the wheel's window and what each day holds.
 *
 * There is no title here on purpose: the wheel is a calendar, so the month above it
 * is whatever the selected capsule is in, and the screen derives it from the day
 * rather than reading a stale string from a model that cannot see the selection.
 */
export type LedgerModel = {
  /** Every capsule, oldest first; the artboard draws fifteen of them. */
  days: LedgerDay[]
  /** Which capsule is under the pointer of the wheel on arrival. */
  selected: number
  /** What to say when a day has no rows, in the artboard's own voice. */
  emptyNote: string
  /**
   * The months the account menu offers, newest first.
   *
   * The wheel is a fifteen-day window — that is the design — so on its own it can
   * only ever reach the last fortnight. The artboard draws a chevron beside the
   * month, which is what this fills: picking a month moves the window to end on
   * the newest row *in that month*, so a history that runs for months is reachable
   * without changing the wheel's geometry at all.
   */
  months: { key: string; label: string; anchor: number }[]
}
