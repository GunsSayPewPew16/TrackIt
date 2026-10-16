# Instructions

Standing rules for anyone — human or model — working in this repository. They were
set by the project owner, so follow them without being asked again.

## How to work here

1. **Keep a todo list for every task, and update it in real time.** Write the todos
   when you start, mark each one complete the moment it is complete, and never batch
   the updates at the end. The owner watches that list as live progress.
2. **Commit and push when the work is done.** That is the default for most tasks.
   `main` is the branch and `origin` is `GunsSayPewPew16/TrackIt`. Stage only the files
   you changed — the working tree may hold someone else's work.
3. **Verify in the browser before claiming anything works.** Start the app and drive
   the real page:

   ```bash
   npm run dev          # then open http://127.0.0.1:4323/
   ```

   A passing build, a clean exit code or an HTTP 200 is not evidence that a screen
   renders or that a gesture works. Read the DOM and the computed styles, drive the
   gesture, and look at what was painted.

   Two traps this repository has already fallen into, so check for them first:
   - **The desktop Preview panel does not always composite.** When it produces no
     frames, screenshots fail and every animation — the cross-fade, the theme
     switch, the wheel's springs — freezes at its starting value, so a *passing*
     check there can be a lie and a *failing* one can be an artefact. When that
     happens, drive real Chrome over the DevTools protocol instead: launch it with
     `--headless=new --remote-debugging-port=<port>`, `Emulation.setDeviceMetricsOverride`
     to 390×1100 at DPR 2, and use `Page.captureScreenshot`, `Input.dispatchMouseEvent`
     (a drag is a real mouse drag) and `DOM.setFileInputFiles` (a real import).
     Remember that `Runtime.evaluate` answers `{ result: { value } }`, not `{ value }`.
   - **A frozen animation is not a layout.** Read geometry with
     `getBoundingClientRect`, and remember that a child's top margin **collapses out**
     of a column with no top padding — one of those pushed the whole ledger screen
     24px down the viewport with the header still looking right in the DOM.
4. **Report what you verified and what you could not.** Say plainly when a check was
   synthetic, skipped or blocked instead of implying it passed, and name the reason
   (no camera, no frames, no account) rather than the symptom.

## The product

TrackIt is a mobile-first expense tracker in two screens: the **bento dashboard** and
the **daily ledger** with its spinning date wheel. React 19 + TypeScript + Vite,
styled with Tailwind CSS v4, Radix for the popovers and the dialog, Lucide for the
icons, Framer Motion for the movement. It is a **static site**: no server, no
service-worker PWA (the previous one was retired with its design), and the only thing
it talks to is `localStorage`.

`README.md` has the stack, the screens, the theme, the importer and the deploy.

The design of record is [`app/design/`](app/design/README.md) — the two exported
artboards the screens were rebuilt from. Every radius, height, line height, letter
spacing and colour in `app/src` is theirs; when a change is meant to alter the design,
change it there too, or say in the commit that the design has moved on.

### The two things that are the owner's

- **The money is rupees**, formatted `en-IN` (₹18,084.07), stored as **integer
  paise** everywhere. Nothing divides by 100 except the CSV export, at the edge.
- **The categories are their own Wallet tree**, not a generic set, and they are
  written by `tools/wallet-import.py` into `app/src/lib/categories.ts`. An import
  resolves against that table so a row keeps the label it arrived with.

## Data: what the screens read

One shape, two producers — `app/src/lib/view.ts` holds the models, and nothing else
knows which producer filled them:

- `app/src/lib/demo.ts` — the artboards' own content, as literals: the eleven sample
  rows, the balance, October 2026. It is what a first visit shows, so the design is
  what the owner sees before their own money is in.
- `app/src/lib/derive.ts` — the same models computed from the owner's rows. Every
  decision a figure needs lives here rather than in a component: money in is never
  spending, `High expense` is a share of the month rather than a threshold, a card's
  little bar measures a budget where one exists and the category's share otherwise
  (and says which), and the gauge measures the export's own envelope where it carried
  one. If a figure is wrong, it is wrong in this file.

`app/src/lib/history.ts` reads the file; `app/src/lib/ledger.ts` keeps the rows
(`trackit-ledger`, and a shared `EMPTY_LEDGER` const, because `useSyncExternalStore`
compares snapshots by identity). Importing the same backup twice is a no-op by
document id, which is the mistake anyone makes with a backup and the one worth
answering kindly — the report it shows says how many rows were added, and what was
left out and why.

## Design decisions already made — do not undo them silently

- **Dark is the default**, and it is what `:root` carries. Light is the same ten
  roles with different values, on `data-theme="light"`, and the choice is remembered
  under `trackit-theme`. A boot script in `app/index.html` applies it before the first
  paint; if you change the key or a value, change it in both places.
- **The 8px grid is real.** Heights, gaps and paddings are the artboard's multiples of
  4/8 (`p-4`, `gap-2`, `h-11`), and a card's height comes from the design rather than
  from its content. Numbers that look arbitrary — 358×128 for a card, 104px for the
  scan band, 232/176/160/280 for the dashboard's cards — are the artboard's, so keep
  them together with the comment that says where they came from.
