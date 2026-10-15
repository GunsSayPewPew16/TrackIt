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

One script owns the icons: `tools/lucide-icons.py` vendors **both** the markers (every
category's glyph on its tile) and the **chrome** (the rail, the buttons, the browser's
arrows) out of `lucide-static` — into the mockup's `CATEGORY_ICONS` table,
`frontend/src/lib/icons.tsx`, and `frontend/src/lib/ui-icons.tsx`. Install the
catalogue first (`npm install --no-save lucide-static`) and re-run the script after
any icon mapping change; it is a build-time input, not a dependency of the app.
Phosphor's `fill` set was here for a while and is gone: two scripts writing one table
is how the two clients drift apart.

One script owns the typeface as well: `tools/vendor-font.py` fetches **Nunito**, the
rounded sans the reference's own labels are set in, and writes it into
`frontend/src/assets/fonts/` with its OFL licence beside it. It writes two files —
the latin subset, one variable font carrying the whole 200–1000 weight range, and a
1.5 KiB file holding the rupee sign alone, which the app writes on every amount and
the latin subset leaves out. The app is offline-first, so the font is vendored into
the build rather than linked from fonts.googleapis.com, and the app's `@font-face`
rules live at the top of `frontend/src/index.css`; do not hand-edit the files.

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
screenshots — and note that no glyph has to stand in for another any more: `parking`
wears Lucide's own `circle-parking`, which the Phosphor set it replaced had to
substitute a map pin for.

**The markers are one white glyph on one brown tile, and the glyph is Lucide's line
art.** Every category's glyph sits on the same solid tile — one warm brown,
`BADGE_COLOR` in `frontend/src/lib/markers.ts`, sampled from the reference's own rows
— and an emoji cannot sit on one: it brings its own palette, so the glyph fights the
tile, and every platform draws it differently. The markers were Phosphor's `fill`
weight for a while, when solid silhouettes were what the owner wanted; the owner has
since asked for Lucide's line art on the tile again, so `tools/lucide-icons.py` writes
the mockup's `CATEGORY_ICONS` table and the app's `frontend/src/lib/icons.tsx` (and
the chrome) out of `lucide-static` — one family on one 24px grid at one stroke weight,
each glyph exactly as Lucide draws it, which is why the marker `<svg>` in both clients
carries `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"` and
`stroke-width="2"`. Nothing else about the marker moved: same tile, same brown, same
white. Do not hand-edit any of the three generated files — change the mapping in the
script that owns them and re-run it, after `npm install --no-save lucide-static`.
`frontend/src/lib/markers.ts` owns the tile's look: one solid fill with the glyph in
white, so there is no ink rule per colour, and a tile reads as part of one family
instead of a paint chart — a group's colour still colours Home's breakdown, where
telling categories apart is the job.
`tools/wallet-import.py` checks the two marker tables against each other on every run
— and names any category with no marker in either — so a marker cannot drift.

**The reference's own tiles are Phosphor's `fill` set, which was measured, not assumed —
and that measurement is what makes our Lucide markers a decision rather than an
oversight.** The owner's screenshot of the reference's marker rows — a renewals list
whose four tiles are a bolt, a briefcase, a camera and a `$` — is Phosphor: drawn white
on `BADGE_COLOR` at the tile's own size, read back with one threshold, and scored
against the screenshot's own four tiles, Phosphor takes first place for the bolt
(`lightning-fill`), the camera (`camera-fill`) and the money (`currency-dollar-fill`)
out of every keyword-matched glyph in sixteen packs — about a thousand candidates each —
and `currency-dollar-fill` lands within 0.001 of the screenshot's own ink ratio (0.583
against 0.582). Do not treat that as a case for putting Phosphor back: the owner has
been shown these numbers and asked for Lucide's line art on our tiles anyway, so the
markers here are Lucide and the reference's tiles are Phosphor, on purpose. (The tiles
agree about everything else: a reference tile measures 81px, ours 44px, both the same
brown and the same rounded square.) Re-check a glyph choice by rendering candidates on
the tile colour at the tile's own size rather than at icon size; a crisp 256px render
against a blurred screenshot tile scores shapes apart that are in fact the same
drawing.

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
- **The cards' materials are generated, not hand-written.** `tools/card-texture.py`
  bakes *both* into the mockup's `:root`, and neither data URI is ever hand-edited —
  change the tool and re-run it. **The UPI card** wears the owner's chrome
  (`frontend/design/card-source.png`) graded to the reference card's gold as
  `--card-texture`.  **The cash card** wears the owner's own foil
  (`frontend/design/cash-source.png`) as `--cash-texture`, and that one is
  **deliberately untinted**: the owner asked for it as it is, so the only things the
  tool does to it are mechanical — a quarter turn clockwise, the widest 3.15:1 window
  the photo allows, and a scale to the card's width. **The turn is the framing, not
  decoration**: the foil is portrait and the card is wide, so a window of the upright
  photo is one crease blown up large, while the same window on the rotated photo shows
  the whole pressed surface — more wrinkles, each one smaller. `CASH_ROTATION` and
  `CASH_WINDOW` in the tool are the two knobs (0.7 closes in for a calmer, bigger
  pattern). That is what makes the two slides read as two materials — warm gold beside
  cold silver — rather than one material twice, so do not grade the foil to match its
  neighbour.
  Each slide wears the material its account names (`.acct-slide--<slug>`, which is also
  why the slides carry `acct-slide--upi` / `acct-slide--cash`), and **a white veil sits
  over whichever one it is**, as the first background layer, declared once on
  `.acct-slide` so both cards share it: thicker where the small words are and thinnest
  across the middle, because the metal's own dark valleys are too deep to carry small
  type. The ink keeps its contrast instead of depending on what the texture happens to
  be doing underneath it — so keep that veil (and the ink alphas that go with it) in
  step with the textures if either changes.
