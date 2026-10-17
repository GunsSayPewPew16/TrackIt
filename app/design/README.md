# The design of record

Three exported artboards and one component, and the only files the screens are drawn
from:

- `dashboard.dc.html` — "Main": the bento dashboard, exported as `Main.dc.html`.
- `ledger.dc.html` — "Daily ledger": the notched cards, and the wheel the date
  container replaced.
- `scanner.dc.html` — "Scan to pay": the camera's viewfinder and the manual-entry row,
  exported as `Scanner.dc.html`.
- `date-container.jsx` — `DailyLedger.jsx`, the owner's newer **date container**, and
  the source of the ledger's drag, snap and haptic. It is a React component rather
  than a design-tool export: it came with its own mock ledger and Tailwind classes,
  and `src/components/DateWheel.tsx` is the part of it the app kept — the arc, the
  virtual scroll offset, the inertia snapping to the capsule pitch, the light haptic,
  the keyboard and the focus behaviour — rebuilt in this app's tokens (`--pill` and
  `--pill-ink` are its two additions to the palette) and against this app's own model
  of fifteen days rather than its twelve mock transactions.

They are **reference, not build input**: nothing imports them, Vite never sees
them, and they are excluded from the deploy (only `app/dist` is published). They
are kept because every number in `src/` — a radius, a line height, a lens' worth
of the wheel's geometry — was transcribed from them, and keeping them here means
the next change can be checked against the source rather than against a memory of
it. `README.md` at the repository root says which file each screen came from.

Each file is a design-tool export: an `<x-dc>` template whose inline `style="…"`
attributes carry the values, plus a small `<script type="text/x-dc">` logic class
that computes the wheel's transforms, the theme's two icon positions and the
eleven sample rows. The export's runtime (`vendor/react.js`, `support.js`) is not
kept: it is a renderer for the mockup, not part of the design.

Open one in a browser by serving the folder (`python3 -m http.server`) — without
the runtime it will not render its `<x-dc>` template, so read the attributes, or
paste the template body into a scratch page of your own if you want to see it.

Three things to know before comparing them to the app:

- **The artboards draw dollars; the app draws rupees.** Otherwise the sample
  content is the same content: `src/lib/demo.ts` is these eleven rows, these
  figures and this month, kept as literals so a first visit looks like the design.
- **The artboards are 390px wide and 1104/880/844px tall.** The app keeps the 390px
  column and its 24/16/32 padding, but lets a screen be as tall as its content and
  centres the column, so the same layout is exact on a phone and does not stretch
  across a desktop window. A screen places its bands at the artboard's own
  coordinates rather than at whatever follows in flow — which is why the scanner's
  frame sits at a fixed 224px, and why the hint above it is absolutely positioned.
- **The scanner's code is the one drawing the app replaces.** The artboard paints a
  stylised QR code and its three finder squares inside the viewfinder, because an
  exported mockup cannot hold a camera; `src/components/ScanScreen.tsx` puts the live
  feed in the same frame instead, and keeps the hairline, the corner brackets and the
  sweeping line that surround it. Everything else in all three artboards is rebuilt
  as drawn.
