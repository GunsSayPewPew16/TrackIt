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
     switch, the wheel's inertia — freezes at its starting value, so a *passing*
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

TrackIt is a mobile-first expense tracker in three screens: the **bento dashboard**,
the **daily ledger** with its spinning date wheel, and **scan to pay** (the camera,
which logs the row a code carries). React 19 + TypeScript + Vite,
styled with Tailwind CSS v4, Radix for the popovers and the dialog, Lucide for the
icons, Framer Motion for the movement. It is a **static site**: no server, no
service-worker PWA (the previous one was retired with its design), and the only thing
it talks to is `localStorage`.

`README.md` has the stack, the screens, the theme, the importer and the deploy.

The design of record is [`app/design/`](app/design/README.md) — the three exported
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
  spending, `High expense` is a share of the month rather than a threshold, and a card's
  little bar measures a budget where one exists and the category's share otherwise (and
  says which). If a figure is wrong, it is wrong in this file.
- `app/src/lib/budget.ts` — **two budgets, because they answer two different questions**,
  and the store both limits live in. `food` is the dashboard's envelope card: **Food &
  Beverages, ₹1,500 a month**, counted through `categoryFor(id).group === "food-drinks"`
  (`isBudgetCategory`), so a taxi, a rent payment or an income row never moves it. `total` is
  the stats screen's dial: **every expense in the month, ₹5,000 a month**, whatever its
  category. `budgetSpent(rows, from, to, scope)` is the one gate both go through; the models
  take the limit as an argument (`dashboardModel`'s `foodLimitCents`, `gaugeModel`'s
  `totalLimitCents`) so `derive.ts` and `analytics.ts` stay pure, and `hooks/useBudgets.ts`
  subscribes the screens to the store. **Both limits are the owner's own**, changed by holding
  the card that draws them (`features/budget/BudgetSheet.tsx`), and kept in `localStorage`
  under `trackit-budgets`; `BUDGET_DEFAULTS` is the fallback, never a ceiling. The module
  deliberately ignores the export's own `Budget` documents: those still drive the per-row bars
  on the ledger, which is a different question — what one category has used up. The card is
  titled **F&B Budget** and its chips are the dimension's own subcategories, biggest first,
  each as a share of the food spend (they add up to 100%, not to the pill); the dial's label is
  *Total this month* / *Total last month*, because it is the whole month and not a dimension.
  The chips live in the card's sideways tray, so four subcategories are a scroll, not a clipped
  row — that is the design's tray, not an overflow bug.

**The rows are re-filed to the new tree on the way in.** `app/src/lib/refile.ts` is the one
place that knows both vocabularies: an envelope the six dimensions cannot offer is re-homed
to the nearest id that exists (`mobile-recharge` and `phone` → `internet`, `stationery` →
`shopping`, `education` → `books-subs`, `wellness` → `health-beauty`, `long-distance` →
`transportation`, and `culture-sport` → `life-entertainment`; `friends` used to be re-homed
there too and is **not any more**, because the picker offers that envelope — see the add-record
bullet below), a title that still
reads as an envelope's own name — Wallet's longer spelling included, see `WALLET_TITLES` — is
replaced with the new name, and `filedName()` is what every screen calls a category by, so
the ledger reads *Restaurants* / *Internet & Mobile* / *Food & Beverages* where the table still
says `Restaurant, fast-food` / `Mobile Recharge` / `Food & Drinks` (`food-drinks` is the one
name in `NEW_NAME` that is a *rename* rather than a re-filing, and it is there so the ledger
says what the picker says). It is applied wherever rows are read (the bundled sheet, the
stored ledger, an import), the store is rewritten in the same pass, and it is idempotent —
**no new category ids were invented for it**, and `lib/categories.ts` stays the importer's own
generated table.

`app/src/lib/history.ts` reads the file; `app/src/lib/ledger.ts` keeps the rows
(`trackit-ledger`, and a shared `EMPTY_LEDGER` const, because `useSyncExternalStore`
compares snapshots by identity). Importing the same backup twice is a no-op by
document id, which is the mistake anyone makes with a backup and the one worth
answering kindly — the report it shows says how many rows were added, and what was
left out and why.

## Design decisions already made — do not undo them silently

- **Zoom is off, on purpose, and it takes three layers to do it.** The viewport carries
  `maximum-scale=1, user-scalable=no`; `index.css` refuses pinch with `touch-action: pan-x
  pan-y` on `html` (the property is the intersection of every ancestor, so nothing below can
  widen it again); and `src/lib/zoom.ts` cancels Safari's `gesturestart` / `gesturechange` and
  a multi-finger `touchmove`, which is the only layer Safari's iOS honours. This is a fixed
  390px phone layout and the installed app has no zoom-out affordance, so a stray second
  thumb used to leave it cropped until the app was killed. Single-finger scrolling, the
  wheel's drag and the sheet's pull-down are untouched — do not "fix" this by removing one of
  the three layers, because a different browser is covered by each.
