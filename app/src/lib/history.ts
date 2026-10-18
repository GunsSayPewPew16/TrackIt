/**
 * Bringing a history in, and taking one out.
 *
 * The two directions have different jobs, so they are written differently.
 *
 * **Import is forgiving**, because the file comes from somewhere else. It reads
 * this app's own export (a bare JSON array of rows, or the same array under
 * `{ rows: [...] }` together with the budgets it was saved with), and the field
 * names other trackers use: `amount` in rupees as well as `amountCents` in paise,
 * `title`/`description`/`memo`/`payee` as well as `note`, and `date`/`spentAt`/`at`
 * as well as `timestamp`. It never throws over one bad row — what it cannot read
 * is **counted and reported**, so an import that loses something says so rather
 * than losing it quietly.
 *
 * **Wallet's own backup is read too**, because that is where the owner's history
 * actually lives. That file is not a list of rows at all: it is PouchDB's dump of
 * Wallet's whole database, one entry per document *revision*, under
 * `{ "<pouch user>": { "by-sequence": [...] } }`. Its rows are turned into rows
 * here and then take the same road as everything else — one set of rules, one
 * report.
 *
 * **Export is exact.** The JSON is a bare array of the ledger's own stored rows,
 * so exporting and importing again is a round trip and a human opening the file
 * sees the ledger; handed the budgets as well, it writes them beside the rows so
 * a backup carries the envelopes too. The CSV is the one a spreadsheet opens:
 * rupees with two decimals, an ISO date, and quoting that survives a comma or a
 * newline in a title.
 *
 * Nothing here touches the DOM or the network — it is string work, which is why the
 * screen can hand it a file's text and get a report back.
 */

import { ACCOUNTS, DEFAULT_ACCOUNT } from "./accounts"
import { CATEGORIES, DEFAULT_CATEGORY, categoryFor, categoryIdForLabel } from "./categories"
import { filedName } from "./refile"
import { DEFAULT_CURRENCY } from "./format"
import type { Budget, Kind, Row } from "./types"

/**
 * One kind of row that could not be used, and how to say so.
 *
 * Both numbers of it are spelled out rather than pluralised by rule: the report
 * says "1 transfer" and "10 rows with no date", and no suffix rule turns "rows
 * with no date" into anything a person would write.
 */
export type DropReason = {
  /** What to call them when there are several: "transfers". */
  reason: string
  /** The same thing said of one: "transfer". */
  one: string
  count: number
}

/** What an import produced: rows and budgets to add, and what was left out. */
export type ImportSummary = {
  rows: Row[]
  budgets: Budget[]
  dropped: DropReason[]
}

export type ImportResult = { ok: true; summary: ImportSummary } | { ok: false; message: string }

/** A kind of row this ledger cannot use, before it has been counted. */
type SetAside = Omit<DropReason, "count">

/**
 * Everything an import can set aside, written out once.
 *
 * Money merely moved between the owner's own accounts is not spending and not
 * income either, so it is set aside rather than counted as one of those. Note
 * what is **not** here: income. Money coming in is a row like any other, keeps
 * `kind: 'income'`, and is what the dashboard's cash flow counts.
 */
const SET_ASIDE = {
  transfers: { reason: "transfers", one: "transfer" },
  noAmount: { reason: "rows with no amount", one: "row with no amount" },
  noDate: { reason: "rows with no date", one: "row with no date" },
} satisfies Record<string, SetAside>

/** Counts what could not be used, under the one label each thing is said with. */
type Recorder = {
  drop: (set: SetAside) => void
  list: () => DropReason[]
}

function recorder(): Recorder {
  const dropped = new Map<string, DropReason>()
  return {
    drop(set) {
      const seen = dropped.get(set.reason)
      dropped.set(set.reason, { ...set, count: (seen?.count ?? 0) + 1 })
    },
    list: () => [...dropped.values()],
  }
}

