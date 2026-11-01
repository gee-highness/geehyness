"""Downscale building/pavement/ballast textures to 512 px (4x less GPU memory, same look at their tile sizes)."""
import glob, os
from PIL import Image
NAMES = ["white_plaster_rough_01", "yellow_plaster", "concrete_wall_007", "brick_wall_02", "corrugated_iron", "rusty_corrugated_iron", "clay_roof_tiles_03", "grey_roof_tiles", "herringbone_pavement_03", "concrete_pavement", "gravel_road"]
for n in NAMES:
    for f in glob.glob(f"public/assets/tex/{n}_*.jpg"):
        im = Image.open(f)
        if im.width > 512: im.resize((512, 512), Image.LANCZOS).convert("RGB").save(f, quality=86, optimize=True)
tot = sum(os.path.getsize(f) for f in glob.glob("public/assets/tex/*.jpg")); print("textures now", tot // 1024, "KB")