- **No hardcoded currency.** `money()` is the only place that formats money, and it
  prints rupees with `en-IN` grouping (₹1,23,456.78, not $123,456.78). The one
  exception is the statistics chart's `axisMoney()`, which sits beside it and only
  ever *shortens* what `money()` would say (₹22.0K, ₹1.2L), because a full figure
  beside every dashed line is wider than the plot it names.
- **Ids are unique and namespaced per screen.**  Home owns the balance card's ids,
  the records page owns the calendar's, the add screen owns its browser's, the
  statistics screen owns the chart's and its axis labels'; any other screen prefixes
  its own. Two overlays once shared ids and both broke.
- **Screenshots in the preview panel crop the bottom ~150px**, which is why the bottom
  rail never appears in a capture even though it is rendered and tappable. Probe it
  instead of trusting the image.

## Design decisions already made — do not undo them silently

- **One expense dataset.** Home and every other screen render the same array, and
  anything that adds an expense adds it there through the shared add screen
  (`openAdd(targetDate)`). There is no per-screen data.- **Financial Operations is a page over the phone, not a screen of it.** It is what
  the total balance opens — the figure is a button and its chevron says so — and Home's
  Transfer/Request pair opens it too, because that pair is the money-movement action and
  this is the money-movement page. It replaced the old "Spending by day" records page:
  the reference's screen 2 is the same shape, so its title is the reference's own two
  lines and its pill row is the reference's three controls — a pale **Transfer**, the
  tile's tan for **Request**, and one gold `+`. **The two money-movement pills are named
  and shaped but answer nothing yet**: the owner is wiring them to UPI, and until that
  lands a control that pretends to move money would be worse than one that waits. The
  `+` is the way to log an entry, and it leaves the page first (`closeRecords()`, then
  `openAdd(selectedDate)`), because the add screen is a screen of the track that the
  page would otherwise be covering.
  - The page is `position: fixed` against the phone rather than the sliding track — it
    covers the rail as well as the screen, which is what "the whole screen" means — and
    it is still a date-filtered view of the one dataset. Its filter cycles
    Day → Week → Month and its back arrow is the way out. Everything behind it is
    `inert` while it is open, so no tap and no tab reaches the dashboard through it.
  - **It opens on the newest day the data has**, not on the mockup's fixed now: the
    import says nothing about 12 October 2026, and a ledger that greets the owner with
    "Nothing on this day" reads as broken. Any day they pick from the strip is what they
    get from then on.
  - **It lives outside `.track` on purpose**: the track carries
    `will-change: transform`, which also makes it a containing block for fixed-position
    descendants — kept inside, the page would slide along with the screens and cover one
    of them only.
- **Logging persists** to `localStorage` under `trackit.mockup.expenses.v1`.
- **The dataset is the owner's own Wallet import** (122 entries — 112 expenses and
  10 income, July–October 2026), embedded in the file as `importedExpenses()`. There
  is no separate demo seed: this *is* what the mockup ships with, and what a fresh
  browser sees. Income only shows once a range holding it is on screen, and the
  calendar strip is a 7-day window, so reaching it means expanding Home's list or
  driving the strip's handler with an earlier date.
