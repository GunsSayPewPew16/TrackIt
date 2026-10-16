# The design of record

Two exported artboards, and the only files the two screens are drawn from:

- `dashboard.dc.html` — "Main": the bento dashboard, exported as `Main.dc.html`.
- `ledger.dc.html` — "Daily ledger": the spinning date wheel and the notched cards.

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

Two things to know before comparing them to the app:

- **The artboards draw dollars; the app draws rupees.** Otherwise the sample
  content is the same content: `src/lib/demo.ts` is these eleven rows, these
  figures and this month, kept as literals so a first visit looks like the design.
- **The artboards are 390px wide and 1104/880px tall.** The app keeps the 390px
  column and its 24/16/32 padding, but lets a screen be as tall as its content and
  centres the column, so the same layout is exact on a phone and does not stretch
  across a desktop window.
