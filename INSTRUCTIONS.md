# Instructions

Standing rules for anyone — human or model — working in this repository. They were
set by the project owner, so follow them without being asked again.

## How to work here

1. **Keep a todo list for every task, and update it in real time.** Write the todos
   when you start, mark each one complete the moment it is complete, and never batch
   the updates at the end. The owner watches that list as live progress.
2. **Commit and push when the work is done.** That is the default for most tasks.
   `main` is the branch and `origin` is `GunsSayPewPew16/TrackIt`. Stage only the
   files you changed — the working tree may hold someone else's work.
3. **Verify in the browser before claiming anything works.** For `frontend/design/mockup.html`
   that means serving the repo and driving the real page:

   ```bash
   python3 -m http.server 4321 --bind 127.0.0.1 --directory .   # then open /frontend/design/mockup.html
   ```

   A passing build, a clean exit code or an HTTP 200 is not evidence that the screen
   renders or that a gesture works. Read the DOM and the computed styles, and look at
   a screenshot.
4. **Report what you verified and what you could not.** Say plainly when a check was
   synthetic, skipped or blocked instead of implying it passed.

## The product

TrackIt is a mobile-first, installable expense-tracker PWA for iPhone: React 19 +
TypeScript + Vite, local-first in IndexedDB, with a token-protected Cloudflare Worker
for the Apple Shortcuts endpoint. `README.md` has the stack, scripts and API.

The repository is split in two: `frontend/` (the installable app plus the mockup)
and `backend/` (the Worker, its `wrangler.toml` and its D1 schema), with the shared
npm workspace, docs and `tools/` at the root. Configs live with the side they
belong to, which is why the Vite root and the build output are configured rather
than defaulted — check `frontend/vite.config.ts` and `backend/wrangler.toml`
before moving anything else.

`frontend/design/mockup.html` is the standalone visual mockup of that same product — one
hand-written file, no build step, no dependencies — used to agree on the UI before it
is built for real. It mirrors the app's domain rules: money is stored as integer
cents, categories come from the same set, and Shortcut-logged rows carry an `AUTO`
badge.

Two things about the money are the owner's, not defaults: everything is in
**rupees** (`DEFAULT_CURRENCY = 'INR'`, `money()` formats with `en-IN` grouping in the
mockup), and the categories are the ones from their old app rather than a generic set.

## Data: the Wallet import (`tools/`)

`tools/wallet-import.py` is the single source of truth for the dataset and the
category list. It reads the owner's old **Wallet (BudgetBakers)** export and writes:

* `tools/trackit-expenses.json` — 122 rows (112 expenses + 10 income) in the exact
  shape the app imports (**Settings → Import JSON**).* `tools/mockup-snippets.txt` — the same rows as a JS array literal, the mockup's
  `ACCOUNTS` list, and every category table, printed from one in-script table.

The script **writes the category tables itself** — `CATEGORY_META` and
`CATEGORY_GROUPS` in the mockup, `CATEGORIES` and `CATEGORY_GROUPS` in
`frontend/src/lib/types.ts` — so never edit a category id, label or group by hand in
either file: change the table in the script and re-run it. What is still pasted from
the snippets is the data (`ACCOUNTS`, the imported row literals), and the slugs in
the mockup must stay quoted, because several contain a dash.

```bash
python3 tools/wallet-import.py ~/Downloads/wallet_unlocked_export.json
```