/**
 * Money, in whichever shape the file writes it.
 *
 * `amountCents` is this project's own unit and is taken as paise exactly — Wallet
 * writes its `amount` there too. A bare `amount` in a hand-written file is read as
 * **rupees**, and a string is read the same way, because an export that has been
 * through a spreadsheet is full of them.
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
 * ISO dates (`2024-05-04`), `YYYY-MM-DD HH:MM`, full ISO strings, and epoch
 * numbers in either seconds or milliseconds are all read. A date with **no time**
 * is placed at noon rather than midnight, because midnight in UTC is the
 * *previous* evening in India — the classic way an imported history ends up a day
 * early — and noon is also what a row keeps when its time is unreadable.
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

const isString = (value: unknown): value is string => typeof value === "string"

const objects = (list: unknown[]): Record<string, unknown>[] =>
  list.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)

/** The rows inside whatever the file wraps them in, and the budgets if it carries them. */
function payloadOf(parsed: unknown): { items: Record<string, unknown>[]; budgets: Record<string, unknown>[] } | null {
  if (Array.isArray(parsed)) return { items: objects(parsed), budgets: [] }
  if (typeof parsed !== "object" || parsed === null) return null
  const wrapper = parsed as Record<string, unknown>
  for (const key of ["expenses", "rows", "data", "history", "entries"]) {
    const value = wrapper[key]
    if (Array.isArray(value)) {
      return {
        items: objects(value),
        budgets: Array.isArray(wrapper.budgets) ? objects(wrapper.budgets) : [],
      }
    }
  }
  return null
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

/* ------------------------------------------------------------------ *
 * Wallet's own backup
 *
 * The owner's history was kept in Wallet, so the file that arrives from it is not
 * a list of rows at all: every row is a `Record`; a category is a separate
 * document that a record only points at by id; money is `amount`, which Wallet
 * already writes in paise; and the note is almost always empty, so the category's
 * own name ("Restaurant, fast-food") is the only thing a row can be called.
 *
 * `tools/wallet-import.py` is the app's other reader of this same file, and these
 * are its rules, so a row lands in the same place whether it arrived through the
 * build or through this screen: Wallet `type` 1 is spending and 0 is income, a
 * record carrying a `transferId` is money moved between the owner's own accounts
 * rather than spent, a soft-deleted record is not a row at all, and the day is the
 * owner's own — Wallet writes UTC, and India is a fixed +05:30.
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
    return objects(list)
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
  const docs = objects(parsed)
  return docs.some((doc) => typeof doc.reservedModelType === "string") ? docs : null
}

/**
 * The Indian wall clock of a UTC moment, as a moment on this device.
 *
 * Wallet writes `recordDate` in UTC while the money is spent in India, so the hour
 * has to be read as +05:30 rather than as whatever the device is set to: otherwise
 * an entry made at 00:03 would be shown on the day before to anyone travelling, and
 * the script that reads this same file pins the day the same way. A browser with no
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

/** Which of the owner's accounts a Wallet `Account` document is. */
function accountIdFor(name: string): string {
  const trimmed = name.trim().toLowerCase()
  const slug = trimmed.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const known = ACCOUNTS.find((account) => account.id === slug || account.name.toLowerCase() === trimmed)
  return known?.id ?? DEFAULT_ACCOUNT
}

/** A Wallet category's name, as the id this app files it under. */
function categoryIdOf(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_CATEGORY
  const value = raw.trim()
  if (!value) return DEFAULT_CATEGORY
  // This app's own export writes the id; another tracker writes a label.
  if (CATEGORIES.some((category) => category.id === value)) return value
  return categoryIdForLabel(value) ?? DEFAULT_CATEGORY
}

/** Wallet's documents as rows and envelopes, counting whatever it could not use. */
function walletRead(
  docs: Record<string, unknown>[],
  log: Recorder,
): { rows: Row[]; budgets: Budget[] } {
  /** `-Category_<uuid>` → the name the owner gave it, and the id it files under. */
  const names = new Map<string, string>()
  const categories = new Map<string, string>()
  /** Wallet's `envelopeId` → the category it stands for, which a budget points at. */
  const envelopes = new Map<number, string>()

  for (const doc of docs) {
    if (doc.reservedModelType !== "Category" || typeof doc.name !== "string") continue
    const key = docId(doc)
    const id = categoryIdOf(doc.name)
    names.set(key, doc.name)
    categories.set(key, id)
    if (typeof doc.envelopeId === "number") envelopes.set(doc.envelopeId, id)
  }

  /** `-Account_<uuid>` → `upi` / `cash`. */
  const accounts = new Map<string, string>()
  for (const doc of docs) {
    if (doc.reservedModelType !== "Account") continue
    accounts.set(docId(doc), accountIdFor(typeof doc.name === "string" ? doc.name : ""))
  }

  const rows: Row[] = []
  for (const record of docs) {
    if (record.reservedModelType !== "Record" || record._deleted) continue
    // Money merely moved between the owner's own accounts: not spending, and not
    // income either, so it is set aside here rather than counted as one of those.
    if (record.transferId) {
      log.drop(SET_ASIDE.transfers)
      continue
    }

    const amount = record.amount
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      log.drop(SET_ASIDE.noAmount)
      continue
    }

    const at = typeof record.recordDate === "string" ? istMoment(record.recordDate) : null
    if (at === null) {
      log.drop(SET_ASIDE.noDate)
      continue
    }

    const key = String(record.categoryId ?? "")
    const category = categories.get(key) ?? DEFAULT_CATEGORY
    rows.push({
      // Wallet's document id is this app's row id, so an export imported twice —
      // the likeliest thing anyone does with a backup — updates instead of
      // doubling, and a file exported from here later matches what is stored.
      id: docId(record).replace(/^Record_/, ""),
      // A Wallet note is empty, so the category the owner filed it under is what
      // the row is called.
      title: names.get(key) ?? filedName(category),
      category,
      account: accounts.get(String(record.accountId ?? "")) ?? DEFAULT_ACCOUNT,
      // Wallet stores money as integer minor units, which is this app's unit too.
      amountCents: Math.round(amount),
      kind: record.type === 1 ? "expense" : "income",
      at,
      // A row a standing order generated keeps that provenance.
      source: record.refObjects ? "shortcut" : "manual",
    })
  }

  const budgets: Budget[] = []
  for (const doc of docs) {
    if (doc.reservedModelType !== "Budget" || doc._deleted) continue
    const amount = doc.amount
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue
    const owned = Array.isArray(doc.envelopes) ? doc.envelopes : []
    const startDate = typeof doc.startDate === "string" ? Date.parse(doc.startDate) : Number.NaN
    budgets.push({
      id: docId(doc).replace(/^Budget_/, ""),
      name: typeof doc.name === "string" && doc.name.trim() ? doc.name.trim() : "Envelope",
      limitCents: Math.round(amount),
      // A budget points at Wallet's envelope ids, and an envelope id is a
      // category's — that mapping is what lets the gauge measure spending.
      categoryIds: owned
        .map((envelope) => envelopes.get(Number(envelope)))
        .filter((id): id is string => Boolean(id)),
      startDate: Number.isFinite(startDate) ? startDate : Date.now(),
    })
  }

  return { rows, budgets }
}