- **Home wears the reference's own anatomy, top to bottom.** The greeting header (the
  brand disc, "Hi, Priyansh", the fixed date) with the wallet button that opens Cards;
  then `ACCOUNTS` added up as the headline — each account's opening balance plus its own
  income minus its own spending — as a *button* whose chevron says it opens the
  operations page, with the sync button beside it, and "Spent this month" directly under
  it. The list below is capped at five rows with a "Show all N entries" button, because
  a four-month history must never fill the first screen, and everything below the
  balance still sums this month's *expenses* only, or the ring would blow up on load.
  The account card and that pair sit together in `.home-group` — one panel of the same
  brown the two budget cards below wear, because in the reference the money you have and
  the money you move are one block rather than three floating parts. The mat around them
  is deliberately thin (the reference's nine pixels) and the two buttons are equal
  halves. They are the reference's **Transfer** and **Request**, which open the
  operations page and are the controls the owner is wiring to UPI (see the page above);
  the **Add expense** screen is reached from the rail's third tab and from that page's
  `+`.
- **The card under the balance swipes between accounts.** One slide per entry in
  `ACCOUNTS` — what it holds, its share of the money, and what it has spent this
  month — over a dot per slide. It is a track of its own: it follows the thumb and
  eases on release over `RELEASE_SLIDE`, exactly as the screens do (see the gesture
  rule below), and the screen swipe stands down for a gesture that
  starts on it, so one finger never moves both. The dots are buttons, because a swipe
  must not be the only way across, and a tap on one lands on the next frame like
  every other tap. The add screen picks the account with a second, quieter toggle
  under the kind, so a logged row moves one balance and not the other.
- **Statistics is the rail's second tab: the balance over time, as one line.** Its
  summary is the balance at the end of every day from the first entry to the fixed now
  (`dailyBalances`), which is the same figure Home leads with — so the two can never
  disagree, and the falls in the line are the days that spent more than they took in.
  It gives the savings screen the reference's pot cards were built on the reference's
  *look* without its pots: those pots were placeholders (the app has no savings goal of
  its own), so what the screen borrows is the anatomy — the dashboard's own greeting
  header, the big title, the range chips, one figure over one label, and a card in the
  reference's tan. **The range is the chips**, one per month the data covers plus
  **All time**, read from the same daily balances the line is drawn from so a chip can
  never name a month with nothing behind it. That is why there is no **Show more** any
  more: "All time" *is* the whole history, and the chips say so in one row instead of a
  link at the foot of the card. The figure's label follows the range — "Current balance"
  while the range ends today, "<Month> balance" for a month already closed, because a
  closing balance is not "today's".
  The dashed rounds are round rupees, the day labels are ~six of them with today always
  last, and each value label is placed by the same fraction of the height the chart
  draws its line at, so a label can never drift off the round it names (the value
  column and the canvas take their height from one variable for the same reason).
  **Everything on that card is the card's own dark ink, not the page's white**: it sits
  on light tan now, so the line, its wash, the uprights and the dashed rounds are all
  dark (`#6d5527` and rgba of `43, 30, 13`), and the labels and swatch follow via
  `.stat-card--tan`. The drawing itself is canvas, sized for the device pixel ratio like
  the ring and the pie, and redrawn on `showScreen` and on a resize; the canvas carries
  an `aria-label` with the window's low, high and current figure, because a plot is
  pixels no screen reader can read.
- **The month's budget is the pie, not a progress bar.** The old October-budget card
  is gone: its slot holds the account carousel, and its figures are the widget that
  replaced "Auto-log with Shortcuts" — this month's spending as a pie over the
  category each rupee went to (`PIE_WEDGES` of them, the tail summed as "other"),
  with `₹X of ₹1,500.00` underneath, while the "Budget used" ring stays the
  at-a-glance percent — drawn as the reference's own three circles: one big brown disc,
  the gold band cut into its rim, and the smaller brown circle the band leaves in the
  middle, with the part of the band the month has not reached left dark. The Shortcuts endpoint is documentation rather than a glance,
  so it lives on Profile beside the Backup card.
- **Adding an expense is a screen, not a sheet.** It is the third screen — right
  after the statistics view, where the owner reaches for it — and both the Home button
  and the records page's `+` navigate to it. Money first, then Expense/Income,
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
- **The rail drives the screens, and so does a horizontal swipe.** Its five tabs are
  Home, Statistics, the add screen, Cards and Profile, and the active one is drawn the
  way the reference draws it: a gold disc, glossy at the top, that pops above the
  bar's top edge with its glyph in a dark brown, over a translucent pill that blurs
  whatever is behind it. Do not flatten that disc back into a squircle, and never clip
  the bar — the disc is meant to stick out of it. The track follows
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
