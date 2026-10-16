"""Vendor the greeting's face, **Anthropic Serif Display**, from the owner's OTFs.

The dashboard's greeting is the one line in the app set in a serif, and the owner
supplied the face for it as two static cuts of Anthropic's own display serif — the
Medium and its italic — which the greeting uses as one line, two styles: the word
("Hello,") italic, the name roman. Both are CFF outlines (PostScript, `2 000`
units per em) and both report their own family and weight, which this tool checks
rather than trusting the file names.

They are **static** cuts, not the variable font: each file is one weight and one
style, so the stylesheet registers two `@font-face` rules with an explicit
`font-weight: 500` and an explicit `font-style`, and the two can never be mixed up
by a browser picking the nearest axis value. The display/text optical size that a
variable serif would carry is not here either — the greeting is 28px and only ever
28px, which is what a display cut is drawn for.

**The licence is not in this repository.** The two files came from the owner's own
Downloads folder, with no licence document beside them, and Anthropic Serif is a
proprietary brand typeface rather than an open one — so unlike Bodoni Moda (OFL,
`tools/vendor-bodoni.py`) there is nothing to travel with the files. This tool
writes a NOTICE beside them recording their provenance and saying plainly that no
licence was supplied; whether they may be published is the owner's call, made the
same way as Neue Haas Grotesk's trial terms (see `tools/vendor-neue-haas.py`).

    python3 tools/vendor-anthropic-serif.py \\
        ~/Downloads/AnthropicSerif-Display-Medium-Static.otf \\
        ~/Downloads/AnthropicSerif-Display-MediumItalic-Static.otf

Run it again to move to a newer cut; it prints what it wrote, like the other tools
here. The order of the two arguments does not matter — each file says which style
it is, and the tool refuses anything that is not the roman-and-italic pair.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover - the message is the point
    raise SystemExit(
        "this tool converts the faces to woff2, so it needs fonttools:\n"
        "    python3 -m pip install fonttools brotli"
    )

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "app/src/assets/fonts"

# The family the stylesheet registers, and the weight both cuts report. The
# greeting asks for 500 because a static Medium cut has no axis to fall back on:
# describing it as 400 would have the browser synthesise a bold that is not there.
FAMILY = "Anthropic Serif Display"
WEIGHT = 500

# What the greeting actually sets, character by character — `Hello, Priyansh` —
# which is the coverage this tool checks, because a face that is missing one of
# them falls back on whatever comes next in the stack and the line goes mismatched.
GREETING = "HeloPryansh,"

NOTICE = """{family} — the greeting's face, as supplied by the owner.

Provenance: the owner supplied these cuts directly (this repository received them
as `{roman}` and `{italic}`). They are converted to woff2 by
`tools/vendor-anthropic-serif.py`; do not hand-edit the font files.

Terms: **no licence document was supplied with the files, and this repository
carries none.** Anthropic Serif is a proprietary typeface, not an open one, so
unlike the OFL face this replaced (Bodoni Moda) there is nothing that travels with
it. Whether these files may be served to the public is the owner's decision, and it
is the same knowing choice recorded beside Neue Haas Grotesk
(`tools/vendor-neue-haas.py`). Obtain a licence, or drop both files and the two
`@font-face` rules in `app/src/index.css`, before this site is shared widely.
"""


def face_of(path: Path) -> tuple[TTFont, bool]:
    """The font, and whether it is the italic cut, checked against its own tables.

    Every one of these three facts is in the file itself — the family, the weight
    and the style — so a renamed download cannot slip the wrong cut into the build.
    """
    font = TTFont(path)
    name = font["name"]
    # The typographic family (name ID 16) drops the weight a legacy system family
    # carries, so this is the name the stylesheet registers and the one to compare.
    family = name.getDebugName(16) or name.getDebugName(1) or ""
    if family != FAMILY:
        raise SystemExit(f"{path.name} is \"{family}\", not {FAMILY}")

    weight = font["OS/2"].usWeightClass
    if weight != WEIGHT:
        raise SystemExit(f"{path.name} is weight {weight}, not a Medium ({WEIGHT})")

    # Two places say italic and either is enough: the style bits on the head table
    # and the selection bits on OS/2.
    italic = bool(font["head"].macStyle & 0b10) or bool(font["OS/2"].fsSelection & 0b1)
    return font, italic


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        raise SystemExit(
            "usage: python3 tools/vendor-anthropic-serif.py <roman.otf> <italic.otf>"
        )

    faces: dict[bool, tuple[Path, TTFont]] = {}
    for raw in argv[1:]:
        path = Path(raw).expanduser()
        if not path.exists():
            raise SystemExit(f"no such file: {path}")
        font, italic = face_of(path)
        if italic in faces:
            raise SystemExit(f"both {faces[italic][0].name} and {path.name} are the same style")
        faces[italic] = (path, font)

    if set(faces) != {False, True}:
        raise SystemExit("the two files must be one roman and one italic cut of the same family")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    for italic in (False, True):
        source, font = faces[italic]
        style = "italic" if italic else "normal"
        out_name = f"anthropic-serif-display-{WEIGHT}{'-italic' if italic else ''}.woff2"
        out_path = OUT_DIR / out_name
        font.flavor = "woff2"
        font.save(out_path)
        css = f"{WEIGHT} {style}"

        cmap = font.getBestCmap()
        missing = sorted({char for char in GREETING if ord(char) not in cmap})
        # The rupee sign is deliberately *not* checked: neither this face nor the
        # sans stack is asked to draw money in the greeting, and a missing glyph
        # there would fall back on a system serif rather than break the line.
        print(f"wrote {out_path.relative_to(ROOT)} ({out_path.stat().st_size // 1024} KiB) — CSS {css}")
        print(f"  {font['maxp'].numGlyphs} glyphs, {font['head'].unitsPerEm} units/em")
        print(f"  greeting coverage: {'complete' if not missing else 'MISSING ' + ' '.join(missing)}")
        written.append(f"    {out_name}  ({source.name}, CSS {css})")

    notice_path = OUT_DIR / "anthropic-serif-display-NOTICE.txt"
    notice_path.write_text(
        NOTICE.format(
            family=FAMILY,
            roman=faces[False][0].name,
            italic=faces[True][0].name,
        )
        + "\nConverted from:\n"
        + "\n".join(written)
        + "\n"
    )
    print(f"wrote {notice_path.relative_to(ROOT)} — its provenance, and the absence of a licence")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
