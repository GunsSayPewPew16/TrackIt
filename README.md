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

**The dashboard** is the artboard's four bands, in its order: the greeting with its
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
the files). The one serif is the greeting — `Hello, Priyansh`, the word in the Medium
Italic and the name in the Medium roman — set in **Anthropic Serif Display**, whose two
static cuts the owner supplied and `tools/vendor-anthropic-serif.py` converts. That is
three departures from the artboards' own type, all of them the owner's: the artboards
draw Playfair Display, and both `@font-face` rules state their weight and style so a
400 request can never quietly re-use the 500 cut. Two things about the sans stacks are
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

## Deploying

```bash
npm run deploy       # build, then `wrangler deploy` (Cloudflare Worker + assets)
```

Pushing to `main` also publishes the same build to GitHub Pages via
`.github/workflows/deploy-pages.yml`, built with `PAGES_BASE=/TrackIt/` so every
asset URL resolves under the project's sub-path. `backend/` is a small
token-protected Worker with a D1 schema — an API for logging a row from an Apple
Shortcut. **The app in `app/` does not call it**: the two screens read and write only
the device's own ledger, and the Worker is kept for the Shortcut endpoint.

## Layout

```
app/                    the whole product — one Vite app
  index.html            entry point; the pre-paint theme script lives here
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
    hooks/              useTheme, useLedger
    lib/
      index.css         the ten roles, both palettes, the two faces
      theme.ts          reading and writing the theme
      ledger.ts         the rows, in localStorage
      history.ts        reading a Wallet export / JSON / CSV out
      derive.ts         rows → both screens' models
      demo.ts           the artboards' own content, before an import
      view.ts           the two models, one shape for both sources
      format.ts         rupees, clocks, "Yesterday"
      categories.ts     the owner's category tree (written by tools/)
      category-icons.tsx, accounts.ts, owner.ts (the greeting's two words)
  design/               see above
backend/                Worker + D1 schema (Shortcut endpoint; unused by app/)
tools/                  wallet-import.py, lucide-icons.py, vendor-neue-haas.py
```

## Status

Working: all three screens in both themes, the wheel's drag/keys/springs, the month
menu that reaches past the wheel's fifteen-day window, the Wallet import and both
exports, the scanner (camera and manual entry, one row per code), and the Pages deploy.
Not built yet: the UPI pay sheet, per-account balances on screen (the accounts are known
and used, but only their sum is drawn), and savings goals. Import and export are implemented but **unwired** — the owner is placing
that panel themselves, which is why no screen opens it. The app is no longer a
service-worker PWA — the previous one was retired with its design.