Two siblings own the icons, and they are two families on purpose:
`tools/phosphor-icons.py` vendors the **category markers** out of
`@phosphor-icons/core`'s `fill` weight into both clients, and `tools/lucide-icons.py`
vendors the **chrome** (the rail, the buttons, the browser's arrows) out of
`lucide-static` into `frontend/src/lib/ui-icons.tsx`. Install both catalogues first —
`npm install --no-save @phosphor-icons/core lucide-static`, in one command, because
npm prunes a `--no-save` package the next time it installs another — and re-run the
matching script after any icon mapping change. The catalogues are build-time inputs,
not dependencies of the app.

Decisions the script makes, so nobody has to guess: amounts are *already* rupees
(Wallet stores paise, and INR is its referential currency, so nothing is converted);
income arrives as `kind: 'income'` and internal transfers are dropped; soft-deleted
rows are dropped; Wallet's UTC `recordDate` becomes a local date at `+05:30`; and the
Wallet document id becomes the TrackIt id, so re-importing an export updates rows
instead of duplicating them. It also prints each of the export's accounts — slug,
name, label and opening balance, which is what the mockup's `ACCOUNTS` list is
pasted from — plus the two added up, which is `OPENING_BALANCE_CENTS` in
`frontend/src/lib/types.ts`.

**Income is a kind of entry, never negative spending.** `kind` is `'expense'` or
`'income'` everywhere (D1 column, Worker payload, app type, mockup row); a missing
`kind` means an expense, so older rows and hand-written files keep working. Every
sum has to decide: "spent this month", the budget ring, the category breakdown and
the daily average count expenses only, while the balance is opening balances plus
income minus expenses, and Operations prints both halves of a range when it holds
both.

**Which account a row moved through is `account`** (`'upi'` or `'cash'`), resolved
from Wallet's `accountId` against its own `Account` documents. The mockup's Home
needs it — that card holds one account's balance at a time — so the row literals
carry it, while `--app-out` leaves it out deliberately: the app's `Expense` type has
no such field yet, and its import drops what it does not know. A row with no
`account` counts on the primary one (`ACCOUNTS[0]`), the way a row with no `kind`
counts as spending, so an older export or a hand-written file still lands on a
balance instead of nowhere.

**Categories hang under Wallet's groups, and the table is the whole tree.** The
export keeps the colour Wallet paints each subcategory with — its group's colour — but
never the group's name, so `GROUPS` is checked against those colours on every run
(`check_group_colors`: 14 of the owner's categories, and a mismatch is reported rather
than grouped silently). The export only paints six of the groups; the other five
group colours (`housing` orange, `vehicle` purple, `financial-expenses` teal,
`investments` pink, `income` gold) were read off the owner's screenshots of Wallet's
browser by fitting the screenshots' own colour shift against those six, and they are
in `GROUP_COLORS` so a future export proves them the same way. Wallet's Help Center
publishes the group names and nothing else, and says so on purpose — owners rename and
hide subcategories, so no complete default list exists to copy — which is why every
row the export never touched (the whole of Shopping beyond two rows, Housing,
Transportation, Vehicle, the rest of Life & Entertainment, Communication, Financial
expenses, Investments, and the Income set) carries that screenshot provenance in the
table's comment. `income` is the odd one: not a row of Wallet's browser but the set it
offers for money coming in, kept as a group because the picker walks groups while the
app's kind toggle is a separate choice. Wallet repeats a few labels across sets
(Child Support under three of them, Lottery, gambling and Gifts under two); a slug
belongs to one group, so a repeat carries the group in its id
(`income-child-support`) while the label stays the owner's own, and `EXPORT_LABELS`
makes sure an import still lands each export document on the unqualified row it always
had. Ask the owner before inventing a category that is not in the export or the
screenshots — and note that only one glyph had to be substituted, because Phosphor
has no parking sign: `parking` wears `map-pin`.

**The markers are solid, the chrome is line art, and both are generated.** Every
category's glyph sits on the same solid tile — one warm brown, `BADGE_COLOR` in
`frontend/src/lib/markers.ts`, sampled from the reference's own rows — and an emoji
cannot sit on one: it brings its own palette, so the glyph fights the tile, and every
platform draws it differently. The owner asked for solid symbols rather than the line
art the markers started as, so the markers are **Phosphor's `fill` weight**:
`tools/phosphor-icons.py` writes the mockup's `CATEGORY_ICONS` table and the app's
`frontend/src/lib/icons.tsx` from `@phosphor-icons/core`, one family on one 256px
grid, each glyph exactly as Phosphor draws it — which is why the marker `<svg>` in
both clients carries `viewBox="0 0 256 256"` and `fill="currentColor"` and no
stroke. The app's chrome keeps Lucide's line art in `frontend/src/lib/ui-icons.tsx`
(`tools/lucide-icons.py`), because a screenful of filled buttons would shout as
loudly as the content they sit under. Do not hand-edit any of the three: change the
mapping in the script that owns it and re-run it, after
`npm install --no-save @phosphor-icons/core lucide-static` (one command — the second
install otherwise prunes the first catalogue). `frontend/src/lib/markers.ts` owns the
badge's look: one solid fill with the glyph in white, so there is no ink rule per
colour, and a tile reads as part of one family instead of a paint chart — a group's
colour still colours Home's breakdown, where telling categories apart is the job.
`tools/wallet-import.py` checks the two marker tables against each other on every run
— and names any category with no marker in either — so a marker cannot drift.

Its data interchange format is deliberately the same one the real app writes in
`frontend/src/components/SettingsScreen.tsx`: a bare JSON array of expenses, downloaded as
`trackit-<date>.json` through a blob URL and a temporary anchor. Do not invent a
wrapper object — the mockup also accepts `{ "expenses": [...] }` on import, but that
is tolerance for hand-written files, not the format to produce.

## Mockup conventions (`frontend/design/mockup.html`)

- **One file.** HTML, CSS and JS live in `frontend/design/mockup.html`. Do not split
  it up or add tooling around it.
- **No hardcoded pixels.** Every length is `rem`/`%`/`em`, with the root font-size at
  `clamp(0.9rem, 4.1vmin, 1.15rem)` so the whole UI scales from an iPhone 13 up to a
  wide desktop panel. Pixel values are only acceptable inside comments.
- **Respect the safe areas.** Keep the `env(safe-area-inset-*)` padding and the
  `viewport-fit=cover` meta so the notch and home bar stay clear.
- **390x844 is the reference size**, and a wide panel (~700px) must be checked too:
  nothing may overflow sideways at either width.
- **The fixed "now" is 12 October 2026** (`const TODAY`). The imported data is real
  and dated, which keeps screenshots stable across sessions.
- **No hardcoded currency.** `money()` is the only place that formats money, and it
  prints rupees with `en-IN` grouping (₹1,23,456.78, not $123,456.78).
- **Ids are unique and namespaced per screen.** Home owns the balance card's ids,
  Operations owns the calendar's, the add screen owns its browser's; any other screen
  prefixes its own. Two overlays once shared ids and both broke.
- **Screenshots in the preview panel crop the bottom ~150px**, which is why the bottom
  rail never appears in a capture even though it is rendered and tappable. Probe it
  instead of trusting the image.

## Design decisions already made — do not undo them silently

- **One expense dataset.** Home and every other screen render the same array, and
  anything that adds an expense adds it there through the shared add screen
  (`openAdd(targetDate)`). There is no per-screen data.
- **Operations is a date-filtered view of that data**, not a bank ledger. Nothing on
  it offers Transfer or Request, and the filter button cycles Day → Week → Month.
- **Logging persists** to `localStorage` under `trackit.mockup.expenses.v1`.
- **The dataset is the owner's own Wallet import** (122 entries — 112 expenses and
  10 income, July–October 2026), embedded in the file as `importedExpenses()`. There
  is no separate demo seed: this *is* what the mockup ships with, and what a fresh
  browser sees. Income only shows once a range holding it is on screen, and the
  calendar strip is a 7-day window, so reaching it means expanding Home's list or
  driving the strip's handler with an earlier date.
