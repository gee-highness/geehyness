"""Convert OSM extracts (Overpass JSON) + DEM into compact game assets in public/assets/world.

Usage: python3 -I scripts/build_world.py <osm_dir> <dem.json> <out_dir>
Coordinates: metres, x = east, z = south (north is -z), origin = Manzini centre. Ints are decimetres.
"""
import json, math, random, struct, sys, os
import numpy as np
from PIL import Image, ImageDraw

osm_dir, dem_path, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
LAT0, LON0 = -26.4966, 31.3826
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
X0, X1, Z0, Z1 = -28500, 7200, -24200, 5000
PX = 25  # ground raster cell, metres
random.seed(7)

def P(lat, lon): return ((lon - LON0) * KX, -(lat - LAT0) * KZ)
def load(n): return json.load(open(f"{osm_dir}/{n}.json"))["elements"]
def poly(e): return [P(g["lat"], g["lon"]) for g in e.get("geometry", [])]
dm = lambda v: int(round(v * 10))

# ---------------- DEM -> Int16 decimetres
dem = json.load(open(dem_path))
open(f"{out}/height.bin", "wb").write(struct.pack(f"<{len(dem['h'])}h", *[int(round(h * 10)) for h in dem["h"]]))

# ---------------- roads
CL = {"motorway": 0, "motorway_link": 0, "trunk": 1, "trunk_link": 1, "primary": 2, "primary_link": 2,
      "secondary": 3, "secondary_link": 3, "tertiary": 4, "tertiary_link": 4, "residential": 5, "unclassified": 5,
      "living_street": 5, "service": 6, "track": 7, "path": 8, "footway": 8, "cycleway": 8, "pedestrian": 8, "steps": 8}
WID = [14, 7.4, 7.2, 7.0, 6.2, 5.6, 4.0, 3.4, 1.6]
roads, water_polys, ground_polys, nodes_major = [], [], [], []
for e in load("roads"):
    if e["type"] != "way": continue
    t = e.get("tags", {}); g = poly(e)
    if len(g) < 2: continue
    if "highway" in t and t["highway"] in CL:
        c = CL[t["highway"]]
        lanes = t.get("lanes"); w = WID[c]
        try:
            if lanes and c <= 4: w = max(5.0, int(lanes) * 3.5) if t.get("oneway") != "yes" else max(4.0, int(lanes) * 3.6)
            if "width" in t: w = float(t["width"].split()[0])
        except ValueError: pass
        unpaved = t.get("surface", "") in ("unpaved", "dirt", "ground", "gravel", "sand", "compacted", "earth", "grass", "mud")
        if c == 7 or (unpaved and c >= 5): u = 1
        else: u = 0
        br = 1 if (t.get("bridge") or t.get("tunnel") or t.get("embankment") == "yes") else 0
        roads.append({"c": c, "w": round(w, 1), "u": u, "b": br, "o": 1 if t.get("oneway") == "yes" else 0,
                      "r": t.get("ref", ""), "n": t.get("name", ""), "p": [dm(v) for pt in g for v in pt]})
        if c <= 3: nodes_major.extend((x, z, t.get("ref", "")) for x, z in g)
    elif t.get("waterway") in ("river", "stream"):
        roads.append({"c": 9, "w": 6.0 if t["waterway"] == "river" else 2.2, "u": 0, "b": 0, "o": 0, "r": "", "n": t.get("name", ""),
                      "p": [dm(v) for pt in g for v in pt]})
    else:
        kind = t.get("natural") or t.get("landuse") or t.get("leisure")
        if kind and len(g) > 3: ground_polys.append((kind, g, t))
        if t.get("natural") == "water" and len(g) > 3: water_polys.append({"p": [dm(v) for pt in g for v in pt]})
json.dump({"roads": roads, "water": water_polys}, open(f"{out}/roads.json", "w"), separators=(",", ":"))
print("roads", len(roads), "water", len(water_polys))

