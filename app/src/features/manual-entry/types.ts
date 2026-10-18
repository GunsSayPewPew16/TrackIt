import type { UpiPayee } from "@/features/upi/upi"
import type { Kind } from "@/lib/types"

/**
 * What the manual-entry sheet collects, and the shape the ledger takes it in.
 *
 * The amount is the keypad's own number of **rupees** while it is being typed (that is
 * what the digits on screen are), and `onSubmit` converts it to the app's integer paise
 * at the one boundary where that is allowed — `lib/ledger.ts` never sees a float.
 */
export type ManualEntry = {
  /**
   * Whether this is money out or money in. The same sheet records both, switched by the
   * Expense/Income control in its header, and the row is written with this kind — which is
   * what keeps an income out of every "spent this month" figure (`lib/derive.ts`).
   */
  kind: Kind
  /** Rupees as typed, e.g. `1250.5`. Converted to paise by the caller. */
  amount: number
  /** An account id from `lib/accounts.ts` (`upi`, `cash`). */
  account: string
  merchant: string
  note: string
  /**
   * A category id from `lib/categories.ts`, or `null` when nothing was picked. It is an
   * id from the tree the header's kind was on: an expense category for money out, an
   * income envelope for money in.
   */
  category: string | null
  /**
   * When the money left, as epoch ms — a whole moment, day and time of day.
   *
   * The sheet's pill starts on the current moment (the default the owner asked for) and
   * opens a picker that sets both halves, so a forgotten expense lands on the day **and at
   * the hour** it happened, and two rows typed for the same day order the way they happened.
   * A **scanned payment** carries it too: a receipt is often typed up after the fact, so the
   * payment screen's pill is the same control and `logPaidPayee` files the row at this moment.
   */
  at: number
}

export type SheetProps = {
  isOpen: boolean
  /**
   * The category the entry starts on, from the screen that opened the sheet: a quick-log
   * chip hands in the envelope its own rows were filed under, and the add-record pill
   * hands in `null` for a blank entry. The sheet's own state is seeded from it on every
   * open, so closing and opening elsewhere never inherits the last one.
   */
  category?: string | null
  /**
   * The merchant a scanned code named, when the sheet was opened from the scanner rather
   * than from the dashboard. It turns the sheet into the *payment* screen: the account tray
   * gives its row to a small box with the payee's name and address, the keypad starts on the
   * code's own amount when it carried one, the confirm reads **Pay and Log Transaction**, and
   * pressing it logs the row and then hands the payment to Google Pay for exactly the amount
   * on screen. `null` is the ordinary blank entry.
   */
  payee?: UpiPayee | null
  onClose: () => void
  /** Called with the entry after the confirm key. The sheet closes itself afterwards. */
  onSubmit?: (entry: ManualEntry) => void
}
