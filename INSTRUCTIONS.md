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
3. **Verify in the browser before claiming anything works.** For `design/mockup.html`
   that means serving the repo and driving the real page:

   ```bash
   python3 -m http.server 4321 --bind 127.0.0.1 --directory .   # then open /design/mockup.html
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

`design/mockup.html` is the standalone visual mockup of that same product — one
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

* `tools/trackit-expenses.json` — 112 expense rows in the exact shape the app imports
  (**Settings → Import JSON**).
* `tools/mockup-snippets.txt` — the same rows as a JS array literal plus both
  category tables (the mockup's `CATEGORY_META` and `src/lib/types.ts`'s
  `CATEGORIES`), printed from one in-script table. Paste those blocks rather than
  editing category ids, labels or emoji by hand in either file; the slugs in the
  mockup must stay quoted, because several contain a dash.

```bash
python3 tools/wallet-import.py ~/Downloads/wallet_unlocked_export.json
```

Decisions the script makes, so nobody has to guess: amounts are *already* rupees
(Wallet stores paise, and INR is its referential currency, so nothing is converted);
income rows (`type == 0`) and internal transfers are dropped because TrackIt models
spending; soft-deleted rows are dropped; Wallet's UTC `recordDate` becomes a local
date at `+05:30`; and the Wallet document id becomes the TrackIt id, so re-importing
an export updates rows instead of duplicating them.

Its data interchange format is deliberately the same one the real app writes in
`src/components/SettingsScreen.tsx`: a bare JSON array of expenses, downloaded as
`trackit-<date>.json` through a blob URL and a temporary anchor. Do not invent a
wrapper object — the mockup also accepts `{ "expenses": [...] }` on import, but that
is tolerance for hand-written files, not the format to produce.

## Mockup conventions (`design/mockup.html`)

- **One file.** HTML, CSS and JS live in `design/mockup.html`. Do not split it up or
  add tooling around it.
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
- **Ids are unique and namespaced per screen.** Home owns `modalOverlay`, `modalInput`
  and friends; any other screen prefixes its own. Two modals once shared ids and both
  broke.
- **Screenshots in the preview panel crop the bottom ~150px**, which is why the bottom
  rail never appears in a capture even though it is rendered and tappable. Probe it
  instead of trusting the image.

## Design decisions already made — do not undo them silently

- **One expense dataset.** Home and every other screen render the same array, and
  anything that adds an expense adds it there through the shared modal
  (`openModal(targetDate)`). There is no per-screen data.
- **Operations is a date-filtered view of that data**, not a bank ledger. Nothing on
  it offers Transfer or Request, and the filter button cycles Day → Week → Month.
- **Logging persists** to `localStorage` under `trackit.mockup.expenses.v1`.
- **The dataset is the owner's own Wallet import** (112 expenses, July–October 2026),
  embedded in the file as `importedExpenses()`. There is no separate demo seed: this
  *is* what the mockup ships with, and what a fresh browser sees.
- **Home's money is scoped to the current month while the list under it is the whole
  history.** The header, budget card and ring must keep summing only this month's
  expenses, or four months of real data would blow the ring instantly.
- **The add-expense modal scrolls and its buttons are pinned.** `max-height: 88dvh`
  on `.modal-box` and a sticky `.modal-actions`, because the owner has 17 categories
  and they no longer fit a phone screen any other way — the same bound the real app's
  `AddExpenseSheet` uses.
- **Profile holds the Backup panel**: Export JSON (downloads the file and fills the
  box), Import JSON (reads the box, validates every row, and replaces the dataset
  atomically — a bad row aborts the whole import), and Reset to imported data (drops
  the storage key and restores the Wallet import, which is also the way to leave the
  mockup in a pristine state after a demo). Anything that replaces the dataset must
  mutate the existing array in place, because every screen closes over it.
- **The rail drives the screens, and so does a horizontal swipe.** The track follows
  the thumb, snaps on release, and a flick's speed decides how many screens it
  carries (one to three). Tapping a tab more than one screen away lands instantly;
  the neighbouring tab slides briefly.
- **Gestures never fight the content.** A vertical drag must scroll the screen rather
  than move the track, taps and tiny drags must do nothing, and a drag must swallow
  the click it would otherwise fire.
- **Activity and Cards are deliberately blank** placeholders, so every tab is wired
  while those screens wait to be designed.
