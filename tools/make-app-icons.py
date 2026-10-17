#!/usr/bin/env python3
"""Draw the home-screen icons for TrackIt from the mark in `app/public/favicon.svg`.

The app shipped one 32×32 SVG mark, which is enough for a browser tab and not
enough to install: iOS wants a 180px PNG for the Home Screen, and a manifest wants
192 and 512. Both drawings already exist in the SVG — a full-bleed `#0A0F0D`
canvas and the clay diamond the ledger's own tiles use — so this script draws the
same two shapes at each size rather than introducing a second mark.

The SVG rounds the canvas' corners because it is a favicon; an app icon does not.
Every PNG here is full-bleed and opaque — the launcher, iOS included, supplies its
own mask — which is also what a `maskable` icon requires: its content has to sit
inside the safe circle at 80% of the icon, and a full canvas with a centred mark
at 31% of the half-width already does.

Supersampled four times and reduced with Lanczos, so the diamond's rotation is
antialiased rather than stepped. Pillow is the only dependency and the script is
not part of any build: run it by hand when the mark changes.

    python3 tools/make-app-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

# The favicon's own two colours, as the SVG writes them.
CANVAS = (10, 15, 13, 255)  # #0A0F0D
MARK = (212, 163, 115, 255)  # #D4A373

# The mark's geometry in the favicon's 32-unit viewBox: a 14-unit square with
# 4-unit corners, turned 45°.
SIDE = 14 / 32
RADIUS = 4 / 32

# Everything is drawn this many times too large and then reduced, which is what
# keeps the rotated square's edges smooth at 180px.
SUPERSAMPLE = 4

# Where the icons land, relative to the repository root.
OUT = Path(__file__).resolve().parent.parent / "app" / "public" / "icons"

# `size`, the file's name, and how much of the mark to draw. The maskable one is
# drawn a little smaller for the safe circle's comfort; the rest are identical.
ICONS = [
    (192, "icon-192.png", 1.0),
    (512, "icon-512.png", 1.0),
    (512, "icon-maskable-512.png", 0.86),
    (180, "apple-touch-icon-180.png", 1.0),
]


def draw(size: int, scale: float) -> Image.Image:
    """One icon: the canvas, and the mark on it at `scale` of its own size."""
    large = size * SUPERSAMPLE
    icon = Image.new("RGBA", (large, large), CANVAS)

    # The mark is drawn on its own layer so the 45° turn can resample just it;
    # rotating the finished icon would soften the canvas' edges against nothing.
    layer = Image.new("RGBA", (large, large), (0, 0, 0, 0))
    pencil = ImageDraw.Draw(layer)
    side = large * SIDE * scale
    radius = large * RADIUS * scale
    middle = large / 2
    pencil.rounded_rectangle(
        (middle - side / 2, middle - side / 2, middle + side / 2, middle + side / 2),
        radius=radius,
        fill=MARK,
    )

    icon.alpha_composite(layer.rotate(45, resample=Image.BICUBIC))
    return icon.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size, name, scale in ICONS:
        icon = draw(size, scale)
        # iOS ignores transparency in a Home Screen icon; the mark's canvas is
        # opaque anyway, so the Apple one is written without an alpha channel at
        # all rather than leaving it to the browser to flatten.
        if name.startswith("apple-"):
            icon.convert("RGB").save(OUT / name)
        else:
            icon.save(OUT / name)
        print(f"{OUT / name} — {size}×{size}")


if __name__ == "__main__":
    main()
