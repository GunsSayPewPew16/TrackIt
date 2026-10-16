/**
 * Bringing a history in, and taking one out.
 *
 * The two directions have different jobs, so they are written differently.
 *
 * **Import is forgiving**, because the file comes from somewhere else. It reads the
 * app's own export (a bare JSON array of its `Expense` rows — this site's sibling
 * project), the same array under `{ expenses: [...] }`, `{ rows: [...] }` or
 * `{ data: [...] }`, and the field names other trackers use: `amount` in rupees as
 * well as `amountCents` in paise, `title`/`description`/`memo`/`payee` as well as
 * `note`, `date`/`spentAt`/`at` as well as `timestamp`. It never throws over one bad
 * row — what it cannot read is **counted and reported**, so an import that loses
 * something says so rather than losing it quietly.
 *
 * **Wallet's own backup is read too**, because that is where the owner's history
 * actually lives; the rules for it are the block above `walletRows`. That file is
 * not a list of rows at all, so it is turned into rows first, and they then take the
 * same road as everything else — one set of rules, one report.
 *
 * **Export is exact.** The JSON is a bare array of the ledger's own stored rows, so
 * exporting and importing again is a round trip and a human opening the file sees
 * the ledger. The CSV is the one a spreadsheet opens: rupees with two decimals, an
 * ISO date, and quoting that survives a comma or a newline in a title.
 *
 * Nothing here touches the DOM or the network — it is string work, which is why the
 * screen can hand it a file's text and get a report back.
 */

import type { LedgerRow } from "./ledger"

/**
 * One kind of row that could not be used, and how to say so.
 *
 * Both numbers of it are spelled out rather than pluralised by rule: the report
 * says "1 transfer" and "10 income rows", and no suffix rule turns "rows with no
 * date" into anything a person would write.
 */
export type DropReason = {
  /** What to call them when there are several: "income rows". */
  reason: string
  /** The same thing said of one row: "income row". */
  one: string
  count: number
}

/** What an import produced: rows to add, and what was left out. */
export type ImportSummary = {
  rows: LedgerRow[]
  dropped: DropReason[]
}

export type ImportResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; message: string }

/** A kind of row this ledger cannot use, before it has been counted. */
type SetAside = Omit<DropReason, "count">

/**
 * Everything an import can set aside, written out once.
 *
 * They live together so that the same row is described the same way whether it was
 * set aside by the Wallet reader or by the loop below it, and so that each one has
 * both ways of saying it — see `DropReason`.
 */
const SET_ASIDE = {
  income: { reason: "income rows", one: "income row" },
  transfers: { reason: "transfers", one: "transfer" },
  noAmount: { reason: "rows with no amount", one: "row with no amount" },
  noDate: { reason: "rows with no date", one: "row with no date" },
} satisfies Record<string, SetAside>

/** The four buckets this ledger has, and what they are called on screen. */
const BUCKET_LABELS: Record<string, string> = {
  food: "Food & Dining",
  transit: "Transit",
  saas: "SaaS Subscriptions",
  shopping: "Shopping",
}

/**
 * Where a category from another tracker lands.
 *
 * The app this site belongs to carries the owner's whole Wallet tree — eighty-odd
 * categories — and this ledger has four. Everything named here is a meal, a way of
 * moving, or a subscription; everything else is spent money that is none of those,
 * so it goes to `shopping`, which is where the scanner puts a merchant it cannot
 * place either.
 */
const BUCKETS: Record<string, string> = {
  // Food & Dining: the meals, the shops the food comes from, the cafés.
  "food-drinks": "food",
  groceries: "food",
  restaurant: "food",
  "bar-cafe": "food",
  // Transit: anything that moves the owner, including the vehicle that does it.
  transportation: "transit",
  "public-transport": "transit",
  taxi: "transit",
  "long-distance": "transit",
  vehicle: "transit",
  fuel: "transit",
  parking: "transit",
  "vehicle-maintenance": "transit",
  rentals: "transit",
  "vehicle-insurance": "transit",
  leasing: "transit",
  // SaaS Subscriptions: the recurring software and media a card is charged for.
  software: "saas",
  internet: "saas",
  phone: "saas",
  communication: "saas",
  "tv-streaming": "saas",
  "books-subs": "saas",
  "mobile-recharge": "saas",
}

/**
 * A category nobody here knows, judged by the word itself: `Gas Station` and
 * `gas-station` both read as fuel. Only consulted when the id is not in `BUCKETS`,
 * because a name is weaker evidence than a known id.
 */