/** Rows from any other tracker, or from this app's own export. */
function genericRead(items: Record<string, unknown>[], log: Recorder): Row[] {
  const rows: Row[] = []

  for (const item of items) {
    const amountCents = centsOf(item)
    if (amountCents === null) {
      log.drop(SET_ASIDE.noAmount)
      continue
    }
    const at = atOf(item)
    if (at === null) {
      log.drop(SET_ASIDE.noDate)
      continue
    }

    const category = categoryIdOf(item.category ?? item.categoryId ?? item.category_id)
    const named = item.title ?? item.description ?? item.memo ?? item.payee ?? item.name
    const title = typeof named === "string" && named.trim() ? named.trim() : filedName(category)
    const note = typeof item.note === "string" && item.note.trim() ? item.note.trim() : undefined
    const people = Array.isArray(item.people) ? item.people.filter(isString) : []
    const account = typeof item.account === "string" ? accountIdFor(item.account) : DEFAULT_ACCOUNT
    const source =
      item.source === "shortcut" || item.source === "upi" || item.source === "manual" ? item.source : undefined
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : undefined

    rows.push({
      // The file's own id when it has one, so re-importing the same file is a no-op;
      // otherwise one derived from the row's own content, which keeps the same
      // promise for files that carry no ids at all.
      id: id ?? `h${hash(`${title}|${category}|${amountCents}|${at}`)}`,
      title,
      category,
      account,
      amountCents,
      // Money in is a kind of entry, never negative spending.
      kind: item.kind === "income" || item.type === "income" ? ("income" as Kind) : ("expense" as Kind),
      at,
      ...(note ? { note } : {}),
      ...(people.length > 0 ? { people } : {}),
      ...(source ? { source } : {}),
    })
  }

  return rows
}

