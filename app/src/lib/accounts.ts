/**
 * The accounts the money moves through, and where they started.
 *
 * The owner keeps two in Wallet — **UPI** (what almost everything goes through)
 * and **Cash** — and every imported row says which one it moved through. The
 * opening balances are the figures `tools/wallet-import.py` reads out of the two
 * `Account` documents in the export, which is why they are paise and why they are
 * not round numbers: they are what the accounts held when the history begins.
 *
 * The dashboard shows one balance, and it is this: both openings, plus every
 * income row, minus every expense row. A row with no account (a hand-written
 * file, or a Shortcut) lands on the primary one, exactly the way a row with no
 * `kind` is an expense.
 */

export type Account = {
  id: string
  /** The account's name in Wallet, which is also its label on screen. */
  name: string
  /** Integer paise it held when the imported history starts. */
  openingCents: number
  /** The account a row belongs to when nothing says otherwise. */
  primary?: boolean
}

/**
 * Wallet's accounts, in the order its own screens list them. `tools/wallet-import.py`
 * prints these, so they are pasted rather than invented.
 */
export const ACCOUNTS: Account[] = [
  { id: "upi", name: "UPI", openingCents: 1430407, primary: true },
  { id: "cash", name: "Cash", openingCents: 378000 },
]

/** The account a row with no `account` is filed under. */
export const DEFAULT_ACCOUNT = ACCOUNTS.find((account) => account.primary)?.id ?? ACCOUNTS[0].id

const BY_ID = new Map(ACCOUNTS.map((account) => [account.id, account]))

/** The account `id` names, or the primary one — never `undefined`. */
export function accountFor(id: string): Account {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_ACCOUNT)!
}

/**
 * Both accounts added up, as of the start of the history: what the owner had
 * before the first imported row. The dashboard's balance is this, plus every
 * income row, minus every expense row.
 */
export const OPENING_BALANCE_CENTS = ACCOUNTS.reduce((total, account) => total + account.openingCents, 0)
