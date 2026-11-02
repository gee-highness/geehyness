"""Elevation grid from Copernicus GLO-30 (native 1 arc-sec ~30 m, TanDEM-X) -> data/dem.json.
Usage: python3 -I scripts/fetch_dem_glo30.py [step_m=40] [out=data/dem.json] [tile.tif]
Needs: pip install tifffile imagecodecs scipy numpy. Same output schema as fetch_dem.py.
Samples with bicubic interpolation of the native posts; light 3x3 median to drop DSM spikes (cars/roofs/noise)."""
import json, math, os, sys, urllib.request
import numpy as np, tifffile
from scipy.ndimage import map_coordinates, median_filter
LAT0, LON0 = -26.4966, 31.3826
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
STEP = int(sys.argv[1]) if len(sys.argv) > 1 else 40
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/dem.json"
TIF = sys.argv[3] if len(sys.argv) > 3 else "/tmp/glo30_S27_E031.tif"
X0, X1, Z0, Z1 = -28500, 7200, -24200, 5000
if not os.path.exists(TIF):
    u = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S27_00_E031_00_DEM/Copernicus_DSM_COG_10_S27_00_E031_00_DEM.tif"
    urllib.request.urlretrieve(u, TIF)
a = tifffile.imread(TIF).astype(np.float32)           # rows N->S, lat 0 -> -26 .. -27 ; cols lon 31..32
H, W = a.shape; a[a < -100] = np.nan
a = median_filter(np.nan_to_num(a, nan=float(np.nanmedian(a))), size=3)
xs = np.arange(X0, X1 + 1, STEP); zs = np.arange(Z0, Z1 + 1, STEP)
XX, ZZ = np.meshgrid(xs, zs)
lat = LAT0 - ZZ / KZ; lon = LON0 + XX / KX
# posts are at pixel centres: row r <-> lat -26 - (r+0.5)/H*... ; GLO-30 pixel-is-area, 1 arcsec
row = (-26.0 - lat) * H - 0.5; col = (lon - 31.0) * W - 0.5
h = map_coordinates(a, [row, col], order=3, mode="nearest")
json.dump({"x0": X0, "z0": Z0, "step": STEP, "nx": len(xs), "nz": len(zs), "h": [round(float(v), 1) for v in h.ravel()]}, open(OUT, "w"))
print("OK", h.size, "min", float(h.min()), "max", float(h.max()))