# ---------------- ground colour + class rasters (25 m)
W, H = (X1 - X0) // PX, (Z1 - Z0) // PX
col = Image.new("RGB", (W, H), (150, 140, 96)); cls = Image.new("L", (W, H), 1)
dc, dk = ImageDraw.Draw(col), ImageDraw.Draw(cls)
# kind -> (rgb, class id)  ids follow the game's ground classes
STYLE = {"residential": ((142, 138, 112), 8), "commercial": ((150, 148, 140), 8), "retail": ((150, 148, 140), 8),
         "industrial": ((128, 120, 108), 9), "farmland": ((168, 150, 96), 4), "farmyard": ((160, 140, 100), 4),
         "orchard": ((92, 130, 70), 4), "vineyard": ((92, 130, 70), 4), "plant_nursery": ((92, 130, 70), 4),
         "meadow": ((118, 140, 80), 2), "grass": ((112, 142, 84), 2), "recreation_ground": ((104, 146, 84), 2),
         "park": ((98, 146, 84), 2), "pitch": ((104, 146, 84), 2), "forest": ((52, 92, 54), 5), "wood": ((52, 92, 54), 5),
         "scrub": ((106, 120, 70), 1), "heath": ((130, 128, 84), 1), "grassland": ((118, 138, 82), 2), "wetland": ((84, 122, 96), 12),
         "water": ((52, 96, 128), 12), "reservoir": ((52, 96, 128), 12), "cemetery": ((110, 130, 96), 2), "quarry": ((156, 138, 118), 6),
         "bare_rock": ((150, 142, 130), 6), "sand": ((196, 180, 140), 10), "construction": ((170, 150, 120), 7),
         "brownfield": ((170, 150, 120), 7), "religious": ((120, 130, 96), 2), "military": ((120, 128, 90), 2), "garages": ((140, 138, 130), 8)}
ORDER = ["farmland", "farmyard", "grassland", "heath", "scrub", "meadow", "grass", "orchard", "vineyard", "plant_nursery", "forest", "wood",
         "wetland", "sand", "bare_rock", "quarry", "brownfield", "construction", "residential", "commercial", "retail", "industrial", "garages", "cemetery",
         "religious", "military", "recreation_ground", "park", "pitch", "water", "reservoir"]
rank = {k: i for i, k in enumerate(ORDER)}
ground_polys.sort(key=lambda a: rank.get(a[0], -1))
wood_masks = []
for kind, g, t in ground_polys:
    if kind not in STYLE: continue
    rgb, cid = STYLE[kind]
    pts = [((x - X0) / PX, (z - Z0) / PX) for x, z in g]
    dc.polygon(pts, fill=rgb); dk.polygon(pts, fill=cid)
# buildings darken the ground slightly (urban footprint) - drawn later with building list
bl = []
types = {"house": 0, "detached": 0, "semidetached_house": 0, "terrace": 0, "bungalow": 0, "residential": 0, "hut": 0, "cabin": 0,
         "apartments": 4, "dormitory": 4, "hotel": 4, "office": 4, "commercial": 2, "retail": 2, "supermarket": 2, "kiosk": 2,
         "industrial": 3, "warehouse": 3, "hangar": 3, "factory": 3, "service": 3, "farm_auxiliary": 3, "barn": 3, "storage_tank": 3,
         "school": 5, "hospital": 5, "church": 5, "mosque": 5, "public": 5, "civic": 5, "government": 5, "university": 5, "college": 5,
         "carport": 6, "garage": 6, "garages": 6, "roof": 6, "shed": 6}
def add_b(e, tags, g):
    if len(g) < 4: return
    bt = tags.get("building", "yes")
    ty = types.get(bt, 1)
    area = abs(sum(g[i][0] * g[(i + 1) % len(g)][1] - g[(i + 1) % len(g)][0] * g[i][1] for i in range(len(g)))) / 2
    if area < 6: return
    try: lv = float(tags.get("building:levels", 0))
    except ValueError: lv = 0
    try: h = float(str(tags.get("height", 0)).split()[0])
    except ValueError: h = 0
    if not h:
        if lv: h = lv * 3.2 + 0.6
        elif ty == 0: h = 3.4 + random.random() * 1.6
        elif ty == 6: h = 2.6
        elif ty == 3: h = 6 + random.random() * 3
        elif ty == 2: h = 4.2 + random.random() * 2.5
        elif ty == 4: h = 9 + random.random() * 6
        elif ty == 5: h = 5 + random.random() * 2
        else: h = 3.6 + random.random() * 2 if area < 140 else 4.5 + random.random() * 3
    h = max(2.4, min(h, 60))
    if g[0] == g[-1]: g = g[:-1]
    bl.append([ty, dm(h), [dm(v) for pt in g for v in pt]])
    pts = [((x - X0) / PX, (z - Z0) / PX) for x, z in g]
    dc.polygon(pts, fill=(118, 112, 100))
