#!/usr/bin/env python3 -I
"""Merge data/mapillary_features.json (CC BY-SA 4.0, Mapillary contributors) into public/assets/world/meta.json in place.
   Safe to re-run (replaces the Mapillary-derived entries). Usage: python3 -I scripts/apply_mapillary.py"""
import json, math
M = "public/assets/world/meta.json"; F = "data/mapillary_features.json"
meta = json.load(open(M)); feats = json.load(open(F))["features"]
LAT0, LON0 = meta["lat0"], meta["lon0"]; KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
def P(lat, lon): return [round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KZ, 1)]
def dedupe(lst, r):
    seen, out = set(), []
    for q in lst:
        k = (int(q[0] // r), int(q[1] // r))
        if k not in seen: seen.add(k); out.append(q)
    return out
lamps, sigs, signs, upoles, bills = [], [], [], [], []
msigns, xwalks, furn, limits = [], [], [], []   # typed signs [x,z,key], zebra crossings [x,z], furniture [x,z,kind], speed limits [x,z,kmh]
def sign_key(v):
    if v.startswith("regulatory--stop"): return "stop"
    if v.startswith(("regulatory--yield", "regulatory--give-way")) or "give-way" in v: return "yield"
    if v.startswith("regulatory--no-entry"): return "noentry"
    if v.startswith("regulatory--turn-left") or v.startswith("regulatory--turn-right"): return "turn"
    if v.startswith(("regulatory--no-overtaking", "regulatory--no-stopping", "regulatory--no-motor")): return "noover"
    if v.startswith("warning--children"): return "w_child"
    if v.startswith("warning--pedestrians"): return "w_ped"
    if v.startswith("warning--road-bump") or v.startswith("warning--uneven"): return "w_bump"
    if v.startswith("warning--curve") or v.startswith("warning--offset"): return "w_curve"
    if v.startswith("warning--junction") or v.startswith("warning--crossroads"): return "w_junc"
    if v.startswith("warning--narrow-bridge"): return "w_narrow"
    if v.startswith("warning--"): return "w_gen"
    if v.startswith(("information--general-directions", "information--highway")): return "dir"
    if v.startswith(("information--", "object--sign--information")): return "info"
    if v in ("general--traffic-sign--g1", "object--traffic-sign--front"): return "gen"
    return None
for v, lon, lat in feats:
    p = P(lat, lon)
    if v == "object--street-light": lamps.append(p)
    elif v.startswith("object--traffic-light"): sigs.append(p)
    elif v == "object--support--utility-pole": upoles.append(p + [0])
    elif v == "object--support--pole": upoles.append(p + [1])
    elif v == "object--sign--advertisement": bills.append(p + [0])
    elif v == "object--sign--store": bills.append(p + [1])
    elif v.startswith("regulatory--maximum-speed-limit-"): limits.append(p + [int(v.split("limit-")[1].split("--")[0])])
    elif v == "marking--discrete--crosswalk-zebra": xwalks.append(p)
    elif v in ("object--manhole", "object--junction-box", "object--trash-can", "construction--barrier--temporary", "object--traffic-cone", "object--banner"): furn.append(p + [{"object--manhole": "manhole", "object--junction-box": "box", "object--trash-can": "can", "construction--barrier--temporary": "barrier", "object--traffic-cone": "cone", "object--banner": "banner"}[v]])
    elif sign_key(v): msigns.append(p + [sign_key(v)])
keep = lambda lst, key: [q for q in lst if not q[-1:] == ["mly"]]
meta["lamps"] = dedupe([q for q in meta.get("lamps", [])] + lamps, 6.0)
meta["signals"] = dedupe([q for q in meta.get("signals", [])] + sigs, 8.0)
prev = {(q[0], q[1]) for q in meta.get("msigns", [])}
meta["signs"] = [q for q in meta.get("signs", []) if (q[0], q[1]) not in prev and not any(abs(q[0] - m[0]) < 0.2 and abs(q[1] - m[1]) < 0.2 for m in msigns)]   # keep OSM-only signs
meta["msigns"] = dedupe(msigns, 3.0)
meta["xwalks"] = dedupe(xwalks, 6.0)
meta["furn"] = dedupe(furn, 2.0)
meta["upoles"] = dedupe(upoles, 4.0)
meta["bills"] = dedupe(bills, 10.0)
_b = meta["bounds"]
for k in ("lamps", "signals", "signs", "msigns", "xwalks", "furn", "upoles", "bills"):   # the world rectangle shrank: drop detections outside it
    meta[k] = [q for q in meta.get(k, []) if _b[0] <= q[0] <= _b[1] and _b[2] <= q[1] <= _b[3]]
json.dump(meta, open(M, "w"), separators=(",", ":"))
# real speed limits: set 'ms' on the nearest road way (and same-named ways within 400 m) for every Mapillary speed-limit sign
R = "public/assets/world/roads.json"; rd = json.load(open(R)); ways = rd["roads"]; changed = 0
for x, z, kmh in limits:
    best, bd = None, 25.0
    for wi, way in enumerate(ways):
        if way["c"] > 6 or way.get("dz") and max(way["dz"]) > 0.25: continue
        p = way["p"]
        for i in range(0, len(p) - 2, 2):
            ax, az, bx, bz = p[i] / 10, p[i + 1] / 10, p[i + 2] / 10, p[i + 3] / 10; dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1e-9
            t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2)); d = math.hypot(ax + t * dx - x, az + t * dz - z)
            if d < bd: bd, best = d, wi
    if best is None: continue
    nm = ways[best].get("n")
    for way in ways:
        if way is ways[best] or (nm and way.get("n") == nm and way["c"] <= 6 and math.hypot(way["p"][0] / 10 - x, way["p"][1] / 10 - z) < 400):
            if way.get("ms") != kmh: way["ms"] = kmh; changed += 1
json.dump(rd, open(R, "w"), separators=(",", ":"))
print("speed limits applied to", changed, "ways")
print({k: len(meta[k]) for k in ("lamps", "signals", "signs", "msigns", "xwalks", "furn", "upoles", "bills")}, "limits", len(limits))
