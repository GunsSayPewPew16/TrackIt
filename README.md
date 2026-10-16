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
are reachable. Dragging it with a mouse or a thumb steps the day by the artboard's
own arithmetic — one step per 60px of travel, up to three at a time, and nothing at
all under 24px — and the capsules spring to their new places (stiffness 300, damping
30). The arrow keys step it too. Each day is a stack of **notched cards**: a 358×128
outline with a step cut out of its top-left corner, the category pill sitting in the
cut and the faces on the step, in one of three treatments — plain, clay for a month's
big expenses, sage for money in.

**Scan to pay** is the artboard of the same name, and is the one screen with no content
of its own: a 48px header (a back circle, the title, the theme toggle), the hint 88px
down, a 358×358 viewfinder at 224px — a sage hairline, four corner brackets and a 2px
line sweeping it from 24px to 332px — and then, at 700px, the small letterspaced label
and the manual row, a 7fr/3fr grid of the field and the clay **Use it** button. The
frame holds the live camera; see *Scanning a UPI code* below for the one part of the
artboard that is deliberately not rebuilt.

**The dashboard and the ledger show the design until there is something real to show.**
With no import they are drawn from `src/lib/demo.ts`, which is the artboards' own
content — the eleven sample rows, $24,860.40 of balance, October 2026 — written out as
literals. The moment the owner imports a Wallet export, `src/lib/derive.ts` computes the
same two models from their rows and the screens change without knowing it. That switch
is the only place the app decides what it is looking at (`src/App.tsx`).

## The greeting

The dashboard's masthead says hello in a different language on every open — `Bonjour,
Priyansh`, `Nǐ hǎo, Priyansh`, `Konnichiwa, Priyansh` — and there are three parts to how
it gets there (`src/lib/greetings.ts`, `src/lib/gemini.ts`, `src/hooks/useGreeting.ts`):

- **A pool of thirty-six greetings**, one per language and every one of them checked
  against both serif cuts. A shuffled order in `localStorage` advances one entry per open
  and re-shuffles when it runs out, so no language repeats until every other one has had a
  turn. This half is instant, offline, and needs no key at all, and it is what is on
  screen first.
- **A model, when there is one to ask** (`src/lib/hello.ts`): once per open, for a
  language the pool does not have. Its answer replaces the pool's word only if it survives
  `validateGreeting` — one latin word, letters the serif can actually draw, a plausible
  language tag. Anything else, including every network failure, leaves the pool's word
  standing, which is why this feature has no error state to show.

**Where the key lives is the interesting part, and it is never in the bundle.** The site
is public and static, so there are two supported ways in:

1. **Bring your own key.** Open the app once with `?gemini_key=…` on the URL: the key is
   moved into this browser's `localStorage` and taken back out of the address bar before
   the app renders, so it is not in the history, a bookmark or a shared link. That device
   gets model greetings; every other device gets the pool.
2. **A server-side proxy.** Build with `VITE_GREETING_ENDPOINT=/api/greeting` (or an
   absolute URL) and the app posts `{ avoid: [...] }` there instead, expecting
   `{ greeting: { word, language, lang } }` back. The key stays in that server's
   environment and every visitor gets a model greeting; `app/api/greeting.ts` is such a
   server, and *Deploying* below is how it is set up. `npm run build` does not set the
   variable by itself — pass it on the command line, or in the host's build settings.

Compiling a key into the bundle is the thing not to do: Google's own key documentation
says a key on a public site can be extracted and spent by anyone. The model is
`gemini-3.5-flash-lite` through the Interactions API on its free tier, and what is sent to
it is one sentence and a short list of language names — no money, no rows. **What that
sentence is, and what an answer has to look like before it is shown, live in
`src/lib/gemini.ts` and nowhere else**, because both routes ask the same question and an
answer is judged the same way on either — the browser's key and the server's key must not
drift into accepting different words.

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
line says so. A code without an amount says so rather than guessing, because the sheet
that would ask for one is not built. Nothing here hands a `upi://` link to another app
— `features/upi/upi.ts` holds that builder for when the pay flow arrives.

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

**What the site needs is one static host and nothing else.** It is a Vite build with no
server of its own: GitHub Pages serves it today, and the Worker above serves the same
output (it builds the app first). The only server-side code in this repository is the
greeting's single function, and it exists for exactly one reason — an API key cannot be
compiled into a public bundle — so it is needed only if *every* visitor is to be greeted
by the model. A third host would be a third account for none of that; pick one place for
the pages and, if you want the model, one place for `/api/greeting`.

Pushing to `main` also publishes the same build to GitHub Pages via
`.github/workflows/deploy-pages.yml`, built with `PAGES_BASE=/TrackIt/` so every
asset URL resolves under the project's sub-path. `backend/` is a small
token-protected Worker with a D1 schema — an API for logging a row from an Apple
Shortcut. **The app in `app/` does not call it**: the two screens read and write only
the device's own ledger, and the Worker is kept for the Shortcut endpoint. That command
deploys the Worker and the built app; it does **not** deploy the greeting's function,
which belongs to whatever host is serving `app/` (below).

### Putting the greeting's model behind a server

