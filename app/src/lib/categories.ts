/**
 * The owner's own categories — their Wallet tree, not a generic set.
 *
 * A Wallet export keeps each category's **id, name and group colour**, and the
 * names in it are the ones the owner has been filing money under for months, so
 * an import resolves against this table and a row keeps the label it arrived
 * with. `tools/wallet-import.py` writes this file from its own single table,
 * which is why nothing here is hand-edited: change the tool and re-run it.
 *
 * Two things are worth knowing before reading the rows:
 *
 * - **A group is a colour, not a heading.** Wallet paints every subcategory with
 *   its group's colour, and the export keeps the colour but never the group's
 *   name, so the table below is grouped by id and the colour comes from
 *   `CATEGORY_GROUPS` — one colour per group, which is what the dashboard's
 *   breakdown tints a category with.
 * - **`system` categories are Wallet's plumbing** — "Transfer, withdraw", the
 *   OneClick record, "Automatic bank statements reading". They are renderable and
 *   never offered as a choice, and money filed under one is not spending.
 */

export type Category = {
  id: string
  /** What the owner calls it, verbatim from their Wallet export. */
  label: string
  /** The group whose colour it is painted in. */
  group: string
  /** The group's own colour, copied onto the row so a component needs one lookup. */
  color: string
  /** Wallet's plumbing envelope: renderable, never offered as a choice. */
  system?: boolean
}

/** A Wallet group: the colour its categories are painted in, and which ones. */
export type CategoryGroup = {
  id: string
  label: string
  /** The group's paint in Wallet, and therefore on every row filed under it. */
  color: string
  /** The group's own category first, then its children, in Wallet's order. */
  categories: string[]
}

/**
 * The groups, in Wallet's own order. Six of these colours come out of the
 * export; the other five come from the owner's screenshots of Wallet's browser,
 * where the same palette shows up in the same family. The reasoning is in
 * `tools/wallet-import.py`, which owns this table.
 */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: "food-drinks",
    label: "Food & Drinks",
    color: "#f44336",
    categories: ["food-drinks", "groceries", "restaurant", "bar-cafe"],
  },
  {
    id: "shopping",
    label: "Shopping",
    color: "#4FC3F7",
    categories: [
      "shopping",
      "clothes-shoes",
      "jewels",
      "health-beauty",
      "kids",
      "home-garden",
      "pets",
      "electronics",
      "gifts-joy",
      "stationery",
      "free-time",
      "drug-store",
    ],
  },
  {
    id: "housing",
    label: "Housing",
    color: "#FFA726",
    categories: ["housing", "rent", "mortgage", "energy", "services", "maintenance", "property-insurance"],
  },
  {
    id: "transportation",
    label: "Transportation",
    color: "#78909C",
    categories: ["transportation", "public-transport", "taxi", "long-distance", "business-trips"],
  },
  {
    id: "vehicle",
    label: "Vehicle",
    color: "#AA00FF",
    categories: [
      "vehicle",
      "fuel",
      "parking",
      "vehicle-maintenance",
      "rentals",
      "vehicle-insurance",
      "leasing",
    ],
  },
  {
    id: "life-entertainment",
    label: "Life & Entertainment",
    color: "#64DD17",
    categories: [
      "life-entertainment",
      "health-doctor",
      "wellness",
      "active-sport",
      "culture-sport",
      "life-events",
      "hobbies",
      "education",
      "books-subs",
      "tv-streaming",
      "holiday-trips",
      "charity-gifts",
      "friends",
      "mobile-recharge",
      "lottery",
    ],
  },
  {
    id: "communication",
    label: "Communication, PC",
    color: "#536DFE",
    categories: ["communication", "phone", "internet", "software", "postal"],
  },
  {
    id: "financial-expenses",
    label: "Financial expenses",
    color: "#26A69A",
    categories: [
      "financial-expenses",
      "taxes",
      "insurances",
      "loans-interests",
      "fines",
      "advisory",
      "charges-fees",
      "financial-child-support",
    ],
  },
  {
    id: "investments",
    label: "Investments",
    color: "#EC407A",
    categories: ["investments", "realty", "vehicles-chattels", "financial-investments", "savings", "collections"],
  },
  {
    id: "allowance",
    label: "Allowance",
    color: "#FBC02D",
    categories: ["allowance", "child-support"],
  },
  {
    id: "income",
    label: "Income",
    color: "#FFCA28",
    categories: [
      "income",
      "wage-invoices",
      "interests-dividends",
      "sale",
      "rental-income",
      "dues-grants",
      "lending-renting",
      "checks-coupons",
      "income-lottery",
      "refunds",
      "income-child-support",
      "income-gifts",
    ],
  },
]

