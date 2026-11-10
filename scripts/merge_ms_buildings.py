"""Add buildings that exist on aerial imagery but are missing from OpenStreetMap.
Source: Microsoft Global ML Building Footprints (ODbL), quadkey 300301322 (auto-traced from high-resolution imagery).
Usage: python3 -I scripts/merge_ms_buildings.py <osm_dir> <osm2_dir> <ms.csv.gz> <out.json>
Keeps a Microsoft footprint only when < 15 % of it is already covered by an OSM building, it is 12-6000 m2, and it lies in the game rectangle.
Output is Overpass-style JSON (ways with geometry) so build_world.py reads it like any other bld_*.json."""
import glob, gzip, json, math, sys
import numpy as np
from PIL import Image, ImageDraw
osm, osm2, src, out = sys.argv[1:5]
LAT0, LON0 = -26.4966, 31.3826
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
X0, X1, Z0, Z1 = -10500, 6500, -6500, 5500; R = 2.0
P = lambda lat, lon: ((lon - LON0) * KX, -(lat - LAT0) * KZ)
W, H = int((X1 - X0) / R), int((Z1 - Z0) / R)
mask = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(mask); n_osm = 0
for f in glob.glob(f"{osm}/bld_*.json") + glob.glob(f"{osm2}/bld_*.json"):
    if f.endswith("bld_ms.json"): continue
    for e in json.load(open(f))["elements"]:
        g = e.get("geometry")
        if e["type"] == "way" and g and len(g) > 3:
            dr.polygon([((P(q["lat"], q["lon"])[0] - X0) / R, (P(q["lat"], q["lon"])[1] - Z0) / R) for q in g], fill=1); n_osm += 1
M = np.asarray(mask)
els, seen, skipped = [], 0, 0
for line in gzip.open(src, "rt"):
    ring = json.loads(line)["geometry"]["coordinates"][0]
    pts = [P(la, lo) for lo, la in ring]
    cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    if not (X0 + 5 < cx < X1 - 5 and Z0 + 5 < cz < Z1 - 5): continue
    seen += 1
    area = abs(sum(pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1] for i in range(len(pts) - 1))) / 2
    if not 12 <= area <= 6000: skipped += 1; continue
    xs = [(p[0] - X0) / R for p in pts]; zs = [(p[1] - Z0) / R for p in pts]
    x0, x1, z0, z1 = max(0, int(min(xs)) - 1), min(W, int(max(xs)) + 2), max(0, int(min(zs)) - 1), min(H, int(max(zs)) + 2)
    m = Image.new("L", (x1 - x0, z1 - z0), 0); ImageDraw.Draw(m).polygon([(x - x0, z - z0) for x, z in zip(xs, zs)], fill=1)
    mk = np.asarray(m) > 0
    if mk.sum() and (M[z0:z1, x0:x1][mk].mean() >= 0.15): skipped += 1; continue
    dr.polygon(list(zip(xs, zs)), fill=1); M = np.asarray(mask) if len(els) % 500 == 0 else M   # also de-duplicates MS against itself (refreshed in batches)
    els.append({"type": "way", "id": -(len(els) + 1), "tags": {"building": "yes", "source": "microsoft_ml"}, "geometry": [{"lat": la, "lon": lo} for lo, la in ring]})
json.dump({"elements": els}, open(out, "w"), separators=(",", ":"))
print("osm buildings", n_osm, "| microsoft in area", seen, "| added", len(els), "| already mapped / out of range", skipped)
