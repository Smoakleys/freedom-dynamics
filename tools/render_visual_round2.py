"""Round 2: controlled branches around the Bold Board winner."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import maximum_filter

import render_visual_round1 as r1


OUT = r1.ROOT / "test" / "artifacts" / "visual_round2"
OUT.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class Variant:
    slug: str
    title: str
    caption: str
    sea: str
    enemies: tuple[str, str, str]
    empire: str
    contested: str
    internal: str
    national: str
    coast: str
    label: str
    label_stroke: str
    chip: str | None
    internal_px: float
    national_px: float
    hatch: str
    label_density: str = "full"


VARIANTS = (
    Variant("01_tuned_original", "TUNED ORIGINAL",
            "Winning grammar, cleaner hierarchy · the control frame",
            "#102f39", ("#684879", "#2f7358", "#3c6e91"), "#e6ae20", "#985168",
            "#332a31", "#211d22", "#1a2025", "#fff8e9", "#211d22", "#191c26dc",
            2.0, 4.0, "wide"),
    Variant("02_lighter_seams", "LIGHTER SEAMS",
            "Thin territory lines · strong nation/coast edge · more color showing",
            "#10333d", ("#765287", "#347b60", "#437a9e"), "#e8b526", "#9b5673",
            "#3d3540", "#201e23", "#171d21", "#fff8e9", "#25202a", "#1b2130d8",
            1.0, 4.5, "fine"),
    Variant("03_nation_hierarchy", "NATION HIERARCHY",
            "Heavy national borders · hairline provinces · unboxed cartographic type",
            "#112e38", ("#6e4c7d", "#32745b", "#3e7192"), "#e2ab25", "#8f526c",
            "#433b43", "#17171b", "#17171b", "#fff9e8", "#222126", None,
            .75, 5.0, "sparse"),
    Variant("04_color_forward", "COLOR-FORWARD",
            "Brighter jewel factions · no chips · uniform medium seams",
            "#0d3542", ("#7a4588", "#237c5a", "#337ca6"), "#efb716", "#b74e72",
            "#29232d", "#29232d", "#17232a", "#fff9e8", "#241e29", None,
            2.0, 2.5, "wide"),
    Variant("05_warm_premium", "WARM PREMIUM",
            "Warmer matte jewels · cream chips · dark-brown cuts",
            "#17343a", ("#744f6d", "#467454", "#496f8a"), "#dfa82d", "#a15f6a",
            "#4b3b35", "#2a201d", "#211b18", "#2d2722", "#f7edda", "#f7eddae8",
            1.5, 3.5, "dots"),
    Variant("06_front_signal", "FRONT SIGNAL",
            "Quieter labels · hotter contested province · battle takes priority",
            "#0f303a", ("#674a7b", "#317059", "#3d7192"), "#e8af20", "#bb4f5f",
            "#332a31", "#211d22", "#171d22", "#fff9ea", "#211d22", "#171c26dc",
            1.5, 4.0, "chevrons", "reduced"),
)


def group_map() -> np.ndarray:
    groups = np.full_like(r1.LABELS, -1)
    for idx in range(len(r1.SEEDS)):
        group = 0 if idx in r1.EMPIRE else r1.NATIONS[idx]
        groups[r1.LABELS == idx] = group
    return groups


GROUPS = group_map()
LABEL_BOUNDARY = ((r1.LABELS != np.roll(r1.LABELS, 1, 0)) |
                  (r1.LABELS != np.roll(r1.LABELS, 1, 1)))
GROUP_BOUNDARY = ((GROUPS != np.roll(GROUPS, 1, 0)) |
                  (GROUPS != np.roll(GROUPS, 1, 1)))
COAST = r1.LAND & ((np.roll(r1.LABELS, 1, 0) < 0) |
                   (np.roll(r1.LABELS, -1, 0) < 0) |
                   (np.roll(r1.LABELS, 1, 1) < 0) |
                   (np.roll(r1.LABELS, -1, 1) < 0))


def solid_overlay(image: Image.Image, mask: np.ndarray, color: str) -> None:
    overlay = Image.new("RGBA", image.size, color)
    r1.mask_overlay(image, overlay, mask)


def edge_mask(source: np.ndarray, width: float) -> np.ndarray:
    size = max(1, int(round(width * r1.SS * 2 + 1)))
    return maximum_filter(source.astype(np.uint8), size=size) > 0


def draw_hatch(image: Image.Image, variant: Variant) -> None:
    mask = r1.LABELS == r1.CONTESTED
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    gold = "#ffd14f"
    if variant.hatch in ("wide", "fine", "sparse"):
        step = {"wide": 18, "fine": 26, "sparse": 34}[variant.hatch] * r1.SS
        width = {"wide": 5, "fine": 2, "sparse": 2}[variant.hatch] * r1.SS
        alpha = {"wide": "8c", "fine": "76", "sparse": "62"}[variant.hatch]
        for p in range(-r1.HH, r1.WW, step):
            draw.line((p, r1.HH, p + r1.HH, 0), fill=gold + alpha, width=width)
    elif variant.hatch == "dots":
        for y in range(0, r1.HH, 24 * r1.SS):
            for x in range((y // (24 * r1.SS) % 2) * 12 * r1.SS, r1.WW, 24 * r1.SS):
                draw.ellipse((x - 2 * r1.SS, y - 2 * r1.SS, x + 2 * r1.SS, y + 2 * r1.SS), fill=gold + "9c")
    else:
        for y in range(70 * r1.SS, r1.HH, 48 * r1.SS):
            for x in range(-20 * r1.SS, r1.WW, 58 * r1.SS):
                draw.line((x, y, x + 14 * r1.SS, y - 12 * r1.SS, x + 28 * r1.SS, y),
                          fill=gold + "a8", width=4 * r1.SS, joint="curve")
    r1.mask_overlay(image, overlay, mask)


def render(variant: Variant) -> Image.Image:
    arr = np.empty((r1.HH, r1.WW, 3), np.uint8)
    arr[:] = r1.rgb(variant.sea)
    for idx in range(len(r1.SEEDS)):
        if idx in r1.EMPIRE:
            color = variant.empire
        elif idx == r1.CONTESTED:
            color = variant.contested
        else:
            color = variant.enemies[(r1.NATIONS[idx] - 1) % len(variant.enemies)]
        arr[r1.LABELS == idx] = r1.rgb(color)
    image = Image.fromarray(arr, mode="RGB").convert("RGBA")

    solid_overlay(image, edge_mask(LABEL_BOUNDARY, variant.internal_px), variant.internal)
    solid_overlay(image, edge_mask(GROUP_BOUNDARY, variant.national_px), variant.national)
    solid_overlay(image, edge_mask(COAST, max(2.5, variant.national_px)), variant.coast)
    draw_hatch(image, variant)

    draw = ImageDraw.Draw(image, "RGBA")
    nation_font = r1.font(25, True)
    nation_specs = (("KOROVIA", 150, 395), ("VRAESK", 604, 350), ("DRAESK", 618, 560), ("EMPIRE", 345, 757))
    for text, x, y in nation_specs:
        color = "#32230b" if text == "EMPIRE" and variant.title != "WARM PREMIUM" else variant.label
        draw.text((x * r1.SS, y * r1.SS), text, font=nation_font, anchor="mm", fill=color + "b8",
                  stroke_width=r1.SS, stroke_fill=variant.label_stroke + "80")

    label_font = r1.font(15, True)
    skipped = {0, 3, 8, 13, 16, 17}
    if variant.label_density == "reduced":
        skipped |= {4, 9, 12, 14, 15}
    for idx, (sx, sy) in enumerate(r1.SEEDS):
        if idx in skipped:
            continue
        x, y = int(sx * r1.W), int(sy * r1.H)
        text = r1.NAMES[idx]
        if variant.chip:
            box = draw.textbbox((x * r1.SS, y * r1.SS), text, font=label_font, anchor="mm")
            pad_x, pad_y = 8 * r1.SS, 4 * r1.SS
            draw.rounded_rectangle((box[0] - pad_x, box[1] - pad_y, box[2] + pad_x, box[3] + pad_y),
                                   radius=9 * r1.SS, fill=variant.chip)
            text_color = variant.label if variant.title != "WARM PREMIUM" else "#312924"
            draw.text((x * r1.SS, y * r1.SS), text, font=label_font, anchor="mm", fill=text_color)
        else:
            draw.text((x * r1.SS, y * r1.SS), text, font=label_font, anchor="mm", fill=variant.label,
                      stroke_width=r1.SS, stroke_fill=variant.label_stroke)

    r1.draw_crossed_swords(draw, int(r1.SEEDS[r1.CONTESTED][0] * r1.W),
                           int(r1.SEEDS[r1.CONTESTED][1] * r1.H) - 30, "#fff1bd", 3)
    return image.convert("RGB").resize((r1.W, r1.H), r1.RESAMPLE)


def sheet(frames: list[tuple[Variant, Image.Image]]) -> Image.Image:
    cell_w, cell_h = 520, 600
    margin, header, footer = 24, 62, 64
    out = Image.new("RGB", (margin * 4 + cell_w * 3, margin * 3 + (header + cell_h + footer) * 2), "#111722")
    draw = ImageDraw.Draw(out)
    title_font = ImageFont.truetype("C:/Windows/Fonts/bahnschrift.ttf", 32)
    cap_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
    for i, (variant, frame) in enumerate(frames):
        col, row = i % 3, i // 3
        x = margin + col * (cell_w + margin)
        y = margin + row * (header + cell_h + footer + margin)
        draw.rounded_rectangle((x, y, x + cell_w, y + header + cell_h + footer), radius=18,
                               fill="#1a2230", outline="#344156", width=2)
        draw.text((x + 18, y + 31), f"{i + 1}. {variant.title}", font=title_font, anchor="lm", fill="#f5f0e5")
        out.paste(frame.resize((cell_w, cell_h), r1.RESAMPLE), (x, y + header))
        draw.text((x + 18, y + header + cell_h + 30), variant.caption, font=cap_font, anchor="lm", fill="#aab8cb")
    return out


def main() -> None:
    frames: list[tuple[Variant, Image.Image]] = []
    for variant in VARIANTS:
        frame = render(variant)
        frame.save(OUT / f"{variant.slug}.png", quality=95)
        frames.append((variant, frame))
    sheet(frames).save(OUT / "round2_contact_sheet.png", quality=95)
    print(f"Rendered {len(frames)} Bold Board branches to {OUT}")


if __name__ == "__main__":
    main()
