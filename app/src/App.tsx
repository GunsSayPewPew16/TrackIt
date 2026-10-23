import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "framer-motion"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"

import { BottomNav } from "@/components/BottomNav"
import { DashboardScreen } from "@/components/DashboardScreen"
import { isOwnerEmail } from "@/lib/owner"
import { LoginScreen } from "@/components/LoginScreen"
import { useAuth } from "@/hooks/useAuth"
// Types only, and that is what keeps the two screens below out of the entry chunk: an
// `import type` is erased, so nothing here fetches them until a tap does.
import type { Props as LedgerProps } from "@/components/LedgerScreen"
import type { Props as ScanProps } from "@/components/ScanScreen"
import type { Props as StatsProps } from "@/components/AnalyticsScreen"
// The settings screen's types only, same reason: it is fetched when its tab is first tapped.
import type { Props as SettingsProps } from "@/components/SettingsScreen"
// The budget editor's types only, for the same reason: it is fetched on the first hold.
import type { BudgetSheetProps } from "@/features/budget/BudgetSheet"
// The balance panel's types only, for the same reason: it is fetched on the first hold.
import type { BalanceSheetProps } from "@/features/balance/BalanceSheet"
// The sheet's types only. The component itself is fetched the first time the pill is
// pressed, so the entry chunk does not pay for a keypad most opens never open.
import type { ManualEntry, SheetProps } from "@/features/manual-entry"
import { logPaidPayee } from "@/features/upi/logScan"
import type { UpiPayee } from "@/features/upi/upi"
import { useBalances } from "@/hooks/useBalances"
import { useBudgets } from "@/hooks/useBudgets"
import { useGreeting } from "@/hooks/useGreeting"
import { useLedger } from "@/hooks/useLedger"
import { useSwipeScreens } from "@/hooks/useSwipeScreens"
import { useTheme } from "@/hooks/useTheme"
import { lightTap } from "@/lib/haptics"
import { demoDashboard, DEMO_LEDGER } from "@/lib/demo"
import { DEFAULT_CATEGORY } from "@/lib/categories"
import { filedName } from "@/lib/refile"
import { dashboardModel, hasHistory, ledgerModel } from "@/lib/derive"
import { BUDGET_COPY, budgetSpent, envelopeCopy } from "@/lib/budget"
import { startOfMonth, startOfNextMonth } from "@/lib/format"
import { ACCOUNTS } from "@/lib/accounts"
import { applyCardOrder } from "@/lib/customCards"
import { appendToLedger } from "@/lib/ledger"
import { TAB_VIEWS, type NavTab } from "@/lib/tabs"
import type { Row } from "@/lib/types"

/**
 * How a turn of the tab track moves. The four tabs sit side by side in one track, and a move from one
 * tab to another slides it: a jump across more than one tab passes the screens in between, so they
 * go by. The longer the jump, the longer it takes.
 */
const SLIDE_EASE = [0.32, 0.72, 0, 1] as const
const slideDuration = (pagesPassed: number): number => 0.3 + 0.1 * pagesPassed

