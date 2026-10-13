#!/usr/bin/env python3
"""Vendor Phosphor's *filled* icons into the mockup and the app, as the markers.

    npm install --no-save @phosphor-icons/core && python3 tools/phosphor-icons.py

Why a second icon tool. ``tools/lucide-icons.py`` still draws the chrome — the
rail, the buttons, the browser's arrows — and the owner's own rows want the
**solid** weight for the categories themselves, which Lucide does not have: it is
a line-only family. Phosphor ships the same icon at six weights, and its ``fill``
ones are a plain filled silhouette, white on the one brown tile, so a screenful
of markers reads the way the reference's do.

One family, one grid: every marker is a Phosphor ``fill`` glyph on its own 256px
grid, which is why the marker's ``<svg>`` in both clients says
``viewBox="0 0 256 256" fill="currentColor"`` and no longer carries a stroke. The
shapes below are the whole file minus its root tag, so the client's root is what
gives them their fill — exactly as Lucide's root used to give its shapes a stroke.
Change a mapping here and re-run; do not hand-edit the tables.
"""

from __future__ import annotations

import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
ICON_DIR = REPO / "node_modules" / "@phosphor-icons" / "core" / "assets" / "fill"
MOCKUP = REPO / "frontend" / "design" / "mockup.html"
APP_ICONS = REPO / "frontend" / "src" / "lib" / "icons.tsx"

# Which Phosphor glyph each slug is marked with, in `tools/wallet-import.py`'s
# order — Wallet's own order, group by group, the group's own row first. The
# owner's screenshots of Wallet's browser are what the glyphs follow: a basket for
# Groceries, a burger for Restaurant, a carriage for Kids, scissors over a bill
# for Taxes. The labels Wallet repeats across sets (Child Support, Lottery, Gifts)
# and the glyphs it repeats on purpose (the same gift, the same key) are repeated
# here too, so the two tables read the same way.
ICONS = {
    # Food & Drinks
    "food-drinks": "fork-knife",
    "groceries": "basket",
    "restaurant": "hamburger",
    "bar-cafe": "wine",
    # Shopping
    "shopping": "shopping-bag",
    "clothes-shoes": "t-shirt",
    "jewels": "diamond",
    "health-beauty": "drop",
    "kids": "baby-carriage",
    "home-garden": "plant",
    "pets": "paw-print",
    "electronics": "laptop",
    "gifts-joy": "gift",
    "stationery": "pencil-ruler",
    "free-time": "smiley",
    "drug-store": "storefront",
    # Housing
    "housing": "house",
    "rent": "key",
    "mortgage": "house-line",
    "energy": "lightbulb",
    "services": "gear",
    "maintenance": "hammer",
    "property-insurance": "fire",
    # Transportation
    "transportation": "bus",
    "public-transport": "tram",
    "taxi": "taxi",
    "long-distance": "airplane-in-flight",
    "business-trips": "briefcase",
    # Vehicle
    "vehicle": "car",
    "fuel": "gas-pump",
    "parking": "map-pin",  # Phosphor has no parking sign; the pin is the place
    "vehicle-maintenance": "wrench",
    "rentals": "key",
    "vehicle-insurance": "identification-card",
    "leasing": "money-wavy",
    # Life & Entertainment
    "life-entertainment": "person",
    "health-doctor": "stethoscope",
    "wellness": "flower",
    "active-sport": "barbell",
    "culture-sport": "hands-clapping",
    "life-events": "cake",
    "hobbies": "palette",
    "education": "graduation-cap",
    "books-subs": "book-open",
    "tv-streaming": "television",
    "holiday-trips": "tree-palm",
    "charity-gifts": "hand-heart",
    "friends": "handshake",
    "mobile-recharge": "wifi-high",
    "lottery": "dice-five",
    # Communication, PC
    "communication": "monitor",
    "phone": "device-mobile",
    "internet": "wifi-high",
    "software": "floppy-disk",
    "postal": "envelope",
    # Financial expenses
    "financial-expenses": "coins",
    "taxes": "scissors",
    "insurances": "shield",
    "loans-interests": "chart-line",
    "fines": "gavel",
    "advisory": "chats-circle",
    "charges-fees": "receipt",
    "financial-child-support": "baby",
    # Investments
    "investments": "network",
    "realty": "buildings",
    "vehicles-chattels": "car-simple",
    "financial-investments": "chart-line-up",
    "savings": "piggy-bank",
    "collections": "sparkle",
    # Allowance
    "allowance": "currency-inr",
    "child-support": "baby",
    # Income
    "income": "hand-coins",
    "wage-invoices": "invoice",
    "interests-dividends": "percent",
    "sale": "tag",
    "rental-income": "house-simple",
    "dues-grants": "seal-check",
    "lending-renting": "tray-arrow-down",
    "checks-coupons": "note-pencil",
    "income-lottery": "dice-five",
    "refunds": "arrow-counter-clockwise",
    "income-child-support": "baby",
    "income-gifts": "gift",
    # Wallet's plumbing, which only ever renders on an imported row.
    "debts": "bank",
    "transfer": "arrows-left-right",
    "shopping-list": "list-checks",
    "oneclick": "lightning",
    "bank-statements": "file-text",
    "unknown": "question",
}


def shapes_of(name: str) -> str:
    """The icon's shapes, on one line, with Phosphor's own path data kept."""
    file = ICON_DIR / f"{name}-fill.svg"
    if not file.exists():
        raise SystemExit(
            f"missing {file} — run: npm install --no-save @phosphor-icons/core"
        )
    markup = file.read_text(encoding="utf-8")
    # Past the <svg ...> tag to the end of the element: the shapes only. The root
    # tag carries the theme — viewBox="0 0 256 256", fill="currentColor" — and the
    # marker's own <svg> in each client repeats it, so the two cannot disagree.
    open_tag = markup.index("<svg")
    inner = markup[markup.index(">", open_tag) + 1 : markup.rindex("</svg>")]
    return re.sub(r"\s+", " ", inner).strip()


def table_rows(indent: str) -> str:
    return "\n".join(
        f"{indent}'{slug}': '{shapes_of(name)}'," for slug, name in ICONS.items()
    )


def splice(path: pathlib.Path, rows: str) -> None:
    """Replace the slug rows of a CATEGORY_ICONS table in place."""
    text = path.read_text(encoding="utf-8")
    start = text.index("CATEGORY_ICONS")
    open_brace = text.index("{", start)
    close = re.search(r"\n\s*\};?\n", text[open_brace:])
    assert close, f"unterminated table in {path}"
    end = open_brace + close.start()  # the newline the closing brace sits on
    # A brace far below the first row means the table's own close was missed and
    # this is about to swallow code; refuse rather than corrupt the file.
    assert text[open_brace:end].count("\n") < len(ICONS) + 3, (
        f"{path}: the table's closing brace looks too far away — refusing"
    )
    text = text[:open_brace] + "{" + "\n" + rows + text[end:]
    path.write_text(text)
    print(f"  {path.relative_to(REPO)}  {len(ICONS)} markers")


def main() -> int:
    if not ICON_DIR.exists():
        print(
            f"{ICON_DIR} is missing — run: npm install --no-save @phosphor-icons/core",
            file=sys.stderr,
        )
        return 1

    print("Phosphor markers ->")
    splice(MOCKUP, table_rows("      "))
    splice(APP_ICONS, table_rows("  "))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