- **The column is 390px and centred.** It is a phone design; it is centred rather than
  stretched, and it keeps the artboard's 24/16/32 padding.
- **A screen starts at its own top.** Both ways in are pressed from down a long
  column, so `goTo` in `App.tsx` resets the scroll — instantly, because the cross-fade
  is what carries the change.
- **The wheel's geometry is the artboard's**, not a tuning: radius 800, one fifteenth
  of the arc per capsule, `rotY(−9°·n)`, scales 1.15/1/0.9/0.78/0.7, opacity
  1/0.6/0.6/0.3/0, and only ±3 reachable. The gesture is too: 60px per step, up to
  three, nothing under 24px. **Framer Motion's spring is the spec's** (stiffness 300,
  damping 30); the theme toggle's curve is the artboard's own
  `cubic-bezier(.34,1.56,.64,1)` overshoot rather than a spring, because that is what
  the design drew.
- **The wheel is a fifteen-day window**, so it can only ever reach the last fortnight
  on its own. The chevron beside the month is the way further back: a Radix menu of
  the months the history touches (`LedgerModel.months`), each anchored on the newest
  day *in that month* rather than on its end, so picking one cannot open on an empty
  sheet. Selecting the month already showing is a no-op.
- **The day's rows are rebuilt, not cross-faded.** The artboard re-runs one fade-up
  keyframe on every change of day, and has no exit animation; a `mode="wait"` swap
  leaves the sheet empty for as long as a fade lasts, which is the one thing the
  design never does.
- **A card's treatment is a domain value, not a class name**: `std` (plain), `alt`
  (clay, for a row that is at least a tenth of the month's spending) and `inc` (sage,
  for money in). The notched path is the artboard's, character for character.
- **The tiles are Lucide line art at `strokeWidth={1.5}`**, one family with the chrome.
  Emoji were tried and rejected: they arrive with their own palette and fight the tile.
  An imported row wears its **category's** marker (`category-icons.tsx`, written by
  `tools/lucide-icons.py`); the artboard's own faces (coffee, bus, cart, laptop, house,
  wallet) come from `lucide-react`. `RowIcon` treats one string as either, which is only
  safe because no face name is also a category id — check `categories.ts` before adding
  one.
- **Neue Haas Grotesk is the face**, with **Helvetica Neue deliberately absent** from
  the stacks: the trial faces carry 74 glyphs, so `%`, `/`, `:`, `+`, `·`, `−` and `₹`
  come from the next family, and naming Helvetica Neue is what made a Neue Haas screen
  read as Helvetica on a Mac. The trial's EULA forbids web embedding; the owner has
  chosen to ship it on their personal site anyway, and the licence travels beside the
  files. `tools/vendor-neue-haas.py` is what converts them.
- **Panels the design does not draw are the app's own, and wear the app's clothes.**
  *Your history* (import/export) and the scan sheet are not in either artboard, so
  they are built from the same tokens — 48px circles with a hairline in a header,
  `bg-clay text-on-clay` for the primary action, 20px radii — and they follow the
  theme like everything else. `scan.module.css` maps the previous app's token names
  (`--bg-color`, `--accent-yellow`, …) onto the current ten roles rather than
  restating colours, which is what keeps the pay sheet (kept for the flow that is not
  built yet) already themed.
- **The UPI scanner logs a row, it does not pay.** A code that carries an amount is
  logged under **Wallet - OneClick record**; one without says so instead of guessing.
  Nothing hands a `upi://` link to another app yet, and the pay sheet is a screen this
  design does not have.
- **`backend/` is not called by the app.** It is the Shortcut endpoint, kept as it is;
  the two screens read and write only the device's own ledger. Do not wire the app to
  it without saying why.
- **The owner's Wallet export is personal data.** An export of it once sat in
  `app/public/` (which is published) and was removed; keep backups of real money out of
  the repository and out of anything that is deployed, and prefer
  `~/Downloads/wallet_unlocked_export.json` when a test needs one.

## Verifying a change

```bash
npm run typecheck    # tsc over the app and the Worker's project
npm run build        # typecheck + a production build
npm run lint         # oxlint
```

Then drive the app. What is worth exercising for a change in these areas:

| Changed | Check |
| --- | --- |
| A screen's layout | computed heights/positions against the artboard values, and a screenshot at 390×1100 |
| The theme | both palettes' canvas, card, hairline and ink by computed style *and* by pixel; the toggle's `aria-pressed`, its label, and the stored choice after a reload |
| The wheel | a real mouse drag (−130px ⇒ +2 days), the ±3 clamp, the 24px threshold, the arrow keys, and the spring settling |
| The ledger's month menu | with real rows: the months listed, the marked one, and that picking an older one moves the window |
| The importer | a real file through the file input; the report's words; the stored row count; and the balance worked out from the stored rows by hand |
| The scanner or *Your history* | both themes, since neither is in the artwork |

`app/design/` is what to compare against when the question is "has a design feature
been lost or changed".