- **Home leads with the balance, then this month's spending, then five entries.**
  The headline is `ACCOUNTS` added up (each account's opening balance plus its own
  income minus its own spending), "Spent this month" sits directly under it, and the
  list is capped at five rows with a "Show all N entries" button — a four-month
  history must never fill the first screen. Everything below the balance still sums
  this month's *expenses* only, or the ring would blow up on load.
- **The card under the balance swipes between accounts.** One slide per entry in
  `ACCOUNTS` — what it holds, its share of the money, and what it has spent this
  month — over a dot per slide. It is a track of its own: it follows the thumb and
  eases on release over `RELEASE_SLIDE`, exactly as the screens do (see the gesture
  rule below), and the screen swipe stands down for a gesture that
  starts on it, so one finger never moves both. The dots are buttons, because a swipe
  must not be the only way across, and a tap on one lands on the next frame like
  every other tap. The add screen picks the account with a second, quieter toggle
  under the kind, so a logged row moves one balance and not the other.
- **The month's budget is the pie, not a progress bar.** The old October-budget card
  is gone: its slot holds the account carousel, and its figures are the widget that
  replaced "Auto-log with Shortcuts" — this month's spending as a pie over the
  category each rupee went to (`PIE_WEDGES` of them, the tail summed as "other"),
  with `₹X of ₹1,500.00` underneath, while the "Budget used" ring stays the
  at-a-glance percent. The Shortcuts endpoint is documentation rather than a glance,
  so it lives on Profile beside the Backup card.