/**
 * The app: three screens, and the state that decides what they show.
 *
 * **The greeting is the one thing here that is neither.** It is a different language
 * every time the app is opened — the owner's ask — so it is chosen once per load by
 * `useGreeting`, out of the twenty words this part of the day owns in the bundle
 * (`lib/greetings.ts`) and, where the build has a server, out of the `hourly_greetings` table
 * the Worker draws one row from (`backend/`). That is why it is a prop rather than a field of the dashboard model:
 * the models are the owner's money, derived from their rows, and this is a line of
 * decoration that has to be on screen before anything is derived at all.
 *
 * **Which content.** The owner's imported history decides it, in one place. With
 * rows in the ledger both screens are computed from them (`lib/derive.ts`); with
 * nothing imported, a **device-only** build draws the artboards' own dataset
 * (`lib/demo.ts`), so the design is what a first visit shows. A signed-in account
 * gets the same derived models over its empty rows instead — an account with
 * nothing on it shows nothing, never sample merchants. Nothing else in the app
 * knows which of the two it got.
 *
 * **The movement between the screens.** The four tabs are one track laid side by side, and a
 * move between two of them slides it, so a jump across the tabs in between sees them go by.
 * The scanner is not a tab and cross-fades in its place (`mode="popLayout"`), at the design's
 * own 0.35s, which is a slower movement than the 120ms repaint a theme change uses: one is the
 * page arriving, the other a switch.
 *
 * **Where the ledger opens.** The wheel holds one month — the 1st through today, or a
 * past month's last day — so the month menu on the ledger screen is what reaches the
 * rest of the history: this holds the day the ledger is anchored on, and `ledgerModel`
 * builds that month around it and opens the wheel on its day. With no anchor the anchor
 * is the newest row, which is what the owner came to see.
 *
 * **Where a screen starts.** At its top, every time. The dock and a sideways swipe are
 * the ways between screens, and on a short window any screen scrolls, so the
 * browser would otherwise hand the new one the old one's scroll offset — the dashboard
 * opening halfway down its cards, or the ledger past a day the owner has not seen.
 * `scrollTo` is instant rather than smooth on purpose: this is not a movement the
 * owner asked for, and the slide is what carries the change of screen.
 *
 * **The scanner is a screen too.** The dashboard's scan square opens it, and it is the
 * only way in — the dock has no Create — and it wears the second artboard's design
 * (`components/ScanScreen.tsx`) rather than the dialog the previous app opened: it
 * has its own header and its own way back, and the cross-fade carries the change like
 * the other two. A read code opens the sheet as a payment — the scanner's
 * `onOpenEntry` — and what the confirm writes is `features/upi/logScan.ts`, so the
 * screen itself never touches the ledger.
 *
 * **The ledger is opened from the dock**, whose Ledger tab is also the way back to it
 * from the scanner; the dashboard's header circle that used to do this is gone.
 * Importing is not reachable from the UI at all at the moment:
 * `components/DataSheet.tsx` is written and unwired,
 * waiting for the owner to place it. The import path behind it (`useLedger`'s
 * `importHistory`) still works the moment something calls it.
 *
 * **The dock is the one thing every screen shares.** It is rendered beside the
 * `AnimatePresence` rather than inside it, so it neither fades with a screen nor
 * leaves the page when the screen does: the tabs are a level above the views and
 * stay put while the content slides over them. Its `active` is the view itself
 * — the tab keys are view names, so a tab is a screen — and the scanner is the one
 * view that is not a tab, so the circle holds its place while the camera is up and
 * slides from there when the owner goes back.
 *
 * **A sideways swipe pages the same order the dock lays out.** `hooks/useSwipeScreens.ts`
 * turns a horizontal gesture into the next or previous tab, with the dock's own list as the
 * order (`TAB_VIEWS`), so a screen added to the dock is a screen the thumb can reach. A
 * gesture that starts in a control which reads sideways itself — the budget carousel, the
 * ledger's date wheel, the trend plot — stays with that control, and a vertical drag is a
 * scroll; the scanner is not a page, so there a swipe is the camera's. The slide is the
 * same one a tab press gets: the gesture chooses the screen, not a second transition.
 *
 * **Only the dashboard is in the file that must arrive before the first pixel.** Nothing
 * renders until this module runs, so everything it imports is a cost the owner pays before
 * seeing anything — and the other screens sit behind a tap most opens never make. They
 * are chunks of their own for that reason: the ledger's month menu is the app's only
 * Radix dependency, and the scanner is a whole decoder (barcode detection, WebRTC shims, and
 * a WASM build fetched from a CDN in turn). Out of the entry file they took it from 657 kB
 * to 415 kB, which is 216 kB over the wire down to 129.
 *
 * Three things go with splitting them, and all three are deliberate:
 *
 * - **A screen is in hand before the view changes.** `goTo` fetches the module and only then
 *   switches, because the design has no loading state and a screen that is not there yet is
 *   worse than a wait: with `Suspense` inside the `AnimatePresence` below, both screens end
 *   up mounted and neither animates, which is a tap that appears to do nothing at all.
 * - **They are fetched again, idly, once the first screen is up** (`requestIdleCallback`, or
 *   a timeout where there is none), so in practice a tap is a screen rather than a wait. The
 *   order is the point: bytes the owner has not asked for are never allowed to delay the
 *   pixels they have.
 * - **A tap that lands before the module does keeps the screen being left on screen**, which
 *   is the one case where the cross-fade does not carry the change. Nothing is drawn in its
 *   place, because a spinner or a skeleton would be this app's taste and not the artboard's.
 */

/**
 * The screens that arrive when they are asked for. The named exports are the only reason these are
 * not plain `lazy` calls — a `lazy` component suspends on first render, and a suspension is exactly
 * what the cross-fade cannot carry.
 */
const screens = {
  ledger: () => import("@/components/LedgerScreen").then((screen) => screen.LedgerScreen),
  scan: () => import("@/components/ScanScreen").then((screen) => screen.ScanScreen),
  stats: () => import("@/components/AnalyticsScreen").then((screen) => screen.AnalyticsScreen),
  settings: () => import("@/components/SettingsScreen").then((screen) => screen.SettingsScreen),
} as const

type View = "dashboard" | "ledger" | "scan" | "stats" | "settings"

/** Which budget the editor is open on: one carousel envelope, or the stats dial. */
type BudgetTarget = { kind: "envelope"; id: string } | { kind: "total" }

