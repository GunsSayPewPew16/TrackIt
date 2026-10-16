"""Vendor the greeting's face, **Bodoni Moda**, from Google's own CSS API.

The dashboard's greeting is the one line in the app set in a serif — "Good
morning, Alex", 28px over Playfair Display before this. The owner asked for
Bodoni instead: a Didone, so the contrast between the thick stems and the hairline
serifs is the point of it, which is what makes a greeting read as a masthead
rather than as body text at a larger size.

Bodoni Moda is Google's Bodoni: a variable face on two axes, an optical size
(`opsz`, 6–96) and weight (400–900), drawn for this kind of display use and
published under the SIL Open Font License. The optical size is why the app asks
for the variable file rather than one static cut — browsers apply `opsz`
automatically from the font size (`font-optical-sizing: auto`), so the same file
is a text cut at 14px and a display cut at 28px, and the greeting gets the
high-contrast one without a second request.

The file is vendored rather than linked: a `<link>` to fonts.googleapis.com would
leave the app with no greeting face the first time it opens without a connection.
Only the `latin` block of the API's answer is taken — everything the greeting
says is English letters and a comma — and the licence travels beside the file,
which is the one condition the OFL makes.

    python3 tools/vendor-bodoni.py

Run it again to move to a newer release; it prints what it wrote, like the other
tools here.
"""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

FAMILY = "Bodoni Moda"
SLUG = "bodoni-moda"
# `opsz,wght` is the order the API wants its axes in, and both are ranges so the
# answer is the variable file rather than a static instance per size.
AXES = "opsz,wght@6..96,400"
CSS_API = f"https://fonts.googleapis.com/css2?family={FAMILY.replace(' ', '+')}:{AXES}&display=swap"
LICENCE_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/bodonimoda/OFL.txt"

# A browser's user agent, because the API answers in woff2 only to clients that
# say they can read it — the same request without one comes back as TTF.
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "app/src/assets/fonts"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request) as response:  # noqa: S310 - the URLs are constants above
        return response.read()


def latin_woff2(css: str) -> str:
    """The `latin` block's woff2 URL, which is the only subset the app needs."""
    blocks = re.findall(r"/\* (\S+) \*/\s*@font-face \{(.*?)\}", css, re.S)
    for name, block in blocks:
        if name == "latin":
            match = re.search(r"url\((https://[^)]+\.woff2)\)", block)
            if match:
                return match.group(1)
    raise SystemExit(f"the API's answer has no latin woff2 block:\n{css}")


def main() -> None:
    css = fetch(CSS_API).decode("utf-8")
    url = latin_woff2(css)
    face = fetch(url)
    licence = fetch(LICENCE_URL)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    face_path = OUT_DIR / f"{SLUG}-400.woff2"
    licence_path = OUT_DIR / f"{SLUG}-OFL.txt"
    face_path.write_bytes(face)
    licence_path.write_text(licence.decode("utf-8"))

    version = re.search(r"/v(\d+)/", url)
    print(f"wrote {face_path.relative_to(ROOT)} ({len(face) / 1024:.1f} KiB, v{version.group(1) if version else '?'})")
    print(f"wrote {licence_path.relative_to(ROOT)} (SIL Open Font License)")
    print(f"source {url}")


if __name__ == "__main__":
    main()
