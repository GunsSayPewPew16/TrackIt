# TrackIt

A mobile-first expense tracker in three screens: a **bento dashboard** that answers
"where does the money stand", a **daily ledger** that answers "what happened that
day", chosen on a spinning date wheel, and **scan to pay**, which reads a merchant's
UPI QR code and logs the row it carries.

It is a static site — React 19, TypeScript and Vite, Tailwind CSS v4 for styling,
Radix UI for the popovers and the dialog, Lucide for every icon and Framer Motion
for the movement. There is no server: the owner's history is imported from their
own **Wallet (BudgetBakers)** export and kept in `localStorage` on the device.

The screens are a faithful rebuild of three exported design artboards — see
[`app/design/`](app/design/README.md) for the artboards themselves and where each
value in `src/` came from.

## Getting started

```bash
npm install          # installs the root tooling and the app (see app/)
npm run dev          # the app on http://127.0.0.1:4323
npm run typecheck    # app + the Worker's own project
npm run build        # typecheck, then a production build into app/dist
```

`npm run lint` (oxlint) and `npm run preview` (serve the built output) are there
too. Every script at the root is a thin wrapper around `app/`, so the app can also
be worked on directly: `cd app && npm run dev`.

## The screens

**The dashboard** is the artboard's four bands, in its order: the greeting — which says
hello in a different language every time the app is opened, see *The greeting* below —
with its
two round header controls; the balance card, which owns the month's cash flow; a
104px band pairing the scan square with the predictive quick-log tray; then four
cards on the 8px grid — the pace of spending and the month's top category side by
side, the envelope gauge (twenty segments and a needle at the same percentage as
the pill above it), and the recent rows. The ledger is opened from the header's
second circle, beside the theme toggle; the artboard's own "See all" button is gone
from the recent card, where it would have been a second door to the same room.

**The ledger** is one day, chosen on a wheel. The wheel is a circle of radius 800
turned on its side: every capsule is drawn at `translate(800·sin θ, 800·(1 − cos θ))
rotY(−9°·n) rot(θ) scale(s)`, so the far ones curve away and fade out, and only ±3
are reachable. It is **dragged as one row**, not stepped: a single scroll offset drives
every capsule's seat on every frame, so the row follows the finger, a flick keeps its
momentum and lands on the day nearest the middle (`modifyTarget` snapping to the
capsule pitch of ~69px), and each capsule that crosses the axis plays a light haptic
(`navigator.vibrate` on Android, the system's switch click on iOS). The arrow keys,
Home and End move it too. Each day is a stack of **notched cards**: a 358×128 outline
with a step cut out of its top-left corner, the category pill sitting in the cut and
the faces on the step, in one of three treatments — plain, clay for a month's big
expenses, sage for money in.

**Scan to pay** is the artboard of the same name, and is the one screen with no content
of its own: a 48px header (a back circle, the title, the theme toggle), the hint 88px
down, a 358×358 viewfinder at 224px — a sage hairline, four corner brackets and a 2px
line sweeping it from 24px to 332px — and then, at 700px, the small letterspaced label
(each of those offsets plus the safe top above)
and the manual row, a 7fr/3fr grid of the field and the clay **Use it** button. The
frame holds the live camera; see *Scanning a UPI code* below for the one part of the
artboard that is deliberately not rebuilt.

**The dashboard and the ledger show the design until there is something real to show.**
With no import they are drawn from `src/lib/demo.ts`, which is the artboards' own
content — the eleven sample rows, $24,860.40 of balance, October 2026 — written out as
literals. The moment the owner imports a Wallet export, `src/lib/derive.ts` computes the
same two models from their rows and the screens change without knowing it. That switch
is the only place the app decides what it is looking at (`src/App.tsx`).

Every screen starts at the artboards' 24px plus 8px plus whatever the phone reserves
for itself (`pt-safe`): on an iPhone in a home-screen window the page is drawn edge to
edge, and the greeting was the first thing to disappear under the notch.

## The greeting

The dashboard's masthead says hello in a different language on every open — `Bonjour,
Priyansh`, `Nǐ hǎo, Priyansh`, `Ahlan, Priyansh` — and it is a **table of fifty greetings:
the world's most spoken languages, one hello each, romanized into latin letters**
(`Mingalaba,`, `Nei hou,`, `Nong hao,`) so that the one serif face can draw every one of
them.

- **The table is the data, and `backend/` serves it.** `POST /api/greeting` on the Worker
draws one row at random out of `greetings` in D1, skipping the languages the app has just
shown. Adding a language, or fixing a romanization, is one `wrangler d1 execute` against
the live database — no rebuild, no redeploy, and the next app open may draw it. Nothing
has to be run by hand to start: the first request that finds the table empty fills it from
the list the app itself ships.
- **The same fifty ship inside the app** (`src/lib/greetings.ts`), which is what makes the
greeting instant and offline — a word is on screen in the first render, before anything is
asked for. `src/lib/rotation.ts` walks the list in a shuffled order kept in
`localStorage`, so no language repeats until every other one has had a turn, and the
languages just shown are what the server is told to avoid.
- **The server's word replaces the pool's when it arrives** (`src/lib/hello.ts`), and only
if it survives `validateGreeting` — one latin word, letters the serif can draw, a plausible
language tag. Every other outcome, including a network that never answers, leaves the word
already on screen standing, which is why this feature has no error state to show.

Which server, and whether there is one, is a single build variable: `VITE_GREETING_ENDPOINT`.
On the Worker's own domain the app and the route share an origin, so `/api/greeting` — a
relative URL — is the whole configuration, and `npm run deploy` serves both. A build served
from somewhere else (GitHub Pages, say) points at the Worker's absolute URL and the Worker's
CORS headers answer it. **A build with the variable unset has no server at all**, which is
not a broken build: the fifty in the bundle *are* the greeting.

### The model, parked

The greeting used to be a model's word — first from the owner's own key, then from a Vercel
function holding one for every visitor — and saying hello in another language does not need
one, so the greeting no longer asks. The code is kept whole and working for whatever asks a
model next: `src/lib/gemini.ts` (the question, the model, the parse), the parked half of
`src/lib/hello.ts` (`?gemini_key=…` still stores a key in that browser, `askModel` still
asks), and `app/api/greeting.ts` (a server that holds a key and rations it). Nothing points
at any of them, and the key itself lives in a gitignored `backend/.dev.vars` — never in this
repository, and never in a bundle, which is the one rule that has not changed.

## The theme

One set of ten colour roles, two palettes, switched by `data-theme` on `<html>`.
Dark is the default (`#0A0F0D` canvas, `#1A221E` cards, `#28332E` hairlines,
`#F4F0EA` ink, `#D4A373` clay, `#A3B19B` sage); light is `#F8F6F2` / `#FFFFFF` /
`#E2DDD5` / `#1A221E` / `#C58B54` / `#6B7F64`. No component knows which theme it is
drawn in — it says `bg-card` and `text-ink2` and gets the right pair — and every
surface repaints over the design's own 0.35s. The choice is remembered, and a boot
script in `app/index.html` puts it on the document before the first paint so a light
screen never flashes dark.