- **The colours are palettes, and `data-palette` is the only switch.** `app/src/index.css`
  has one block per **palette**, each stating the whole table (surfaces, the ten roles, the
  dock, the data colours, the tint numbers) — `ink` and `paper` are the artboards' own two
  and the defaults, and `midnight` / `parchment` are samples there so a picker has something
  to choose. `:root` alone carries `ink`, so a document that names nothing is the design of
  record. **This is the modularity the owner asked for**: a theme picker is a list over
  `lib/theme.ts`'s `PALETTES` calling `useTheme().choosePalette(id)`, and adding a palette is
  one CSS block, one register row and one line in the boot table — nothing in a component
  and no per-theme CSS ever again. There is **no `data-theme`**: a palette declares its own
  theme (`color-scheme`, and which way the sun/moon toggle goes), the toggle flips to the
  palette **the owner last used in the other theme** and to that theme's default only the
  first time, and a browser that chose before palettes existed still gets its choice —
  `trackit-theme`'s `light` / `dark` are read once and mapped to `paper` / `ink`. Three
  things must be kept in step by hand, and `lib/theme.ts` is the one to edit first: the
  register, the stylesheet blocks, and `app/index.html`'s boot table of id → canvas (the one
  value a script needs before the stylesheet has run, because a `<meta>` cannot read CSS).
  A palette that forgets a token inherits the previous block's value, which is why each
  block states all twenty-one rather than an override or two.
- **The 8px grid is real.** Heights, gaps and paddings are the artboard's multiples of
  4/8 (`p-4`, `gap-2`, `h-11`), and a card's height comes from the design rather than
  from its content. Numbers that look arbitrary — 358×128 for a card, 104px for the
  scan band, 224/176/160/280 for the dashboard's cards, and the account band's 224 of card
  plus the 288 the pinned pill grew it to — are the artboard's, so keep
  them together with the comment that says where they came from.
- **A fixed height is a promise about its content, and the content has to keep it.** Two
  cards were breaking that promise, and both are content-sized rather than re-tuned. The
  recent card is a 48px header and **three** 64px rows inside its 280px, so the derived
  model hands it three — the demo content always did, which is why five of them only
  showed once real rows existed (`lib/derive.ts`). The envelope's money column is sized by
  the figure it holds (`grid-cols-[auto_1fr]` with `whitespace-nowrap`) because
  `/ ₹1,500` at the design's 40px is 135px and the artboard's `2fr 3fr` track is 124px of
  a card whose own example, `/ $600`, is 105: the wider line wrapped onto a third row,
  which the card's 160px then clipped. Neither change moves a type size, a line height or
  a height — keep it that way if either is revisited.
- **The column is 390px and centred.** It is a phone design; it is centred rather than
  stretched, and it keeps the artboard's 24/16/32 padding — except at the top, which is
  `pt-safe`: the 24px, then 8px more, then `env(safe-area-inset-top)`. The page is
  edge-to-edge (`viewport-fit=cover`), so on a phone with a notch the greeting used to
  be drawn under it; the extra 8 is the owner's own ask. The ledger's panel stays at the
  top of the page and the header moves down the panel — the panel is a surface the notch
  can sit over, the greeting and the header are not.
- **A screen starts at its own top.** The way back is pressed from the foot of the
  ledger's rows and either screen scrolls on a short window, so `goTo` in `App.tsx`
  resets the scroll — instantly, because the cross-fade is what carries the change.
- **Only the dashboard may be in the entry chunk.** Nothing renders until that module
  runs, so every byte in it is paid before the first pixel, and the ledger and the scanner
  are behind taps most opens never make: they are fetched (`src/App.tsx`'s `screens` map,
  with their props as `import type` so the split survives) and the ledger's month menu is
  the app's only Radix dependency while the scanner is a whole decoder. Keeping them out
  took the entry from 657 kB to 415 kB — 216 kB over the wire down to 129. Three rules come
  with that, and they are the reason this is not a bare `React.lazy`: **a screen is in hand
  before the view changes** (`goTo` awaits the module and only then switches, with a ref
  guard so a slow first tap cannot land after a fast second one — a `Suspense` inside the
  `AnimatePresence` instead leaves both screens mounted and neither animating), **both are
  fetched idly once the first screen is up** so a tap is normally a screen rather than a
  wait, and **a tap that lands first keeps the screen being left** rather than showing a
  spinner the artboard never drew. A new screen belongs in that map, not in an import.
- **The ledger is opened from the dashboard header's circle**, beside the theme toggle;
  the artboard's "See all" button has been taken out of the recent card, where it was a
  second door to the same room. That circle carries `ArrowDownUp` because it is the
  control the owner pointed at — the glyph is what to change first if it reads as
  "swap".
