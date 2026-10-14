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
it is turn it on its side, frame it and scale it — no colour reaches it at all.
That is what makes the two cards read as two materials — warm gold beside cold
silver — instead of one material twice.

The turning matters, and it is not decoration. The card is 3.15:1 and the foil is
portrait, so a window of the upright photo is a thin band across one crease or
two; the same window on the rotated photo takes in its whole width and most of
its height, which is how the card ends up showing the *pressed surface* — more of
the wrinkles, each one smaller — instead of one crease blown up large.

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
# The app cannot carry a 60 KiB data URI per card the way the one-file mockup
# does, so the same pixels are also written beside it as importable assets.
ASSETS = REPO / "frontend" / "src" / "assets"

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

# The cash card's own framing. The quarter turn is clockwise, which lays the
# foil's creases across the card rather than up it. `CASH_WINDOW` is the zoom:
# 1 takes the widest window the photo can give (the most wrinkles, each one
# smallest), and anything below 1 closes in on the photo's middle for a larger,
# calmer pattern — drop it to 0.7 if the foil ever reads as too busy.
CASH_ROTATION = -90
CASH_WINDOW = 1.0


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
    """The owner's foil, untinted: turned on its side, framed wide, scaled.

    No colour step runs here at all — that is the whole difference between this
    function and `gold_texture`, and the reason the two cards read as two
    materials.
    """
    image = load(CASH_SOURCE)

    # A quarter turn, expanded: the foil is portrait and the card is wide, and the
    # window below can only ever take a band of whatever it is handed.
    image = image.rotate(CASH_ROTATION, expand=True)

    # The widest 3.15:1 window this photo can give, centred — the whole width of
    # the rotated foil and as much of its height as the card's shape allows, which
    # is the most wrinkles that fit on one card. `CASH_WINDOW` narrows it towards
    # the middle of the photo for a bigger, calmer pattern.
    width = int(min(image.width, image.height * CARD_RATIO) * CASH_WINDOW)
    height = round(width / CARD_RATIO)
    left = (image.width - width) // 2
    top = (image.height - height) // 2
    return resize(image.crop((left, top, left + width, top + height)))


TEXTURES = (
    ("--card-texture", "card-gold.jpg", gold_texture),
    ("--cash-texture", "cash-silver.jpg", cash_texture),
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
    ASSETS.mkdir(parents=True, exist_ok=True)

    for name, filename, build in TEXTURES:
        texture = build()

        # JPEG, not PNG: these are photographs of reflections, so the compressed
        # form is a fraction of the bytes and nobody can tell on a card.
        buffer = io.BytesIO()
        texture.save(buffer, format="JPEG", quality=QUALITY, optimize=True, progressive=True)
        raw = buffer.getvalue()
        data_uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")

        splice(name, data_uri)

        asset = ASSETS / filename
        asset.write_bytes(raw)
        print(
            f"  {name}  {texture.width}x{texture.height}  {len(raw) / 1024:.1f} KiB "
            f"({len(data_uri) / 1024:.1f} KiB encoded)  + {asset.relative_to(REPO)}"
        )
    print(f"  written into {MOCKUP.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