## Importing, and where the rows live

The importer reads `src/lib/history.ts` — Wallet's own PouchDB backup (the owner's real
export), this app's own JSON, or the JSON other trackers write — skips internal
transfers, keeps income as income, and reuses each document's own id so importing the
same backup twice changes nothing. Rows are paise, integer throughout, and the CSV
divides by 100 once, at the edge.

**It has no way in from the UI at the moment.** The panel that drives it
(`src/components/DataSheet.tsx`) is written and unwired while the owner decides where
it belongs — so today the app cannot take a file, and both screens stay on the
artboards' own content until something calls `useLedger`'s `importHistory`. Wiring it
back up is one piece of state and two props.

Everything imported is kept in `localStorage` under `trackit-ledger`
(`src/lib/ledger.ts`), which is the app's only storage, so a ledger imported by an
earlier build still shows. An import of the owner's four months of history is 122 rows
and 1 envelope; a browser that refuses storage costs a remembered row, never the page.

`tools/wallet-import.py` predates the in-app importer and is still the owner of two
tables the app reads: it writes `src/lib/categories.ts` (every category, with Wallet's
own labels and group colours — an import resolves against this table, so a row keeps
the name and colour it arrived with) and `tools/lucide-icons.py` writes
`src/lib/category-icons.tsx`, the marker each category is drawn with. Change the tool
and re-run it rather than editing either file by hand.

## Fonts

The design is set in **Neue Haas Grotesk**: Display for the headings and the money
figures, Text for everything else, both vendored as woff2 in `app/src/assets/fonts/`
(the conversion and the trial licence are in `tools/vendor-neue-haas.py` and beside
the files). The one serif is the greeting — the language's word in the Medium Italic and
`Priyansh` in the Medium roman — set in **Anthropic Serif Display**, whose two static
cuts the owner supplied and `tools/vendor-anthropic-serif.py` converts. That is three
departures from the artboards' own type, all of them the owner's: the artboards draw
Playfair Display, and both `@font-face` rules state their weight and style so a 400
request can never quietly re-use the 500 cut. Because the word changes language, that
tool also **checks every word in the greeting pool against both cuts** and fails its run
if one carries a letter the faces cannot draw — a missing glyph would be finished by
Georgia and put two typefaces in one masthead line. Two things about the sans stacks are
deliberate:

- **Helvetica Neue is not in them.** The trial faces carry 74 glyphs — letters,
  digits, space and a handful of punctuation — so `%`, `/`, `:`, `+`, `·`, the true
  minus (`−`) and the rupee sign (`₹`) are drawn by whatever comes next in the stack.
  That next is Helvetica, then Arial; naming Helvetica Neue made a Neue Haas screen
  read as Helvetica on any Mac that has it.
- **The licences are not open ones.** Neue Haas Grotesk's trial EULA forbids web
  embedding (`@font-face`) and redistribution without a separate web licence, and no
  licence document came with the two Anthropic Serif files at all; both notices travel
  beside the files. The owner has chosen to publish them on their personal site anyway.
  Buy the licences, or drop the files, before the site is shared more widely.

## Scanning a UPI code

The dashboard's scan square opens **Scan to pay** (`src/components/ScanScreen.tsx`),
rebuilt from `Scanner.dc.html`: the viewfinder with its hairline, brackets and sweeping
line, the theme toggle beside the way back, and the manual row under it for a code that
will not scan — a UPI ID or a whole `upi://` link, through exactly the same parser the
camera's reads go through. Decoding is `@yudiel/react-qr-scanner`: the browser's own
`BarcodeDetector` where there is one, a WASM ZXing build where there is not.

