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
  stretched, and it keeps the artboard's 24/16/32 padding.
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
  ask and the one thing on screen that is neither data nor design. `lib/greetings.ts`
  holds the pool and the per-open rotation, `hooks/useGreeting.ts` composes the line, and
  `lib/hello.ts` may ask a model for a language the pool lacks. Three rules go with it:
  the pool's word is on screen first and a model only swaps in after — never a wait and
  never an error state; a model's word must survive `validateGreeting` (one latin word
  the serif can draw) or the pool's stands; and **no API key ever goes in the bundle.**
  The key is either the owner's own, pasted once as `?gemini_key=…` and kept in that
  browser, or it lives in a server-side proxy the build is pointed at with
  `VITE_GREETING_ENDPOINT`. A key compiled into a public build is a key anyone can spend.
- **The question a model is asked is written once.** `lib/gemini.ts` owns the prompt, the
  model, the request and the parse, and it is deliberately portable — no `import.meta`,
  no `window` — because two different runtimes import it: the browser, when the owner has
  brought their own key, and `api/greeting.ts`, the Vercel function that holds the key for
  every visitor. Change the prompt or the accepted answer there or not at all; editing one
  caller is how the two routes start disagreeing about what a greeting is.
- **`api/greeting.ts` is the greeting's server, and it is not `backend/`.** Vercel builds
  every file in the project's root `api/` directory, and this project's Root Directory is
  `app/`, so the function answers on the *site's own origin* at `/api/greeting`. The
  contract is one way: `POST { avoid: string[] }` in, `{ greeting: { word, language,
  lang } }` out, anything else 502, and no key 503 (the app keeps the pool's word for
  every one of those). It asks nothing of a caller but a list of languages *not* to pick —
  it is not a proxy for the model. The Worker in `backend/` stays what it is, the
  Shortcut's endpoint; the app still does not call it.
- **A public endpoint that holds a key is rationed.** `api/greeting.ts` answers twelve
  requests a minute per caller and 240 a minute altogether, and refuses the rest with
  `429` and a `Retry-After` the app treats like any other failure — the pool's word
  stands. The counters are one `Map` in the instance's own memory and nothing more: a
  cold start forgets them, a second instance has its own, and `x-forwarded-for` is a
  header a caller can write. That makes a stray loop or a crawler pointless, which is the
  job; it is not a firewall, and if this endpoint ever matters it wants a WAF rule or a
  shared counter in front of it rather than a bigger `Map`. `allow()` is exported and
  takes `now` as a parameter precisely so a test can step past a window instead of
  waiting a minute for it.
- **The pool is checked against the font, not eyeballed.** `tools/vendor-anthropic-serif.py`
  reads every `word:` out of `lib/greetings.ts` and fails if either cut cannot draw one
  of those characters — the check exists because a missing glyph is finished by Georgia,
  and one masthead line in two typefaces is the whole risk of this feature.
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
- **The UPI scanner logs a row, it does not pay.** A code that carries an amount is
  logged under **Wallet - OneClick record**; one without says so instead of guessing
  (`features/upi/logScan.ts`, which returns the sentence the status line shows).
  Nothing hands a `upi://` link to another app yet, and the pay sheet is a screen this
  design does not have. The screen itself is the second artboard, so keep it at the
  artboard's geometry: the frame is 358×358 at 224px and the manual row 724px down,
  and the frame holds the live camera where the artboard paints a code.
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
| The importer | with `DataSheet` unwired, drive `readHistory` + `appendToLedger` in the page (Vite serves them as ES modules: `await import('/src/lib/history.ts')`), then check the stored row count and work the balance out from the stored rows by hand |
| The scanner | both themes, the frame's 358×358 at 224px and the manual row at 724px against the artboard, a hand-typed `pa=name@bank&am=12.50` logging exactly one row under Wallet - OneClick record, and the camera's failure copy where there is no camera (a desktop) |
| The greeting | two loads in a row, which must give two different languages; `data-greeting` on the `h1` says whether the pool or a model answered; every word is drawn by the serif and never finished by a fallback face; and with a key set, the request that goes out is one sentence to the Interactions API (or to `VITE_GREETING_ENDPOINT`) and its failure leaves the pool's word on screen |
| The greeting's server | `node_modules/.bin/esbuild app/api/greeting.ts --bundle --format=esm --platform=node --outfile=/tmp/greeting.mjs`, then import it in Node with `globalThis.fetch` stubbed and `GEMINI_API_KEY` set: ask it a Request and read the Response. Vercel is a deploy target, not a thing to install to find out whether the endpoint works — the handler is a plain `fetch`, so Node is enough. Check the 200 and the `{ greeting }` shape, the same-origin answer with no CORS header, an allowed `Origin` echoed with `Vary`, a refused one getting 403, `OPTIONS` → 204, `GET` → 405, an unusable model answer → 502, and no key → 503 without a call upstream. Then drive it from the app: run the bundle behind loopback HTTP and `npm --prefix app run dev -- --port 4325` with `VITE_GREETING_ENDPOINT=http://127.0.0.1:4399/api/greeting`, and watch the heading become the model's word with `data-greeting="model"` |

`app/design/` is what to compare against when the question is "has a design feature
been lost or changed".