const BUCKET_HINTS: [RegExp, string][] = [
  [/food|restaurant|cafe|coffee|grocer|kitchen|dining|dhaba|bakery|pizza|juice|chai|meal|lunch|dinner/i, "food"],
  [/transport|transit|taxi|cab|fuel|petrol|diesel|parking|metro|rail|train|bus|vehicle|car\b|travel|flight|airline|trip|long distance/i, "transit"],
  [/software|saas|subscription|sub\b|streaming|internet|phone|mobile|recharge|hosting|cloud|app\b|domain/i, "saas"],
]

const DEFAULT_BUCKET = "shopping"

/** Which bucket a category id belongs in, by name first and by word second. */
function bucketFor(raw: string): string {
  const id = raw.trim().toLowerCase()
  const known = BUCKETS[id]
  if (known) return known
  for (const [pattern, bucket] of BUCKET_HINTS) {
    if (pattern.test(id)) return bucket
  }
  return DEFAULT_BUCKET
}

/**
 * Money, in whichever shape the file writes it.
 *
 * `amountCents` is this project's own unit and is taken as paise exactly. A bare
 * `amount` is read as **rupees** — which is the unit the app's own endpoint takes,
 * where `{ "amount": 150 }` is ₹150 — and a string is read the same way, because an
 * export that has been through a spreadsheet is full of them.
 */
function centsOf(item: Record<string, unknown>): number | null {
  const exact = item.amountCents ?? item.amount_cents ?? item.amountPaise
  if (typeof exact === "number" && Number.isFinite(exact)) return Math.round(exact)

  const loose = item.amount ?? item.value ?? item.total
  if (typeof loose === "number" && Number.isFinite(loose)) return Math.round(loose * 100)
  if (typeof loose === "string") {
    const cleaned = loose.replace(/[^0-9.+-]/g, "")
    if (!cleaned) return null
    const rupees = Number(cleaned)
    if (Number.isFinite(rupees)) return Math.round(rupees * 100)
  }
  return null
}

const MIDDAY = "T12:00:00"

/**
 * When the row happened, epoch ms.
 *
 * ISO dates (`2024-05-04`), `YYYY-MM-DD HH:MM`, full ISO strings, and epoch numbers
 * in either seconds or milliseconds are all read. A date with **no time** is placed
 * at noon rather than midnight, because midnight in UTC is the *previous* evening in
 * India — the classic way an imported history ends up a day early — and noon is also
 * what a row keeps when its time is unreadable.
 */
function atOf(item: Record<string, unknown>): number | null {
  const raw =
    item.at ?? item.timestamp ?? item.spentAt ?? item.spent_at ?? item.date ?? item.createdAt ?? item.created_at

  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Seconds or milliseconds: nothing in this century is a plausible millisecond
    // value below 10^12, and nothing plausible in seconds is above it.
    return raw > 1e12 ? Math.round(raw) : Math.round(raw * 1000)
  }
  if (typeof raw !== "string") return null

  const text = raw.trim()
  if (!text) return null
  // A bare calendar date is read as a local day at noon, not as UTC midnight.
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (bare) return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]), 12).getTime()

  const parsed = Date.parse(text)
  if (Number.isFinite(parsed)) return parsed
  // `2024-05-04 09:12` is not ISO; give the day-and-time one more chance at noon.
  const dayOnly = Date.parse(`${text.slice(0, 10)}${MIDDAY}`)
  return Number.isFinite(dayOnly) ? dayOnly : null
}