seen = set()
for n in ("bld_manzini", "bld_ezulwini"):
    for e in load(n):
        if e["id"] in seen: continue
        seen.add(e["id"])
        t = e.get("tags", {})
        if e["type"] == "way": add_b(e, t, poly(e))
        elif e["type"] == "relation":
            for m in e.get("members", []):
                if m.get("role") == "outer" and m.get("geometry"): add_b(e, t, [P(g["lat"], g["lon"]) for g in m["geometry"]])
json.dump({"b": bl}, open(f"{out}/buildings.json", "w"), separators=(",", ":"))
print("buildings", len(bl))
col.save(f"{out}/groundcolor.png", optimize=True); cls.save(f"{out}/groundclass.png", optimize=True)

# ---------------- trees from raster (forest + residential gardens)
arr = np.array(cls); trees = []
for cid, prob in ((5, 0.5), (8, 0.025), (2, 0.004), (4, 0.01)):
    ys, xs = np.nonzero(arr == cid)
    keep = np.random.default_rng(cid).random(len(xs)) < prob
    for xi, yi in zip(xs[keep], ys[keep]):
        trees.append((X0 + (xi + random.random()) * PX, Z0 + (yi + random.random()) * PX, cid))
random.shuffle(trees); trees = trees[:90000]
open(f"{out}/trees.bin", "wb").write(b"".join(struct.pack("<ffB", x, z, c) for x, z, c in trees))
print("trees", len(trees))

# ---------------- places, POIs, signals, spawn, landmarks
pts = load("points")
places = [{"n": e["tags"]["name"], "k": e["tags"]["place"], "p": [round(v, 1) for v in P(e["lat"], e["lon"])]}
          for e in pts if e["tags"].get("place") in ("city", "town", "suburb", "village", "neighbourhood", "hamlet")]
KEEP = ("mall", "supermarket", "marketplace", "fuel", "hospital", "bus_station", "school", "college", "university", "place_of_worship", "bank", "police", "restaurant", "fast_food", "convenience")
pois = []
for e in pts:
    t = e["tags"]; k = t.get("amenity") or t.get("shop") or t.get("tourism")
    if t.get("name") and k and (k in KEEP or t.get("shop") in ("mall", "supermarket")):
        pois.append({"n": t["name"], "k": k, "p": [round(v, 1) for v in P(e["lat"], e["lon"])]})
signals = [[round(v, 1) for v in P(e["lat"], e["lon"])] for e in pts if e["tags"].get("highway") == "traffic_signals"]
mx = np.array([[x, z] for x, z, r in nodes_major])
def snap(x, z):
    i = int(np.argmin((mx[:, 0] - x) ** 2 + (mx[:, 1] - z) ** 2)); return [round(float(mx[i, 0]), 1), round(float(mx[i, 1]), 1)]
# spawn: eastbound MR3 carriageway node nearest the centre
best = None
for r in roads:
    if r["c"] <= 3 and r["o"]:
        p = r["p"]
        for i in range(0, len(p) - 2, 2):
            dx, dz = (p[i + 2] - p[i]) / 10, (p[i + 3] - p[i + 1]) / 10
            d = math.hypot(p[i] / 10, p[i + 1] / 10)
            if dx > 0 and (best is None or d < best[0]) and math.hypot(dx, dz) > 4: best = (d, p[i] / 10, p[i + 1] / 10, dx, dz)
spawn = {"x": best[1], "z": best[2], "yaw": math.atan2(best[3], best[4])}
want = {"manzini": (-26.4966, 31.3826), "matsapha": (-26.4945, 31.3084), "lobamba": (-26.4463, 31.2084), "ezulwini": (-26.4018, 31.1783),
        "malkerns": (-26.5319, 31.1890), "mbabane": (-26.3257, 31.1447)}
snaps = {k: snap(*P(*v)) for k, v in want.items()}
meta = {"lat0": LAT0, "lon0": LON0, "bounds": [X0, X1, Z0, Z1], "px": PX, "gw": W, "gh": H,
        "dem": {"x0": dem["x0"], "z0": dem["z0"], "step": dem["step"], "nx": dem["nx"], "nz": dem["nz"]},
        "spawn": spawn, "places": places, "pois": pois, "signals": signals, "snaps": snaps}
json.dump(meta, open(f"{out}/meta.json", "w"), separators=(",", ":"))
print("spawn", spawn, "snaps", snaps)
