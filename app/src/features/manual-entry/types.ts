/**
 * What the manual-entry sheet collects, and the shape the ledger takes it in.
 *
 * The amount is the keypad's own number of **rupees** while it is being typed (that is
 * what the digits on screen are), and `onSubmit` converts it to the app's integer paise
 * at the one boundary where that is allowed — `lib/ledger.ts` never sees a float.
 */
export type ManualEntry = {
  /** Rupees as typed, e.g. `1250.5`. Converted to paise by the caller. */
  amount: number
  /** An account id from `lib/accounts.ts` (`upi`, `cash`). */
  account: string
  merchant: string
  note: string
  /** A category id from `lib/categories.ts`, or `null` when nothing was picked. */
  category: string | null
}

export type SheetProps = {
  isOpen: boolean
  onClose: () => void
  /** Called with the entry after the confirm key. The sheet closes itself afterwards. */
  onSubmit?: (entry: ManualEntry) => void
}
