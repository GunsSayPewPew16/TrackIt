# TrackIt

A mobile-first expense tracker in two screens: a **bento dashboard** that answers
"where does the money stand", and a **daily ledger** that answers "what happened
that day", chosen on a spinning date wheel.

It is a static site — React 19, TypeScript and Vite, Tailwind CSS v4 for styling,
Radix UI for the popovers and the dialog, Lucide for every icon and Framer Motion
for the movement. There is no server: the owner's history is imported from their
own **Wallet (BudgetBakers)** export and kept in `localStorage` on the device.

The two screens are a faithful rebuild of an exported design — see
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

## The two screens

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

**Both screens show the design until there is something real to show.** With no
import they are drawn from `src/lib/demo.ts`, which is the artboards' own content —
the eleven sample rows, $24,860.40 of balance, October 2026 — written out as literals.
The moment the owner imports a Wallet export, `src/lib/derive.ts` computes the same
two models from their rows and the screens change without knowing it. That switch is
the only place the app decides what it is looking at (`src/App.tsx`).

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
the files). The one serif is the greeting, and it is **Bodoni Moda** (Google's
variable Bodoni, OFL) rather than the artboard's Playfair Display — the owner asked
for Bodoni, `tools/vendor-bodoni.py` vendors it, and its optical size follows the
font size so 28px gets the display cut. Two things about the sans stacks are
deliberate:

- **Helvetica Neue is not in them.** The trial faces carry 74 glyphs — letters,
  digits, space and a handful of punctuation — so `%`, `/`, `:`, `+`, `·`, the true
  minus (`−`) and the rupee sign (`₹`) are drawn by whatever comes next in the stack.
  That next is Helvetica, then Arial; naming Helvetica Neue made a Neue Haas screen
  read as Helvetica on any Mac that has it.
- **The licence is a trial's.** Its EULA forbids web embedding (`@font-face`) and
  redistribution without a separate web licence. The owner has chosen to publish it on
  their personal site anyway. Buy the web licence, or drop the files, before the site
  is shared more widely. (Bodoni Moda is OFL and travels with its licence beside it.)

## Scanning a UPI code

The dashboard's scan square opens the app's own QR scanner
(`src/features/upi/`): the browser's `BarcodeDetector` where it exists, a WASM
decoder where it does not. A code that already carries an amount logs a row under
**Wallet - OneClick record**; a code without one says so rather than guessing, because
the sheet that would ask for an amount is not built. Nothing here hands a `upi://`
link to another app — `features/upi/upi.ts` holds that builder for when the pay flow
arrives. The scanner's sheet is drawn in the app's own tokens, so it follows the theme
like every other surface.

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
      ScanSheet         what the scan square opens
      RowIcon           a card's glyph: a Lucide face, or a category's marker
    features/upi/       the scanner, the UPI link builder, its stylesheet
    hooks/              useTheme, useLedger
    lib/
      index.css         the ten roles, both palettes, the two faces
      theme.ts          reading and writing the theme
      ledger.ts         the rows, in localStorage
      history.ts        reading a Wallet export / JSON / CSV out
      derive.ts         rows → both screens' models
      demo.ts           the artboards' own content, before an import
      view.ts           the two models, one shape for both sources
      format.ts         rupees, clocks, "Yesterday" (the greeting's face is Bodoni)
      categories.ts     the owner's category tree (written by tools/)
      category-icons.tsx, accounts.ts, owner.ts
  design/               see above
backend/                Worker + D1 schema (Shortcut endpoint; unused by app/)
tools/                  wallet-import.py, lucide-icons.py, vendor-neue-haas.py
```

## Status

Working: both screens in both themes, the wheel's drag/keys/springs, the month menu
that reaches past the wheel's fifteen-day window, the Wallet import and both exports,
the scanner, and the Pages deploy. Not built yet: the UPI pay sheet, per-account
balances on screen (the accounts are known and used, but only their sum is drawn), and
savings goals. Import and export are implemented but **unwired** — the owner is placing
that panel themselves, which is why no screen opens it. The app is no longer a
service-worker PWA — the previous one was retired with its design.