/** The rows inside whatever the file wraps them in. */
function rowsOf(parsed: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(parsed)) return parsed.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
  if (typeof parsed !== "object" || parsed === null) return null
  const wrapper = parsed as Record<string, unknown>
  for (const key of ["expenses", "rows", "data", "history", "entries"]) {
    const value = wrapper[key]
    if (Array.isArray(value)) {
      return value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Wallet's own backup
 *
 * The owner's history was kept in Wallet, so the file that arrives from it is not
 * a list of rows at all: it is PouchDB's dump of Wallet's whole database, one entry
 * per document *revision*, under `{ "<pouch user>": { "by-sequence": [...] } }`.
 * Every row is a `Record`; a category is a separate document that a record only
 * points at by id; money is `amount`, which Wallet already writes in paise; and the
 * note is almost always empty, so the category's own name ("Restaurant, fast-food")
 * is the only thing a row can be called.
 *
 * `tools/wallet-import.py` is the app's reader of this same file, and these are its
 * rules, so a row lands in the same place whether it arrived through the app's build
 * or through this screen: Wallet `type` 1 is spending and 0 is income, a record
 * carrying a `transferId` is money moved between the owner's own accounts rather
 * than spent, a soft-deleted record is not a row at all, and the day is the owner's
 * own — Wallet writes UTC, and India is a fixed +05:30.
 * ------------------------------------------------------------------ */

/** The id part of PouchDB's `-Category_<uuid>::1-<rev>` key. */
function docId(doc: Record<string, unknown>): string {
  return String(doc._doc_id_rev ?? "").split("::")[0]
}

/** The `by-sequence` list of a PouchDB dump, from wherever it is nested. */
function walletDocs(parsed: unknown): Record<string, unknown>[] | null {
  const sequenceOf = (value: unknown): Record<string, unknown>[] | null => {
    if (typeof value !== "object" || value === null) return null
    const list = (value as Record<string, unknown>)["by-sequence"]
    if (!Array.isArray(list)) return null
    return list.filter((doc): doc is Record<string, unknown> => typeof doc === "object" && doc !== null)
  }

  const top = sequenceOf(parsed)
  if (top) return top
  if (typeof parsed === "object" && parsed !== null) {
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      const found = sequenceOf(value)
      if (found) return found
    }
  }
  return null
}

/** Wallet's documents as a plain list, which is what a trimmed dump is. */
function walletDocList(parsed: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(parsed)) return null
  const docs = parsed.filter((doc): doc is Record<string, unknown> => typeof doc === "object" && doc !== null)
  return docs.some((doc) => typeof doc.reservedModelType === "string") ? docs : null
}

/**
 * The Indian wall clock of a UTC moment, as a moment on this device.
 *
 * Wallet writes `recordDate` in UTC while the money is spent in India, so the hour
 * has to be read as +05:30 rather than as whatever the device is set to: otherwise
 * an entry made at 00:03 would be shown on the day before to anyone travelling, and
 * the app that reads this same file pins the day the same way. A browser with no
 * timezone data falls back to the plain instant, which is worse but not wrong.
 */
function istMoment(iso: string): number | null {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return null
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      // Midnight is 00, not 24: the day a row is on has to survive the round trip.
      hourCycle: "h23",
    }).formatToParts(new Date(parsed))
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
    return new Date(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second")).getTime()
  } catch {
    return parsed
  }
}

/** What the Wallet side of a file produced: rows, and what it set aside itself. */
function walletRows(docs: Record<string, unknown>[]): {
  items: Record<string, unknown>[]
  dropped: DropReason[]
} {
  /** `-Category_<uuid>` → the name the owner gave it, which is all a row can say. */
  const categoryNames = new Map<string, string>()
  for (const doc of docs) {
    if (doc.reservedModelType === "Category" && typeof doc.name === "string") {
      categoryNames.set(docId(doc), doc.name)
    }
  }

  const items: Record<string, unknown>[] = []
  let transfers = 0

  for (const record of docs) {
    if (record.reservedModelType !== "Record" || record._deleted) continue
    // Money merely moved between the owner's own accounts: not spending, and not
    // income either, so it is set aside here rather than counted as one of those.
    if (record.transferId) {
      transfers += 1
      continue
    }

    const named = categoryNames.get(String(record.categoryId ?? ""))
    const at = typeof record.recordDate === "string" ? istMoment(record.recordDate) : null

    items.push({
      // Wallet's document id is the app's row id, so an export imported twice — the
      // likeliest thing anyone does with a backup — updates instead of doubling, and
      // a file exported from the app later matches the rows already here.
      id: docId(record).replace(/^Record_/, ""),
      // `amount` is already paise, which is the unit this project keeps money in.
      amountCents: record.amount,
      kind: record.type === 1 ? "expense" : "income",
      category: named ?? "",
      // A Wallet note is empty, so the category the owner filed it under is what the
      // row is called; a category that is missing from the dump falls back below.
      title: named ?? "",
      // Left out rather than faked when the date cannot be read, so that a row with
      // no date is the main loop's to count and report.
      ...(at === null ? {} : { at }),
    })
  }

  return {
    items,
    dropped: transfers > 0 ? [{ ...SET_ASIDE.transfers, count: transfers }] : [],
  }
}