The greeting needs no server at all (the pool) and no server for one device
(`?gemini_key=…`). For *every* visitor to be greeted by the model, the key has to live on
a server that answers `/api/greeting`, and the build has to know it is there.
`app/api/greeting.ts` is that server: Vercel builds every file in a project's root `api/`
directory into a function, and the project's Root Directory here is `app/`, so the
function is served **from the same origin as the site** — no CORS, no second deployment
to keep in step, and changing the greeting's model is one file in this repository.

1. **Import the repository** at [vercel.com/new](https://vercel.com/new). Framework
   Preset: Vite. (Nothing to install and no `vercel.json` to write: Vite plus an `api/`
   directory is a supported project as it stands.)
2. **Set the Root Directory to `app`** — Project Settings → Build and Deployment.
   Without it Vercel looks for `package.json` and `api/` at the repository root and
   builds none of this.
3. **Add two environment variables** (Project Settings → Environment Variables, for
   Production and Preview):
   - `GEMINI_API_KEY` — a key from
     [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Mark it **Secret**.
     It is read only by the function, and it is the reason the name has no `VITE_`
     prefix: Vite inlines `VITE_` variables into the browser bundle, which is exactly
     what must never happen to a key.
   - `VITE_GREETING_ENDPOINT` — `/api/greeting`. Not a secret; it is the URL the app
     posts to, and a relative one resolves against the site's own origin.
4. **Deploy** (`vercel --prod`, or push to the connected branch). A variable added to a
   project does not change an existing deployment — it applies to the next build.
5. **Check it**: open the deployment and hover the greeting; the tooltip says
   `hello in <language>`. A language outside the pool's thirty-six means the model
   answered. If it never leaves the pool, the endpoint variable is missing from that
   environment's build, or `GEMINI_API_KEY` is missing from the function's.

**The endpoint is rationed**, because an endpoint that holds a key is a key anyone can
reach: twelve requests a minute per caller, 240 a minute altogether, and a caller over
either gets `429` with a `Retry-After` the app treats like any other failure — the pool's
word stands. The counters are a `Map` in the function instance's own memory, so a cold
start forgets them and a second instance has its own; that is enough to make a stray loop
or a crawler pointless and to keep the day's free quota out of one script's hands, and it
is deliberately not more than that. A flood is a firewall's problem — and note that the
per-caller bucket is keyed on `x-forwarded-for`, which a client can write, which is
another reason the ceiling over everybody is there.

A site served from somewhere else — GitHub Pages, say — can call the same function
cross-origin: list its origin in `GREETING_ORIGINS` (comma-separated, e.g.
`https://piyu.github.io` — an origin, not a path), because the function refuses every
other origin. CORS is a browser rule and not authentication: the endpoint is public, it
answers only with a greeting, and anyone can spend the key's quota by calling it. If that
matters, put it behind Cloudflare or add rate limiting.

## Layout

```
app/                    the whole product — one Vite app
  index.html            entry point; the pre-paint theme script lives here
  api/greeting.ts       the greeting's server half: POST /api/greeting (Vercel)
  design/               the two exported artboards, as the design of record
  src/
    App.tsx             which content, which screen, and the cross-fade between them
    components/
      DashboardScreen   the bento dashboard
      LedgerScreen      the wheel, the month menu, the notched cards
      ThemeToggle       the 48px circle that hands the sun to the moon
      DataSheet         import / export / start over
      ScanScreen        Scan to pay: the camera in its frame, and the manual row
      RowIcon           a card's glyph: a Lucide face, or a category's marker
    features/upi/       the UPI link builder, and what a read code becomes (logScan)
    hooks/              useTheme, useLedger, useGreeting
    lib/
      index.css         the ten roles, both palettes, the two faces
      theme.ts          reading and writing the theme
      ledger.ts         the rows, in localStorage
      history.ts        reading a Wallet export / JSON / CSV out
      derive.ts         rows → both screens' models
      demo.ts           the artboards' own content, before an import
      view.ts           the two models, one shape for both sources
      format.ts         rupees, clocks, "Yesterday"
      greetings.ts      the pool of languages, the per-open rotation, the validator
      hello.ts          the greeting's key: a pasted one, or a proxy's
      gemini.ts         the one question a model is asked, and what an answer must be
      categories.ts     the owner's category tree (written by tools/)
      category-icons.tsx, accounts.ts, owner.ts (whose name the greeting says)
  design/               see above
backend/                Worker + D1 schema (Shortcut endpoint; unused by app/)
tools/                  wallet-import.py, lucide-icons.py, the two font converters
```

## Status

Working: all three screens in both themes, the wheel's drag/keys/springs, the month
menu that reaches past the wheel's fifteen-day window, the Wallet import and both
exports, the scanner (camera and manual entry, one row per code), the greeting in a
different language every open (pool, key and server — the server half is written and
tested but **not yet deployed**: no Vercel project exists for this repository yet, so the
live site greets from the pool), and the Pages deploy.
Not built yet: the UPI pay sheet, per-account balances on screen (the accounts are known
and used, but only their sum is drawn), and savings goals. Import and export are implemented but **unwired** — the owner is placing
that panel themselves, which is why no screen opens it. The app is no longer a
service-worker PWA — the previous one was retired with its design.
