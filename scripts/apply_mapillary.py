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
for v, lon, lat in feats:
    p = P(lat, lon)
    if v == "object--street-light": lamps.append(p)
    elif v.startswith("object--traffic-light"): sigs.append(p)
    elif v == "object--support--utility-pole": upoles.append(p + [0])
    elif v == "object--support--pole": upoles.append(p + [1])
    elif v == "object--sign--advertisement": bills.append(p + [0])
    elif v == "object--sign--store": bills.append(p + [1])
    elif v.startswith("regulatory--stop"): signs.append(p + [0])
    elif v.startswith("regulatory--yield") or v.startswith("regulatory--give-way"): signs.append(p + [1])
    elif v.startswith(("regulatory--", "warning--")) and "speed-limit" not in v: signs.append(p + [2])
keep = lambda lst, key: [q for q in lst if not q[-1:] == ["mly"]]
meta["lamps"] = dedupe([q for q in meta.get("lamps", [])] + lamps, 6.0)
meta["signals"] = dedupe([q for q in meta.get("signals", [])] + sigs, 8.0)
meta["signs"] = dedupe([q for q in meta.get("signs", [])] + signs, 6.0)
meta["upoles"] = dedupe(upoles, 4.0)
meta["bills"] = dedupe(bills, 10.0)
json.dump(meta, open(M, "w"), separators=(",", ":"))
print({k: len(meta[k]) for k in ("lamps", "signals", "signs", "upoles", "bills")})
