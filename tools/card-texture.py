#!/usr/bin/env python3
"""Grade the owner's chrome texture into the bank card's gold, and bake it in.

    python3 tools/card-texture.py

The card Home leads with is the reference's: a liquid-metal swirl, warm and
light, with the account's own figures printed on it in dark ink. The owner
supplied the metal as chrome — a silver swirl — and this script grades it to the
card's gold: the luminance of the original is kept, and its hue is replaced by a
cream-to-tan-to-bronze ramp, which is what turns polished chrome into the pale
gold the reference card is made of.

The result is spliced into the mockup as a data URI rather than written beside
it, because the mockup is one hand-written file with no build step and no
assets directory (see INSTRUCTIONS.md). The splice target is the single
``--card-texture:`` declaration in the mockup's ``:root`` block: change the
source photo, the crop or a ramp colour in here and re-run. Never hand-edit the
data URI, and never write the texture into an asset file the mockup would have
to fetch.
"""

from __future__ import annotations

import base64
import io
import pathlib
import re
import sys

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

REPO = pathlib.Path(__file__).resolve().parent.parent
SOURCE = REPO / "frontend" / "design" / "card-source.png"
MOCKUP = REPO / "frontend" / "design" / "mockup.html"

# The reference card's own proportions (the "5368 **** **** 9154" card on Home):
# the texture is cropped to that shape so the swirl never stretches on the card.
CARD_RATIO = 3.15
OUT_WIDTH = 720          # roughly twice the card's width, for a 2x screen
QUALITY = 78

# The gold ramp: the darkest streak, the tan the metal passes through, and the
# highlight. Sampled off the reference's card — its darks are brown rather than
# black, and its lights are warm white, which is what reads as gold rather than
# as grey metal.
BLACK = (40, 30, 15)
MID = (190, 165, 112)
WHITE = (255, 253, 246)
MIDPOINT = 118           # where the tan sits on the 0-255 luminance ramp
BLUR = 0.7               # softens the chrome's own reflections into the card's
CONTRAST = 1.06
SATURATION = 0.9


def texture() -> Image.Image:
    if not SOURCE.exists():
        raise SystemExit(f"missing {SOURCE} — the chrome texture the card is graded from")
    source = Image.open(SOURCE).convert("RGB")

    # A centre crop at the card's own aspect, then the metal read as light alone:
    # one channel of shading is what the ramp below paints the gold onto.
    height = int(source.width / CARD_RATIO)
    if height > source.height:
        raise SystemExit(f"{SOURCE} is too wide for a {CARD_RATIO}:1 crop")
    top = (source.height - height) // 2
    crop = source.crop((0, top, source.width, top + height))
    grey = ImageOps.autocontrast(crop.convert("L"), cutoff=1).filter(ImageFilter.GaussianBlur(0.6))

    graded = ImageOps.colorize(grey, black=BLACK, white=WHITE, mid=MID, midpoint=MIDPOINT)
    graded = graded.filter(ImageFilter.GaussianBlur(BLUR))
    graded = ImageEnhance.Contrast(graded).enhance(CONTRAST)
    graded = ImageEnhance.Color(graded).enhance(SATURATION)
    return graded.resize((OUT_WIDTH, round(OUT_WIDTH / CARD_RATIO)), Image.LANCZOS)


def splice(data_uri: str) -> None:
    """Replace the one `--card-texture:` value in the mockup, in place."""
    text = MOCKUP.read_text(encoding="utf-8")
    pattern = re.compile(r"(--card-texture:\s*)url\(\"[^\"]*\"\)")
    if not pattern.search(text):
        raise SystemExit(f"{MOCKUP} has no `--card-texture: url(\"…\")` to replace")
    MOCKUP.write_text(pattern.sub(lambda match: f'{match.group(1)}url("{data_uri}")', text, count=1), encoding="utf-8")


def main() -> int:
    graded = texture()

    # JPEG, not PNG: this is a photograph of a reflection, so the compressed
    # form is a fraction of the bytes and nobody can tell on a card.
    buffer = io.BytesIO()
    graded.save(buffer, format="JPEG", quality=QUALITY, optimize=True, progressive=True)
    raw = buffer.getvalue()
    data_uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")

    splice(data_uri)
    print(f"  {SOURCE.relative_to(REPO)}  {graded.width}x{graded.height}")
    print(f"  {MOCKUP.relative_to(REPO)}  {len(raw) / 1024:.1f} KiB of texture ({len(data_uri) / 1024:.1f} KiB encoded)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
