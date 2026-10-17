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
- **The UPI scanner logs a row; the money screen is what fills in an amount.** A code
  that carries an amount is logged on the spot under **Wallet - OneClick record**; one
  without opens `components/PaySheet.tsx` — **the retired app's `UpiPaySheet.tsx` brought
  back at the owner's request**, whose structure and wording are therefore not this design's
  to re-imagine, and which the owner is restyling themselves. Two of its details are load
  bearing: **the row is logged before any payment is handed off** (the handoff is one-way, so
  a row written afterwards is a row a crash can lose), and the handoff happens only where
  something can take it (`canHandOffToUpiApp` — a phone), because on a desktop the generic
  `upi://` link is a scheme nothing claims. `features/upi/logScan.ts` is the only thing that
  writes either row and returns the sentence the status line shows; keep the id the payee
  plus the amount, so re-reading a code is the same row rather than a second one. The scanner
  itself is the second artboard, so keep it at that geometry: the frame is 358×358 at 224px
  plus `--safe-top` (the hint is the one absolute one, and carries it in its `top`)
  and the manual row 724px down, and the frame holds the live camera where the artboard
  paints a code.
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
| The theme | both palettes' canvas, card, hairline and ink by computed style *and* by pixel; the toggle's `aria-pressed`, its label, and the stored choice after a reload |
| The date container | a real mouse drag: the row follows the finger mid-drag (read the active capsule's centre before release, not just after), a slow 48px drag lands on one day, a flick travels and still lands exactly on a capsule (centre error 0), dragging past either end holds at it, a tap selects the capsule tapped, the arrow/Home/End keys move and keep the focus, and **the first capsule is the 1st of the month** (Home reaches it, centred). On Android ticks are `navigator.vibrate` calls (count them by replacing it); with an iPhone user agent the switch is the only path — check `input[switch]` computes `display: block` rather than `none`, that `label.click()` toggles its `checked`, that a real drag counts one toggle per capsule crossed, and that `navigator.vibrate` is never called. With CDP: `Emulation.setSafeAreaInsetsOverride` at top 47 makes `pt-safe` compute 79px |
| The ledger's month menu | with real rows: the months listed, the marked one, and that picking an older one moves the window |
| The importer | with `DataSheet` unwired, drive `readHistory` + `appendToLedger` in the page (Vite serves them as ES modules: `await import('/src/lib/history.ts')`), then check the stored row count and work the balance out from the stored rows by hand |
| The scanner | both themes, the frame's 358×358 at 224px and the manual row at 724px against the artboard, a hand-typed `pa=name@bank&am=12.50` logging exactly one row under Wallet - OneClick record, and the camera's failure copy where there is no camera (a desktop) |
| The money screen | a hand-typed code with **no** `am` must open it, with the amount empty and the category guessed from the merchant's name (`Swiggy` → restaurant, `Blinkit` → groceries); typing `1,250` must log ₹1,250.00 (commas are grouping in this app's money, not decimals); the row must be in `trackit-ledger` **before** any handoff; on a desktop nothing must navigate away, and the generic `upi://` link plus the payee's UPI id must be on screen; a code **with** an `am` must still log with no screen at all; and a code read while the screen is open must not change the payee under it |
| The greeting | two loads in a row, which must give two different languages; `data-greeting` on the `h1` says whether the table or the bundle answered; every word is drawn by the serif and never finished by a fallback face; a word is on screen in the first render (an endpoint that takes seconds must not be waited on); and an endpoint that is slow, absent or refused leaves that word standing with no error state |
| The greeting's table | `wrangler dev --config backend/wrangler.toml --port 8787` against local D1, then drive `POST /api/greeting` with curl or a script: one row out of fifty, `{ greeting }` with no escaping damage, `no-store`, `access-control-allow-origin: *`, `GET` → 405 and `OPTIONS` → 204, an `avoid` list that is honoured and then dropped rather than refused when it names every language, and a junk body that answers anyway. Check the seed: the first request against an empty table fills it, `DELETE FROM greetings` + the next request fills it again, and a hand-edited word survives both. Then point the app at it (`VITE_GREETING_ENDPOINT=http://127.0.0.1:8787/api/greeting npm --prefix app run dev`) and watch the heading become a row from the table with `data-greeting="server"` |
| The parked model route | still, if it is ever woken up: `node_modules/.bin/esbuild app/api/greeting.ts --bundle --format=esm --platform=node --outfile=/tmp/greeting.mjs`, then import it in Node with `globalThis.fetch` stubbed and `GEMINI_API_KEY` set and ask it a Request. Vercel is a deploy target, not a thing to install — the handler is a plain `fetch`, so Node is enough. 200 and `{ greeting }`, same-origin with no CORS header, an allowed `Origin` echoed with `Vary`, a refused one 403, `OPTIONS` → 204, `GET` → 405, an unusable answer 502, and no key 503 without a call upstream |

`app/design/` is what to compare against when the question is "has a design feature
been lost or changed".