/**
 * Wallet's own labels repeat across sets — Child Support and Lottery each appear
 * twice — so a repeated label carries its set in its id (`income-child-support`)
 * and the export's own row keeps the plain one.
 */
const ROWS: readonly (readonly [id: string, label: string, group: string])[] = [
  ["food-drinks", "Food & Drinks", "food-drinks"],
  ["groceries", "Groceries", "food-drinks"],
  ["restaurant", "Restaurant, fast-food", "food-drinks"],
  ["bar-cafe", "Bar, cafe", "food-drinks"],
  ["shopping", "Shopping", "shopping"],
  ["clothes-shoes", "Clothes & shoes", "shopping"],
  ["jewels", "Jewels, accessories", "shopping"],
  ["health-beauty", "Health and beauty", "shopping"],
  ["kids", "Kids", "shopping"],
  ["home-garden", "Home, garden", "shopping"],
  ["pets", "Pets, animals", "shopping"],
  ["electronics", "Electronics, accessories", "shopping"],
  ["gifts-joy", "Gifts, joy", "shopping"],
  ["stationery", "Stationery, tools", "shopping"],
  ["free-time", "Free time", "shopping"],
  ["drug-store", "Drug-store, chemist", "shopping"],
  ["housing", "Housing", "housing"],
  ["rent", "Rent", "housing"],
  ["mortgage", "Mortgage", "housing"],
  ["energy", "Energy, utilities", "housing"],
  ["services", "Services", "housing"],
  ["maintenance", "Maintenance, repairs", "housing"],
  ["property-insurance", "Property insurance", "housing"],
  ["transportation", "Transportation", "transportation"],
  ["public-transport", "Public transport", "transportation"],
  ["taxi", "Taxi", "transportation"],
  ["long-distance", "Long distance", "transportation"],
  ["business-trips", "Business trips", "transportation"],
  ["vehicle", "Vehicle", "vehicle"],
  ["fuel", "Fuel", "vehicle"],
  ["parking", "Parking", "vehicle"],
  ["vehicle-maintenance", "Vehicle maintenance", "vehicle"],
  ["rentals", "Rentals", "vehicle"],
  ["vehicle-insurance", "Vehicle insurance", "vehicle"],
  ["leasing", "Leasing", "vehicle"],
  ["life-entertainment", "Life & Entertainment", "life-entertainment"],
  ["health-doctor", "Health care, doctor", "life-entertainment"],
  ["wellness", "Wellness, beauty", "life-entertainment"],
  ["active-sport", "Active sport, fitness", "life-entertainment"],
  ["culture-sport", "Culture, sport events", "life-entertainment"],
  ["life-events", "Life events", "life-entertainment"],
  ["hobbies", "Hobbies", "life-entertainment"],
  ["education", "Education, development", "life-entertainment"],
  ["books-subs", "Books, audio, subscriptions", "life-entertainment"],
  ["tv-streaming", "TV, Streaming", "life-entertainment"],
  ["holiday-trips", "Holiday, trips, hotels", "life-entertainment"],
  ["charity-gifts", "Charity, gifts", "life-entertainment"],
  ["friends", "Friends", "life-entertainment"],
  ["mobile-recharge", "Mobile Recharge", "life-entertainment"],
  ["lottery", "Lottery, gambling", "life-entertainment"],
  ["communication", "Communication, PC", "communication"],
  ["phone", "Phone, cell phone", "communication"],
  ["internet", "Internet", "communication"],
  ["software", "Software, apps, games", "communication"],
  ["postal", "Postal services", "communication"],
  ["financial-expenses", "Financial expenses", "financial-expenses"],
  ["taxes", "Taxes", "financial-expenses"],
  ["insurances", "Insurances", "financial-expenses"],
  ["loans-interests", "Loan, interests", "financial-expenses"],
  ["fines", "Fines", "financial-expenses"],
  ["advisory", "Advisory", "financial-expenses"],
  ["charges-fees", "Charges, Fees", "financial-expenses"],
  ["financial-child-support", "Child Support", "financial-expenses"],
  ["investments", "Investments", "investments"],
  ["realty", "Realty", "investments"],
  ["vehicles-chattels", "Vehicles, chattels", "investments"],
  ["financial-investments", "Financial investments", "investments"],
  ["savings", "Savings", "investments"],
  ["collections", "Collections", "investments"],
  ["allowance", "Allowance", "allowance"],
  ["child-support", "Child Support", "allowance"],
  ["income", "Income", "income"],
  ["wage-invoices", "Wage, invoices", "income"],
  ["interests-dividends", "Interests, dividends", "income"],
  ["sale", "Sale", "income"],
  ["rental-income", "Rental income", "income"],
  ["dues-grants", "Dues & grants", "income"],
  ["lending-renting", "Lending, renting", "income"],
  ["checks-coupons", "Checks, coupons", "income"],
  ["income-lottery", "Lottery, gambling", "income"],
  ["refunds", "Refunds (tax, purchase)", "income"],
  ["income-child-support", "Child Support", "income"],
  ["income-gifts", "Gifts", "income"],
  ["debts", "Debts", "debts"],
  ["transfer", "Transfer, withdraw", "transfer"],
  ["shopping-list", "Shopping list", "shopping-list"],
  ["oneclick", "Wallet - OneClick record", "oneclick"],
  ["bank-statements", "Automatic bank statements reading", "bank-statements"],
  ["unknown", "Unknown", "unknown"],
]