- **Adding an expense is a screen, not a sheet.** It is the third screen — right
  after the day-by-day view, where the owner reaches for it — and both the Home
  button and Operations' `+` navigate to it. Money first, then Expense/Income,
  account and date, then the category browser: the groups, and once one is open its
  own row followed by its subcategories. **The last tap is the save** — the amount is
  already typed, so choosing the category completes the entry and lands back on the
  dashboard, where the line under the header says what was added. An empty amount is
  the one tap that cannot complete anything, and it marks the amount rather than
  swallowing the tap. A rail tab or a swipe reaches the same screen without wiping a
  half-typed entry; only the buttons start a fresh one. The app's sheet walks the
  same browser — `All categories`, then one group's own row followed by its
  subcategories, with a back button to leave the group — inside a `.picker` whose
  list scrolls on its own so the money, the kind and the date stay put, and it pins
  its buttons with `.sheet .btn-row` because Wallet's list is too long to fit above
them.
- **The picker's rows wear the same tile as the transaction rows.** Each group still
  carries the colour Wallet paints its categories with — that is what the export's
  colour proof checks, and what Home's breakdown draws with — but the browser's
  markers wear the one solid badge colour, so a category looks the same in the sheet
  as it does in the list. A group's own row comes first under
  its "SUBCATEGORIES" heading — whole outings get logged against the group itself —
  and every row is a button (`aria-pressed` on the category it picks, `aria-expanded`
  on a group), not a chip: the old flat chip row could not say where a category
  belonged, and the app's sheet lost it for the same reason.
- **A transaction row is a tile, a name, the day and a signed amount.** The owner
  picked that anatomy from a reference: the category's icon on a solid tile, then what
  it was, then the day it happened in the muted line, then what it
  cost at the right edge — a minus in the soft expense red for money out, a plus in
  the green for money in. The tile is the reference's own brown rather than the
  category's group colour, so a screenful of rows reads as one family; the add sheet's
  picker wears the same one. The tile already says the category, so the row stopped
  repeating it under the title, which is also what fixed imported rows printing their
  own label twice. Home's list and Operations' rows are the same `rowHtml`, and the
  app's `ExpenseRow` carries the same anatomy with its own `--expense`/`--income`
  tokens (softer than `--danger`, which is for warnings, not for spending).
- **Profile holds the Backup panel**: Export JSON (downloads the file and fills the
  box), Import JSON (reads the box, validates every row, and replaces the dataset
  atomically — a bad row aborts the whole import), and Reset to imported data (drops
  the storage key and restores the Wallet import, which is also the way to leave the
  mockup in a pristine state after a demo). Anything that replaces the dataset must
  mutate the existing array in place, because every screen closes over it.
- **The rail drives the screens, and so does a horizontal swipe.** The track follows
  the thumb with no transition at all while the finger is down — the release sets
  `--track-duration`, and 0ms is what a drag leaves it at, so the track can never lag
  the thumb. A flick's speed decides how many screens it carries (one to three), and
  **a tap lands on the next frame** whatever the distance, because a transition we
  start ourselves reads as delay, not as feedback.
  **A release is the one thing that eases, and only over `RELEASE_SLIDE` (120ms).**
  The page it lands on is committed at the release; the 120ms is what lets a flick
  carrying two or three screens be *seen* to carry them. That number is the whole
  point: this was 300ms and read as a delay, and 0ms lost the travel — so do not
  lengthen it back, and do not delete the ease either. The duration is committed
  before the transform moves (the forced reflow in `settle`), and `--track-duration`
  is what carries it, so the transition itself is never toggled off and on.
- **Gestures never fight the content.** A vertical drag must scroll the screen rather
  than move the track, taps and tiny drags must do nothing, and a drag must swallow
  the click it would otherwise fire — but only that click. The swallow is armed when a
  drag ends and cleared by the *document's* next `pointerdown` (or `keydown` for a
  keyboard activation), with `DRAG_CLICK_WINDOW` as a safety valve on a stale flag.
  The reset has to be document-wide, not scoped to `.app-content`: a tap after a swipe
  usually lands on the rail or on a category row of the add screen, neither of which
  is inside the swipe area, and a scoped reset ate every one of them for 150ms. The
  old 400ms timer ate deliberate taps outright.
- **Cards is deliberately blank**, a placeholder wired to the rail while it waits to
  be designed. The third tab used to hold the same kind of blank Activity placeholder
  and now holds the add flow, which is where the owner asked for it.
