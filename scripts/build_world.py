"""Convert OSM extracts (Overpass JSON) + DEM into compact game assets in public/assets/world.

Usage: python3 -I scripts/build_world.py <osm_dir> <dem.json> <out_dir>
Coordinates: metres, x = east, z = south (north is -z), origin = Manzini centre. Ints are decimetres.
"""
import json, math, random, struct, sys, os
import numpy as np
from PIL import Image, ImageDraw

osm_dir, dem_path, out = sys.argv[1:4]
dir2 = sys.argv[4] if len(sys.argv) > 4 else None
dir3 = sys.argv[5] if len(sys.argv) > 5 else None   # optional third fetch (fetch_osm3.py)
os.makedirs(out, exist_ok=True)
LAT0, LON0 = -26.4966, 31.3826
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
X0, X1, Z0, Z1 = -10500, 6500, -6500, 5500   # Manzini + Matsapha + outskirts (17 x 12 km)
PX = 10  # ground raster cell, metres
random.seed(7)

def P(lat, lon): return ((lon - LON0) * KX, -(lat - LAT0) * KZ)
M_ = 60.0  # keep this much beyond the edge so roads run off-map instead of stopping short
def _in(g): return X0 - M_ <= (g["lon"] - LON0) * KX <= X1 + M_ and Z0 - M_ <= -(g["lat"] - LAT0) * KZ <= Z1 + M_
def clip(els):
    """Clip OSM elements to the playable rectangle: nodes dropped, open ways cut into their inside runs, areas kept if they touch it."""
    out_ = []
    for e in els:
        if "lat" in e:
            if _in(e): out_.append(e)
            continue
        g = e.get("geometry")
        if g is None:
            if any(_in(q) for m in e.get("members", []) for q in m.get("geometry", [])): out_.append(e)
            continue
        ins = [_in(q) for q in g]
        if all(ins): out_.append(e); continue
        if not any(ins): continue
        closed = len(g) > 3 and g[0] == g[-1]
        if closed: out_.append(e); continue
        nd = e.get("nodes", []); ok = len(nd) == len(g); i = 0
        while i < len(g):
            if not ins[i]: i += 1; continue
            j = i
            while j + 1 < len(g) and ins[j + 1]: j += 1
            a, b = max(0, i - 1), min(len(g) - 1, j + 1)
            if b > a:
                c = dict(e); c["geometry"] = g[a:b + 1]
                if ok: c["nodes"] = nd[a:b + 1]
                out_.append(c)
            i = j + 1
    return out_
def _ld(f): return clip(json.load(open(f))["elements"]) if f and os.path.exists(f) else []
def load(n): return _ld(f"{osm_dir}/{n}.json")
def load0(n): return _ld(f"{osm_dir}/{n}.json")
def load2(n): return _ld(f"{dir2}/{n}.json" if dir2 else None)
def load3(n): return _ld(f"{dir3}/{n}.json" if dir3 else None)
def num(v, default):
    try: return float(str(v).replace(",", ".").split()[0]) or default
    except (ValueError, IndexError): return default
def poly(e): return [P(g["lat"], g["lon"]) for g in e.get("geometry", [])]
dm = lambda v: int(round(v * 10))

# ---------------- real colour: Sentinel-2 true colour on the game grid (scripts/fetch_s2.py); optional
S2_PATH = os.environ.get("S2", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "s2_ground.png"))
S2 = np.asarray(Image.open(S2_PATH).convert("RGB"), np.float32) if os.path.exists(S2_PATH) else None
S2PX = 10
_DD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
Image.MAX_IMAGE_PIXELS = None
if os.path.exists(f"{_DD}/ortho_1m.jpg"):
    ORTHO = np.asarray(Image.open(f"{_DD}/ortho_1m.jpg").convert("RGB")); ORTHO_M = np.asarray(Image.open(f"{_DD}/ortho_1m_mask.png")) > 127
    OB = json.load(open(f"{_DD}/ortho_meta.json"))["bounds"]