- **The dashboard's first band is the account stack, not the balance box.** The newer
  Main artboard replaced the single "total available balance" panel with two cards, one
  per account (`components/BalanceCards.tsx`), so the screen finally draws the accounts
  `lib/accounts.ts` has always carried instead of only their sum. Three things are the
  owner's rather than the artboard's: **the pill is pinned** (the export draws one inside
  each card, so it would travel with the drag) at the export's own 8px right inset; and it
  is **below the card rather than inside it** — the owner asked for air between the two, so
  it starts 240px down (the card's own bottom edge is 224: a 40px seat plus 184 of card),
  which is a 16px gap, and the band grew from the artboard's 224px to **288px** (240 + the
  48px pill) so the pill stays inside the band and the column's 8px gap still separates it
  from the quick-log row. The 8px right inset is unchanged on purpose: it is what keeps the
  pill's right edge lined up with the card's, so **do not trade that alignment away** for
  more padding — the gap goes vertically, never horizontally; **the
  release re-stacks** — the export drops the front card 160px and re-indexes 300ms later,
  which drew a card below the band over the quick-log row, so the pulled card instead
  travels up to the back seat while the card behind takes the front, with no drop and no
  timer (the start is in the release handler and a layout effect, so no frame paints the
  new front before it moves); and **the 40px detent ticks** through `hooks/useTick.ts`,
  fired from the pointer handlers because that is the only place iOS will play its
  switch click. The cards are a stack, not a carousel of pages: the seats are `0` and
  `REST` (−40), never anything below, and a pull is clamped to 120.
- **The date container is the owner's newer one, and it is a scroll rather than a
  step.** `components/DateWheel.tsx` holds it. The geometry is still the artboard's —
  radius 800, one fifteenth of the arc per capsule, `rotY(−9°·n)`, scales
  1.15/1/0.9/0.78/0.7, opacity 1/1/0.8/0.4/0, only ±3 reachable — but **the gesture is
  not the old wheel's**: one virtual scroll offset drives every capsule on every frame
  (so a finger moves the row one-to-one), a flick keeps its inertia and `modifyTarget`
  snaps the projected end-point to the nearest multiple of the ~69px capsule pitch, and
  every capsule that crosses the axis plays a light haptic (`hooks/useTick.ts`:
  `navigator.vibrate(8)` on Android; on iOS a scripted click through an
  `<input type="checkbox" switch>`'s label). Two things about the iOS half: the switch
  **must stay rendered** — 1×1, transparent, `pointer-events: none` — because a
  `display: none` switch is one iOS never lays out and never ticks for, which is why
  the first version was silent on the owner's phone; and the whole trick is a side
  effect of a control rather than an API, so it is version-sensitive (scripted clicks
  have been reported to stop ticking from iOS 26.5, where only a real tap does). A
  silent wheel is the accepted fallback — never let the tick become something the UI
  waits on. The old 60px-per-step / 24px-threshold / three-at-a-time
  arithmetic is **gone on purpose — do not reintroduce it**: it is what made the row
  step on release instead of following the thumb. Taps and the keyboard move the row
  with a spring (stiffness 320, damping 28); the theme toggle's curve is still the
  artboard's own `cubic-bezier(.34,1.56,.64,1)` overshoot rather than a spring, because
  that is what the design drew. The container's two idle colours (`--pill`,
  `--pill-ink`) are its own tokens: the capsule rests on the card in dark and on the
  canvas in light, so neither can be a fixed utility.
- **The wheel holds one month, from its 1st**, and opens on the anchor's own day —
  the newest row (or today, with nothing imported), not the last capsule. The ongoing
  month runs from the 1st to **today**; a month behind us runs to its last day. It was
  a fifteen-day window until the owner pointed out October could only go 23→9: the
  first of a month was unreachable by dragging, so the model no longer clips the
  window. The chevron beside the month is the way to the months behind it: a Radix
  menu of the months the history touches (`LedgerModel.months`), each anchored on the
  newest day *in that month* rather than on its end, so picking one cannot open on an
  empty sheet. Selecting the month already showing is a no-op.
- **The two budgets are two different questions, and both belong to the owner.** The
  dashboard's envelope card is Food & Beverages out of **₹1,500**; the stats dial is every
  expense out of **₹5,000**. They were one figure once (the card and the dial both counted food
  against ₹5,000), and that is exactly the state the owner split apart — do not merge them
  again, and do not derive one screen's figure from the other's. Each limit is changed where
  it is drawn: a hold on the envelope card or on the dial opens
  `features/budget/BudgetSheet.tsx`, which reuses the manual entry's keypad, haptics and 40px
  money type, starts on the current limit, and writes `lib/budget.ts`'s store (`trackit-budgets`,
  integer paise, cached snapshot). Three details are load bearing: **the hold is
  `hooks/useLongPress.ts` for both cards and for a ledger row** (500ms, 10px slop so a scroll
  cancels it, a 20ms tick when it fires, and `contextmenu` / `Enter` as the desk and keyboard
  paths — a hold must never be the only way in); **the models take the limit as an argument**,
  so a save redraws only what changed and the derivation stays pure; and **the panel is fetched
  on the first hold** like every other panel, because only the dashboard may be in the entry
  chunk. The tick at the hold's moment is a timer rather than a touch, so iOS may stay silent —
  the same accepted fallback as everywhere else.
