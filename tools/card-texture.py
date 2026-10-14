#!/usr/bin/env python3
"""Bake the card's two materials into the mockup: the graded gold and the foil.

    python3 tools/card-texture.py

Home's card is one account at a time, and each account wears its own material.
The UPI card is the reference's: a liquid-metal swirl, warm and light, with the
account's own figures printed on it in dark ink. The owner supplied that metal as
chrome — a silver swirl — and this script grades it to the card's gold: the
luminance of the original is kept, and its hue is replaced by a cream-to-tan-to-
bronze ramp, which is what turns polished chrome into the pale gold the reference
card is made of.

The cash card is that same owner's foil (``cash-source.png``), and it is
deliberately *not* graded: they asked for the photo as it is, so all this does to
it is crop it to the card's shape, scale it and save it. That is what makes the
two cards read as two materials — warm gold beside cold silver — instead of one
material twice.

Both results are spliced into the mockup as data URIs rather than written beside
it, because the mockup is one hand-written file with no build step and no assets
directory (see INSTRUCTIONS.md). The splice targets are the ``--card-texture:``
and ``--cash-texture:`` declarations in its ``:root`` block: change a source
photo, the crop or a ramp colour in here and re-run. Never hand-edit a data URI,
and never write a texture into an asset file the mockup would have to fetch.
"""

from __future__ import annotations

import base64
import io
import pathlib
import re
import sys

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

REPO = pathlib.Path(__file__).resolve().parent.parent
DESIGN = REPO / "frontend" / "design"
GOLD_SOURCE = DESIGN / "card-source.png"
CASH_SOURCE = DESIGN / "cash-source.png"
MOCKUP = DESIGN / "mockup.html"

# The reference card's own proportions (the "5368 **** **** 9154" card on Home):
# each texture is cropped to that shape so the metal never stretches on the card.
CARD_RATIO = 3.15
OUT_WIDTH = 720          # roughly twice the card's width, for a 2x screen
QUALITY = 78

# The gold ramp: the darkest streak, the tan the metal passes through, and the
# highlight. Sampled off the reference's card — its darks are brown rather than
# black, and its lights are warm white, which is what reads as gold rather than
# as grey metal. The cash foil, being untinted, never sees these.
BLACK = (40, 30, 15)
MID = (190, 165, 112)
WHITE = (255, 253, 246)
MIDPOINT = 118           # where the tan sits on the 0-255 luminance ramp
BLUR = 0.7               # softens the chrome's own reflections into the card's
CONTRAST = 1.06
SATURATION = 0.9


def load(source: pathlib.Path) -> Image.Image:
    if not source.exists():
        raise SystemExit(f"missing {source} — a texture the cards are made from")
    return Image.open(source).convert("RGB")


def card_crop(image: Image.Image, source: pathlib.Path) -> Image.Image:
    """A centre crop at the card's own aspect: the metal must not stretch."""
    height = int(image.width / CARD_RATIO)
    if height > image.height:
        raise SystemExit(f"{source} is too wide for a {CARD_RATIO}:1 crop")
    top = (image.height - height) // 2
    return image.crop((0, top, image.width, top + height))


def resize(image: Image.Image) -> Image.Image:
    return image.resize((OUT_WIDTH, round(OUT_WIDTH / CARD_RATIO)), Image.LANCZOS)


def gold_texture() -> Image.Image:
    crop = card_crop(load(GOLD_SOURCE), GOLD_SOURCE)

    # The metal read as light alone: one channel of shading is what the ramp
    # below paints the gold onto.
    grey = ImageOps.autocontrast(crop.convert("L"), cutoff=1).filter(ImageFilter.GaussianBlur(0.6))

    graded = ImageOps.colorize(grey, black=BLACK, white=WHITE, mid=MID, midpoint=MIDPOINT)
    graded = graded.filter(ImageFilter.GaussianBlur(BLUR))
    graded = ImageEnhance.Contrast(graded).enhance(CONTRAST)
    graded = ImageEnhance.Color(graded).enhance(SATURATION)
    return resize(graded)


def cash_texture() -> Image.Image:
    """The owner's foil, untinted: cropped to the card and scaled, nothing else."""
    return resize(card_crop(load(CASH_SOURCE), CASH_SOURCE))


TEXTURES = (
    ("--card-texture", gold_texture),
    ("--cash-texture", cash_texture),
)


def splice(name: str, data_uri: str) -> None:
    """Replace one `--<name>: url("…")` value in the mockup, in place."""
    text = MOCKUP.read_text(encoding="utf-8")
    pattern = re.compile(rf"({name}:\s*)url\(\"[^\"]*\"\)")
    if not pattern.search(text):
        raise SystemExit(f'{MOCKUP} has no `{name}: url("…")` to replace')
    MOCKUP.write_text(
        pattern.sub(lambda match: f'{match.group(1)}url("{data_uri}")', text, count=1),
        encoding="utf-8",
    )


def main() -> int:
    for name, build in TEXTURES:
        texture = build()

        # JPEG, not PNG: these are photographs of reflections, so the compressed
        # form is a fraction of the bytes and nobody can tell on a card.
        buffer = io.BytesIO()
        texture.save(buffer, format="JPEG", quality=QUALITY, optimize=True, progressive=True)
        raw = buffer.getvalue()
        data_uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")

        splice(name, data_uri)
        print(f"  {name}  {texture.width}x{texture.height}  {len(raw) / 1024:.1f} KiB ({len(data_uri) / 1024:.1f} KiB encoded)")
    print(f"  written into {MOCKUP.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