A code that already carries an amount logs **one row** under **Wallet - OneClick
record** (`src/features/upi/logScan.ts`), newest first, so it is what the dashboard's
recent list shows next; scanning the same code twice is the same row, and the status
line says so. **A code that carries no amount opens the money screen**
(`src/components/PaySheet.tsx`, the retired app's pay sheet brought back), because the
amount is the one number this app will not guess: the amount, a category guessed from the
merchant's own name (`Swiggy` → restaurant, `Blinkit` → groceries) and a note in the
owner's words. Paying **logs the row first and hands the payment to Google Pay second**,
in that order and for a reason — the handoff tells this app nothing about what was paid, so
a row written afterwards is a row a crash or a cancelled payment can lose. On a device that
cannot open a UPI app at all (a desktop), and after any handoff, the generic `upi://` link
and the payee's own UPI ID stay on screen to pay from by hand.

The artboard paints a stylised code inside the viewfinder, because a mockup cannot hold
a camera; **this screen holds the camera instead**, and keeps the frame's chrome over
it. The artboard's scrim — a full-bleed mask with the feed punched out of it —
composites to the canvas colour, so the screen simply stands on the canvas and draws
the frame in the card colour rather than reproducing the layer stack.

## What loads first

Nothing renders until the entry script runs, so everything in it is paid before the first
pixel. Only the dashboard is: the ledger and the scanner are two chunks of their own,
fetched when a tap asks for one and again idly once the first screen is up, because the
ledger's month menu is the app's only Radix dependency and the scanner is a whole decoder
(barcode detection, WebRTC shims, and a WASM build fetched from a CDN in turn). That took
the entry from **657 kB to 415 kB — 216 kB over the wire down to 129** — and left the two
screens at 31 kB and 60 kB gzipped, where before they were everybody's download.

Three details are the reason it works rather than merely measures smaller, and `src/App.tsx`
holds all three: the screen is **in hand before the view changes** (the app has no loading
state, so a module is awaited and only then shown, over the screen being left), the two are
**fetched idly after first paint** so a tap is normally instant, and a tap that lands first
**keeps the old screen** rather than flashing an empty canvas. The fonts are deliberately not
preloaded: nothing draws before the script does, so pulling 150 kB of type ahead of it would
only delay the pixels that are actually waiting.

## Deploying

```bash
npm run deploy       # build, then `wrangler deploy` (Cloudflare Worker + assets)
```

**What the site needs is one static host and one route beside it.** It is a Vite build with
no server of its own: GitHub Pages serves it today, and the Worker above serves the same
output (it builds the app first) *plus* `/api/greeting`. That route is why the greeting is
a table and not an array with a redeploy behind it — and why, on the Worker's own domain,
the app needs no configuration to reach it at all.

Pushing to `main` also publishes the same build to GitHub Pages via
`.github/workflows/deploy-pages.yml`, built with `PAGES_BASE=/TrackIt/` so every
asset URL resolves under the project's sub-path. `backend/` is a small
token-protected Worker with a D1 schema — an API for logging a row from an Apple
Shortcut. **The app in `app/` does not call it**: the two screens read and write only
the device's own ledger, and the Worker is kept for the Shortcut endpoint. That command
deploys the Worker and the built app, and with them the greeting's route.

### Standing up the greeting's table

The greeting needs `backend/` for one route, and nothing has to be run to make it work on a
fresh deployment. To do it on a Cloudflare account:

1. **Create the database** once — `wrangler d1 create trackit-db` — and paste the UUID it
   prints into `backend/wrangler.toml`, in place of the placeholder.
2. **Deploy**: `npm run deploy` (build + `wrangler deploy`), which serves the app and
   `/api/greeting` from one origin. For the app on that domain, build with
   `VITE_GREETING_ENDPOINT=/api/greeting` — a relative URL, resolved against the site's own
   origin, so nothing else has to be configured.
3. **A build served from somewhere else** — the GitHub Pages one — can call the same route
   cross-origin by setting the variable to the Worker's absolute URL
   (`https://trackit.<subdomain>.workers.dev/api/greeting`). That is what the route's
   `access-control-allow-origin: *` is for. Leave the variable unset and that build greets
   from its own fifty, which is a complete greeting either way.
4. **Check it**: hover the greeting. The tooltip says `hello in <language>`, and the
   heading itself carries `data-greeting="server"` when the row came out of D1 and
   `"pool"` when the bundle answered.
5. **Add a language whenever you like** — no rebuild, no redeploy:

   ```bash
   wrangler d1 execute trackit-db --remote --config backend/wrangler.toml \
     --command "INSERT INTO greetings (language, word, lang) VALUES ('Maori', 'Kia ora,', 'mi')"
   ```

   The app's own `validateGreeting` still has the last word: a row whose word the serif
   cannot draw, or whose tag is not a tag, is refused and the pool's word stands — a bad row
   costs a greeting rather than the masthead. Run `tools/vendor-anthropic-serif.py` when you
   want a new word checked against the faces properly; it fails the run rather than
   shipping a word that would be finished by Georgia.

**The route is public, and it holds nothing worth guarding.** No key, no name, no money —
fifty hellos and which one to draw, which is why it is the one route in `backend/` that does
not sit behind the Shortcut's token. What it can spend is the day's D1 reads, since every
request draws a random row against that table; a script that hammered it would take the
greeting down to the app's own fifty, which is a graceful way for a greeting to fail and the
reason there is no rate limiter in front of it. (The rate limiter in `app/api/greeting.ts`
belongs to the *parked* model route, where what it protects is a key's quota.)

## Layout

```
app/                    the whole product — one Vite app
  index.html            entry point; the pre-paint theme script lives here
  api/greeting.ts       parked: a model behind a server, and the rationing (Vercel)
  design/               the artboards and the date container, as the design of record
  src/
    App.tsx             which content, which screen, and the cross-fade between them
    components/
      DashboardScreen   the bento dashboard
      LedgerScreen      the wheel's screen: the month menu and the notched cards
      DateWheel         the date container: the arc, the drag, the snap and the tick
      ThemeToggle       the 48px circle that hands the sun to the moon
      DataSheet         import / export / start over
      PaySheet          the money screen a scanned code with no amount opens
      ScanScreen        Scan to pay: the camera in its frame, and the manual row
      RowIcon           a card's glyph: a Lucide face, or a category's marker
    features/upi/       the UPI link builder, and what a read code becomes (logScan)
    hooks/              useTheme, useLedger, useGreeting, useTick
    lib/
      index.css         the ten roles, both palettes, the two faces
      theme.ts          reading and writing the theme
      ledger.ts         the rows, in localStorage
      history.ts        reading a Wallet export / JSON / CSV out
      derive.ts         rows → both screens' models
      demo.ts           the artboards' own content, before an import
      view.ts           the two models, one shape for both sources
      format.ts         rupees, clocks, "Yesterday"
      greetings.ts      the fifty greetings, and what qualifies as one (data and rules)
      rotation.ts       which language this open shows, and which it has just shown
      hello.ts          the greeting's server, and the parked model key
      gemini.ts         the parked question a model is asked, and what an answer must be
      categories.ts     the owner's category tree (written by tools/)
      category-icons.tsx, accounts.ts, owner.ts (whose name the greeting says)
  design/               see above
backend/                Worker + D1: the Shortcut's endpoint, and POST /api/greeting
tools/                  wallet-import.py, lucide-icons.py, the two font converters
```

## Status

Working: all three screens in both themes, the wheel's drag/snap/haptics/keys, the month
menu that reaches past the wheel's fifteen-day window, the Wallet import and both
exports, the scanner (camera and manual entry, the money screen for a code with no amount,
and one row per code), the greeting in a different language every open, and the Pages
deploy. The greeting's table is written and driven end to end against local D1 — the route's
contract, the seed, the `avoid` list, the re-seed after a hand-edit — but **no D1 database
exists on the account yet**, so the live site greets from the fifty in its own bundle
(`data-greeting="pool"`), which is the same fifty the table is seeded with.
Not built yet: per-account balances on screen (the accounts are known and used, but only
their sum is drawn), and savings goals. Import and export are implemented but **unwired** — the owner is placing
that panel themselves, which is why no screen opens it. The app is no longer a
service-worker PWA — the previous one was retired with its design.
