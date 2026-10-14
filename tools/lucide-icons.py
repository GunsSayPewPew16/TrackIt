#!/usr/bin/env python3
"""Vendor Lucide's line icons into both clients — the chrome and the markers.

    npm install --no-save lucide-static && python3 tools/lucide-icons.py

The markers went back to Lucide. They were Phosphor's ``fill`` weight for a while,
because the owner asked for solid glyphs on the tile; the owner has since asked for
Lucide's line art on the tile again, so this script owns both halves: the chrome (the
rail, the buttons, the browser's arrows) and every category's marker. Phosphor is gone
from the repo rather than kept alongside — two scripts writing one table is how the two
clients drift apart.

Nothing about the marker's *look* changed in the move: one warm brown tile, one white
glyph on it. Only the glyph's family and weight did — a line now, not a silhouette.
The reference's own tiles are Phosphor's ``fill`` set (measured; see INSTRUCTIONS.md),
which is precisely why the choice is written down there: it is the owner's call, not an
oversight. Where Lucide has no icon for a Wallet category the closest Lucide handful is
used and named here — ``circle-parking`` for parking, which Phosphor had to substitute a
map pin for.

One family, one 24px grid, one stroke weight, each icon exactly as Lucide draws it. The
app's two icon modules and the mockup's marker table are generated; do not hand-edit
them — change the mapping here and re-run.
"""

from __future__ import annotations

import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
ICON_DIR = REPO / "node_modules" / "lucide-static" / "icons"
MOCKUP = REPO / "frontend" / "design" / "mockup.html"
APP_MARKERS = REPO / "frontend" / "src" / "lib" / "icons.tsx"
APP_UI_ICONS = REPO / "frontend" / "src" / "lib" / "ui-icons.tsx"

# The chrome around the markers — the rail, the buttons, the browser's arrows.
# Written as a finished file rather than spliced: it is generated whole.
CHROME = {
    "HouseIcon": "house",
    "SettingsIcon": "settings",
    "PlusIcon": "plus",
    "ChevronRightIcon": "chevron-right",
    "ChevronLeftIcon": "chevron-left",
    "CheckIcon": "check",
    "XIcon": "x",
    "BackIcon": "arrow-left",
    "ReceiptIcon": "receipt-text",
}