else: ORTHO = None
ROOF_SRC = {0: 0, 1: 0, 2: 0}
def s2_roof(g, area):
    """Real roof colour, packed sRGB (+ bit 24 when it comes from the 1 m aerial photo). Aerial: median of the pixels inside the
    footprint shrunk 30 % toward its centre (tolerates a few metres of misregistration, ignores edge shadows). Else Sentinel-2. Else -1."""
    cx = sum(q[0] for q in g) / len(g); cz = sum(q[1] for q in g) / len(g)
    if ORTHO is not None and OB[0] + 2 < cx < OB[1] - 2 and OB[2] + 2 < cz < OB[3] - 2 and ORTHO_M[int(cz - OB[2]), int(cx - OB[0])]:
        pts = [((cx + (x - cx) * 0.7) - OB[0], (cz + (z - cz) * 0.7) - OB[2]) for x, z in g]
        x0_, x1_ = int(min(q[0] for q in pts)), int(max(q[0] for q in pts)) + 1; z0_, z1_ = int(min(q[1] for q in pts)), int(max(q[1] for q in pts)) + 1
        x0_, z0_ = max(0, x0_), max(0, z0_); x1_, z1_ = min(ORTHO.shape[1], x1_), min(ORTHO.shape[0], z1_)
        if x1_ > x0_ and z1_ > z0_:
            m = Image.new("L", (x1_ - x0_, z1_ - z0_), 0); ImageDraw.Draw(m).polygon([(q[0] - x0_, q[1] - z0_) for q in pts], fill=1)
            mk = np.asarray(m) > 0; px = ORTHO[z0_:z1_, x0_:x1_][mk] if mk.sum() >= 3 else ORTHO[int(cz - OB[2]), int(cx - OB[0])][None]
            c = np.median(px, axis=0); ROOF_SRC[2] += 1
            return (1 << 24) | (int(c[0]) << 16) | (int(c[1]) << 8) | int(c[2])
    if S2 is None: ROOF_SRC[0] += 1; return -1
    r = int(min(6, max(0, (math.sqrt(max(area, 1.0)) * 0.3) // S2PX)))
    j, i = int((cz - Z0) // S2PX), int((cx - X0) // S2PX)
    if not (0 <= j < S2.shape[0] and 0 <= i < S2.shape[1]): ROOF_SRC[0] += 1; return -1
    c = np.clip(S2[max(0, j - r):j + r + 1, max(0, i - r):i + r + 1].reshape(-1, 3).mean(0) * 1.5, 0, 255); ROOF_SRC[1] += 1
    return (int(c[0]) << 16) | (int(c[1]) << 8) | int(c[2])
ROOF_SHAPE = {0: 0, 1: 0, 2: 0}
def roof_shape(g, area):
    """Roof form read off the aerial photo: 2 = pitched (the two sides of a ridge are lit differently by the sun), 1 = flat (one even
    tone over a big roof), 0 = cannot tell / no imagery. The ridge is looked for along both axes of the footprint's longest edge."""
    if ORTHO is None or area < 30: ROOF_SHAPE[0] += 1; return 0
    cx = sum(q[0] for q in g) / len(g); cz = sum(q[1] for q in g) / len(g)
    if not (OB[0] + 3 < cx < OB[1] - 3 and OB[2] + 3 < cz < OB[3] - 3 and ORTHO_M[int(cz - OB[2]), int(cx - OB[0])]): ROOF_SHAPE[0] += 1; return 0
    pts = [((cx + (x - cx) * 0.82) - OB[0], (cz + (z - cz) * 0.82) - OB[2]) for x, z in g]
    x0_, x1_ = max(0, int(min(q[0] for q in pts))), min(ORTHO.shape[1], int(max(q[0] for q in pts)) + 1); z0_, z1_ = max(0, int(min(q[1] for q in pts))), min(ORTHO.shape[0], int(max(q[1] for q in pts)) + 1)
    if x1_ - x0_ < 4 or z1_ - z0_ < 4: ROOF_SHAPE[0] += 1; return 0
    m = Image.new("L", (x1_ - x0_, z1_ - z0_), 0); ImageDraw.Draw(m).polygon([(q[0] - x0_, q[1] - z0_) for q in pts], fill=1)
    mk = np.asarray(m) > 0
    if mk.sum() < 16: ROOF_SHAPE[0] += 1; return 0
    lum = ORTHO[z0_:z1_, x0_:x1_].astype(np.float32).mean(-1)
    bi = max(range(len(g)), key=lambda i: math.hypot(g[(i + 1) % len(g)][0] - g[i][0], g[(i + 1) % len(g)][1] - g[i][1]))
    ex, ez = g[(bi + 1) % len(g)][0] - g[bi][0], g[(bi + 1) % len(g)][1] - g[bi][1]; el = math.hypot(ex, ez) or 1; ex, ez = ex / el, ez / el
    jj, ii = np.nonzero(mk); L = lum[jj, ii]; dx = ii + x0_ - (cx - OB[0]); dz = jj + z0_ - (cz - OB[2])
    v = dx * (-ez) + dz * ex; u = dx * ex + dz * ez
    def split(c):
        a, b = L[c > 0.6], L[c < -0.6]
        return abs(float(a.mean() - b.mean())) if len(a) > 5 and len(b) > 5 else 0.0
    dv, du, sd = split(v), split(u), float(L.std())
    if max(dv, du) > 14 and max(dv, du) > 0.55 * sd: ROOF_SHAPE[2] += 1; return 2
    if area > 160 and sd < 13 and max(dv, du) < 6: ROOF_SHAPE[1] += 1; return 1
    ROOF_SHAPE[0] += 1; return 0
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
        w *= 1.2  # roads 20% wider for a more generous, drivable feel
        try: ly = int(t.get("layer", 0))
        except ValueError: ly = 0
        isbr = 1 if t.get("bridge") and t.get("bridge") != "low_water_crossing" else 0
        if isbr and ly == 0: ly = 1
        istn = 1 if t.get("tunnel") in ("yes", "culvert", "building_passage") else 0
        if istn and ly == 0: ly = -1
        try: ms = int(str(t.get("maxspeed", "0")).split()[0])
        except ValueError: ms = 0
        sfc = t.get("surface", "")
        rough = 1 if (t.get("smoothness", "") in ("bad", "very_bad", "horrible", "very_horrible", "impassable") or t.get("tracktype") in ("grade4", "grade5")) else 0
        roads.append({"ms": ms, "rg": rough, "rb": 1 if t.get("junction") in ("roundabout", "circular") else 0, "ly": ly, "bk": isbr, "tn": istn, "lk": 1 if t["highway"].endswith("_link") else 0, "nd": e.get("nodes", []), "ref": t.get("ref", ""),
                      "c": c, "w": round(w, 1), "u": u, "b": br, "o": 1 if t.get("oneway") == "yes" else 0,
                      "r": t.get("ref", ""), "n": t.get("name", ""), "p": [dm(v) for pt in g for v in pt]})
        if c <= 3: nodes_major.extend((x, z, t.get("ref", "")) for x, z in g)
    elif t.get("waterway") in ("river", "stream"):
        roads.append({"ly": 0, "bk": 0, "tn": 0, "lk": 0, "nd": e.get("nodes", []), "ref": "", "c": 9, "w": 6.0 if t["waterway"] == "river" else 2.2, "u": 0, "b": 0, "o": 0, "r": "", "n": t.get("name", ""),
                      "p": [dm(v) for pt in g for v in pt]})
    else:
        kind = t.get("natural") or t.get("landuse") or t.get("leisure")
        if kind and len(g) > 3: ground_polys.append((kind, g, t))
        if t.get("natural") == "water" and len(g) > 3: water_polys.append({"p": [dm(v) for pt in g for v in pt]})
# --- third fetch: hydrology (real widths for rivers/streams/canals/drains) + lakes/wetlands
WW = {"river": 8.0, "canal": 5.0, "stream": 2.2, "drain": 1.6, "ditch": 1.2}
have_w = {tuple(r["nd"][:2]) for r in roads if r.get("c") == 9 and r.get("nd")}
for e in load3("hydro3"):
    t = e.get("tags", {}); g = poly(e)
    if e["type"] != "way" or len(g) < 2: continue
    if t.get("waterway") in WW and not (e.get("nodes") and tuple(e["nodes"][:2]) in have_w):
        wd = num(t.get("width", ""), WW[t["waterway"]])
        roads.append({"ly": 0, "bk": 0, "tn": 0, "lk": 0, "nd": e.get("nodes", []), "ref": "", "c": 9, "w": max(0.8, min(40.0, wd)), "u": 0, "b": 0, "o": 0, "r": "", "n": t.get("name", ""), "p": [dm(v) for pt in g for v in pt]})
    elif (t.get("natural") in ("water", "wetland") or t.get("water")) and len(g) > 3: water_polys.append({"p": [dm(v) for pt in g for v in pt]})
print("roads", len(roads), "water", len(water_polys))

# ---------------- railway
rails = []
for e in load("roads"):
    t = e.get("tags", {})
    if e["type"] == "way" and t.get("railway") in ("rail", "abandoned", "disused", "narrow_gauge"):
        g = poly(e)
        if len(g) >= 2: rails.append({"a": 0 if t["railway"] in ("rail", "narrow_gauge") else 1, "p": [dm(v) for pt in g for v in pt]})
print("rails", len(rails))
level_x = []
for ri, rl in enumerate(rails):
    p = rl["p"]
    for i in range(0, len(p) - 3, 2):
        ax, az, bx, bz = p[i] / 10, p[i + 1] / 10, p[i + 2] / 10, p[i + 3] / 10
        for r in roads:
            if r["c"] > 6 or r["ly"] != 0 or r.get("b"): continue
            q = r["p"]
            for k in range(0, len(q) - 3, 2):
                cx, cz, dx, dz = q[k] / 10, q[k + 1] / 10, q[k + 2] / 10, q[k + 3] / 10
                if max(ax, bx) < min(cx, dx) - 1 or min(ax, bx) > max(cx, dx) + 1 or max(az, bz) < min(cz, dz) - 1 or min(az, bz) > max(cz, dz) + 1: continue
                den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx)
                if abs(den) < 1e-6: continue
                tt = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den; uu = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den
                if 0 <= tt <= 1 and 0 <= uu <= 1:
                    level_x.append([round(ax + (bx - ax) * tt, 1), round(az + (bz - az) * tt, 1), round(math.atan2(dx - cx, dz - cz), 3), r["w"], 1 if rl["a"] == 0 else 0])
print("level crossings", len(level_x))

# ---------------- ground colour + class rasters (25 m)
W, H = (X1 - X0) // PX, (Z1 - Z0) // PX
col = Image.new("RGB", (W, H), (112, 120, 72)); cls = Image.new("L", (W, H), 1); bmask = Image.new("L", (W, H), 0); dbm = ImageDraw.Draw(bmask)
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
         "brownfield": ((170, 150, 120), 7), "religious": ((120, 130, 96), 2), "military": ((120, 128, 90), 2), "garages": ((140, 138, 130), 8), "garden": ((100, 140, 80), 2), "golf_course": ((92, 150, 82), 2), "sports_centre": ((104, 146, 84), 2), "parking": ((92, 92, 90), 9), "allotments": ((130, 140, 80), 4)}
ORDER = ["farmland", "farmyard", "grassland", "heath", "scrub", "meadow", "grass", "orchard", "vineyard", "plant_nursery", "forest", "wood",
         "wetland", "sand", "bare_rock", "quarry", "brownfield", "construction", "residential", "commercial", "retail", "industrial", "garages", "cemetery",
         "religious", "military", "recreation_ground", "park", "garden", "golf_course", "sports_centre", "parking", "pitch", "water", "reservoir"]
rank = {k: i for i, k in enumerate(ORDER)}
for e in load2("leisure"):
    t = e.get("tags", {}); g = poly(e)
    kind = t.get("leisure") or ("parking" if t.get("amenity") == "parking" else t.get("landuse"))
    if kind in ("park", "garden", "golf_course", "sports_centre", "pitch", "parking", "cemetery", "allotments") and len(g) > 3: ground_polys.append((kind, g, t))
for e in load2("misc"):
    t = e.get("tags", {}); g = poly(e) if e["type"] == "way" else []
    if t.get("man_made") == "works" and len(g) > 3: ground_polys.append(("industrial", g, t))
ground_polys.sort(key=lambda a: rank.get(a[0], -1))
wood_masks = []
for kind, g, t in ground_polys:
    if kind not in STYLE: continue
    rgb, cid = STYLE[kind]
    pts = [((x - X0) / PX, (z - Z0) / PX) for x, z in g]
    dc.polygon(pts, fill=rgb); dk.polygon(pts, fill=cid)
CLS_A = np.array(cls)
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
FUELS = [("GALP", "#f26522", "#ffffff"), ("ENGEN", "#0b3c9e", "#ffffff"), ("SHELL", "#fbce07", "#d4101a"), ("TOTAL", "#e30613", "#ffffff"), ("PUMA", "#00844a", "#ffffff"), ("MITRA", "#2f3fa6", "#ffffff")]
KNOWN = {"shoprite": SHOPS[0], "pick n pay": SHOPS[1], "spar": SHOPS[2], "ok": SHOPS[3], "boxer": SHOPS[4], "pep": SHOPS[5], "kfc": SHOPS[20], "mtn": SHOPS[7],
         "standard bank": BANKS[0], "fnb": BANKS[1], "nedbank": BANKS[2], "galp": FUELS[0], "engen": FUELS[1], "shell": FUELS[2], "total": FUELS[3], "puma": FUELS[4], "mitra": FUELS[5]}
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
for n_, ldr in [("bld_manzini", load), ("bld_ezulwini", load), ("bld_extra", load0), ("bld_ms", load0)] + [(n, load2) for n in ("bld_lobamba", "bld_malkerns", "bld_matsapha1", "bld_matsapha2", "bld_mbabane1", "bld_mbabane2")]:
    for e in ldr(n_):
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
# (road elevation solved below)
# parking lanes: every town street (not the MR3 trunk/primary, not dirt) gets a 2.4 m lane each side

# ---------------- overpass elevation: real clearances where a bridge crosses a lower road, ramps at a legal gradient
import heapq
CLEAR, SLOPE_MAJOR, SLOPE_MINOR, DZMAX = 6.6, 0.06, 0.08, 14.0
def seg_closest(ax, az, bx, bz, cx, cz, dx, dz):
    """closest approach between 2D segments AB and CD: (distance, t along AB)."""
    best = (1e9, 0.0)
    for t in [i / 8 for i in range(9)]:
        px, pz = ax + (bx - ax) * t, az + (bz - az) * t
        ex, ez = dx - cx, dz - cz; l2 = ex * ex + ez * ez or 1e-9
        u = max(0, min(1, ((px - cx) * ex + (pz - cz) * ez) / l2)); d = math.hypot(px - cx - ex * u, pz - cz - ez * u)
        if d < best[0]: best = (d, t)
    # refine around the best t
    t0 = best[1]
    for dt in (0.06, 0.03, 0.015, 0.007):
        for t in (t0 - dt, t0 + dt):
            t = max(0, min(1, t)); px, pz = ax + (bx - ax) * t, az + (bz - az) * t
            ex, ez = dx - cx, dz - cz; l2 = ex * ex + ez * ez or 1e-9
            u = max(0, min(1, ((px - cx) * ex + (pz - cz) * ez) / l2)); d = math.hypot(px - cx - ex * u, pz - cz - ez * u)
            if d < best[0]: best = (d, t); t0 = t
    return best
LOW = defaultdict(list)  # grid of drivable lower-layer segments
for wi, r in enumerate(roads):
    if r["ly"] <= 0 and not r["tn"] and r["c"] <= 6:
        p = r["p"]
        for i in range(0, len(p) - 3, 2):
            ax, az, bx, bz = p[i] / 10, p[i + 1] / 10, p[i + 2] / 10, p[i + 3] / 10
            for gx in range(int(min(ax, bx) // 60), int(max(ax, bx) // 60) + 1):
                for gz in range(int(min(az, bz) // 60), int(max(az, bz) // 60) + 1): LOW[(gx, gz)].append((wi, ax, az, bx, bz))
synth = [-1]
req = {}  # (way index, vertex index) -> required dz
for wi, r in enumerate(roads):
    if r["ly"] < 1 or r["tn"] or r["c"] > 8: continue
    p = r["p"]; nd = list(r["nd"]) if len(r["nd"]) == len(p) // 2 else [0] * (len(p) // 2)
    newp, newnd, newreq = [], [], []
    for i in range(0, len(p) - 2, 2):
        ax, az, bx, bz = p[i] / 10, p[i + 1] / 10, p[i + 2] / 10, p[i + 3] / 10
        newp += [p[i], p[i + 1]]; newnd.append(nd[i // 2]); newreq.append(0.0)
        hits = {}
        for gx in range(int(min(ax, bx) // 60) - 1, int(max(ax, bx) // 60) + 2):
            for gz in range(int(min(az, bz) // 60) - 1, int(max(az, bz) // 60) + 2):
                for (lw, cx, cz, dx, dz) in LOW.get((gx, gz), ()):
                    if lw == wi: continue
                    L = roads[lw]
                    if L["ly"] >= r["ly"]: continue
                    d, t = seg_closest(ax, az, bx, bz, cx, cz, dx, dz)
                    if d < (r["w"] + L["w"]) / 2 * 0.9 and 0.02 < t < 0.98:
                        key = round(t, 2); need = CLEAR * (r["ly"] - L["ly"])
                        hits[key] = max(hits.get(key, 0), need)
        for t in sorted(hits):
            newp += [int(round((p[i] + (p[i + 2] - p[i]) * t))), int(round((p[i + 1] + (p[i + 3] - p[i + 1]) * t)))]
            synth[0] -= 1; newnd.append(synth[0]); newreq.append(hits[t])
    newp += [p[-2], p[-1]]; newnd.append(nd[-1]); newreq.append(0.0)
    r["p"], r["nd"] = newp, newnd
    for k, q in enumerate(newreq):
        if q > 0: req[(wi, k)] = q
# propagate elevation along connected carriageway (ramps) at a legal gradient
best = {}
heap = []
for (wi, k), q in req.items():
    n = roads[wi]["nd"][k]; best[n] = max(best.get(n, 0), q); heapq.heappush(heap, (-q, n, wi))
INC = defaultdict(list)  # node -> (way, vertex)
for wi, r in enumerate(roads):
    if r["tn"] or r["c"] > 8: continue
    for k, n in enumerate(r["nd"]): INC[n].append((wi, k))
def allowed(W, B):
    if W is B: return True
    if W["c"] > 6: return False
    return (W["ref"] and W["ref"] == B["ref"]) or (W["n"] and W["n"] == B["n"]) or W["lk"] or (W["c"] <= B["c"] and not W["n"] and not B["n"])
while heap:
    negq, n, src = heapq.heappop(heap)
    q = -negq
    if q < best.get(n, 0) - 1e-6: continue
    Bw = roads[src]
    for (wi, k) in INC[n]:
        Wy = roads[wi]
        if Wy["ly"] < 0 or not allowed(Wy, Bw): continue
        for kk in (k - 1, k + 1):
            if kk < 0 or kk >= len(Wy["nd"]): continue
            m = Wy["nd"][kk]; L = math.hypot(Wy["p"][kk * 2] - Wy["p"][k * 2], Wy["p"][kk * 2 + 1] - Wy["p"][k * 2 + 1]) / 10
            nq = q - (SLOPE_MAJOR if Wy["c"] <= 4 else SLOPE_MINOR) * L
            if nq > 0.05 and nq > best.get(m, 0) + 1e-6:
                best[m] = nq; heapq.heappush(heap, (-nq, m, src))
nel = 0
for wi, r in enumerate(roads):
    dzv = [min(DZMAX, best.get(n, 0.0)) for n in r["nd"]] if r["nd"] and len(r["nd"]) == len(r["p"]) // 2 else []
    if dzv and max(dzv) > 0.25:
        r["dz"] = [int(round(v * 10)) for v in dzv]; nel += 1
    r["br"] = 1 if (r["bk"] and r["c"] <= 6) or (dzv and max(dzv) > 0.25) else 0
    r["nd"] = None
    for k in ("ref", "lk", "tn"): r.pop(k, None)
    r.pop("nd", None)
print("elevated ways:", nel, "max dz", max([max(r.get("dz", [0])) for r in roads]) / 10)

def way_density(r):
    p = r["p"]; vals = [density(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 2)]
    return sum(vals) / max(1, len(vals))
bays = 0
for r in roads:
    if 3 <= r["c"] <= 5 and not r["u"] and not r["b"] and way_density(r) >= 7 and not (r["o"] and r["w"] > 8):
        r["w"] = round(r["w"] + 4.8, 1); r["bay"] = 1; bays += 1
json.dump({"roads": roads, "water": water_polys, "rails": rails, "crossings": level_x}, open(f"{out}/roads.json", "w"), separators=(",", ":"))
print("parking-lane streets", bays)
def pip(g, x, z):
    ins = False
    for i in range(len(g)):
        a, b = g[i], g[i - 1]
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]: ins = not ins
    return ins
# zoning from OSM landuse polygons (landuse.json from merge_osm_full.py): grid-hashed point-in-polygon
LUZ = {"industrial": "ind", "commercial": "com", "retail": "com", "residential": "res", "farmland": "farm", "farmyard": "farm", "construction": "con", "garden": "res", "allotments": "farm", "orchard": "farm"}
LU, LUH = [], defaultdict(list)
for e in load0("landuse"):
    z_ = LUZ.get((e.get("tags") or {}).get("landuse"))
    if not z_: continue
    gs = [poly(e)] if e["type"] == "way" else [[P(g["lat"], g["lon"]) for g in m["geometry"]] for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    for g in gs:
        if len(g) < 4: continue
        xs = [q[0] for q in g]; zs = [q[1] for q in g]; i = len(LU); LU.append((z_, g))
        for a in range(int(min(xs) // 200), int(max(xs) // 200) + 1):
            for b in range(int(min(zs) // 200), int(max(zs) // 200) + 1): LUH[(a, b)].append(i)
def landzone(x, z):
    best = None
    for i in LUH.get((int(x // 200), int(z // 200)), ()):
        if pip(LU[i][1], x, z): best = LU[i][0] if best != "com" and best != "ind" else best
    return best
print("landuse zones", len(LU))
# ---- buildings must not sit on drivable roads: nudge any small footprint sideways (away from the road) until no road sample is inside it
RS = defaultdict(list)
for r_ in roads:
    if r_["c"] > 6 or r_.get("br") or r_.get("u") or r_.get("dz"): continue
    q_ = r_["p"]
    for i_ in range(0, len(q_) - 3, 2):
        ax_, az_, bx_, bz_ = q_[i_] / 10, q_[i_ + 1] / 10, q_[i_ + 2] / 10, q_[i_ + 3] / 10; n_ = max(1, int(math.hypot(bx_ - ax_, bz_ - az_) / 2))
        for k_ in range(n_ + 1):
            sx_, sz_ = ax_ + (bx_ - ax_) * k_ / n_, az_ + (bz_ - az_) * k_ / n_; RS[(int(sx_ // 30), int(sz_ // 30))].append((sx_, sz_))
def road_inside(g_):
    xs_ = [q[0] for q in g_]; zs_ = [q[1] for q in g_]; hit_ = []
    for a_ in range(int(min(xs_) // 30), int(max(xs_) // 30) + 1):
        for b_ in range(int(min(zs_) // 30), int(max(zs_) // 30) + 1):
            for sx_, sz_ in RS.get((a_, b_), ()):
                if min(xs_) <= sx_ <= max(xs_) and min(zs_) <= sz_ <= max(zs_) and pip(g_, sx_, sz_): hit_.append((sx_, sz_))
    return hit_
moved = dropped = shrunk = 0; BR2 = []
for t_, g_, area_, cx_, cz_ in BR:
    h_ = road_inside(g_) if area_ < 3000 else []
    if len(h_) >= 2:
        mx_ = sum(q[0] for q in h_) / len(h_); mz_ = sum(q[1] for q in h_) / len(h_); dx_, dz_ = cx_ - mx_, cz_ - mz_; L_ = math.hypot(dx_, dz_)
        if L_ < 0.5: dx_, dz_, L_ = 1.0, 0.0, 1.0
        dx_, dz_ = dx_ / L_, dz_ / L_; ok_ = False
        for st_ in range(1, 25):
            g2_ = [(q[0] + dx_ * st_, q[1] + dz_ * st_) for q in g_]
            if not road_inside(g2_): g_ = g2_; cx_ += dx_ * st_; cz_ += dz_ * st_; ok_ = True; break
        if ok_: moved += 1
        else:   # cannot slide clear: keep a small 7 x 5 m building on a road-free patch inside its own footprint (e.g. a petrol-station kiosk), else drop it
            k0_ = max(range(len(g_)), key=lambda i: math.hypot(g_[(i + 1) % len(g_)][0] - g_[i][0], g_[(i + 1) % len(g_)][1] - g_[i][1]))
            a_, b_ = g_[k0_], g_[(k0_ + 1) % len(g_)]; ul_ = math.hypot(b_[0] - a_[0], b_[1] - a_[1]) or 1; ux_, uz_ = (b_[0] - a_[0]) / ul_, (b_[1] - a_[1]) / ul_; vx_, vz_ = -uz_, ux_
            xs0 = [q[0] for q in g_]; zs0 = [q[1] for q in g_]; best_ = None
            gx_ = min(xs0)
            while gx_ <= max(xs0):
                gz_ = min(zs0)
                while gz_ <= max(zs0):
                    box_ = [(gx_ + ux_ * du + vx_ * dv, gz_ + uz_ * du + vz_ * dv) for du, dv in ((-3.5, -2.5), (3.5, -2.5), (3.5, 2.5), (-3.5, 2.5))]
                    if all(pip(g_, q[0], q[1]) for q in box_) and not road_inside(box_):
                        d_ = math.hypot(gx_ - cx_, gz_ - cz_)
                        if best_ is None or d_ < best_[0]: best_ = (d_, box_, gx_, gz_)
                    gz_ += 2.0
                gx_ += 2.0
            if best_: g_ = best_[1]; cx_, cz_ = best_[2], best_[3]; area_ = 35.0; shrunk += 1
            else: dropped += 1; continue
    BR2.append((t_, g_, area_, cx_, cz_))
BR = BR2
print("buildings moved off roads:", moved, "shrunk:", shrunk, "dropped:", dropped)
MATS = P(-26.494482, 31.308351)  # Matsapha centre
CBD = P(-26.4981, 31.3742)  # Manzini CBD (Nkose'luhlaza / Ngwane St core)
CBD2 = P(-26.3257, 31.1447)  # Mbabane CBD
stalls = []
use_count = defaultdict(int)
for t, g, area, cx, cz in BR:
    h_ = (math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1.0
    h2 = (math.sin(cx * 3.1 + cz * 5.7) * 9731.17) % 1.0
    d_cbd = min(math.hypot(cx - CBD[0], cz - CBD[1]), 1.1 * math.hypot(cx - CBD2[0], cz - CBD2[1])); d_mat = math.hypot(cx - MATS[0], cz - MATS[1])
    poi = None
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            for i in PHASH.get((int(cx // 60) + a, int(cz // 60) + b), ()):
                (px, pz), pt = poi_xy[i]
                if pip(g, px, pz): poi = pt
    kind = int(CLS_A[min(H - 1, max(0, int((cz - Z0) // PX))), min(W - 1, max(0, int((cx - X0) // PX)))])
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
    lz = landzone(cx, cz) if use < 0 else None
    if use < 0 and lz == "ind": use = 7 if area > 180 else 8
    elif use < 0 and lz == "com": use = 4 if area > 1200 else (6 if (area > 380 and h_ < 0.4) else 3)
    elif use < 0 and lz == "farm": use = 7 if area > 500 else 8
    elif use < 0 and lz == "res" and area > 60: use = 2 if (dens >= 20 and area > 260 and h_ < 0.3) else (1 if area > 190 and h_ < 0.55 else 0)
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
    _ar = abs(sum(g[i][0] * g[(i + 1) % len(g)][1] - g[(i + 1) % len(g)][0] * g[i][1] for i in range(len(g)))) / 2
    bl.append([use, dm(hh), [dm(v) for pt in g for v in pt], sid, int(h_ * 1000), s2_roof(g, _ar), roof_shape(g, _ar)])
    pts = [((x - X0) / PX, (z - Z0) / PX) for x, z in g]
    dbm.polygon(pts, fill=255)
for e in poi_xy:
    (x, z), pt = e
    if pt.get("amenity") in ("marketplace", "bus_station") or pt.get("shop") == "marketplace": stalls.append([round(x, 1), round(z, 1)])
print("uses", dict(sorted(use_count.items())), "stalls", len(stalls))
json.dump({"b": bl, "signs": SIGNS, "stalls": stalls}, open(f"{out}/buildings.json", "w"), separators=(",", ":"))
print("buildings", len(bl), "roof colour source none/sentinel/aerial", ROOF_SRC, "roof shape unknown/flat/pitched", ROOF_SHAPE)


# ---------------- extra OSM features (barriers, real trees, power, pitches, pools, parking, tanks, bumps)
feat = {"cliffs": [], "barriers": [], "gates": [], "trees": [], "lines": [], "towers": [], "solar": [], "subst": [], "pitches": [], "pools": [], "parking": [], "tanks": [], "bumps": []}
BK = {"fence": 0, "wall": 1, "retaining_wall": 2, "hedge": 3, "gate": 4, "city_wall": 1, "guard_rail": 0}
for e in load3("cliffs3"):
    t = e.get("tags", {}); g = poly(e)
    if e["type"] != "way" or len(g) < 2: continue
    kind = t.get("natural") or t.get("man_made") or t.get("barrier")
    ht = {"cliff": 6.0, "ridge": 3.0, "rock": 2.5, "bare_rock": 2.0, "scree": 1.5, "embankment": 2.5, "retaining_wall": 2.0}.get(kind)
    if ht is None: continue
    ht = num(t.get("height", ""), ht)
    feat["cliffs"].append([0 if kind in ("cliff", "ridge", "rock", "bare_rock", "scree") else 1, round(min(ht, 25.0), 1), [dm(v) for pt in g for v in pt]])
for e in load2("barriers"):
    t = e.get("tags", {}); k = t.get("barrier", "")
    if e["type"] == "way":
        g = poly(e)
        if k in BK and len(g) >= 2: feat["barriers"].append([BK[k], [dm(v) for pt in g for v in pt]])
    elif k in ("gate", "lift_gate", "bollard", "toll_booth"): feat["gates"].append([round(P(e["lat"], e["lon"])[0], 1), round(P(e["lat"], e["lon"])[1], 1), {"gate": 0, "lift_gate": 1, "bollard": 2, "toll_booth": 1}[k]])
for e in load2("trees"):
    if e["type"] == "node": x, z = P(e["lat"], e["lon"]); feat["trees"].append([round(x, 1), round(z, 1)])
    else:
        g = poly(e)
        for i in range(len(g) - 1):
            L = math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1])
            for k in range(max(1, int(L // 7))): f = k * 7 / max(L, 1); feat["trees"].append([round(g[i][0] + (g[i + 1][0] - g[i][0]) * f, 1), round(g[i][1] + (g[i + 1][1] - g[i][1]) * f, 1)])
for e in load2("power"):
    t = e.get("tags", {}); pw = t.get("power", "")
    if e["type"] == "node" and pw in ("tower", "pole"): x, z = P(e["lat"], e["lon"]); feat["towers"].append([round(x, 1), round(z, 1), 0 if pw == "tower" else 1])
    elif e["type"] == "way":
        g = poly(e)
        if pw in ("line", "minor_line", "cable") and len(g) >= 2: feat["lines"].append([0 if pw == "line" else 1, [dm(v) for pt in g for v in pt]])
        elif pw == "generator" and len(g) > 3: feat["solar"].append([dm(v) for pt in g for v in pt])
        elif pw == "substation" and len(g) > 3: feat["subst"].append([dm(v) for pt in g for v in pt])
SPORT = {"soccer": 0, "football": 0, "tennis": 1, "basketball": 2, "netball": 2, "volleyball": 2, "athletics": 3, "cricket": 3, "rugby": 0}
for e in load2("leisure"):
    t = e.get("tags", {}); g = poly(e)
    if e["type"] != "way" or len(g) < 4: continue
    pts_ = [dm(v) for pt in g for v in pt]
    if t.get("leisure") == "pitch": feat["pitches"].append([SPORT.get(str(t.get("sport", "")).split(";")[0], 3), pts_])
    elif t.get("leisure") == "swimming_pool": feat["pools"].append(pts_)
    elif t.get("amenity") == "parking": feat["parking"].append(pts_)
for e in load2("misc"):
    t = e.get("tags", {}); mm = t.get("man_made", "")
    if mm in ("storage_tank", "silo"):
        if e["type"] == "way":
            g = poly(e)
            if len(g) > 3:
                cx = sum(p[0] for p in g) / len(g); cz = sum(p[1] for p in g) / len(g); r = sum(math.hypot(p[0] - cx, p[1] - cz) for p in g) / len(g)
                feat["tanks"].append([round(cx, 1), round(cz, 1), round(max(1.5, r), 1), 1 if mm == "silo" else 0])
        else: x, z = P(e["lat"], e["lon"]); feat["tanks"].append([round(x, 1), round(z, 1), 4.0, 1 if mm == "silo" else 0])
    if e["type"] == "node" and t.get("traffic_calming"): x, z = P(e["lat"], e["lon"]); feat["bumps"].append([round(x, 1), round(z, 1)])
extra_views = []
for e in load2("misc"):
    t = e.get("tags", {})
    if e["type"] == "node" and (t.get("tourism") == "viewpoint" or t.get("natural") == "peak"):
        x, z = P(e["lat"], e["lon"]); extra_views.append({"n": t.get("name") or ("Peak" + (" " + t["ele"] + "m" if t.get("ele") else "")), "p": [round(x, 1), round(z, 1)]})
json.dump(feat, open(f"{out}/features.json", "w"), separators=(",", ":"))
print("features", {k: len(v) for k, v in feat.items()}, "views+", len(extra_views))

# ---------------- urban ground: where buildings are dense the ground is packed earth / paving, not lawn (yards in Manzini are swept red earth)
from PIL import ImageFilter
_bm = np.asarray(bmask, np.float32) / 255
def _box(a, r):
    c = np.cumsum(np.cumsum(np.pad(a, ((r + 1, r), (r + 1, r)), mode="edge"), 0), 1)
    return (c[2 * r + 1:, 2 * r + 1:] - c[:-2 * r - 1, 2 * r + 1:] - c[2 * r + 1:, :-2 * r - 1] + c[:-2 * r - 1, :-2 * r - 1]) / (2 * r + 1) ** 2
dens = _box(_bm, max(2, int(40 / PX)))                              # building coverage in an ~80 m window
ca, ka = np.array(col, np.float32), np.array(cls)
soft = np.isin(ka, (1, 2, 4, 8))                                    # never repaint water, forest, rock, parking...
yard = np.clip((dens - 0.05) / 0.10, 0, 1) * soft; core = np.clip((dens - 0.20) / 0.12, 0, 1) * soft
if S2 is not None and S2.shape[:2] == ca.shape[:2] and S2PX == PX:
    # the real thing: satellite colour, lifted to the game's exposure; OSM colour only survives as a 12 % hint and for water
    g_ = np.clip(S2 * 1.62 + 6, 0, 255); lum = g_.mean(-1, keepdims=True); g_ = np.clip(lum + (g_ - lum) * 1.12, 0, 255)
    wat = (ka == 12)[..., None]
    ca = np.where(wat, ca * 0.6 + g_ * 0.4, ca * 0.12 + g_ * 0.88); yard *= 0; core *= 0
    REAL_GROUND = True
else: REAL_GROUND = False
ca = ca * (1 - 0.75 * yard[..., None]) + np.array([150, 126, 98], np.float32) * 0.75 * yard[..., None]
ca = ca * (1 - 0.85 * core[..., None]) + np.array([134, 132, 126], np.float32) * 0.85 * core[..., None]
ka[(np.clip((dens - 0.05) / 0.10, 0, 1) * soft > 0.5) & (ka != 8)] = 8
if not REAL_GROUND: ca[_bm > 0.5] = ca[_bm > 0.5] * 0.8                                 # contact darkening under footprints
col = Image.fromarray(ca.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)); cls = Image.fromarray(ka)
col.save(f"{out}/groundcolor.png", optimize=True); cls.save(f"{out}/groundclass.png", optimize=True)
# ---------------- trees from raster: density per m2 by ground class (5 forest, 8 gardens, 1 bushveld, 2 grass, 4 farmland)
arr = np.array(cls); trees = []
for cid, per_m2 in ((5, 1 / 350), (8, 1 / 1100), (1, 1 / 3200), (2, 1 / 6000), (4, 1 / 12000)):
    prob = per_m2 * PX * PX
    ys, xs = np.nonzero(arr == cid)
    keep = np.random.default_rng(cid).random(len(xs)) < prob
    for xi, yi in zip(xs[keep], ys[keep]):
        trees.append((X0 + (xi + random.random()) * PX, Z0 + (yi + random.random()) * PX, cid))
random.shuffle(trees); trees = trees[:90000]
open(f"{out}/trees.bin", "wb").write(b"".join(struct.pack("<ffB", x, z, c) for x, z, c in trees))
print("trees", len(trees))

# ---------------- places, POIs, signals, spawn, landmarks
pts = load("points")
pts3 = [e for e in load3("points3") if e.get("type") == "node" and "tags" in e]
places = [{"n": e["tags"]["name"], "k": e["tags"]["place"], "p": [round(v, 1) for v in P(e["lat"], e["lon"])]}
          for e in pts if e["tags"].get("place") in ("city", "town", "suburb", "village", "neighbourhood", "hamlet")]
KEEP = ("mall", "supermarket", "marketplace", "fuel", "hospital", "bus_station", "school", "college", "university", "place_of_worship", "bank", "police", "restaurant", "fast_food", "convenience")
pois = []
for e in pts:
    t = e["tags"]; k = t.get("amenity") or t.get("shop") or t.get("tourism")
    if t.get("name") and k and (k in KEEP or t.get("shop") in ("mall", "supermarket")):
        pois.append({"n": t["name"], "k": k, "p": [round(v, 1) for v in P(e["lat"], e["lon"])]})
signals = [[round(v, 1) for v in P(e["lat"], e["lon"])] for e in pts if e["tags"].get("highway") == "traffic_signals"]
busstops = [{"p": [round(v, 1) for v in P(e["lat"], e["lon"])], "n": e["tags"].get("name", "")} for e in pts + pts3 if e["tags"].get("highway") == "bus_stop"]
def _dedupe(lst, r=3.0):
    seen, out = set(), []
    for q in lst:
        k = (int(q[0] // r), int(q[1] // r))
        if k not in seen: seen.add(k); out.append(q)
    return out
lamps = _dedupe([[round(v, 1) for v in P(e["lat"], e["lon"])] for e in pts + pts3 if e["tags"].get("highway") == "street_lamp"])
# traffic signs: [x, z, kind] kind 0=stop 1=give way 2=other regulatory/warning
SIGNK = {"stop": 0, "give_way": 1}
signs = _dedupe([[round(v, 1) for v in P(e["lat"], e["lon"])] + [SIGNK.get(e["tags"].get("highway") or e["tags"].get("traffic_sign"), 2)]
                 for e in pts3 if e["tags"].get("highway") in ("stop", "give_way") or e["tags"].get("traffic_sign")], 4.0)
addr = [[round(v, 1) for v in P(e["lat"], e["lon"])] + [str(e["tags"]["addr:housenumber"])[:6]] for e in pts3 if e["tags"].get("addr:housenumber")][:20000]
views = [{"n": e["tags"].get("name", "Viewpoint"), "p": [round(v, 1) for v in P(e["lat"], e["lon"])]} for e in pts if e["tags"].get("tourism") == "viewpoint"]
mx = np.array([[r_['p'][i] / 10, r_['p'][i + 1] / 10] for r_ in roads if r_['c'] <= 5 for i in range(0, len(r_['p']), 2)])
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
want = {"manzini": (-26.4966, 31.3826), "matsapha": (-26.4945, 31.3084), "fairview": (-26.478, 31.376), "ngwane_park": (-26.5228, 31.373),
        "kwaluseni": (-26.482, 31.297), "airport": (-26.529, 31.3075), "moneni": (-26.505, 31.41)}
snaps = {k: snap(*P(*v)) for k, v in want.items()}
_ortho = {"ortho": {"bounds": OB}} if ORTHO is not None and os.path.exists(f"{out}/ortho.jpg") else {}
meta = {**_ortho, "lat0": LAT0, "lon0": LON0, "bounds": [X0, X1, Z0, Z1], "px": PX, "gw": W, "gh": H,
        "dem": {"x0": dem["x0"], "z0": dem["z0"], "step": dem["step"], "nx": dem["nx"], "nz": dem["nz"]},
        "spawn": spawn, "places": places, "pois": pois, "signals": signals, "busstops": busstops, "lamps": lamps, "signs": signs, "addr": addr, "views": views + [v for v in extra_views if all(abs(v["p"][0] - q["p"][0]) + abs(v["p"][1] - q["p"][1]) > 60 for q in views)], "snaps": snaps}
json.dump(meta, open(f"{out}/meta.json", "w"), separators=(",", ":"))
print("spawn", spawn, "snaps", snaps)
