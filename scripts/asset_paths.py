"""Portable paths and review fonts for the expansion authoring scripts."""

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXPANSION_DIR = PROJECT_ROOT / "output" / "expansion-20260910"
PROCESSED_DIR = EXPANSION_DIR / "processed"
PACK_ROOT = PROJECT_ROOT / "dist" / "packs" / "reading-room"


def production_dir():
    """Prefer an explicit source directory, then bundled sources, then legacy files."""
    configured = os.environ.get("ROAM_ART_SOURCE_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    bundled = EXPANSION_DIR / "production"
    if bundled.is_dir():
        return bundled
    return Path("/tmp/roam-expansion-20260910")


def review_font(size=18):
    """Load a configured font, an installed Chinese font, or Pillow's default."""
    from PIL import ImageFont

    candidates = []
    configured = os.environ.get("ROAM_REVIEW_FONT")
    if configured:
        candidates.append(Path(configured).expanduser())
    windows_fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    candidates.extend([
        Path("/System/Library/Fonts/STHeiti Light.ttc"),
        Path("/System/Library/Fonts/PingFang.ttc"),
        windows_fonts / "msyh.ttc",
        windows_fonts / "simhei.ttf",
        windows_fonts / "simsun.ttc",
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
        Path("/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"),
    ])
    for candidate in candidates:
        try:
            return ImageFont.truetype(str(candidate), size)
        except (OSError, ValueError):
            continue

    # Also find fonts installed under user directories or distro-specific layouts.
    font_dirs = [
        Path.home() / ".local/share/fonts",
        Path.home() / ".fonts",
        Path.home() / "Library/Fonts",
        Path("/Library/Fonts"),
        Path("/usr/share/fonts"),
        Path("/usr/local/share/fonts"),
        windows_fonts,
    ]
    chinese_names = ("notosanscjk", "notoserifcjk", "notosanssc", "notoserifsc",
                     "sourcehansans", "sourcehanserif", "wqy", "droidsansfallback",
                     "pingfang", "stheiti", "msyh", "simhei", "simsun")
    for directory in font_dirs:
        if not directory.is_dir():
            continue
        for candidate in sorted(directory.rglob("*")):
            if candidate.suffix.lower() not in {".ttf", ".ttc", ".otf"}:
                continue
            if not any(name in candidate.name.lower() for name in chinese_names):
                continue
            try:
                return ImageFont.truetype(str(candidate), size)
            except (OSError, ValueError):
                continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow versions before the size parameter was added.
        return ImageFont.load_default()