# Which Lucide glyph each slug is marked with, in `tools/wallet-import.py`'s order —
# Wallet's own order, group by group, the group's own row first. The concepts follow
# the table this one replaced (a basket for Groceries, a burger for Restaurant, a
# carriage for Kids, scissors for Taxes); where Lucide draws that idea differently the
# Lucide drawing wins, and where Lucide has no equivalent at all the closest thing it
# does have is named in the comment beside it. The labels Wallet repeats (Child
# Support, Lottery, Gifts) and the glyphs repeated on purpose (the same baby, the same
# gift) are repeated here too, so the two clients read the same way.
MARKERS = {
    # Food & Drinks
    "food-drinks": "utensils",
    "groceries": "shopping-basket",
    "restaurant": "hamburger",
    "bar-cafe": "wine",
    # Shopping
    "shopping": "shopping-bag",
    "clothes-shoes": "shirt",
    "jewels": "gem",
    "health-beauty": "droplet",
    "kids": "baby",
    "home-garden": "sprout",
    "pets": "paw-print",
    "electronics": "laptop",
    "gifts-joy": "gift",
    "stationery": "pencil-ruler",
    "free-time": "smile",
    "drug-store": "store",
    # Housing
    "housing": "house",
    "rent": "key",
    "mortgage": "landmark",  # the bank the loan is with
    "energy": "lightbulb",
    "services": "cog",  # the chrome's own gear is `settings`; a marker keeps its own
    "maintenance": "hammer",
    "property-insurance": "flame",
    # Transportation
    "transportation": "bus",
    "public-transport": "tram-front",
    "taxi": "car-taxi-front",
    "long-distance": "plane",
    "business-trips": "briefcase",
    # Vehicle
    "vehicle": "car",
    "fuel": "fuel",
    "parking": "circle-parking",  # Phosphor had no parking sign; Lucide does
    "vehicle-maintenance": "wrench",
    "rentals": "key-round",
    "vehicle-insurance": "shield-check",
    "leasing": "banknote",
    # Life & Entertainment
    "life-entertainment": "user",
    "health-doctor": "stethoscope",
    "wellness": "flower",
    "active-sport": "dumbbell",
    "culture-sport": "ticket",
    "life-events": "cake",
    "hobbies": "palette",
    "education": "graduation-cap",
    "books-subs": "book-open",
    "tv-streaming": "tv",
    "holiday-trips": "palmtree",
    "charity-gifts": "hand-heart",
    "friends": "handshake",
    "mobile-recharge": "smartphone-charging",
    "lottery": "dices",
    # Communication, PC
    "communication": "monitor",
    "phone": "smartphone",
    "internet": "wifi",
    "software": "app-window",
    "postal": "mail",
    # Financial expenses
    "financial-expenses": "coins",
    "taxes": "scissors",
    "insurances": "shield",
    "loans-interests": "chart-line",
    "fines": "gavel",
    "advisory": "messages-square",
    "charges-fees": "receipt",
    "financial-child-support": "baby",
    # Investments
    "investments": "network",
    "realty": "building-2",
    "vehicles-chattels": "car-front",
    "financial-investments": "trending-up",
    "savings": "piggy-bank",
    "collections": "sparkles",
    # Allowance
    "allowance": "indian-rupee",
    "child-support": "baby",
    # Income
    "income": "hand-coins",
    "wage-invoices": "file-text",
    "interests-dividends": "percent",
    "sale": "tag",
    "rental-income": "house-plus",
    "dues-grants": "badge-check",
    "lending-renting": "arrow-down-to-line",
    "checks-coupons": "ticket-percent",
    "income-lottery": "dices",
    "refunds": "rotate-ccw",
    "income-child-support": "baby",
    "income-gifts": "gift",
    # Wallet's plumbing, which only ever renders on an imported row.
    "debts": "credit-card",
    "transfer": "arrow-left-right",
    "shopping-list": "list-checks",
    "oneclick": "zap",
    "bank-statements": "scroll-text",
    "unknown": "circle-help",
}


def shapes_of(name: str) -> str:
    """The icon's shapes, on one line, with Lucide's own attributes kept."""
    file = ICON_DIR / f"{name}.svg"
    if not file.exists():
        raise SystemExit(
            f"missing {file} — run: npm install --no-save lucide-static"
        )
    markup = file.read_text(encoding="utf-8")
    # Past the <svg ...> tag (the file opens with an @license comment) to the end
    # of the element: the shapes only. The root tag carries the theme — viewBox,
    # fill="none", stroke="currentColor", stroke-width="2", round caps — and the
    # client's own <svg> repeats it, so the two cannot disagree.
    open_tag = markup.index("<svg")
    inner = markup[markup.index(">", open_tag) + 1 : markup.rindex("</svg>")]
    return re.sub(r"\s+", " ", inner).strip()


def missing_names() -> list[str]:
    """Every mapped icon Lucide does not ship — all of them, not just the first."""
    return sorted(
        {
            name
            for name in list(CHROME.values()) + list(MARKERS.values())
            if not (ICON_DIR / f"{name}.svg").exists()
        }
    )


def ui_icons_source() -> str:
    blocks = "\n\n".join(
        f'''/** Lucide's `{name}`. */
export function {component}({{
  className,
  strokeWidth = 2,
}}: IconProps) {{
  return (
    <svg
      className={{className}}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={{strokeWidth}}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{{{ __html: '{shapes_of(name)}' }}}}
    />
  )
}}'''
        for component, name in CHROME.items()
    )
    return f'''/**
 * The chrome icons: the rail, the buttons, the browser's own arrows.
 *
 * **Generated by `tools/lucide-icons.py`** from `lucide-static` — Lucide
 * (lucide.dev, ISC licence), one 24px grid at one stroke weight. The category
 * markers are the same family, in `icons.tsx`. Do not hand-edit; change the
 * mapping in that script and re-run it.
 */

type IconProps = {{
  className?: string
  /** Lucide's own weight; nobody in this file thins the family's line. */
  strokeWidth?: number
}}

{blocks}
'''


