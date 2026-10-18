"""Vendor **Anthropic Serif Text** — the editorial cut the app sets its context in.

The greeting and the screen titles are Anthropic Serif **Display** (the optical size
drawn for 24px and up; `vendor-anthropic-serif.py` owns those two files). Everything
that is the *other* serif role — a note after a bullet, an input placeholder, the
quiet line under a figure — is set in the **Text** cut, whose optical size is drawn
for reading sizes. It is a separate family on purpose: asking a 12px line for the
display cut is how an italic starts to look like a caption in a magazine rather than
a note in a ledger.

The owner supplied the whole family (Display and Text, every weight) as `fontiko`
OTFs. This tool vendors the two cuts the app asks for — Regular and Regular Italic —
and nothing else: each `@font-face` rule in `app/src/index.css` names one file, one
weight and one style, so a browser never synthesises an italic or guesses a weight.

    python3 tools/vendor-anthropic-serif-text.py \\
        ~/Downloads/AnthropicSerif-Text-Regular-Static.otf \\
        ~/Downloads/AnthropicSerif-Text-RegularItalic-Static.otf

It prints what it wrote. Like the display tool it checks the greeting pool against
the faces it converted: the serif is one family to the reader even when it is two
files to the browser, and a missing glyph would be finished by Georgia mid-line.
"""

from __future__ import annotations

import re
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

FAMILY = "Anthropic Serif Text"
WEIGHT = 400

POOL = ROOT / "app/src/lib/greetings.ts"
OWNER = ROOT / "app/src/lib/owner.ts"
WORD = re.compile(r'word: "([^"]+)"')
OWNER_NAME = re.compile(r'export const OWNER_NAME = "([^"]+)"')

NOTICE = """{family} — the app's editorial serif, as supplied by the owner.

Provenance: the owner supplied the full Anthropic Serif family (Display and Text,
all weights) directly. These two cuts were converted to woff2 by
`tools/vendor-anthropic-serif-text.py`; do not hand-edit the font files.

Terms: **no licence document was supplied with the files, and this repository
carries none.** Anthropic Serif is a proprietary typeface, not an open one, so
unlike an OFL face there is nothing that travels with it. Whether these files may
be served to the public is the owner's decision, recorded in the same place as the
display cut's (`anthropic-serif-display-NOTICE.txt`). Obtain a licence, or drop both
files and their `@font-face` rules in `app/src/index.css`, before this site is
shared widely.
"""


def greeting_text() -> tuple[str, list[str]]:
    """Every character the serif can be asked to set, and the words they are in."""
    words = WORD.findall(POOL.read_text(encoding="utf-8"))
    owner = OWNER_NAME.search(OWNER.read_text(encoding="utf-8"))
    if not words or owner is None:
        raise SystemExit(f"could not read the greeting out of {POOL} and {OWNER}")
    return "".join(words) + owner.group(1), [*words, owner.group(1)]


def face_of(path: Path) -> tuple[TTFont, bool]:
    """The font, and whether it is the italic cut, checked against its own tables."""
    font = TTFont(path)
    name = font["name"]
    family = name.getDebugName(16) or name.getDebugName(1) or ""
    if family != FAMILY:
        raise SystemExit(f'{path.name} is "{family}", not {FAMILY}')

    weight = font["OS/2"].usWeightClass
    if weight != WEIGHT:
        raise SystemExit(f"{path.name} is weight {weight}, not a Regular ({WEIGHT})")

    italic = bool(font["head"].macStyle & 0b10) or bool(font["OS/2"].fsSelection & 0b1)
    return font, italic


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        raise SystemExit(
            "usage: python3 tools/vendor-anthropic-serif-text.py <regular.otf> <regular-italic.otf>"
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

    # Coverage before writing anything, so a word the text cut cannot draw fails the
    # run rather than leaving half-converted binaries behind.
    text, words = greeting_text()
    for italic in (False, True):
        cmap = faces[italic][1].getBestCmap()
        missing = sorted({char for char in text if ord(char) not in cmap})
        if missing:
            raise SystemExit(
                f"{faces[italic][0].name} cannot set {', '.join(missing)} "
                "— fix app/src/lib/greetings.ts before vendoring again"
            )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    for italic in (False, True):
        source, font = faces[italic]
        style = "italic" if italic else "normal"
        out_name = f"anthropic-serif-text-{WEIGHT}{'-italic' if italic else ''}.woff2"
        out_path = OUT_DIR / out_name
        font.flavor = "woff2"
        font.save(out_path)

        print(f"wrote {out_path.relative_to(ROOT)} ({out_path.stat().st_size // 1024} KiB) — CSS {WEIGHT} {style}")
        print(f"  {font['maxp'].numGlyphs} glyphs, {font['head'].unitsPerEm} units/em")
        print(f"  greeting coverage: complete — {len(words)} words in the pool and the owner's name")
        written.append(f"    {out_name}  ({source.name}, CSS {WEIGHT} {style})")

    notice_path = OUT_DIR / "anthropic-serif-text-NOTICE.txt"
    notice_path.write_text(
        NOTICE.format(family=FAMILY, roman=faces[False][0].name, italic=faces[True][0].name)
        + "\nConverted from:\n"
        + "\n".join(written)
        + "\n"
    )
    print(f"wrote {notice_path.relative_to(ROOT)} — its provenance, and the absence of a licence")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
