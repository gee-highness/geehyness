"""Build a 250 m elevation grid from AWS Terrain Tiles (terrarium z11, SRTM/Copernicus-derived). Output: /tmp/dem.json"""
import io, json, math, urllib.request
import numpy as np
from PIL import Image
LAT0, LON0 = -26.4966, 31.3826
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
X0, X1, Z0, Z1, STEP, Z = -28500, 7200, -24200, 5000, 250, 11
n = 2 ** Z
def tile_xy(lat, lon):
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
a = tile_xy(LAT0 - Z0 / KZ, LON0 + X0 / KX); b = tile_xy(LAT0 - Z1 / KZ, LON0 + X1 / KX)
tx0, tx1, ty0, ty1 = int(a[0]), int(b[0]), int(a[1]), int(b[1])
mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        req = urllib.request.Request(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png", headers={"User-Agent": "toy-circuit/1.0"})
        im = np.array(Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert("RGB")).astype(np.float32)
        mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
xs = list(range(X0, X1 + 1, STEP)); zs = list(range(Z0, Z1 + 1, STEP)); out = []
for z in zs:
    for x in xs:
        fx, fy = tile_xy(LAT0 - z / KZ, LON0 + x / KX)
        px, py = (fx - tx0) * 256, (fy - ty0) * 256
        i, j = int(px), int(py); u, v = px - i, py - j
        out.append(float(mosaic[j, i] * (1 - u) * (1 - v) + mosaic[j, i + 1] * u * (1 - v) + mosaic[j + 1, i] * (1 - u) * v + mosaic[j + 1, i + 1] * u * v))
json.dump({"x0": X0, "z0": Z0, "step": STEP, "nx": len(xs), "nz": len(zs), "h": [round(h, 1) for h in out]}, open("/tmp/dem.json", "w"))
print("OK", len(out), "min", min(out), "max", max(out))