def marker_rows(indent: str) -> str:
    return "\n".join(
        f"{indent}'{slug}': '{shapes_of(name)}'," for slug, name in MARKERS.items()
    )


def markers_source() -> str:
    rows = "\n".join(
        f"  '{slug}': '{shapes_of(name)}'," for slug, name in MARKERS.items()
    )
    return f'''/**
 * The category markers, as Lucide line art.
 *
 * A category is marked with a glyph on one solid tile (`markers.ts`). Emoji
 * cannot do that job: they arrive with their own palette, so the glyph fights the
 * tile, and every platform draws them differently.
 *
 * These are **Lucide** icons (lucide.dev, ISC licence) — the same 24px grid and
 * the same stroke weight as the app's chrome, so a screenful of them reads as one
 * family. They were Phosphor's `fill` weight for a while, until the owner asked
 * for Lucide's line art on the tile again; `tools/lucide-icons.py` writes this
 * table, and the mockup's own, from `lucide-static`. Only the shapes are kept: the
 * root `<svg>` in Lucide's file carries `viewBox="0 0 24 24"`, `fill="none"`,
 * `stroke="currentColor"` and `stroke-width="2"`, and `CategoryIcon` below repeats
 * exactly those, so the two cannot disagree. `tools/wallet-import.py` compares this
 * table with the mockup's on every run, so the two clients cannot mark the same
 * category two ways.
 */
const CATEGORY_ICONS: Record<string, string> = {{
{rows}
}}

/** The dot a category the tables have never heard of is drawn with. */
const FALLBACK_ICON = '<circle cx="12" cy="12" r="9" />'

type IconProps = {{
  /** The category or group id, e.g. `public-transport`. */
  id: string
  className?: string
  /** Overrides the ink; Home's breakdown passes the category's group colour. */
  color?: string
}}

export function CategoryIcon({{ id, className, color }}: IconProps) {{
  return (
    <svg
      className={{className}}
      style={{color ? {{ color }} : undefined}}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={{2}}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // A build-time constant from this file, never markup from an expense or
      // the network: the shapes are the markers themselves.
      dangerouslySetInnerHTML={{{{ __html: CATEGORY_ICONS[id] ?? FALLBACK_ICON }}}}
    />
  )
}}
'''


def splice_mockup(rows: str) -> None:
    """Replace the slug rows of the mockup's CATEGORY_ICONS table in place."""
    text = MOCKUP.read_text(encoding="utf-8")
    start = text.index("CATEGORY_ICONS")
    open_brace = text.index("{", start)
    close = re.search(r"\n\s*\};?\n", text[open_brace:])
    assert close, f"unterminated table in {MOCKUP}"
    end = open_brace + close.start()  # the newline the closing brace sits on
    # A brace far below the first row means the table's own close was missed and
    # this is about to swallow code; refuse rather than corrupt the file.
    assert text[open_brace:end].count("\n") < len(MARKERS) + 3, (
        f"{MOCKUP}: the table's closing brace looks too far away — refusing"
    )
    MOCKUP.write_text(text[:open_brace] + "{\n" + rows + text[end:], encoding="utf-8")


def main() -> int:
    if not ICON_DIR.exists():
        print(
            f"{ICON_DIR} is missing — run: npm install --no-save lucide-static",
            file=sys.stderr,
        )
        return 1

    missing = missing_names()
    if missing:
        print(f"lucide-static ships no such icon: {', '.join(missing)}", file=sys.stderr)
        return 1

    APP_UI_ICONS.write_text(ui_icons_source(), encoding="utf-8")
    APP_MARKERS.write_text(markers_source(), encoding="utf-8")
    splice_mockup(marker_rows("      "))

    print(f"  {APP_UI_ICONS.relative_to(REPO)}  {len(CHROME)} chrome icons")
    print(f"  {APP_MARKERS.relative_to(REPO)}  {len(MARKERS)} markers")
    print(f"  {MOCKUP.relative_to(REPO)}  {len(MARKERS)} markers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
