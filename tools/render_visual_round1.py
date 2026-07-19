"""Render the six locked Round 1 visual directions on identical map geometry.

These are code-native comparison frames, not production assets. Run with:
    py -3.12 tools/render_visual_round1.py
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, maximum_filter, minimum_filter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test" / "artifacts" / "visual_round1"
OUT.mkdir(parents=True, exist_ok=True)

W, H, SS = 780, 900, 2
WW, HH = W * SS, H * SS
RESAMPLE = Image.Resampling.LANCZOS


@dataclass(frozen=True)
class Style:
    slug: str
    title: str
    sea: str
    fills: tuple[str, ...]
    empire: str
    contested: str
    border: str
    label: str
    label_stroke: str
    border_px: int
    mode: str
    caption: str


STYLES = (
    Style("01_ink_atlas", "INK ATLAS", "#e9e1cf",
          ("#f8f4e9", "#f3efe5", "#faf6eb", "#f0ede4"),
          "#d8a62a", "#f7f1e4", "#312e2a", "#292720", "#f7f1e4", 1,
          "ink", "Paper-white field · ink coast · gold is the only loud color"),
    Style("02_bold_board", "BOLD BOARD", "#102e38",
          ("#176b70", "#573b69", "#2e624b", "#315d7b"),
          "#e2ad22", "#8c4867", "#241f25", "#fff8e8", "#241f25", 3,
          "bold", "Poster saturation · chunky chips · decisive charcoal seams"),
    Style("03_midnight_ops", "MIDNIGHT OPS", "#0b1220",
          ("#243345", "#30374b", "#263d3d", "#3b3045"),
          "#d5a72f", "#41364f", "#748095", "#e5e9ef", "#0b1220", 2,
          "midnight", "Command-screen dark · slate steps · restrained gold glow"),
    Style("04_pastel_provinces", "PASTEL PROVINCES", "#dcebf0",
          ("#9fbba8", "#9eb3c6", "#d9c7a4", "#c79e8f"),
          "#d2a34b", "#c89aa3", "#f7f3e9", "#514b44", "#f7f3e9", 3,
          "pastel", "Negative-space borders · muted provinces · airy ice-blue sea"),
    Style("05_duotone_field", "DUOTONE FIELD", "#1c2e43",
          ("#456078", "#5b7186", "#718699", "#8a9cab"),
          "#d8a52c", "#6f8092", "#1c2e43", "#f4f0e7", "#1c2e43", 1,
          "duotone", "Gold plus one slate family · no decorative noise · data-viz calm"),
    Style("06_carved_inlay", "CARVED INLAY", "#392e2a",
          ("#557478", "#70586e", "#67765c", "#566b82"),
          "#c89832", "#79586d", "#2a2524", "#f4ead9", "#2a2524", 2,
          "inlay", "Flat inlaid pieces · light inner lip · dark outer cut"),
)


SEEDS = np.array([
    (.16, .80), (.36, .83), (.57, .84), (.79, .79),
    (.10, .63), (.30, .64), (.50, .67), (.71, .64), (.91, .59),
    (.17, .46), (.38, .48), (.59, .49), (.80, .43),
    (.25, .30), (.46, .31), (.67, .28), (.86, .29), (.54, .13),
], dtype=np.float32)

NAMES = (
    "EMBER LANDING", "TAX HAVEN", "BROKEN HOLLOWS", "IRON SHELF",
    "POWDER FIELDS", "DUST WASTES", "CINDER BARRENS", "MIRROR PLATEAU", "SALT REACH",
    "COPPER PASS", "GLASS DIVIDE", "GRANITE RIDGE", "STATIC MARSH",
    "PALE BASIN", "THORN VALLEY", "RUST FLATS", "BLEAK FORK", "SILENT SPUR",
)

NATIONS = (0, 0, 0, 0, 1, 1, 2, 2, 2, 1, 1, 2, 2, 3, 3, 3, 3, 3)
EMPIRE = {0, 1, 2, 3}
CONTESTED = 6


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "bahnschrift.ttf" if not bold else "bahnschrift.ttf"
    candidates = [Path("C:/Windows/Fonts") / name,
                  Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf")]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size * SS)
    return ImageFont.load_default()


def make_geometry() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    yy, xx = np.mgrid[0:HH, 0:WW].astype(np.float32)
    x, y = xx / WW, yy / HH
    rng = np.random.default_rng(1776)
    small = rng.normal(0, 1, (HH // 12, WW // 12)).astype(np.float32)
    small = gaussian_filter(small, 4.5)
    small -= small.mean()
    small /= max(1e-6, small.std())
    noise = np.asarray(Image.fromarray(small, mode="F").resize((WW, HH), Image.Resampling.BICUBIC))

    coast = ((x - .52) / .61) ** 2 + ((y - .58) / .59) ** 2
    coast += .055 * np.sin(x * 19 + y * 7) + .04 * np.sin(y * 25 - x * 9)
    land = coast < 1.0 + noise * .035

    wx = x + .018 * np.sin(y * 31) + noise * .008
    wy = y + .015 * np.sin(x * 27 + .6) - noise * .006
    labels = np.full((HH, WW), -1, np.int16)
    best = np.full((HH, WW), np.inf, np.float32)
    for idx, (sx, sy) in enumerate(SEEDS):
        d = (wx - sx) ** 2 + (wy - sy) ** 2
        take = land & (d < best)
        labels[take] = idx
        best[take] = d[take]

    up = np.roll(labels, 1, axis=0)
    left = np.roll(labels, 1, axis=1)
    boundary = (labels != up) | (labels != left)
    coast_edge = land & ((up < 0) | (left < 0) |
                         (np.roll(labels, -1, axis=0) < 0) |
                         (np.roll(labels, -1, axis=1) < 0))
    return labels, land, boundary, coast_edge


LABELS, LAND, BOUNDARY, COAST_EDGE = make_geometry()


def rgb(value: str) -> np.ndarray:
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.uint8)


def territory_color(style: Style, idx: int) -> str:
    if idx in EMPIRE:
        return style.empire
    if idx == CONTESTED:
        return style.contested
    return style.fills[NATIONS[idx] % len(style.fills)]


def mask_overlay(base: Image.Image, overlay: Image.Image, mask: np.ndarray) -> None:
    region = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    clipped = overlay.copy()
    clipped.putalpha(ImageChops.multiply(overlay.getchannel("A"), region))
    base.alpha_composite(clipped)


def draw_crossed_swords(draw: ImageDraw.ImageDraw, x: int, y: int, color: str, width: int) -> None:
    x *= SS; y *= SS; width *= SS
    length = 18 * SS
    for sign in (-1, 1):
        draw.line((x - length, y + sign * length, x + length, y - sign * length), fill=color, width=width)
        draw.line((x - length - 4 * SS, y + sign * (length - 4 * SS),
                   x - length + 5 * SS, y + sign * (length + 5 * SS)), fill=color, width=width)
        draw.ellipse((x + length - 3 * SS, y - sign * length - 3 * SS,
                      x + length + 3 * SS, y - sign * length + 3 * SS), fill=color)


def render(style: Style) -> Image.Image:
    arr = np.empty((HH, WW, 3), np.uint8)
    arr[:] = rgb(style.sea)
    for idx in range(len(SEEDS)):
        arr[LABELS == idx] = rgb(territory_color(style, idx))
    image = Image.fromarray(arr, mode="RGB").convert("RGBA")

    # Every direction uses the same smooth geometry; only its graphic grammar changes.
    if style.mode == "pastel":
        gaps = maximum_filter(BOUNDARY.astype(np.uint8), size=7 * SS) > 0
        gap_layer = Image.new("RGBA", (WW, HH), style.border)
        mask_overlay(image, gap_layer, gaps & LAND)
    elif style.mode == "inlay":
        dark = maximum_filter(BOUNDARY.astype(np.uint8), size=3 * SS) > 0
        image.paste(Image.new("RGBA", image.size, style.border), (0, 0), Image.fromarray((dark * 255).astype("uint8")))
        tl = LAND & ((np.roll(LABELS, 2 * SS, 0) != LABELS) | (np.roll(LABELS, 2 * SS, 1) != LABELS))
        image.paste(Image.new("RGBA", image.size, "#a8aaa0"), (0, 0), Image.fromarray((tl * 150).astype("uint8")))
    else:
        width = max(1, style.border_px * SS)
        edge = maximum_filter(BOUNDARY.astype(np.uint8), size=width * 2 + 1) > 0
        image.paste(Image.new("RGBA", image.size, style.border), (0, 0), Image.fromarray((edge * 255).astype("uint8")))
        # Refill the interiors so the stroke sits cleanly on the seam.
        interior = minimum_filter((~BOUNDARY).astype(np.uint8), size=max(1, width)) > 0
        refill = Image.fromarray(arr, mode="RGB").convert("RGBA")
        image.paste(refill, (0, 0), Image.fromarray(((interior & LAND) * 255).astype("uint8")))

    draw = ImageDraw.Draw(image, "RGBA")

    if style.mode == "midnight":
        glow = maximum_filter((LABELS < 4).astype(np.uint8), size=17 * SS) > 0
        glow &= ~(LABELS < 4)
        image.paste(Image.new("RGBA", image.size, "#d6a72f28"), (0, 0), Image.fromarray((glow * 110).astype("uint8")))
    elif style.mode == "ink":
        # Sparse chart marks only in open sea.
        for x, y in ((85, 130), (640, 82), (94, 345), (700, 718)):
            draw.arc((x * SS, y * SS, (x + 44) * SS, (y + 16) * SS), 200, 340, fill="#6d665650", width=2 * SS)
    elif style.mode == "inlay":
        for x, y in ((155, 566), (510, 368), (665, 210)):
            draw.arc((x * SS, y * SS, (x + 34) * SS, (y + 12) * SS), 190, 350, fill="#d7c7aa55", width=2 * SS)

    # Contested grammar is intentionally different in each direction.
    contested_mask = LABELS == CONTESTED
    hatch = Image.new("RGBA", (WW, HH), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hatch)
    if style.mode == "pastel":
        ring = (maximum_filter(contested_mask.astype(np.uint8), size=5 * SS) > 0) & ~contested_mask
        dots = np.zeros_like(ring)
        dots[::12 * SS, ::12 * SS] = True
        dotted = maximum_filter(dots.astype(np.uint8), size=3 * SS) > 0
        image.paste(Image.new("RGBA", image.size, "#8c6f76"), (0, 0), Image.fromarray(((ring & dotted) * 255).astype("uint8")))
    else:
        hatch_color = "#f6c54a" if style.mode != "ink" else "#b58419"
        step = 22 if style.mode in ("ink", "duotone") else 16
        for p in range(-HH, WW, step * SS):
            hd.line((p, HH, p + HH, 0), fill=hatch_color + ("55" if style.mode != "bold" else "88"), width=(2 if style.mode != "bold" else 5) * SS)
        mask_overlay(image, hatch, contested_mask)

    draw = ImageDraw.Draw(image, "RGBA")
    # Nation labels sit behind territory labels and remain restrained.
    nation_specs = (("KOROVIA", 160, 395), ("VRAESK", 600, 350), ("DRAESK", 604, 570), ("EMPIRE", 333, 755))
    nation_font = font(28 if style.mode == "bold" else 24, True)
    for text, x, y in nation_specs:
        fill = style.label if text != "EMPIRE" else ("#3a2b08" if style.mode != "midnight" else "#fff0b2")
        draw.text((x * SS, y * SS), text, font=nation_font, anchor="mm", fill=fill + "9d",
                  stroke_width=1 * SS, stroke_fill=style.label_stroke + "70")

    label_font = font(15 if style.mode not in ("bold", "duotone") else 16, True)
    for idx, (sx, sy) in enumerate(SEEDS):
        if idx in (0, 3, 8, 13, 16, 17):
            continue
        x, y = int(sx * W), int(sy * H)
        text = NAMES[idx]
        box = draw.textbbox((x * SS, y * SS), text, font=label_font, anchor="mm", stroke_width=0)
        if style.mode == "bold":
            pad_x, pad_y = 9 * SS, 5 * SS
            draw.rounded_rectangle((box[0] - pad_x, box[1] - pad_y, box[2] + pad_x, box[3] + pad_y),
                                   radius=10 * SS, fill="#1a202bd0")
            draw.text((x * SS, y * SS), text, font=label_font, anchor="mm", fill=style.label)
        else:
            stroke = 1 * SS if style.mode in ("midnight", "inlay") else 0
            draw.text((x * SS, y * SS), text, font=label_font, anchor="mm", fill=style.label,
                      stroke_width=stroke, stroke_fill=style.label_stroke)

    swords_color = "#fff3cb" if style.mode in ("bold", "midnight", "inlay") else "#6b4a0a"
    draw_crossed_swords(draw, int(SEEDS[CONTESTED][0] * W), int(SEEDS[CONTESTED][1] * H) - 28, swords_color, 3)

    if style.mode == "duotone":
        # One tiny legend is the only secondary ornament.
        draw.rounded_rectangle((24 * SS, 24 * SS, 245 * SS, 64 * SS), radius=8 * SS, fill="#142437d9")
        draw.ellipse((42 * SS, 38 * SS, 52 * SS, 48 * SS), fill=style.empire)
        draw.text((63 * SS, 43 * SS), "CORPORATE CONTROL", font=font(12, True), anchor="lm", fill="#f4f0e7")

    return image.convert("RGB").resize((W, H), RESAMPLE)


def contact_sheet(rendered: list[tuple[Style, Image.Image]]) -> Image.Image:
    cell_w, cell_h = 520, 600
    margin, header, footer = 24, 62, 64
    sheet = Image.new("RGB", (margin * 4 + cell_w * 3, margin * 3 + (header + cell_h + footer) * 2), "#111722")
    draw = ImageDraw.Draw(sheet)
    for i, (style, frame) in enumerate(rendered):
        col, row = i % 3, i // 3
        x = margin + col * (cell_w + margin)
        y = margin + row * (header + cell_h + footer + margin)
        draw.rounded_rectangle((x, y, x + cell_w, y + header + cell_h + footer), radius=18, fill="#1a2230", outline="#344156", width=2)
        draw.text((x + 20, y + 30), f"{i + 1}. {style.title}", font=font(17, True).font_variant(size=34), anchor="lm", fill="#f5f0e5")
        thumb = frame.resize((cell_w, cell_h), RESAMPLE)
        sheet.paste(thumb, (x, y + header))
        cap_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
        draw.text((x + 18, y + header + cell_h + 30), style.caption, font=cap_font, anchor="lm", fill="#aab8cb")
    return sheet


def main() -> None:
    rendered: list[tuple[Style, Image.Image]] = []
    for style in STYLES:
        frame = render(style)
        frame.save(OUT / f"{style.slug}.png", quality=95)
        rendered.append((style, frame))
    contact_sheet(rendered).save(OUT / "round1_contact_sheet.png", quality=95)
    print(f"Rendered {len(rendered)} concepts to {OUT}")


if __name__ == "__main__":
    main()
