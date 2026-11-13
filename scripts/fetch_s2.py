"""Real ground colour from Sentinel-2 L2A true colour (10 m) -> data/s2_ground.png on the game grid (x east, z south, 10 m/px).
Usage: python3 -I scripts/fetch_s2.py [TCI.tif] [out.png]
Scene: S2B_36JUR_20240308 (0 % cloud), public on AWS open data. Contains modified Copernicus Sentinel data 2024.
Needs numpy, tifffile, imagecodecs, scipy, Pillow."""
import math, os, sys, urllib.request
import numpy as np, tifffile
from PIL import Image
from scipy.ndimage import map_coordinates
TIF = sys.argv[1] if len(sys.argv) > 1 else "/tmp/s2/tci.tif"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/s2_ground.png"
URL = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/36/J/UR/2024/3/S2B_36JUR_20240308_0_L2A/TCI.tif"
if not os.path.exists(TIF): os.makedirs(os.path.dirname(TIF), exist_ok=True); urllib.request.urlretrieve(URL, TIF)
LAT0, LON0 = -26.4966, 31.3826
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
X0, X1, Z0, Z1 = -10500, 6500, -6500, 5500; PX = 10
E0, N0, RES = 300000.0, 7100020.0, 10.0          # UTM 36S upper-left corner of tile 36JUR
def utm36s(lat, lon):                             # WGS84 transverse Mercator, central meridian 33 E
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996; e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    la, lo = np.radians(lat), np.radians(lon - 33.0)
    N = a / np.sqrt(1 - e2 * np.sin(la) ** 2); T = np.tan(la) ** 2; C = ep2 * np.cos(la) ** 2; A = np.cos(la) * lo
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * la - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * np.sin(2 * la)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * np.sin(4 * la) - (35 * e2 ** 3 / 3072) * np.sin(6 * la))
    E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000.0
    Nn = k0 * (M + N * np.tan(la) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720)) + 10000000.0
    return E, Nn
xs = np.arange(X0 + PX / 2, X1, PX); zs = np.arange(Z0 + PX / 2, Z1, PX)
XX, ZZ = np.meshgrid(xs, zs)
E, N = utm36s(LAT0 - ZZ / KZ, LON0 + XX / KX)
col, row = (E - E0) / RES - 0.5, (N0 - N) / RES - 0.5
img = tifffile.imread(TIF)
r0, r1, c0, c1 = int(row.min()) - 2, int(row.max()) + 3, int(col.min()) - 2, int(col.max()) + 3
sub = img[r0:r1, c0:c1].astype(np.float32)
out = np.stack([map_coordinates(sub[..., k], [row - r0, col - c0], order=1, mode="nearest") for k in range(3)], -1)
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(OUT, optimize=True)
print("OK", out.shape, "mean rgb", out.reshape(-1, 3).mean(0).round(1))