- **A ledger row is deleted by holding it, through a confirm.** `components/LedgerScreen.tsx`
  arms the row (`Delete this entry?`, naming its title, category, time and amount), and only
  that panel's **Delete** writes: `lib/ledger.ts`'s `removeFromLedger` rewrites the store minus
  the one id — budgets untouched — so every screen subscribed redraws and the row stays gone
  after a reload. Three things are deliberate: **it is a confirm, not an instant delete**,
  because a hold is easy to do by accident and a row cannot be recovered from a list; **the
  save and the delete are the 45ms thud** while a cancel is the 20ms click, the same weights the
  manual entry uses for writing and for not writing; and **the wheel keeps its day** — the
  selection resets only when the *window* changed (a month pick, or the 1st arriving), not when
  a day's cards were rewritten under it (`window[0]?.at` / length), which is what a deleted row
  is. `App.tsx` passes `useLedger`'s `remove`, so the screen never touches storage itself.
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
- **Neue Haas Grotesk is the sans**, with **Helvetica Neue deliberately absent** from
  the stacks: the trial faces carry 74 glyphs, so `%`, `/`, `:`, `+`, `·`, `−` and `₹`
  come from the next family, and naming Helvetica Neue is what made a Neue Haas screen
  read as Helvetica on a Mac. The trial's EULA forbids web embedding; the owner has
  chosen to ship it on their personal site anyway, and the licence travels beside the
  files. `tools/vendor-neue-haas.py` is what converts them.
