#!/usr/bin/env python3
"""The app's icon set, drawn from the owner's mark.

The mark is one file — `app/public/favicon.png`, 512px of the interlocking T on its own black
field, exactly as the owner supplied it. Every icon the manifest and `index.html` point at is a
landing of that same drawing at a different size, so they are generated here rather than
hand-exported: the geometry cannot drift between them, and a change to the mark is one run.

**The mark becomes an alpha matte first.** In the master it is a light drawing on a black field;
the field is the *artboard*, not the icon, so the luminance becomes the alpha channel and the ink
becomes `--ink` (`#F4F0EA`). Everything from there is composited over `--canvas` (`#0A0F0D`) —
the owner's field, so an icon and the app's own canvas are the same black on a home screen, and a
launcher that scales one slightly differently cannot show a seam.

**The launcher shows the mark larger than the tab does.** In the master — the owner's own file,
shipped as the favicon — the drawing sits at 44% of the square, with the generous margin the
artwork was delivered with. A tab renders that at 16px, where the margin is what makes it read;
a launcher renders a 192px tile at 48–60px, where the same margin leaves the mark looking small.
So the icons take the mark out of the master's framing and place it themselves: **57%** for the
two `any` icons, **55%** for the iOS tile, and **50%** for the maskable one, whose safe zone is
the central 80% circle — a 256px mark's diagonal (~274px) stays inside that at every crop shape
Android uses.

Output is RGBA everywhere (iOS and Android both composite these), with the field drawn in rather
than left transparent: a transparent background would show the launcher's own white behind a
cream mark, which is the one combination this palette cannot do.

    python3 tools/make-icons.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "app/public/favicon.png"
ICONS = ROOT / "app/public/icons"

# The palette's own values, copied from `app/src/index.css` (`ink` palette).
CANVAS = (0x0A, 0x0F, 0x0D)
INK = (0xF4, 0xF0, 0xEA)

# Where each icon lands, and how much of its square the mark takes.
SIZES = {
    "icon-192x192.png": (192, 0.57),
    "icon-512x512.png": (512, 0.57),
    "icon-maskable-512x512.png": (512, 0.5),
    "apple-touch-icon-180.png": (180, 0.55),
}


def matte() -> Image.Image:
    """The master's drawing as RGBA ink on transparency, cropped to its own ink."""
    master = Image.open(MASTER).convert("RGB")
    # The field is black and the mark is light, so the brightest channel is the coverage: an
    # antialiased edge keeps its partial value, which is what makes the downscale smooth.
    alpha = master.convert("L")
    ink = Image.new("RGBA", master.size, (*INK, 255))
    ink.putalpha(alpha)
    box = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if box is None:
        raise SystemExit(f"{MASTER} has no mark in it — is it the right file?")
    return ink.crop(box)


def compose(mark: Image.Image, size: int, share: float) -> Image.Image:
    """Land the mark in a `size` square, centred at `share` of its width, on the canvas field."""
    width = max(1, round(size * share))
    height = max(1, round(width * mark.height / mark.width))
    scaled = mark.resize((width, height), Image.LANCZOS)
    icon = Image.new("RGBA", (size, size), (*CANVAS, 255))
    icon.alpha_composite(scaled, ((size - width) // 2, (size - height) // 2))
    return icon


def main() -> None:
    mark = matte()
    ICONS.mkdir(parents=True, exist_ok=True)
    for name, (size, share) in SIZES.items():
        icon = compose(mark, size, share)
        icon.save(ICONS / name, optimize=True)
        print(f"{ICONS / name}  {icon.width}x{icon.height}  mark {round(size * share)}px")


if __name__ == "__main__":
    main()