/** Envelopes a saved backup carried beside its rows. */
function genericBudgets(items: Record<string, unknown>[]): Budget[] {
  const budgets: Budget[] = []
  for (const item of items) {
    const limit = item.limitCents ?? item.limit ?? item.amount
    const limitCents =
      typeof limit === "number" ? Math.round(limit) : typeof limit === "string" ? Math.round(Number(limit)) : NaN
    if (!Number.isFinite(limitCents)) continue
    const startDate = atOf({ at: item.startDate ?? item.start ?? item.from }) ?? Date.now()
    budgets.push({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `b${hash(`${item.name}|${limitCents}`)}`,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Envelope",
      limitCents,
      categoryIds: Array.isArray(item.categoryIds) ? item.categoryIds.filter(isString) : [],
      startDate,
    })
  }
  return budgets
}

/** Read a file's text as a history, reporting separately whatever it could not use. */
export function readHistory(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: "That file is not JSON. TrackIt's own export and Wallet's are both JSON — pick the .json file." }
  }

  const log = recorder()
  // Wallet's backup first: it is a database, and none of the wrappers below match it.
  const wallet = walletDocs(parsed) ?? walletDocList(parsed)

  if (wallet) {
    const read = walletRead(wallet, log)
    return { ok: true, summary: { rows: read.rows, budgets: read.budgets, dropped: log.list() } }
  }

  const payload = payloadOf(parsed)
  if (!payload) {
    return { ok: false, message: "That file has no rows in it. It should hold a list of expenses, or an export from Wallet." }
  }
  if (payload.items.length === 0) {
    return { ok: false, message: "That file's list of expenses is empty." }
  }

  return {
    ok: true,
    summary: { rows: genericRead(payload.items, log), budgets: genericBudgets(payload.budgets), dropped: log.list() },
  }
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
 * This ledger as JSON: a bare array of its own rows, newest first, in the same
 * shape it reads — so export → import is a round trip whether or not the app is
 * the thing opening the file.
 *
 * Handed the budgets as well, it writes them **beside** the rows instead
 * (`{ version, rows, budgets }`), because a backup that loses the envelopes loses
 * what the dashboard's gauge measures against. `readHistory` reads both shapes.
 */
export function toJson(rows: Row[], budgets: Budget[] = []): string {
  if (budgets.length === 0) return JSON.stringify(rows, null, 2)
  return JSON.stringify({ version: 1, rows, budgets }, null, 2)
}

/** One CSV cell: quoted when it holds a comma, a quote or a line break. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const CSV_HEADER = ["date", "time", "amount", "currency", "kind", "account", "category", "title", "note", "people"]

/**
 * This ledger as CSV, for a spreadsheet.
 *
 * Amounts are rupees with two decimals and dates are the local day, both because a
 * spreadsheet has no idea what paise or an epoch are. The leading byte-order mark is
 * what makes Excel read the file as UTF-8 rather than as the system's own encoding —
 * the difference between a payee's name arriving intact and arriving as punctuation.
 */
export function toCsv(rows: Row[]): string {
  const lines = rows.map((row) =>
    [
      localDate(row.at),
      localTime(row.at),
      (row.amountCents / 100).toFixed(2),
      DEFAULT_CURRENCY,
      row.kind,
      row.account,
      row.category,
      row.title,
      row.note ?? "",
      (row.people ?? []).join("; "),
    ]
      .map(csvCell)
      .join(","),
  )
  return `\uFEFF${[CSV_HEADER.join(","), ...lines].join("\r\n")}\r\n`
}
