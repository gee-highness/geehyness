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
col = Image.new("RGB", (W, H), (112, 120, 72)); cls = Image.new("L", (W, H), 1)
dc, dk = ImageDraw.Draw(col), ImageDraw.Draw(cls)
# kind -> (rgb, class id)  ids follow the game's ground classes
STYLE = {"residential": ((116, 124, 88), 8), "commercial": ((138, 138, 130), 8), "retail": ((138, 138, 130), 8),
         "industrial": ((128, 120, 108), 9), "farmland": ((150, 148, 84), 4), "farmyard": ((140, 132, 92), 4),
         "orchard": ((92, 130, 70), 4), "vineyard": ((92, 130, 70), 4), "plant_nursery": ((92, 130, 70), 4),
         "meadow": ((118, 140, 80), 2), "grass": ((112, 142, 84), 2), "recreation_ground": ((104, 146, 84), 2),
         "park": ((98, 146, 84), 2), "pitch": ((104, 146, 84), 2), "forest": ((52, 92, 54), 5), "wood": ((52, 92, 54), 5),
         "scrub": ((92, 112, 62), 1), "heath": ((118, 122, 72), 1), "grassland": ((118, 138, 82), 2), "wetland": ((84, 122, 96), 12),
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
# ---------------- building uses, inferred from the street map (OSM carries almost no use tags)
# use codes: 0 house 1 villa 2 apartments 3 shop 4 supermarket/retail 5 mall 6 office/bank 7 industrial 8 shed/garage
#            9 school 10 church 11 clinic/hospital 12 fuel-shop 13 hotel/lodge 14 civic 15 restaurant 16 farm 17 canopy(not solid)
TAGUSE = {"house": 0, "detached": 0, "semidetached_house": 0, "terrace": 0, "bungalow": 0, "residential": 0, "hut": 8, "cabin": 8,
          "apartments": 2, "dormitory": 13, "hotel": 13, "guest_house": 13, "office": 6, "commercial": 3, "retail": 4, "supermarket": 4, "kiosk": 3,
          "industrial": 7, "warehouse": 7, "hangar": 7, "factory": 7, "service": 8, "farm_auxiliary": 16, "barn": 16, "storage_tank": 7,
          "school": 9, "university": 9, "college": 9, "kindergarten": 9, "church": 10, "chapel": 10, "cathedral": 10, "mosque": 10, "temple": 10,
          "hospital": 11, "clinic": 11, "public": 14, "civic": 14, "government": 14, "carport": 17, "roof": 17, "canopy": 17,
          "garage": 8, "garages": 8, "shed": 8, "construction": 8, "greenhouse": 16, "stable": 16}
SIGNS = []  # unique (text, bg, fg)
def sign_id(t, bg, fg):
    k = (t, bg, fg)
    if k not in SIGNS: SIGNS.append(k)
    return SIGNS.index(k)
SHOPS = [("SHOPRITE", "#e1251b", "#ffffff"), ("PICK n PAY", "#0b3d91", "#ffd200"), ("SPAR", "#1b7f3b", "#ffffff"), ("OK FOODS", "#d71920", "#ffffff"),
         ("BOXER", "#f7941d", "#1a1a1a"), ("PEP", "#0072bc", "#ffffff"), ("MR PRICE", "#262626", "#ffffff"), ("MTN", "#ffcb05", "#000000"),
         ("ESWATINI MOBILE", "#e2231a", "#ffffff"), ("PHARMACY", "#00843d", "#ffffff"), ("HARDWARE", "#f58220", "#000000"), ("BUTCHERY", "#8b1a1a", "#ffffff"),
         ("HAIR SALON", "#9b2c8f", "#ffffff"), ("TUCK SHOP", "#2b6cb0", "#ffffff"), ("CELL PHONES", "#0e7490", "#ffffff"), ("FURNITURE", "#7c4a21", "#ffffff"),
         ("TAKE AWAYS", "#c2410c", "#ffffff"), ("LIQUOR STORE", "#1f2937", "#fbbf24"), ("CLOTHING", "#be185d", "#ffffff"), ("BAKERY", "#b45309", "#ffffff"),
         ("KFC", "#e4002b", "#ffffff"), ("DEBONAIRS PIZZA", "#d71920", "#ffd200"), ("GENERAL DEALER", "#365314", "#ffffff"), ("CASH LOAN", "#0f766e", "#ffffff")]
BANKS = [("STANDARD BANK", "#0033a0", "#ffffff"), ("FNB", "#00a19c", "#ffffff"), ("NEDBANK", "#00703c", "#ffffff"), ("ESWATINI BANK", "#1d4ed8", "#ffffff")]
FUELS = [("ENGEN", "#e2001a", "#ffffff"), ("SHELL", "#fbce07", "#d4101a"), ("TOTAL", "#e30613", "#ffffff"), ("PUMA", "#d71920", "#ffffff")]
KNOWN = {"shoprite": SHOPS[0], "pick n pay": SHOPS[1], "spar": SHOPS[2], "ok": SHOPS[3], "boxer": SHOPS[4], "pep": SHOPS[5], "kfc": SHOPS[20], "mtn": SHOPS[7],
         "standard bank": BANKS[0], "fnb": BANKS[1], "nedbank": BANKS[2], "engen": FUELS[0], "shell": FUELS[1], "total": FUELS[2]}
def brand_for(name, pool, h):
    n = (name or "").lower()
    for k, v in KNOWN.items():
        if k in n: return sign_id(*v)
    if name: return sign_id(name.upper()[:24], "#" + "%02x%02x%02x" % (60 + int(h * 120) % 160, 70 + int(h * 977) % 120, 90 + int(h * 313) % 140), "#ffffff")
    return sign_id(*pool[int(h * 7919) % len(pool)])

# road frontage + density helpers
from collections import defaultdict
ROADPTS = defaultdict(list)
for r in roads:
    if r["c"] <= 4:
        p = r["p"]
        for i in range(0, len(p) - 3, 2):
            ax, az, bx, bz = p[i] / 10, p[i + 1] / 10, p[i + 2] / 10, p[i + 3] / 10
            n = max(1, int(math.hypot(bx - ax, bz - az) // 20))
            for k in range(n + 1):
                x, z = ax + (bx - ax) * k / n, az + (bz - az) * k / n
                ROADPTS[(int(x // 50), int(z // 50))].append((x, z, r["c"]))
def road_dist(x, z, maxc=4):
    cx, cz = int(x // 50), int(z // 50); best = 1e9
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            for (px, pz, c) in ROADPTS.get((cx + a, cz + b), ()):
                if c <= maxc:
                    d = math.hypot(px - x, pz - z)
                    if d < best: best = d
    return best
POIS = [e for e in load("points") if e["tags"].get("name") or e["tags"].get("shop") or e["tags"].get("amenity")]
poi_xy = [(P(e["lat"], e["lon"]), e["tags"]) for e in POIS]
PHASH = defaultdict(list)
for i, ((x, z), t) in enumerate(poi_xy): PHASH[(int(x // 60), int(z // 60))].append(i)
cent = []  # building centroids for density
BR = []
seen = set()
for n_ in ("bld_manzini", "bld_ezulwini"):
    for e in load(n_):
        if e["id"] in seen: continue
        seen.add(e["id"]); t = e.get("tags", {})
        polys = []
        if e["type"] == "way": polys = [poly(e)]
        else: polys = [[P(g["lat"], g["lon"]) for g in m["geometry"]] for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        for g in polys:
            if len(g) < 4: continue
            if g[0] == g[-1]: g = g[:-1]
            area = abs(sum(g[i][0] * g[(i + 1) % len(g)][1] - g[(i + 1) % len(g)][0] * g[i][1] for i in range(len(g)))) / 2
            if area < 6: continue
            cx = sum(p[0] for p in g) / len(g); cz = sum(p[1] for p in g) / len(g)
            BR.append((t, g, area, cx, cz)); cent.append((cx, cz))
DH = defaultdict(int)
for cx, cz in cent: DH[(int(cx // 60), int(cz // 60))] += 1
def density(cx, cz):
    k = (int(cx // 60), int(cz // 60)); return sum(DH.get((k[0] + a, k[1] + b), 0) for a in (-1, 0, 1) for b in (-1, 0, 1))
def pip(g, x, z):
    ins = False
    for i in range(len(g)):
        a, b = g[i], g[i - 1]
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]: ins = not ins
    return ins
MATS = P(-26.494482, 31.308351)  # Matsapha centre
CBD = P(-26.4981, 31.3742)  # Manzini CBD (Nkose'luhlaza / Ngwane St core)
stalls = []
use_count = defaultdict(int)
for t, g, area, cx, cz in BR:
    h_ = (math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1.0
    h2 = (math.sin(cx * 3.1 + cz * 5.7) * 9731.17) % 1.0
    d_cbd = math.hypot(cx - CBD[0], cz - CBD[1]); d_mat = math.hypot(cx - MATS[0], cz - MATS[1])
    poi = None
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            for i in PHASH.get((int(cx // 60) + a, int(cz // 60) + b), ()):
                (px, pz), pt = poi_xy[i]
                if pip(g, px, pz): poi = pt
    kind = int(np.array(cls)[min(H - 1, max(0, int((cz - Z0) // PX))), min(W - 1, max(0, int((cx - X0) // PX)))])
    dens = density(cx, cz); fr = road_dist(cx, cz, 3) < 55; fr4 = road_dist(cx, cz, 4) < 35
    bt = t.get("building", "yes"); use = TAGUSE.get(bt, -1); name = t.get("name") or (poi or {}).get("name")
    am = (poi or {}).get("amenity") or t.get("amenity"); sh = (poi or {}).get("shop") or t.get("shop")
    if am == "fuel" or t.get("amenity") == "fuel": use = 12
    elif am in ("school", "college", "university", "kindergarten") or t.get("office") == "educational_institution": use = 9
    elif am == "place_of_worship": use = 10
    elif am in ("hospital", "clinic", "doctors") or t.get("healthcare"): use = 11
    elif am in ("restaurant", "fast_food", "cafe", "bar", "pub"): use = 15
    elif am == "bank" or t.get("office"): use = 6
    elif am in ("townhall", "police", "courthouse", "fire_station", "community_centre", "conference_centre"): use = 14
    elif sh in ("mall", "department_store"): use = 5
    elif sh == "supermarket": use = 4
    elif sh in ("car_repair", "car", "car_parts"): use = 8 if area < 400 else 7
    elif sh: use = 3
    elif t.get("tourism") in ("hotel", "guest_house", "hostel", "motel", "apartment", "chalet"): use = 13
    if use < 0:  # plain building=yes: infer from where it stands
        if kind == 9 or d_mat < 2300 and area > 300 and dens < 14: use = 7 if area > 220 else 8
        elif d_cbd < 900 and area > 1500: use = 5 if h_ < 0.4 else 4
        elif d_cbd < 900 and area > 380: use = 6 if h_ < 0.4 else (4 if h_ < 0.55 else 3)
        elif d_cbd < 1000 and area > 70 and (fr or fr4) and h_ < 0.8: use = 3
        elif d_cbd < 1000 and dens >= 16 and area > 70 and h_ < 0.45: use = 3
        elif fr and d_cbd < 2600 and 90 < area < 1400 and h_ < 0.4: use = 3
        elif area > 1800: use = 7 if kind in (9,) or d_mat < 3000 else 4
        elif dens >= 11 and area > 260 and h_ < 0.4: use = 2
        elif area < 35: use = 8
        elif area > 190 and h_ < 0.55: use = 1
        else: use = 0
    # levels / height
    try: lv = float(t.get("building:levels", 0))
    except ValueError: lv = 0
    try: hh = float(str(t.get("height", 0)).split()[0])
    except ValueError: hh = 0
    if not hh:
        if lv: hh = lv * 3.2 + 0.8
        elif use == 0: hh = 3.1 + (3.2 if h2 < 0.22 else 0) + h_ * 0.5
        elif use == 1: hh = 6.3 + h_ * 1.2
        elif use == 2: hh = 9.6 + (3.2 if h2 < 0.5 else 0) + (3.2 if h2 < 0.15 else 0)
        elif use == 3: hh = 4.0 + (3.4 if h2 < 0.3 else 0)
        elif use == 4: hh = 6.5 + h_ * 1.5
        elif use == 5: hh = 8.5 + h_ * 3
        elif use == 6: hh = (3.4 * (2 + int(h2 * 6)) + 1.0) if d_cbd < 900 else 7.0
        elif use == 7: hh = 6.5 + h_ * 4
        elif use == 8 or use == 17: hh = 2.7 + h_ * 0.6
        elif use == 9: hh = 3.6
        elif use == 10: hh = 6 + h_ * 2
        elif use == 11: hh = 7 + h_ * 3
        elif use == 12: hh = 3.6
        elif use == 13: hh = 6.5 + (3.2 if h2 < 0.4 else 0)
        elif use == 14: hh = 7.5
        elif use == 15: hh = 3.8
        else: hh = 4.5
    hh = max(2.4, min(hh, 60))
    sid = -1
    if use in (3, 4, 5, 6, 12, 15, 11, 9, 10, 13, 14):
        pool = {3: SHOPS, 4: SHOPS[:5], 5: [("MALL", "#7c3aed", "#ffffff")], 6: BANKS, 12: FUELS, 15: [SHOPS[20], SHOPS[21], SHOPS[16], ("RESTAURANT", "#92400e", "#ffffff")],
                11: [("CLINIC", "#0e7490", "#ffffff")], 9: [("PRIMARY SCHOOL", "#1e3a8a", "#ffffff")], 10: [("CHURCH", "#4b5563", "#ffffff")],
                13: [("GUEST HOUSE", "#166534", "#ffffff"), ("LODGE", "#7c2d12", "#ffffff")], 14: [("GOVERNMENT", "#1e293b", "#ffffff")]}[use]
        if use in (9, 10, 14, 11, 13) and not name: sid = sign_id(*pool[0]) if use != 13 else sign_id(*pool[int(h_ * 7) % len(pool)])
        else: sid = brand_for(name, pool, h_)
        if use == 6 and not (poi or t.get("office")) and d_cbd > 800: sid = -1
    use_count[use] += 1
    bl.append([use, dm(hh), [dm(v) for pt in g for v in pt], sid, int(h_ * 1000)])
    pts = [((x - X0) / PX, (z - Z0) / PX) for x, z in g]
    dc.polygon(pts, fill=(104, 104, 96))
for e in poi_xy:
    (x, z), pt = e
    if pt.get("amenity") in ("marketplace", "bus_station") or pt.get("shop") == "marketplace": stalls.append([round(x, 1), round(z, 1)])
print("uses", dict(sorted(use_count.items())), "stalls", len(stalls))
json.dump({"b": bl, "signs": SIGNS, "stalls": stalls}, open(f"{out}/buildings.json", "w"), separators=(",", ":"))
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
