"""Vendor the owner's two faces, Neue Haas Grotesk Display and Text, from their zip.

The zip is Commercial Type's trial collection, and it carries four families:
Display, Text, and a "Round Dots" novelty cut of each. The mockup needs two of
them, because it sets dialogue type in one and headings in the other:

* **Display** is the heading face — the wordmark, the screen titles and the
  money figures. Its letterforms are cut tighter for large sizes, which is what
  it is for.
* **Text** is everything else: paragraphs, the small letterspaced labels, the
  field text in the pay sheets. It is the same design drawn for reading rather
  than for display, so the counters open up at 12–16px, where Display's close.

The licence (EULA, name record 13) restricts web embedding: @font-face and other
web-font technologies each require a separate web licence, and redistribution is
not granted. The owner has chosen to ship it on the personal Pages site anyway,
and this writes that licence beside the files so the terms are on record.

It converts three weights of Text (Roman 400, Medium 500, Bold 700) and two of
Display (Medium 500, Bold 700), and nothing else: no italics, because nothing in
the mockup is set italic and an italic file for every weight would double the
payload, and no Round Dots cut, which is a novelty drawing of the same letters.
A weight the screen does not use yet costs nothing to keep, because a browser
only downloads a face some element actually matches; Display's Medium is one of
those today. Neither face carries the rupee sign, so amounts draw their ₹ from
Helvetica Neue behind it, and the weight each file reports is checked against
the file's own `usWeightClass` rather than trusted from the name.

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
        "this tool converts the faces to woff2, so it needs fonttools:\n"
        "    python3 -m pip install fonttools brotli"
    )

RUPEE = 0x20B9

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "mockups/meetgen/src/assets/fonts"
LICENCE_FILE = OUT_DIR / "neue-haas-grotesk-LICENSE.txt"

# Family -> the zip's own file stem, the name fragment this tool writes, and the
# weights the stylesheet loads, keyed by the trial's weight name.
FAMILIES = {
    "Display": {
        "stem": "NeueHaasGrotDisp",
        "slug": "display",
        "weights": {"65Medium": 500, "75Bold": 700},
    },
    "Text": {
        "stem": "NeueHaasGrotText",
        "slug": "text",
        "weights": {"55Roman": 400, "65Medium": 500, "75Bold": 700},
    },
}

NOTE = """Neue Haas Grotesk Display and Text — the mockup's two faces.

Supplied to this repository by the app's owner from Commercial Type's trial
collection (`{source}`). Display sets the headings and the money figures; Text sets
everything else, from paragraphs down to the small letterspaced labels. The files
here are woff2 conversions of these weights:

{weights}

The trial's end-user licence (EULA) states, in part:

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

    written: list[str] = []
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        names = archive.namelist()
        for family, spec in FAMILIES.items():
            print(f"{family}")
            for weight_name, weight in spec["weights"].items():
                stem = f"{spec['stem']}-{weight_name}-Trial.otf"
                matches = [n for n in names if n.endswith(stem)]
                if not matches:
                    raise SystemExit(f"{source} holds no {stem}")
                # Read eagerly so fonttools has bytes it can save from, not a lazy zip stream.
                font = TTFont(io.BytesIO(archive.read(matches[0])))
                actual = font["OS/2"].usWeightClass
                if actual != weight:
                    raise SystemExit(f"{stem} is weight {actual}, not {weight}")

                out_name = f"neue-haas-grotesk-{spec['slug']}-{weight}.woff2"
                out_path = OUT_DIR / out_name
                font.flavor = "woff2"
                font.save(out_path)

                written.append(f"    {out_name}  ({family} {weight_name}, CSS weight {weight})")
                print(f"  wrote {out_path.relative_to(ROOT)} ({out_path.stat().st_size // 1024} KiB)")
                rupee = "present" if RUPEE in font.getBestCmap() else "MISSING"
                print(f"    weight {weight}, rupee sign (U+20B9): {rupee}")

    LICENCE_FILE.write_text(NOTE.format(source=source.name, weights="\n".join(written)))
    print(f"wrote {LICENCE_FILE.relative_to(ROOT)} — the licence it travels under")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
