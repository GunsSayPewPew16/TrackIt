/**
 * The icons a card can wear: a short row for the picker, and the whole library behind **More**.
 *
 * **The library.** Fifty names, chosen for what this ledger actually records rather than for a
 * generic icon set: the money marks first (`qr` and `cash` are the two accounts' own glyphs, and
 * they are in the library so a card of the owner's own can wear them), then what the money is
 * spent on — shopping, eating out, getting about, the home, health, study, work, and the small
 * things a month is made of. They are Lucide's names, and every one of them is drawn by
 * `CARD_ICONS` in `components/BalanceCards.tsx`.
 *
 * **The quick row.** Seven of the library's own, in the order a card is usually thought about:
 * a wallet, a card, savings, a bank, coins, a gift and a trip. The eighth cell of the picker is
 * the **More** button, which opens the library; the seven are not repeated there, so the grid is
 * the library minus what the row already shows.
 *
 * The names are the storage format: `lib/customCards.ts` and `lib/cardLook.ts` both validate a
 * saved card against this list, so a name that is not here can never reach the screen.
 */

/**
 * Fifty icons, in the order the library is drawn: the money marks, then shopping, food, travel,
 * home, health, study, work, and the everyday.
 */
export const ICON_LIBRARY = [
  // The two accounts' own marks, drawn from Lucide's code and banknote glyphs.
  "qr",
  "cash",
  // Money.
  "Wallet",
  "CreditCard",
  "Coins",
  "BadgeIndianRupee",
  "IndianRupee",
  "Percent",
  // Shopping.
  "ShoppingBag",
  "ShoppingCart",
  "ShoppingBasket",
  "Store",
  "Receipt",
  "Tag",
  "Ticket",
  // Eating and drinking.
  "Utensils",
  "Coffee",
  "Pizza",
  "CakeSlice",
  "Beer",
  // Getting about.
  "Car",
  "Bus",
  "Bike",
  "Fuel",
  "TrainFront",
  "Plane",
  "PlaneTakeoff",
  "MapPin",
  // The home.
  "House",
  "Building2",
  "Landmark",
  // Health.
  "HeartPulse",
  "Pill",
  "Dumbbell",
  "Heart",
  // Saving, study and work.
  "PiggyBank",
  "Gift",
  "GraduationCap",
  "BookOpen",
  "Briefcase",
  // The everyday.
  "Smartphone",
  "Wifi",
  "Zap",
  "Droplets",
  "Wrench",
  "Scissors",
  "Shirt",
  "PawPrint",
  "Baby",
  "Sparkles",
] as const

export type CardIconName = (typeof ICON_LIBRARY)[number]

/** The seven the picker shows before **More**: the marks a card is usually given. */
export const QUICK_ICONS = [
  "Wallet",
  "CreditCard",
  "PiggyBank",
  "Landmark",
  "Coins",
  "Gift",
  "Plane",
] as const satisfies readonly CardIconName[]

/** The library without the quick row, which is what **More** opens. */
export const MORE_ICONS: readonly CardIconName[] = ICON_LIBRARY.filter(
  (name) => !(QUICK_ICONS as readonly string[]).includes(name),
)
