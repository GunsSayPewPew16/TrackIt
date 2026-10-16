#!/usr/bin/env python3
"""Vendor Lucide's line icons for the app's category markers.

    npm install --no-save lucide-static && python3 tools/lucide-icons.py

One table, one file: every category's marker, written whole into
``app/src/lib/category-icons.tsx``. The app's own chrome — the sun and the moon, the
arrows, the chevrons, the camera — is not vendored at all: it imports `lucide-react`
directly, out of the same catalogue, so there is no second table here to keep in step.

The markers went back to Lucide. They were Phosphor's ``fill`` weight for a while,
because the owner asked for solid glyphs on the tile; the owner has since asked for
Lucide's line art on the tile again. Phosphor is gone from the repo rather than kept
alongside — two scripts writing one table is how a client drifts from its design.

Nothing about the marker's *look* changed in the move: one warm brown tile, one white
glyph on it. Only the glyph's family and weight did — a line now, not a silhouette.
The reference's own tiles are Phosphor's ``fill`` set (measured; see INSTRUCTIONS.md),
which is precisely why the choice is written down there: it is the owner's call, not an
oversight. Where Lucide has no icon for a Wallet category the closest Lucide handful is
used and named here — ``circle-parking`` for parking, which Phosphor had to substitute a
map pin for.

One family, one 24px grid, one stroke weight, each icon exactly as Lucide draws it. The
table is generated; do not hand-edit it — change the mapping here and re-run.
``tools/wallet-import.py`` proves on every run that every category has a glyph.
"""

from __future__ import annotations

import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
ICON_DIR = REPO / "node_modules" / "lucide-static" / "icons"
# The one file this writes, and the only place the markers live.
MARKERS_FILE = REPO / "app" / "src" / "lib" / "category-icons.tsx"

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
        name for name in set(MARKERS.values()) if not (ICON_DIR / f"{name}.svg").exists()
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
 * These are **Lucide** icons (lucide.dev, ISC licence) — the same 24px grid as the
 * app's chrome, which comes out of the same catalogue through `lucide-react` and
 * is drawn at the same weight, so a screenful of them reads as one family. They
 * were Phosphor's `fill` weight for a while, until the owner asked for Lucide's
 * line art on the tile again; `tools/lucide-icons.py` writes this table from
 * `lucide-static`. Only the shapes are kept: the root `<svg>` in Lucide's file
 * carries `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"` and its
 * own `stroke-width`, and `CategoryIcon` below repeats all of it at the weight
 * this design draws every line at. `tools/wallet-import.py` proves on every run
 * that every category has a glyph here, which is what catches a table edited by
 * hand.
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
      strokeWidth={{1.5}}
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

    MARKERS_FILE.write_text(markers_source(), encoding="utf-8")
    print(f"  {MARKERS_FILE.relative_to(REPO)}  {len(MARKERS)} markers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