/** Whichever of the lazy screens has arrived — normally all of them, from the idle fetch. */
type Arrived = {
  ledger?: ComponentType<LedgerProps>
  scan?: ComponentType<ScanProps>
  stats?: ComponentType<StatsProps>
  settings?: ComponentType<SettingsProps>
}
function TrackIt() {
  const { theme, toggleTheme, palette, chooseTheme } = useTheme()
  /**
   * The moment this open is drawn on. The dashboard's figures are "this month", so they need
   * a clock, and taking it once here rather than on every derivation is also what keeps the
   * model stable for the memo below.
   */
  const [now] = useState(() => Date.now())
  // Which build this is: the device-only tracker draws the artboards until something is
  // imported, while an account's empty ledger is just that — empty.
  const { mode, email } = useAuth()
  const { rows, budgets, remove, update } = useLedger()
  const {
    envelopes,
    total,
    activeEnvelopeId,
    saveEnvelopeLimit,
    saveEnvelopeTracked,
    saveEnvelopeName,
    createEnvelope,
    viewEnvelope,
    moveBudget,
    deleteBudget,
    saveTotalLimit,
    saveTotalTracked,
    saveTotalName,
  } = useBudgets()
  const { openings, transfers, setBalance, transfer, customCards, cardOrder, addCard, removeCard, reorderCards } =
    useBalances(rows)
  const greeting = useGreeting()
  const [view, setView] = useState<View>("dashboard")
  /**
   * The tab track. `track` is its left edge in pixels — `-index × width` at rest — and it is the only
   * thing that moves while a turn runs or the thumb drags. `mounted` is which tabs are drawn at all:
   * the current one, and whatever a turn passes through or a drag may reveal. Every other slot is
   * empty, so a screen the owner is not near is not mounted.
   */
  const track = useMotionValue(0)
  const [mounted, setMounted] = useState<number[]>([0])
  /** A turn or a snap-back is moving the track, so a gesture must not fight it. */
  const sliding = useRef(false)
  /** Counts the moves of the track. A move that was overtaken by a later one does nothing when it lands. */
  const turn = useRef(0)
  /** The move that is running now, so the next one can stop it. */
  const glideControls = useRef<ReturnType<typeof animate> | null>(null)
  /** A sideways drag has mounted the neighbours and is following the thumb. */
  const dragging = useRef(false)
  const viewport = useRef<HTMLDivElement>(null)
  /** The viewport's width, read by the gesture and the turn; a ref so both see it at once. */
  const widthRef = useRef(0)
  /** The screen's width as state, so the dock re-places its circle when the screen is measured. */
  const [screenWidth, setScreenWidth] = useState(0)
  /** The committed view, for the layout effects and the resize observer. */
  const viewRef = useRef<View>(view)
  const reduceMotion = useReducedMotion()
  const [arrived, setArrived] = useState<Arrived>({})
  /**
   * Where the owner has most recently asked to be. A tap is not always answered in the order
   * it was made — a screen is fetched before it is shown — and this is what stops a slow
   * first tap from landing after a fast second one.
   */
  const wanted = useRef<View>("dashboard")
  /** The day the wheel's window ends on; `undefined` means "the newest row". */
  const [anchor, setAnchor] = useState<number | undefined>(undefined)
  /**
   * The manual-entry sheet, fetched on its first use. It is a modal rather than a screen,
   * but the same rule applies: nothing in the entry chunk should pay for a keypad most
   * opens never open. The module is warmed idly with the other two, so in practice the
   * first press is a sheet rather than a wait.
   */
  const [EntrySheet, setEntrySheet] = useState<ComponentType<SheetProps> | null>(null)
  const [entryOpen, setEntryOpen] = useState(false)
  /**
   * The budget editor, fetched on the first hold for the same reason every other panel is:
   * a keypad that may never be opened should not be in the entry chunk. It is warmer with the
   * others, so the first hold is normally a panel rather than a wait.
   */
  const [BudgetEditor, setBudgetEditor] = useState<ComponentType<BudgetSheetProps> | null>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  /**
   * Which budget the editor is about. Read while the panel closes, too, so it stays set
   * until another card is held — and the dashboard's carousel keeps its cards by id.
   */
  const [budgetTarget, setBudgetTarget] = useState<BudgetTarget>({ kind: "envelope", id: "food" })
  /**
   * The account whose balance is being edited, if any: the front card's hold. It is the id
   * rather than the card, because the card is a formatted view of the account and the panel
   * needs the numbers (`features/balance/BalanceSheet.tsx`).
   */
  const [balanceAccount, setBalanceAccount] = useState<string | null>(null)
  /** The card a transfer is moving money into, or `null` when no transfer sheet is open. */
  const [transferTo, setTransferTo] = useState<string | null>(null)
  /** Counts each open, so the transfer sheet remounts blank on every open. */
  const [transferOpens, setTransferOpens] = useState(0)
  /**
   * The balance panel, fetched on the first hold for the same reason the budget editor is:
   * a keypad that may never be opened does not belong in the entry chunk. It is warmed idly
   * with the others, so in practice the first hold is a panel rather than a wait.
   */
  const [BalanceEditor, setBalanceEditor] = useState<ComponentType<BalanceSheetProps> | null>(null)
  /**
   * A hold on a balance card opens its choice first: edit the card, or add one. The choice and the
   * add-card sheet are one module, fetched on that first hold (`features/balance/CardSheets.tsx`).
   */
  const [choiceFor, setChoiceFor] = useState<string | null>(null)
  const [addingCard, setAddingCard] = useState(false)
  const [cardSheets, setCardSheets] = useState<typeof import("@/features/balance/CardSheets") | null>(null)
  /**
   * The category the sheet opens on, when it was opened from a quick-log chip rather than
   * from the add-record pill: `null` for a blank entry, which is what the pill means.
   */
  const [entryCategory, setEntryCategory] = useState<string | null>(null)
  /**
   * The merchant a scanned code named, when the scanner opened the sheet: that turns it into
   * the payment screen (`SheetProps.payee`), seeds the keypad when the code carried an amount,
   * and makes the confirm **Pay and Log Transaction**. The row it writes is the payee's rather
   * than a hand-typed one's — `logPaidPayee` builds it, so a scanned payment keeps its own id,
   * its own `source: "upi"` and the VPA in its note.
   */
  const [entryPayee, setEntryPayee] = useState<UpiPayee | null>(null)
  /**
   * The row being corrected, when the sheet was opened from a ledger card's **Edit** rather
   * than from the add-record pill. It is the whole row, not an id, because the app already
   * holds every row (`useLedger`) and the sheet needs its figures to start on.
   */
  const [entryEditing, setEntryEditing] = useState<Row | null>(null)
  /**
   * Where the scanner's answer goes. A scanned code hands the sheet a promise, and the sentence
   * is what that promise resolves with once the owner confirms or gives up — the scanner's own
   * status line is the one place "what did that do?" is answered.
   */
  const settleScan = useRef<((sentence: string | null) => void) | null>(null)

  /**
   * After the first screen is painted, the other two are fetched in the background, so a tap
   * the owner has not made yet is not a tap that waits. This is the one place the app
   * deliberately downloads something nobody has asked to see, and it is idly scheduled so
   * that a slow phone finishes its first paint first.
   */
  useEffect(() => {
    const warm = () => {
      void screens.ledger()
      void screens.scan()
      void screens.stats()
      void screens.settings()
      void import("@/features/manual-entry")
      void import("@/features/budget/BudgetSheet")
      void import("@/features/balance/BalanceSheet")
      void import("@/features/balance/CardSheets")
    }
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(warm, { timeout: 2000 })
      return () => window.cancelIdleCallback(idle)
    }
    // Safari has no idle callback; a second after load is idle enough.
    const timer = window.setTimeout(warm, 1200)
    return () => window.clearTimeout(timer)
  }, [])

  /** A screen is in hand before it is drawn: fetched once, then kept in `arrived`. */
  const loadScreen = useCallback(async (page: View) => {
    if (page === "dashboard") return
    const screen = await screens[page]()
    setArrived((was) => ({ ...was, [page]: screen }))
  }, [])

  /** Put the track where the committed view is, at rest, for the width it is measured at. */
  const restTrack = useCallback(() => {
    const index = TAB_VIEWS.indexOf(viewRef.current as NavTab)
    if (index >= 0) track.set(-index * widthRef.current)
  }, [track])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) return
    const measure = () => {
      widthRef.current = el.clientWidth
      setScreenWidth(el.clientWidth)
      if (!sliding.current && !dragging.current) restTrack()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [restTrack])

  /**
   * Turn the track from one tab to another. Every tab the move passes through is in hand and drawn
   * before it moves, so the owner sees them go by; the view is changed when the track lands.
   */
  const slideTo = useCallback(
    async (to: number) => {
      const target = TAB_VIEWS[to]
      const id = ++turn.current
      wanted.current = target
      // Where the track is now, in tabs: a tap during a turn turns it from there, not from the view.
      const at = -track.get() / Math.max(1, widthRef.current)
      glideControls.current?.stop()
      sliding.current = true
      const low = Math.max(0, Math.min(Math.floor(at), to))
      const high = Math.min(TAB_VIEWS.length - 1, Math.max(Math.ceil(at), to))
      await Promise.all(TAB_VIEWS.slice(low, high + 1).map((page) => loadScreen(page)))
      if (turn.current !== id) return
      setMounted(Array.from({ length: high - low + 1 }, (_, k) => low + k))
      const controls = animate(track, -to * widthRef.current, {
        duration: reduceMotion ? 0 : slideDuration(Math.abs(to - at)),
        ease: SLIDE_EASE,
      })
      glideControls.current = controls
      await controls
      if (turn.current !== id) return
      sliding.current = false
      setMounted([to])
      setView(target)
      window.scrollTo({ top: 0, left: 0, behavior: "instant" })
    },
    [loadScreen, reduceMotion, track],
  )

  /**
   * Change screens, whichever way. A move between two tabs turns the track; the scanner is not in the
   * tab order, so a move to or from it is a plain change of screen. A tap during a turn is ignored.
   */
  const goTo = useCallback(
    async (next: View) => {
      const to = TAB_VIEWS.indexOf(next as NavTab)
      if (to >= 0 && TAB_VIEWS.includes(viewRef.current as NavTab)) {
        // A tap on the screen that is already showing, with the track at rest, is nothing. A tap
        // while it is still turning to another tab turns it back.
        if (!sliding.current && next === viewRef.current) return
        await slideTo(to)
        return
      }
      // The scanner, or a move from it: a plain change of screen. Any turn still running is stopped.
      turn.current++
      glideControls.current?.stop()
      sliding.current = false
      wanted.current = next
      await loadScreen(next)
      if (wanted.current !== next) return
      // A tab coming back from the scanner is put at rest on its own tab, with only that one drawn.
      if (to >= 0) {
        setMounted([to])
        track.set(-to * widthRef.current)
      }
      setView(next)
      window.scrollTo({ top: 0, left: 0, behavior: "instant" })
    },
    [loadScreen, slideTo, track],
  )

  /**
   * The thumb's way between screens: the same four tabs, in the dock's order. `canSwipe`
   * keeps the first and last pages from being swiped past (the dock has no wrap either), and
   * the tick is the dock's own `lightTap`, fired inside the gesture that asked for the page.
   * The scanner is not a page in the order; its swipe belongs to the camera.
   */
  useSwipeScreens({
    enabled: view !== "scan",
    canSwipe: (direction) => {
      const index = TAB_VIEWS.indexOf(view as NavTab)
      return index >= 0 && index + direction >= 0 && index + direction < TAB_VIEWS.length
    },
    onDrag: (dx) => {
      if (sliding.current) return
      const index = TAB_VIEWS.indexOf(view as NavTab)
      if (index < 0) return
      if (!dragging.current) {
        // The first sideways movement draws the screens either side, so there is one to show.
        dragging.current = true
        const beside = [index - 1, index + 1].filter((i) => i >= 0 && i < TAB_VIEWS.length)
        beside.forEach((i) => void loadScreen(TAB_VIEWS[i]))
        setMounted([index, ...beside])
      }
      // A move toward no screen gives a little and no more.
      const toward = dx < 0 ? 1 : -1
      const open = index + toward >= 0 && index + toward < TAB_VIEWS.length
      track.set(-index * widthRef.current + (open ? dx : dx * 0.3))
    },
    onSettle: (direction) => {
      const wasDragging = dragging.current
      dragging.current = false
      if (sliding.current) return
      const index = TAB_VIEWS.indexOf(view as NavTab)
      if (index < 0) return
      const next = direction === null ? -1 : index + direction
      if (direction !== null && next >= 0 && next < TAB_VIEWS.length) {
        // Must run synchronously inside the gesture for iOS, like every other tap in the app.
        lightTap()
        void slideTo(next)
        return
      }
      if (!wasDragging) return
      // Did not turn: the track goes back to where the view is, and the neighbours go with it.
      const id = ++turn.current
      wanted.current = TAB_VIEWS[index]
      glideControls.current?.stop()
      sliding.current = true
      const controls = animate(track, -index * widthRef.current, {
        duration: reduceMotion ? 0 : 0.3,
        ease: SLIDE_EASE,
      })
      glideControls.current = controls
      void (async () => {
        await controls
        if (turn.current !== id) return
        sliding.current = false
        setMounted([index])
      })()
    },
  })

  /**
   * Open the sheet, fetching its module first if this is the first press.
   *
   * The amount arrives as **rupees** because that is what the keypad types; this is the
   * one boundary where it becomes the app's integer paise. Everything else about the row
   * is the ledger's own shape: an id no import can collide with, the merchant as the
   * title (or the category's name when the merchant was left empty), and `source: manual`
   * so a hand-typed row can always be told from an imported or scanned one.
   */
  const openEntry = useCallback(
    async (
      category: string | null = null,
      payee: UpiPayee | null = null,
      /** The row a ledger card's Edit handed over, if this open is a correction. */
      editing: Row | null = null,
    ): Promise<string | null> => {
      // Set before the sheet opens, and before any await: the category, the payee and the row
      // being corrected are what the sheet starts on, and a tap that fetched the module first
      // would otherwise open a blank entry and only then be told what it was for.
      setEntryCategory(category)
      setEntryPayee(payee)
      setEntryEditing(editing)
      const answer = payee === null
        ? null
        : new Promise<string | null>((resolve) => {
            settleScan.current = resolve
          })
      if (!EntrySheet) {
        const module = await import("@/features/manual-entry")
        setEntrySheet(() => module.ManualEntrySheet)
      }
      setEntryOpen(true)
      return answer
    },
    [EntrySheet],
  )

  const addEntry = useCallback((entry: ManualEntry) => {
    // The sheet's own day: today unless the owner changed it, so a forgotten expense lands
    // on the day it happened rather than on the day it was remembered. The id carries that
    // moment too, and the random tail keeps two entries in the same minute apart.
    const at = entry.at
    const category = entry.category ?? DEFAULT_CATEGORY
    appendToLedger({
      rows: [
        {
          id: `manual-${at}-${Math.random().toString(36).slice(2, 8)}`,
          title: entry.merchant || filedName(category),
          category,
          account: entry.account,
          amountCents: Math.round(entry.amount * 100),
          // The sheet's Expense/Income switch decides the direction; `amountCents` stays a
          // positive number and every total reads the kind (`lib/derive.ts`), so an income
          // here is never counted as spending.
          kind: entry.kind,
          at,
          ...(entry.note ? { note: entry.note } : {}),
          source: "manual",
        },
      ],
    })
  }, [])

  /**
   * The sheet's confirm, in edit mode: the same row, corrected.
   *
   * Everything the sheet knows is written onto the row it started on — **the id stays**, which
   * is what makes this a correction rather than a second entry: the card keeps its place in
   * the ledger, the cloud's upsert lands on the same `client_id` (`lib/cloud.ts`), and every
   * total it was part of simply moves. Fields the sheet does not ask about ride along
   * untouched: an imported row keeps its Wallet id, its icon and its people, and a scanned
   * one keeps `source: "upi"`.
   */
  const editEntry = useCallback(
    (row: Row, entry: ManualEntry) => {
      const category = entry.category ?? DEFAULT_CATEGORY
      const next: Row = {
        ...row,
        title: entry.merchant || filedName(category),
        category,
        account: entry.account,
        amountCents: Math.round(entry.amount * 100),
        kind: entry.kind,
        // The moment is the row's own unless the pill was moved, and that is the point of
        // seeding the sheet with it: a backdated expense is corrected where it happened.
        at: entry.at,
      }
      // A note the owner cleared is gone rather than stored as an empty string: a row with no
      // note has no such key anywhere else in the app.
      if (entry.note) next.note = entry.note
      else delete next.note
      update(next)
    },
    [update],
  )

  /**
   * The sheet's confirm.
   *
   * One screen, two rows: a hand-typed entry is `addEntry`'s (`source: "manual"`, an id no
   * import can collide with), and an entry opened from a scanned code is the *payee's* —
   * `logPaidPayee` writes it through `logScan.ts`'s `rowFor`, so
   * the two ways into a scanned row cannot disagree about what one is. It also hands the
   * scanner its sentence, which is what the status line shows when the sheet closes. A scan
   * is always money out, so that screen never shows the sheet's kind switch: only the
   * add-record path can hand `addEntry` an income.
   */
  const submitEntry = useCallback(
    (entry: ManualEntry) => {
      if (entryEditing !== null) {
        editEntry(entryEditing, entry)
        return
      }
      if (entryPayee === null) {
        addEntry(entry)
        return
      }
      settleScan.current?.(
        logPaidPayee(entryPayee, {
          amountCents: Math.round(entry.amount * 100),
          category: entry.category ?? DEFAULT_CATEGORY,
          note: entry.note,
          title: entry.merchant,
          // The payment screen's own moment, which starts on now and can be moved back.
          at: entry.at,
        }),
      )
      settleScan.current = null
    },
    [addEntry, editEntry, entryEditing, entryPayee],
  )

  /**
   * Open the budget editor on one target, fetching the panel first if this is the first
   * hold. The target is set before the await, so a first hold still opens the panel on the
   * budget it was made on.
   */
  const editBudget = useCallback(
    async (target: BudgetTarget) => {
      setBudgetTarget(target)
      if (!BudgetEditor) {
        const module = await import("@/features/budget/BudgetSheet")
        setBudgetEditor(() => module.BudgetSheet)
      }
      setBudgetOpen(true)
    },
    [BudgetEditor],
  )

  /**
   * The carousel's **Create new**: add an envelope, then open its editor on it. Creating first
   * is what makes the card exist behind the panel — the owner sees it arrive in the carousel
   * and names it in the same gesture — rather than opening an editor for something unsaved.
   */
  const createBudget = useCallback(() => {
    const id = createEnvelope()
    void editBudget({ kind: "envelope", id })
  }, [createEnvelope, editBudget])

  /**
   * A deleted envelope can no longer be the editor's target. The card that takes its place
   * is the store's choice; closing the panel here is what keeps it from drawing a budget the
   * owner just removed.
   */
  const deleteEnvelope = useCallback(
    (id: string) => {
      deleteBudget(id)
      if (budgetTarget.kind === "envelope" && budgetTarget.id === id) setBudgetOpen(false)
    },
    [budgetTarget, deleteBudget],
  )

  /** Closing without confirming is an answer too: the scanner's hint comes back. */
  const closeEntry = useCallback(() => {
    setEntryOpen(false)
    setEntryEditing(null)
    settleScan.current?.(null)
    settleScan.current = null
  }, [])

  /**
   * A ledger card's hold → **Edit**: find the row the app actually holds and open the sheet on
   * it. The lookup is by the card's id, which is the row's own; a card whose row has gone (a
   * delete on another device, a pull that landed in between) opens nothing rather than a blank
   * sheet with somebody else's figures.
   */
  const editRow = useCallback(
    (id: string) => {
      const row = rows.find((candidate) => candidate.id === id)
      if (row) void openEntry(row.category, null, row)
    },
    [rows, openEntry],
  )

  /**
   * A balance card's hold: fetch the panel on the first one, then open it on that account.
   * The account id is set before the await, like every other panel here.
   */
  const editBalance = useCallback(
    async (accountId: string) => {
      setBalanceAccount(accountId)
      if (!BalanceEditor) {
        const module = await import("@/features/balance/BalanceSheet")
        setBalanceEditor(() => module.BalanceSheet)
      }
    },
    [BalanceEditor],
  )

  /** A balance card's hold: fetch the choice on the first one, then open it on that card. */
  const holdCard = useCallback(
    async (cardId: string) => {
      setChoiceFor(cardId)
      if (!cardSheets) setCardSheets(await import("@/features/balance/CardSheets"))
    },
    [cardSheets],
  )

  /**
   * Both models are rebuilt when the ledger changes and not on every render: the
   * derivation walks every row, and a screen that re-renders for a hover must not
   * make it do that.
   *
   * **The demo content belongs to the device-only build.** With no account there is nobody
   * whose money it could be, so an empty ledger draws the artboards (`lib/demo.ts`) — that is
   * what a first visit to the tracker has always been. A signed-in account with no rows is
   * somebody's account with nothing on it, and drawing Blue Bottle and ₹24,860.40 there reads
   * as their data: it gets the real (empty) models instead, which is the same rule
   * `lib/ledger.ts` already follows for the bundled sheet.
   */
  const imported = hasHistory(rows)
  const demo = mode === "device" && !imported
  const dashboard = useMemo(
    () => {
      const model = demo
        ? demoDashboard(envelopes, openings, customCards)
        : dashboardModel(rows, now, envelopes, openings, customCards, transfers)
      return { ...model, cards: applyCardOrder(model.cards, cardOrder) }
    },
    [demo, rows, now, envelopes, openings, customCards, cardOrder, transfers],
  )
  const ledger = useMemo(
    () => (demo ? DEMO_LEDGER : ledgerModel(rows, budgets, anchor, openings)),
    [demo, rows, budgets, anchor, openings],
  )
  /** What both accounts opened with, for the stats trend — the dashboard's own figures. */
  const openingCents = useMemo(
    () => ACCOUNTS.reduce((total, account) => total + (openings[account.id] ?? 0), 0),
    [openings],
  )

  /**
   * What the budget editor is drawing: one envelope from the carousel, or the stats dial.
   * The envelope is looked up by id because the carousel can add cards behind the panel;
   * the first card is the fallback for a target that no longer exists, rather than a blank
   * panel with somebody else's figures.
   */
  const targetEnvelope =
    budgetTarget.kind === "envelope"
      ? (envelopes.find((envelope) => envelope.id === budgetTarget.id) ?? envelopes[0] ?? null)
      : null
  const budgetCopy = targetEnvelope ? envelopeCopy(targetEnvelope) : BUDGET_COPY.total
  const budgetLimit = targetEnvelope ? targetEnvelope.limitCents : total.limitCents
  const budgetTracked = targetEnvelope ? targetEnvelope.tracked : total.tracked
  const budgetName = targetEnvelope ? targetEnvelope.name : total.name

  const Ledger = arrived.ledger
  const Scan = arrived.scan
  const Stats = arrived.stats
  const Settings = arrived.settings

  /** The screen a tab draws. A tab the track has not reached yet is not drawn at all. */
  const tabScreen = (page: NavTab): ReactNode => {
    if (page === "dashboard") {
      return (
        <DashboardScreen
          model={dashboard}
          greeting={greeting}
          theme={theme}
          onToggleTheme={toggleTheme}
          onScan={() => void goTo("scan")}
          onAddRecord={() => void openEntry()}
          onQuickLog={(category) => void openEntry(category)}
          activeEnvelopeId={activeEnvelopeId}
          onViewEnvelope={viewEnvelope}
          onEditBudget={(id) => void editBudget({ kind: "envelope", id })}
          onCreateBudget={createBudget}
          onMoveBudget={moveBudget}
          onDeleteBudget={deleteEnvelope}
          onHoldCard={(cardId) => void holdCard(cardId)}
          onReorderCards={reorderCards}
          canShowPayCode={isOwnerEmail(email)}
        />
      )
    }
    if (page === "ledger") {
      return Ledger ? (
        <Ledger
          model={ledger}
          theme={theme}
          onToggleTheme={toggleTheme}
          onPickMonth={setAnchor}
          // The ledger screen only asks; the store is what forgets a row and tells every
          // screen subscribed to it (`lib/ledger.ts`).
          onDelete={remove}
          // …and an edit comes back the same way: the sheet is opened here, over the
          // ledger, with the row the app holds.
          onEdit={editRow}
        />
      ) : null
    }
    if (page === "stats") {
      return Stats ? (
        <Stats
          rows={rows}
          theme={theme}
          onToggleTheme={toggleTheme}
          budgetCents={total.limitCents}
          budgetCategories={total.tracked}
          openingCents={openingCents}
          onSetBudget={() => void editBudget({ kind: "total" })}
        />
      ) : null
    }
    return Settings ? (
      <Settings
        theme={theme}
        onToggleTheme={toggleTheme}
        palette={palette}
        onChooseTheme={chooseTheme}
      />
    ) : null
  }

  return (
    <>
      {/*
        The tab track. The four tabs sit side by side in one row, and the row is moved with `left`
        rather than a transform: a transform would make every `position: fixed` inside a page
        relative to the row. The scanner is not a tab, so it cross-fades in the same frame.
      */}
      <div ref={viewport} className="relative overflow-x-clip">
        <AnimatePresence initial={false} mode="popLayout">
          {view === "scan" ? (
            <motion.div
              key="scan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35 }}
            >
              {Scan ? (
                <Scan
                  theme={theme}
                  onToggleTheme={toggleTheme}
                  onBack={() => void goTo("dashboard")}
                  // A scanned code opens the same sheet the dashboard's pill opens, as a payment
                  // screen for this merchant — and its answer is the status line's sentence, so the
                  // screen itself never touches the ledger.
                  onOpenEntry={(payee) => openEntry(null, payee)}
                />
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="tabs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35 }}
            >
              <motion.div
                className="relative flex"
                style={{ left: track, width: `${TAB_VIEWS.length * 100}%` }}
              >
                {TAB_VIEWS.map((page, index) => (
                  <div
                    key={page}
                    className="min-w-0 shrink-0"
                    style={{ width: `${100 / TAB_VIEWS.length}%` }}
                  >
                    {mounted.includes(index) ? tabScreen(page) : null}
                  </div>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/*
        The dock lives outside the slide: it is the frame the screens change
        inside, not a fourth screen. `null` on the scanner leaves no tab marked.
      */}
      <BottomNav
        active={view === "scan" ? null : view}
        onChange={(tab) => void goTo(tab)}
        track={track}
        screenWidth={screenWidth}
      />

      {/* The one modal in the app: over the dock, and fetched on first use. */}
      {EntrySheet && (
        <EntrySheet
          isOpen={entryOpen}
          category={entryCategory}
          payee={entryPayee}
          editing={entryEditing}
          onClose={closeEntry}
          onSubmit={submitEntry}
        />
      )}

      {/*
        The budget editor. A long press on any envelope in the dashboard's carousel opens it
        on that card, and the stats dial opens it on `total`; the save writes the owner's
        number to `lib/budget.ts`, which redraws whichever cards draw it.
      */}
      {BudgetEditor && (
        <BudgetEditor
          isOpen={budgetOpen}
          copy={budgetCopy}
          allowEveryExpense={targetEnvelope === null}
          limitCents={budgetLimit}
          tracked={budgetTracked}
          // The envelope's own name, which the card behind this panel prints as its title.
          name={budgetName}
          onName={(value) => {
            if (targetEnvelope) saveEnvelopeName(targetEnvelope.id, value)
            else saveTotalName(value)
          }}
          // What the budget has counted so far this month, so the picker's own figure moves
          // on every toggle — re-derived here because the rows do not leave the app.
          spentCents={budgetSpent(rows, startOfMonth(now), startOfNextMonth(now), budgetTracked)}
          onClose={() => setBudgetOpen(false)}
          onSave={(cents) => {
            if (targetEnvelope) saveEnvelopeLimit(targetEnvelope.id, cents)
            else saveTotalLimit(cents)
            setBudgetOpen(false)
          }}
          // Written on every toggle rather than on the save: the card behind the panel is
          // the answer to what a choice does, so it has to move while the panel is open.
          onTrack={(categories) => {
            if (targetEnvelope) saveEnvelopeTracked(targetEnvelope.id, categories)
            else saveTotalTracked(categories)
          }}
        />
      )}

      {/** The balance editor: what the card's hold opened, by account id. */}
      {BalanceEditor && (
        <BalanceEditor
          isOpen={balanceAccount !== null}
          name={dashboard.cards.find((card) => card.id === balanceAccount)?.name ?? "Account"}
          balanceCents={
            dashboard.cards.find((card) => card.id === balanceAccount)?.cents ?? 0
          }
          onClose={() => setBalanceAccount(null)}
          onSave={(cents) => {
            if (balanceAccount) setBalance(balanceAccount, cents)
            setBalanceAccount(null)
          }}
        />
      )}

      {/** The balance card's choice, and the sheet that adds a card to the stack. */}
      {cardSheets && (
        <>
          <cardSheets.CardChoiceSheet
            isOpen={choiceFor !== null}
            name={dashboard.cards.find((card) => card.id === choiceFor)?.name ?? "Card"}
            heldId={choiceFor ?? ""}
            cards={dashboard.cards.map((card) => ({ id: card.id, name: card.name }))}
            canDelete={customCards.some((card) => card.id === choiceFor)}
            onEdit={() => {
              const id = choiceFor
              setChoiceFor(null)
              if (id) void editBalance(id)
            }}
            onTransfer={() => {
              const id = choiceFor
              setChoiceFor(null)
              setTransferOpens((count) => count + 1)
              setTransferTo(id)
            }}
            onAdd={() => {
              setChoiceFor(null)
              setAddingCard(true)
            }}
            onFront={(id) => {
              const ids = dashboard.cards.map((card) => card.id)
              setChoiceFor(null)
              reorderCards([id, ...ids.filter((existing) => existing !== id)])
            }}
            onBack={(id) => {
              const ids = dashboard.cards.map((card) => card.id)
              setChoiceFor(null)
              reorderCards([...ids.filter((existing) => existing !== id), id])
            }}
            onDelete={() => {
              const id = choiceFor
              setChoiceFor(null)
              if (id) removeCard(id)
            }}
            onClose={() => setChoiceFor(null)}
          />
          <cardSheets.TransferSheet
            key={transferOpens}
            isOpen={transferTo !== null}
            toId={transferTo ?? ""}
            toName={dashboard.cards.find((card) => card.id === transferTo)?.name ?? "Card"}
            onClose={() => setTransferTo(null)}
            onSave={(fromId, cents) => {
              if (transferTo) transfer(fromId, transferTo, cents)
              setTransferTo(null)
            }}
          />
          <cardSheets.AddCardSheet
            isOpen={addingCard}
            onClose={() => setAddingCard(false)}
            onSave={(card) => {
              addCard(card)
              setAddingCard(false)
            }}
          />
        </>
      )}

    </>
  )
}

/**
 * The gate, and the reason the ledger above is a component rather than the default export.
 *
 * Three builds come out of one source:
 *
 * - **No Supabase values** (`mode === "device"`) — the tracker this app has always been. Nothing
 *   is fetched, nothing is gated, and `TrackIt` mounts on the first frame.
 * - **A project and no session** — the portal, because the account is what the ledger is filed
 *   under; there is nothing on this screen for somebody who is not signed in.
 * - **A project and a session** — `TrackIt`, reading the account's cache (which may be empty on a
 *   brand-new account, and is the last thing this device saw when the network is gone).
 *
 * The wait between boot and that decision is a bare canvas, not a splash: the session is read
 * from `localStorage` synchronously enough that a returning owner never sees it, and a logo held
 * for one frame is a promise the app cannot keep any faster than painting.
 */
export default function App() {
  const { mode, ready, user } = useAuth()

  if (mode === "device") return <TrackIt />
  if (!ready) return <div className="h-dvh w-full bg-canvas" aria-busy="true" />
  return user ? <TrackIt /> : <LoginScreen />
}