- **The serif has two optical sizes, and they are not interchangeable.** Anthropic Serif
  **Display** (the greeting, the screen titles, the ledger's month) is drawn for 24px and up;
  Anthropic Serif **Text** (`font-editorial` — Regular and Regular Italic, converted by
  `tools/vendor-anthropic-serif-text.py`) is the reading cut for everything under that: the
  note after a transaction's bullet, an input placeholder, the quiet line beneath a dashboard
  figure. `font-serif` is the display cut and `font-editorial` the text one, so a component
  that sets 12px has to ask for the serif it means and the two roles cannot drift into each
  other. The month above the wheel and the split transaction subheaders (category in the
  sans, note or clock after `·` in the text serif's italic) are the owner's newer typography.
  The `tracking-tight-hero` / `tight-title` / `wide-tag` ladder lives in `index.css`'s
  `@theme`, which is this project's tailwind config — there is no `tailwind.config.js` under
  Tailwind v4, and Helvetica Neue stays out of the sans stack for the reason below.
- **The add-record pill is the manual entry's door.** The dashboard's pinned pill (over the
  account stack, where the artboard drew "Add card") reads **Add Record** and opens
  `features/manual-entry` — a full-screen spring sheet (380/32/0.8) that slides up, drags
  down from its header, and dismisses past 150px. Inside: the amount at 56px Neue Haas
  Grotesk Display Bold with a 24px clay rupee superscript, the UPI/Cash tray, two journal
  lines whose placeholder is Anthropic Serif Text italic and whose typed value is upright
  sans, and the six Wallet parent dimensions as a bento matrix (14% colour wash in dark, 10%
  in light, 35% border; the chosen tile scales to 0.97 and the rest fade to 0.4). **A parent
  tile both selects that parent and opens its tray** of sub-category pills — Lucide icons in
  a 20% (dark) / 12% (light) wash with a solid border and white ink on the one chosen, and
  every pill files under a real `lib/categories.ts` id rather than an invented leaf: where
  Wallet has one envelope for two intents (`bar-cafe` is the cafe and the bar, `tv-streaming`
  is Spotify and everything else you subscribe to) two pills share the id and are told apart
  by key. **`Friends` is one of those envelopes**, and it is offered now: it sits under Life &
  Leisure (whose tile reads **Life & Leisure**, not Wallet's lowercase *leisure*), and
  `lib/refile.ts` no longer re-homes `friends` to the dimension — the ledger keeps the owner's
  own filing for money spent on other people. The closed row reads `Parent • Sub` — sans, bullet, editorial serif italic at 60% —
  a pick folds the panel after 250ms, and `Done` in the panel's own header folds it with the
  parent alone, which is the only other way to bring the keypad back. Haptics are
  weighted in `lib/haptics.ts` — 8ms digits, 20ms backspace/decimal, 45ms confirm — which on
  iOS are one/two/three clicks of the root switch, because the platform has no length to
  vary. A confirm converts the sheet's rupees to integer paise once and appends one
  `source: "manual"` row; the sheet's module is fetched on the first press, so it is not in
  the entry chunk. **The sheet can be opened with a category already chosen**: a quick-log chip
  hands in the envelope its own rows were filed under (`quickActions` in `lib/derive.ts` carries
  the id, `App.openEntry` takes it, `SheetProps.category` seeds the screen's state), so
  `LOG RESTAURANTS` arrives on *Food & Beverages • Restaurants* with the keypad up, exactly as
  the add-record pill opens it — and the pill hands in `null`, because a blank entry is what *it*
  means. The screen unmounts with the sheet, which is why the seed cannot outlive one open. The
  sheet's own title is the editorial serif italic at 18px (`text-[18px] leading-7`), one step up
  from the 15px captions the same face sets elsewhere. **On the add-record screen that title is
  the Expense/Income switch** (the owner's ask: one screen records both directions): two
  segments in a `bg-card` tray, the live one on a `bg-canvas` seat, `role="radiogroup"` named
  *Record type*, ticking at the light weight and keeping its presses off the header's drag. It
  is a **kind, not a sign** — `ManualEntry.kind` goes into the row's `kind`, `amountCents` stays
  positive, and every "spent" figure in `lib/derive.ts` filters on the kind, so an income can
  never be counted as spending. Switching kind clears the category and remounts the mosaic,
  because the picker draws a **second tree** for money in: the same six-tile bento, its parents
  Salary & Bonus / Interest / Freelance / Refunds / Gifts & Winnings / Other, every pill an
  envelope from Wallet's Income group (nothing invented — `wage-invoices`, `dues-grants`,
  `interests-dividends`, `refunds`, `income-gifts`, `income`, `rental-income`, `sale`,
  `checks-coupons`, `lending-renting`, `income-lottery`, `income-child-support`, `allowance`),
  with the same pixel geometry as the expense mosaic. The confirm reads **Add Income** for money
  in and **Add Record** for money out, the rupee mark turns sage, and the journal line asks *Who
  paid you?*. **A scanned payment never shows the switch**: a code being paid is always money
  out, so that screen keeps the plain `New expense` title.
  **The same sheet is the scanner's payment
  screen** (see the UPI bullet below): the tray gives its 56px to a box naming the payee, the
  keypad may arrive prefilled with the code's own amount, and the confirm reads **Pay and Log
  Transaction** — a payment to a UPI address is from the UPI account, so an account control
  there could only be a lie.
  **The sheet carries the moment.** A 36px pill on the amount canvas's free top-right — under
  the header, opposite the figures — reads `Today · 2:14 PM` / `Yesterday · 9:05 AM` /
  `Oct 12, 2026 · 9:40 PM` and opens `DateDialog`
  (`features/manual-entry/DateDialog.tsx`), a Monday-first month grid of 36px days with a
  native `time` field, a `now` button and a `done` button under it. It is on the **canvas**
  deliberately: the closed column is exactly full on a 390×844 phone, so a date row in it
  would push the keypad off the bottom; the canvas's top-right is the one corner nothing else
  owns. Both halves are the owner's: a day tap moves the selection and leaves the card open
  (the time is usually the next thing wanted), the field sets the time on that day, `now`
  resets both, and **`done` is the only way out** — the owner's ask, after the card kept
  closing while they were adjusting the time. There is no ✕ and the scrim is a dim, not a door:
  the card used to close on a scrim click, and on a phone the tap that dismisses the platform's
  own time wheel lands on that scrim. Nothing here closes on a timer either — a card left open
  stays open — and because it always opens on the moment the pill is already showing, pressing
  `done` without touching anything changes nothing, which is what makes a cancel unnecessary.
  Escape still cancels on a desk (and is swallowed, so it cannot close the sheet behind).
  **The months cycle.** The chevrons step one month, and the grid is dragged sideways — the
  month follows the finger under 0.12 elastic and pages past ~32px or a flick, the grid box's
  height animating to the month showing (a five-row February leaves no blank row). A swipe is
  not a tap: `paged` holds off the day buttons for 320ms after one, so paging cannot quietly
  move the selection. **The selection travels with the month** — the day keeps its number where
  the month has it (31 → 30 → 28) and never passes today — because `done` commits what the grid
  shows. The dialog cannot reach forward — the next chevron and every day after today
  are disabled — and unlimited back.
  **It starts on the current moment**, which is the default the owner asked for, and
  `ManualEntry.at` is a whole moment rather than a day: a backdated row carries the hour it
  actually happened at, and two rows typed for the same forgotten day order the way they
  happened rather than the way they were typed. **A scanned payment wears the same pill**
  (it used to be hidden): a receipt is often typed up after the fact, and `logPaidPayee`
  files the row at `PaidDraft.at` — the payment screen's own moment, untouched unless the
  owner moves it.
  **The mosaic is one surface whose height animates** — the row and the open panel are the
  same element, 56px closed and the sheet's measured room open — and the shape of that
  animation is a decision, not an implementation detail. It used to be two elements sharing
  a Framer `layoutId`, and the morph scaled the whole mosaic (tiles stretched non-uniformly,
  the card translucent for long enough that the leaving keypad showed through it) while the
  exiting keypad kept its 248px in the flow, so the panel grew part of the way, stalled, and
  snapped the last 265px in one frame. Three things hold the current behaviour up: the panel
  is one `motion.div` with `animate={{ height }}` and **no `layoutId`**; `ManualEntryScreen`
  measures the room the panel may take (column height less the account tray and one gap) and
  passes it down as `room`; and the keypad leaves with `AnimatePresence mode="popLayout"` so
  it vacates the layout on the first frame while it slides away, with the panel at
  `relative z-10` over it. The journal lines deliberately stay *in* the flow on the way
  open — their 92px of collapse is what carries the panel's top edge upward while its own
  height pushes the bottom down, which is the whole travel of the expansion. Closed, the
  mosaic is still mounted at zero opacity and `inert`, and a transparent button over the
  card is the tap target.
- **The greeting is Anthropic Serif Display, in two styles of one family.** The owner
  chose the face and supplied the two static Medium cuts; `"Hello,"` is the Medium
  Italic and the name the Medium roman, both registered in `index.css` with an explicit
  weight and style (`tools/vendor-anthropic-serif.py` converts them). It is the one
  thing in the app that departs from the artboards' own type. **No licence came with
  the files** — the notice beside them says so, and it is the same knowing posture as
  Neue Haas Grotesk's trial. If a serif question comes up again, that is the family to
  extend rather than swapping in a third.
- **The greeting says hello in a different language every open**, which is the owner's
  ask and the one thing on screen that is neither data nor design. It is **fifty greetings
  in fifty languages — the world's most spoken ones, romanized into latin letters** — and
  the same fifty exist twice on purpose: as rows in the `greetings` table in D1, which
  `backend/` serves, and as the array in `lib/greetings.ts` that ships in the bundle, which
  is what makes the first render instant and offline. `lib/rotation.ts` walks the array and
  remembers what it has just shown, `hooks/useGreeting.ts` composes the line, and
  `lib/hello.ts` asks the server for a row. Three rules go with it: **a word is on screen
  in the first render** and a server's answer only ever replaces it — never a wait and never
  an error state; **an answer must survive `validateGreeting`** (one latin word the serif can
  draw, a plausible tag) or the bundle's word stands, and that guard covers a row somebody
  added to the database by hand as much as it ever covered a model; and **no key ever goes in
  the bundle** — nothing in the greeting needs one any more, and the parked `?gemini_key=…`
  path below must stay out of the arrival path.
- **The greeting is data, and the database is where it can be changed.** `lib/greetings.ts`
  is the source the table is seeded from (the Worker imports it, so the fifty in D1 and the
  fifty in the bundle cannot drift apart), and a word is corrected the same way a row of
  money is: one `wrangler d1 execute` against the live database, no rebuild, no redeploy.
  **The seed is decided by the draw, not by a flag** — `POST /api/greeting` fills the table
  only when a request finds it empty, so a fresh deploy fills it on its first greeting, a
  table somebody emptied fills again on the next request, and a word edited by hand is never
  overwritten. That is why `ensureGreetings` (the DDL, cached per isolate) and
  `seedGreetings` (the rows) are two functions: keep it that way, or "empty the table" stops
  being a way to put the deployed list back.
- **The route is public and holds nothing.** `backend/`'s `/api/greeting` is the one route
  there that is not behind the Shortcut's token, and the reason is that there is nothing to
  guard: no key, no name, no money — fifty hellos and which one to draw. What it can spend is
  the day's D1 reads, and a script that hammered it would take the greeting down to the
  app's own fifty; that is a graceful failure, which is why there is no rate limiter here.
  The limiter in `app/api/greeting.ts` belongs to the parked model route, where the thing
  being protected is a key's quota rather than a table.
- **The parked model is parked, not deleted.** `lib/gemini.ts` (the question, the model, the
  parse), the `askModel`/`geminiKey`/`rememberKeyFromUrl` half of `lib/hello.ts`, and
  `app/api/greeting.ts` (a key held server-side, with the per-caller and global rationing)
  all still work and nothing calls them: a model will be wanted for something else in this
  project. Do not wire them back into the greeting, and do not delete them to tidy up. The
  key lives in the gitignored `backend/.dev.vars`; production would want
  `wrangler secret put GEMINI_API_KEY`.
- **The table is checked against the font, not eyeballed.** `tools/vendor-anthropic-serif.py`
  reads every `word:` out of `lib/greetings.ts` and fails if either cut cannot draw one
  of those characters — the check exists because a missing glyph is finished by Georgia,
  and one masthead line in two typefaces is the whole risk of this feature. It covers what
  the app ships; a word added straight into D1 is checked by `validateGreeting` at the
  masthead instead, which refuses it rather than drawing it in two faces.
- **Panels the design does not draw are the app's own, and wear the app's clothes.**
  `components/DataSheet.tsx` is not in any artboard, so it is built from the same
  tokens — 48px circles with a hairline in a header, `bg-clay text-on-clay` for the
  primary action, 20px radii — and it follows the theme like everything else. The
  scanner *is* drawn now (`Scanner.dc.html`), so it is held to the artboard's own
  numbers instead.
- **Import and export are written and unwired.** `components/DataSheet.tsx` is whole —
  the file input, the two exports, the two-tap clear, the report wording — and nothing
  mounts it, because the owner is placing it themselves. `useLedger` still exposes
  `importHistory` and `clear`; do not delete either as dead code, and do not "fix" the
  missing entry point by inventing a new one without asking.
- **The UPI scanner's payment screen is the manual entry, at the owner's request.** Every
  code it reads opens `features/manual-entry` as a payment screen (the owner's ask: the same
  add-record screen, with the money and the category filled in): the payee's box takes the
  account tray's 56px, the keypad is prefilled when the code carried an amount, the confirm
  reads **Pay and Log Transaction**, and everything else — the mosaic, the journal lines, the
  drag, the 18px serif title — is the sheet the pill opens. Three details are load bearing:
  **the row is logged before any payment is handed off** (the handoff is one-way, so a row
  written afterwards is a row a crash can lose), **the amount handed over is the one on
  screen** (same paise, no re-derivation), and the handoff happens only where something can
  take it (`handOffToUpiApp` — a phone), because on a desktop there is nothing to open. The
  link names Google Pay (`gpay://` on iOS, an `intent://` pinned to its package on Android)
  and falls back to the generic `upi://` link on an iPhone that stays on screen, because a
  custom scheme nothing claims is ignored silently. `features/upi/logScan.ts` is the only thing
  that writes a scanned row and returns the sentence the status line shows; keep the id the
  payee plus the amount, so re-paying a code is the same row rather than a second one. Do not
  reinstate an instant log for codes that carry an amount: the owner wants the screen. The
  scanner itself is the second artboard, so keep it at that geometry: the frame is 358×358 at
  224px plus `--safe-top` (the hint is the one absolute one, and carries it in its `top`) and
  the manual row 724px down, and the frame holds the live camera where the artboard paints a
  code.
- **`backend/` is the Shortcut's endpoint and the greeting's server, and the app calls
  exactly one of its routes.** That one is `POST /api/greeting`, which draws a random row
  out of `greetings`; every expense route is the Shortcut's, stays token-guarded, and is
  untouched by the app. The two screens still read and write only the device's own ledger —
  do not wire them to the expense routes without saying why.
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
| The account stack's pill | at 390 wide: the band is 288px, the front card's bottom edge is at 224 inside it, the pill's top is 240 (**a 16px gap**) and its bottom is the band's own 288, its right edge is 8px inside the card's (`right: 374` against the pill's `366` — the alignment the owner asked to keep), and the quick-log band starts 8px below the pill; pulling a card past 40px still re-stacks it without moving the pill |
| The palettes | every palette in `PALETTES` has a stylesheet block and the boot table, and its `canvas` matches both; each block states **all twenty-one tokens** (a missing one silently inherits the block above it) and `color-scheme` agrees with the register's theme. For each one: canvas, card, hairline and ink by computed style (read *after* the 120ms repaint — a read in the same task catches the previous palette, because the tokens transition); the toggle's `aria-pressed`, its label, and the stored choice after a reload; a browser holding only the legacy `trackit-theme` lands on that theme's default palette; and **the dark palette picked before the toggle is still the one it comes back to** (`trackit-palette-<theme>`). Contrast, per palette: ink-on-canvas, ink-on-card, ink2-on-card, on-clay-on-clay and on-sage-on-sage — the artboards' own paper sits at 15.06 / 16.26 / 4.34 / 5.57 / 4.33, and a new sample should not be worse than the paper it is a variation of. **Timing:** every text element must start its repaint on the same frame and be finished inside 150ms — read `getComputedStyle(el).color` each animation frame *from inside the change* (start the sampler, then perform the change in the same task, so the zero point is the click rather than the round trip), compare each element against its own final value, and repeat across a toggle, a same-theme pick and a cross-theme pick. `documentElement` must list the colour tokens as its `transition-property`, and no text element may list `color` |
| The date container | a real mouse drag: the row follows the finger mid-drag (read the active capsule's centre before release, not just after), a slow 48px drag lands on one day, a flick travels and still lands exactly on a capsule (centre error 0), dragging past either end holds at it, a tap selects the capsule tapped, the arrow/Home/End keys move and keep the focus, and **the first capsule is the 1st of the month** (Home reaches it, centred). On Android ticks are `navigator.vibrate` calls (count them by replacing it); with an iPhone user agent the switch is the only path — check `input[switch]` computes `display: block` rather than `none`, that `label.click()` toggles its `checked`, that a real drag counts one toggle per capsule crossed, and that `navigator.vibrate` is never called. With CDP: `Emulation.setSafeAreaInsetsOverride` at top 47 makes `pt-safe` compute 79px |
| The ledger's month menu | with real rows: the months listed, the marked one, and that picking an older one moves the window |
| The two budgets | with no stored limits: the dashboard card reads **F&B Budget**, ₹1,500, and counts only `food-drinks` rows this month (a taxi or a rent payment must not move it) while the stats dial reads **Total this month** and counts every expense; the pill, the needle and the filled segments agree on the same percentage; the chips are the dimension's subcategories with their share of the food spend; a month with no food spend draws ₹0 / 0% with no chips. A hold (or Enter / right-click) on either opens the keypad editor on that card's own limit — Android `navigator.vibrate` 20ms for the hold, then **8ms per digit and 20ms for `.`/backspace** exactly as the entry keypad does (both sheets render the same `Keypad`, which ticks on `pointerdown`), iOS the switch clicks — and saving rewrites `trackit-budgets` and redraws the card and the dial. The food limit must not move the dial's figure or the reverse; a limit changed while the ledger is empty still shows on the demo card; the total saved from the dial survives a reload |
| Deleting a row | a hold on a ledger card (or Enter / right-click) opens **Delete this entry?** with that row's title, category, time and amount; a scroll cancels the hold; **Keep It** leaves the store untouched, **Delete** removes that id from `trackit-ledger`, shrinks the day's list and this month's totals, survives a reload, and leaves the wheel on the day it was showing; Android vibrates 20ms on the hold and 45ms on the delete |
| The importer | with `DataSheet` unwired, drive `readHistory` + `appendToLedger` in the page (Vite serves them as ES modules: `await import('/src/lib/history.ts')`), then check the stored row count and work the balance out from the stored rows by hand |
| The scanner | both themes, the frame's 358×358 at 224px and the manual row at 724px against the artboard, and the camera's failure copy where there is no camera (a desktop) |
| The add-record date and time | the pill reads `Today · 2:14 PM` on the amount canvas's top-right (the sheet's own clock) and does not overlap the amount at 390×844; tapping it opens **When was this?** on the current month with today selected and the time on the current minute; the next chevron and every future day are disabled, *now* puts day and time back on the current moment, and a previous month's chevron works and is unbounded backwards; **a swipe across the grid pages a month each way and never picks the day under the finger**, and the day travels with the month (its number clamped, never past today); **nothing closes the card but `done`** — no ✕ is drawn, a tap on the scrim leaves it open, and it is still open after several idle seconds and after the platform's own time field has been used — while Escape cancels on a desk; tapping the 12th leaves the card open and selects the 12th; setting `09:40` and pressing **done** relabels the pill `Oct 12, 2026 · 9:40 AM`; confirming writes a row whose `at` is that day at 09:40 (not midnight, not now, and in that day's order), the ledger opens on that day with the row, the dashboard's recent list says `Oct 12`, and the totals include the amount; a scanned payment wears the same pill and logs at the moment it shows |
| The add-record switch (expense/income) | the header carries a **Record type** radiogroup only on the add-record screen — a scanned code's payment screen has the plain `New expense` title and no switch; **Income** draws the income mosaic (Salary & bonus / Interest / Freelance / Refunds / Gifts & winnings / Other) at the **same pixel geometry** as the expense tiles, its pills file `wage-invoices` / `interests-dividends` / `dues-grants` / `refunds` / `income-gifts` / `income` and their children, the rupee mark turns sage, the journals ask *Who paid you?*, and the confirm reads **Add Income**; confirming appends one row with `kind: "income"` — so no spent figure, envelope or budget on either screen moves — and its ledger card is the sage `+₹…` one under the *Income* tag; switching back to Expense clears the category, and no expense category can be carried into the income tree or the reverse. The **Friends** pill sits under **Life & Leisure** (the tile's caption is capitalised like that, not `Life & leisure`), files the row as `category: "friends"`, and that id **survives a reload** — `lib/refile.ts` must not move it to `life-entertainment` |
| The payment screen | a hand-typed code — with or without `am` — must open the sheet, with the payee's name and address in its box, the amount **empty** without an `am` and **prefilled** with one, the confirm reading **Pay and Log Transaction** (not **Add Record**), the date and time pill present and starting on the current moment (`at` on the logged row follows it), and `Category: … Change category` still working; entering `1,250` must log ₹1,250.00 (commas are grouping in this app's money, not decimals) under the payee's own title, with the VPA in the note; the row must be in `trackit-ledger` **before** any handoff, and the handoff must carry the same paise (`gpay://upi/pay?…am=1250.00…` on an iOS user agent, an `intent://…package=com.google.android.apps.nbu.paisa.user` one on Android); on a desktop nothing may navigate away; and a code read while the sheet is open must not change the payee under it |
| The greeting | two loads in a row, which must give two different languages; `data-greeting` on the `h1` says whether the table or the bundle answered; every word is drawn by the serif and never finished by a fallback face; a word is on screen in the first render (an endpoint that takes seconds must not be waited on); and an endpoint that is slow, absent or refused leaves that word standing with no error state |
| The greeting's table | `wrangler dev --config backend/wrangler.toml --port 8787` against local D1, then drive `POST /api/greeting` with curl or a script: one row out of fifty, `{ greeting }` with no escaping damage, `no-store`, `access-control-allow-origin: *`, `GET` → 405 and `OPTIONS` → 204, an `avoid` list that is honoured and then dropped rather than refused when it names every language, and a junk body that answers anyway. Check the seed: the first request against an empty table fills it, `DELETE FROM greetings` + the next request fills it again, and a hand-edited word survives both. Then point the app at it (`VITE_GREETING_ENDPOINT=http://127.0.0.1:8787/api/greeting npm --prefix app run dev`) and watch the heading become a row from the table with `data-greeting="server"` |
| The parked model route | still, if it is ever woken up: `node_modules/.bin/esbuild app/api/greeting.ts --bundle --format=esm --platform=node --outfile=/tmp/greeting.mjs`, then import it in Node with `globalThis.fetch` stubbed and `GEMINI_API_KEY` set and ask it a Request. Vercel is a deploy target, not a thing to install — the handler is a plain `fetch`, so Node is enough. 200 and `{ greeting }`, same-origin with no CORS header, an allowed `Origin` echoed with `Vary`, a refused one 403, `OPTIONS` → 204, `GET` → 405, an unusable answer 502, and no key 503 without a call upstream |

`app/design/` is what to compare against when the question is "has a design feature
been lost or changed".
