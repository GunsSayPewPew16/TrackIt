"""Vendor the owner's heading face, Neue Haas Grotesk Display, from the zip they supplied.

The zip is Commercial Type's trial collection. Its end-user licence (EULA, name
record 13) restricts web embedding: @font-face and other web-font technologies
each require a separate web licence, and redistribution is not granted. The
owner has chosen to ship it on the personal Pages site anyway, and this writes
that licence text beside the font so the terms are on record in the repository.

It converts two weights to woff2, because the headings only use Medium and Bold:
Display Medium (500) and Display Bold (700). The face has no rupee sign
(U+20B9), so the amounts draw their ₹ from the system sans behind it.

    python3 tools/vendor-neue-haas.py ~/Downloads/Neue_Haas_Grotesk_Collection.zip
"""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover - the message is the point
    raise SystemExit(
        "this tool converts the face to woff2, so it needs fonttools:\n"
        "    python3 -m pip install fonttools brotli"
    )

RUPEE = 0x20B9

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "mockups/meetgen/src/assets/fonts"
LICENCE_FILE = OUT_DIR / "neue-haas-grotesk-LICENSE.txt"

# Source file suffix inside the zip -> woff2 name the stylesheet loads.
WEIGHTS = {
    "65Medium": ("neue-haas-grotesk-display-500.woff2", 500),
    "75Bold": ("neue-haas-grotesk-display-700.woff2", 700),
}

NOTE = """Neue Haas Grotesk Display — the mockup's heading face.

Supplied to this repository by the app's owner from Commercial Type's trial
collection (`{source}`). The trial's end-user licence (EULA) states, in part:

  * Use is for the customary personal or internal purposes of the licensee; the
    commercial distribution or use of the font software is not granted.
  * The use of @font-face or other forms of web embedding "each require the
    purchase of a" web licence. This repository embeds the font that way.
  * Redistribution of the font software files is not granted.

Full licence: http://commercialtype.com/license

The owner has decided to publish these files on the personal GitHub Pages site
without a web licence. That is a knowing breach of the trial terms, not a
licence. Buy the web licence, or drop these files, before the site is shared.

Written by `tools/vendor-neue-haas.py`, which also converts the weights to woff2;
do not hand-edit the font files. Re-run the tool if the owner supplies a newer cut.
"""


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        raise SystemExit(__doc__.strip().splitlines()[-1].strip())

    source = Path(argv[1]).expanduser()
    if not source.exists():
        raise SystemExit(f"no such file: {source}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        names = archive.namelist()
        for key, (out_name, weight) in WEIGHTS.items():
            matches = [n for n in names if n.endswith(f"NeueHaasGrotDisp-{key}-Trial.otf")]
            if not matches:
                raise SystemExit(f"{source} holds no NeueHaasGrotDisp-{key}-Trial.otf")
            # Read eagerly so fonttools has bytes it can save from, not a lazy zip stream.
            font = TTFont(io.BytesIO(archive.read(matches[0])))
            if font["OS/2"].usWeightClass != weight:
                raise SystemExit(f"{matches[0]} is weight {font['OS/2'].usWeightClass}, not {weight}")

            font.flavor = "woff2"
            out_path = OUT_DIR / out_name
            font.save(out_path)
            rupee = "present" if RUPEE in font.getBestCmap() else "MISSING"
            print(f"wrote {out_path.relative_to(ROOT)} ({out_path.stat().st_size // 1024} KiB)")
            print(f"  weight {weight}, rupee sign (U+20B9): {rupee}")

    LICENCE_FILE.write_text(NOTE.format(source=source.name))
    print(f"wrote {LICENCE_FILE.relative_to(ROOT)} — the licence it travels under")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