/** Wallet's plumbing envelopes: money filed under one of these is not spending. */
const SYSTEM = new Set(["debts", "transfer", "shopping-list", "oneclick", "bank-statements", "unknown"])

const COLOR_OF_GROUP = new Map(CATEGORY_GROUPS.map((group) => [group.id, group.color]))
const LABEL_OF_GROUP = new Map(CATEGORY_GROUPS.map((group) => [group.id, group.label]))

/** Every category the owner's tracker knows, in Wallet's own order. */
export const CATEGORIES: Category[] = ROWS.map(([id, label, group]) => ({
  id,
  label,
  group,
  color: COLOR_OF_GROUP.get(group) ?? "#8BC34A",
  ...(SYSTEM.has(id) ? { system: true } : {}),
}))

const BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]))

/** What a row with no category, or one this table has never heard of, is filed as. */
export const DEFAULT_CATEGORY = "unknown"

/** The category `id` names, or `Unknown` — never `undefined`, so a row always reads. */
export function categoryFor(id: string): Category {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_CATEGORY)!
}

/** The group's own label, for anything that needs to name it. */
export function groupLabel(group: string): string {
  return LABEL_OF_GROUP.get(group) ?? group
}

/**
 * Where a label from another tracker lands: whether this table already knows that
 * name, so an import can keep the owner's own wording when it is already theirs.
 */
export function categoryIdForLabel(label: string): string | undefined {
  const wanted = label.trim().toLowerCase()
  if (!wanted) return undefined
  return CATEGORIES.find((category) => category.label.toLowerCase() === wanted)?.id
}
