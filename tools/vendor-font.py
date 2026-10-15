"""Vendor the app's typeface, so the installed app keeps it offline.

The design's own labels — the reference's card, its two pills, the goals card —
are set in a rounded geometric sans, and Nunito is the closest free face to it:
the rounded terminals, the double-storey `a`, the round dot on the `i`, the
single-storey `g` with its open tail, and the wide round numerals all match.

The app is offline-first and installable, so the font is *vendored* rather than
fetched: a `<link>` to fonts.googleapis.com would leave the installed app with
no typeface the first time it opens without a connection — and the app is a
phone app whose whole point is that it works on a train. The service worker
precaches `woff2`, so one file is all it takes.

One file, not five: the variable woff2 carries the whole 200–1000 weight range,
which is what lets the UI keep its 600/650/700/750 steps exactly as designed
instead of rounding each one to the nearest static face.

Google serves the variable file from the CSS API, so the script reads the API's
own CSS and takes the `latin` block out of it — the subset the app needs, since
everything it shows is English. Run it again to move to a newer release; it
prints what it wrote, like the other tools here.

    python3 tools/vendor-font.py

The rupee sign is the one glyph Nunito's latin subset does not carry, and this
app writes it on every amount. The API answers a `text=` request with a tiny
file holding just that glyph, so a second 1.5 KiB download keeps ₹ in the app's
own typeface instead of dropping the amounts back to the phone's system font.
It is the same variable file, trimmed to one character, and the CSS gives it
`unicode-range: U+20B9` so the browser only asks for it when ₹ appears.

Nunito is under the SIL Open Font License, so the licence travels beside the
file it covers, which is the one condition that matters for shipping it.
"""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

FAMILY = "Nunito"
WEIGHTS = "200..1000"
CSS_API = f"https://fonts.googleapis.com/css2?family={FAMILY}:wght@{WEIGHTS}&display=swap"
RUPEE_API = f"https://fonts.googleapis.com/css2?family={FAMILY}:wght@{WEIGHTS}&text=%E2%82%B9"
LICENCE_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt"

# A browser's user agent, because the API answers in woff2 only to clients that
# say they can read it — the same request without one comes back as TTF.
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

OUT_DIR = Path(__file__).resolve().parent.parent / "frontend/src/assets/fonts"
WOFF_FILE = OUT_DIR / "nunito-var-latin.woff2"
RUPEE_FILE = OUT_DIR / "nunito-var-rupee.woff2"
LICENCE_FILE = OUT_DIR / "OFL.txt"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        return response.read()


def latin_woff2(css: str) -> str:
    """The `latin` block's file, not `latin-ext` or any of the other subsets."""
    blocks = re.findall(r"/\*\s*([a-z0-9-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
    for name, body in blocks:
        if name != "latin":
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", body)
        if url:
            return url.group(1)
    raise SystemExit(f"no latin woff2 in the API's answer:\n{css[:400]}")


def only_url(css: str) -> str:
    """The single file a `text=` request answers with."""
    # The `text=` answer's URL carries a query string rather than a .woff2
    # suffix — `https://fonts.gstatic.com/l/font?kit=…` — so the match is on
    # the url() itself, not on the file's name.
    url = re.search(r"url\((https://[^)]+)\)", css)
    if not url:
        raise SystemExit(f"no file in the API's answer:\n{css[:400]}")
    return url.group(1)


def write(path: Path, data: bytes, note: str = "") -> None:
    path.write_bytes(data)
    shown = path.relative_to(OUT_DIR.parents[3])
    size = f"{len(data) // 1024} KiB" if len(data) >= 1024 else f"{len(data)} bytes"
    print(f"wrote {shown} ({size}){' — ' + note if note else ''}")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    css = fetch(CSS_API).decode()
    url = latin_woff2(css)
    write(WOFF_FILE, fetch(url), "the latin subset, whole weight range")
    print(f"  from {url}")

    rupee_css = fetch(RUPEE_API).decode()
    rupee_url = only_url(rupee_css)
    write(RUPEE_FILE, fetch(rupee_url), "U+20B9 alone, so ₹ keeps its typeface")

    licence = fetch(LICENCE_URL).decode()
    LICENCE_FILE.write_text(licence)
    first = next(line for line in licence.splitlines() if FAMILY.lower() in line.lower())
    print(f"wrote {LICENCE_FILE.relative_to(OUT_DIR.parents[3])} — {first.strip()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