/** Read a file's text as a history, reporting separately whatever it could not use. */
export function readHistory(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: "That file is not JSON. TrackIt's own export and Wallet's are both JSON — pick the .json file." }
  }

  // Wallet's backup first: it is a database, and none of the wrappers below match it.
  const wallet = walletDocs(parsed) ?? walletDocList(parsed)
  let items: Record<string, unknown>[]
  let aside: DropReason[] = []
  if (wallet) {
    const read = walletRows(wallet)
    items = read.items
    aside = read.dropped
  } else {
    const raw = rowsOf(parsed)
    if (!raw) {
      return { ok: false, message: "That file has no rows in it. It should hold a list of expenses, or an export from Wallet." }
    }
    if (raw.length === 0) {
      return { ok: false, message: "That file's list of expenses is empty." }
    }
    items = raw
  }

  const rows: LedgerRow[] = []
  const dropped = new Map<string, DropReason>()
  const drop = (set: SetAside) => {
    const seen = dropped.get(set.reason)
    dropped.set(set.reason, { ...set, count: (seen?.count ?? 0) + 1 })
  }
  // Whatever the Wallet side already set aside is part of the one report.
  for (const entry of aside) dropped.set(entry.reason, entry)

  for (const item of items) {
    // Money in is not spending, and this ledger only counts spending: importing an
    // income row as an expense would move every total the wrong way.
    if (item.kind === "income" || item.type === "income") {
      drop(SET_ASIDE.income)
      continue
    }
    const amountCents = centsOf(item)
    if (amountCents === null) {
      drop(SET_ASIDE.noAmount)
      continue
    }
    const at = atOf(item)
    if (at === null) {
      drop(SET_ASIDE.noDate)
      continue
    }
    const category = bucketFor(String(item.category ?? item.categoryId ?? item.category_id ?? ""))
    const named = item.title ?? item.note ?? item.description ?? item.memo ?? item.payee ?? item.name
    const title = typeof named === "string" && named.trim() ? named.trim() : BUCKET_LABELS[category]
    const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : undefined
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : undefined

    rows.push({
      // The file's own id when it has one, so re-importing the same file is a no-op;
      // otherwise one derived from the row's own content, which keeps the same
      // promise for files that carry no ids at all.
      id: id ?? `h${hash(`${title}|${category}|${amountCents}|${at}`)}`,
      title,
      category,
      amountCents,
      at,
      tags: tags && tags.length > 0 ? tags : undefined,
    })
  }

  return { ok: true, summary: { rows, dropped: [...dropped.values()] } }
}

/**
 * A short, stable number for a string, so a row without an id still has one.
 *
 * FNV-1a, which is four lines and good enough: the only job is that the same row in
 * the same file lands on the same id twice.
 */
function hash(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** The local calendar day of a moment, as `YYYY-MM-DD` — never UTC's day. */
function localDate(at: number): string {
  const when = new Date(at)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
}

/** `HH:MM` on the owner's own clock. */
function localTime(at: number): string {
  const when = new Date(at)
  return `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`
}

/**
 * This ledger as JSON: a bare array of its own rows, newest first.
 *
 * The same shape it reads, so export → import is a round trip, and the same shape
 * the app uses for its own export, so a human who opens either file sees the same
 * kind of thing.
 */
export function toJson(rows: LedgerRow[]): string {
  return JSON.stringify(rows, null, 2)
}

/** One CSV cell: quoted when it holds a comma, a quote or a line break. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const CSV_HEADER = ["date", "time", "amount", "currency", "category", "title", "tags", "handed_to"]

/**
 * This ledger as CSV, for a spreadsheet.
 *
 * Amounts are rupees with two decimals and dates are the local day, both because a
 * spreadsheet has no idea what paise or an epoch are. The leading byte-order mark is
 * what makes Excel read the file as UTF-8 rather than as the system's own encoding —
 * the difference between a payee's name arriving intact and arriving as punctuation.
 */
export function toCsv(rows: LedgerRow[]): string {
  const lines = rows.map((row) =>
    [
      localDate(row.at),
      localTime(row.at),
      (row.amountCents / 100).toFixed(2),
      "INR",
      row.category,
      row.title,
      (row.tags ?? []).join("; "),
      row.handedTo ?? "",
    ]
      .map(csvCell)
      .join(","),
  )
  return `\uFEFF${[CSV_HEADER.join(","), ...lines].join("\r\n")}\r\n`
}
