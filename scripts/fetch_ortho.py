"""Aerial orthophoto of Manzini (17 cm drone survey, Aug 2024) -> game-grid rasters.
Source: OpenAerialMap "Manzini Municipality", National Disaster Management Agency (Eswatini), CC-BY 4.0.
Usage: python3 -I scripts/fetch_ortho.py [src.tif]   (downloads ~820 MB to /tmp/oam/manzini.tif when missing)
Writes: data/ortho_1m.jpg  (1 m/px working copy: roof colours, building checks; not shipped)
        data/ortho_meta.json (game-space bounds of the rasters)
        public/assets/world/ortho.jpg (2 m/px ground texture, alpha in ortho_mask.png)
Needs rasterio, numpy, Pillow. The game grid is linear in lon/lat, so the target is a plain EPSG:4326 grid."""
import json, math, os, sys, urllib.request
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import Affine
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/oam/manzini.tif"
URL = "https://oin-hotosm-temp.s3.us-east-1.amazonaws.com/672cd3f604bd070001991c41/0/672cd3f604bd070001991c42.tif"
if not os.path.exists(SRC): os.makedirs(os.path.dirname(SRC), exist_ok=True); urllib.request.urlretrieve(URL, SRC)
LAT0, LON0 = -26.4966, 31.3826
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
BX0, BX1, BZ0, BZ1 = -3600, 4280, -3660, 4060          # game-space box around the surveyed area (metres)
def warp(res):
    w, h = int((BX1 - BX0) / res), int((BZ1 - BZ0) / res)
    dst = np.full((3, h, w), 255, np.uint8)
    T = Affine(res / KX, 0, LON0 + BX0 / KX, 0, -res / KZ, LAT0 - BZ0 / KZ)
    with rasterio.open(SRC) as d:
        reproject(rasterio.band(d, [1, 2, 3]), dst, dst_transform=T, dst_crs="EPSG:4326", resampling=Resampling.average, dst_nodata=255, src_nodata=255)
    return np.moveaxis(dst, 0, -1)
a = warp(1.0)
valid = ~((a[..., 0] > 250) & (a[..., 1] > 250) & (a[..., 2] > 250))
Image.fromarray(a).save("data/ortho_1m.jpg", quality=88)
Image.fromarray((valid * 255).astype(np.uint8)).save("data/ortho_1m_mask.png", optimize=True)
h, w = a.shape[:2]
b = a[:h // 2 * 2, :w // 2 * 2].reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3)).astype(np.uint8)
m = valid[:h // 2 * 2, :w // 2 * 2].reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3))
Image.fromarray(b).save("public/assets/world/ortho.jpg", quality=84, optimize=True)
from PIL import ImageFilter
Image.fromarray((m * 255).astype(np.uint8)).resize((w // 16, h // 16), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3)).save("public/assets/world/ortho_mask.png", optimize=True)
json.dump({"bounds": [BX0, BX1, BZ0, BZ1], "res1": 1.0, "res_game": 2.0, "source": "OpenAerialMap / NDMA Eswatini, CC-BY 4.0, 2024-08"}, open("data/ortho_meta.json", "w"))
print("OK", a.shape, "valid", round(float(valid.mean()), 3))
