#!/usr/bin/env python3
"""Merge the Termux "everything" extract (eswatini-osm-full.zip) into the base extracts so build_world.py sees one dataset.
usage: merge_osm_full.py <osm_dir> <osm_full_dir> <out_dir>
 - roads.json   = base roads + any highway way in roads_all.json not already present
 - points.json  = base points + pois_all.json elements not already present
 - bld_extra.json = buildings_all.json elements not present in any base bld_*.json (needs <osm2_dir> via OSM2 env)
 - landuse.json = landuse_all.json (for zoning)
Everything is clipped to the playable world rectangle (same as build_world.py X0..Z1)."""
import json, math, os, sys, glob
osm, full, out = sys.argv[1:4]; osm2 = os.environ.get("OSM2", "")
os.makedirs(out, exist_ok=True)
LAT0, LON0 = -26.4966, 31.3826
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
X0, X1, Z0, Z1 = -28500, 7200, -24200, 5000
def ld(p): return json.load(open(p))["elements"]
def ctr(e):
    if "lat" in e: pts = [(e["lat"], e["lon"])]
    elif e.get("geometry"): pts = [(g["lat"], g["lon"]) for g in e["geometry"]]
    elif e.get("members"): pts = [(g["lat"], g["lon"]) for m in e["members"] for g in m.get("geometry", [])]
    else: return None
    if not pts: return None
    la = sum(p[0] for p in pts) / len(pts); lo = sum(p[1] for p in pts) / len(pts)
    return ((lo - LON0) * KX, -(la - LAT0) * KZ)
def inside(e):
    c = ctr(e); return c is not None and X0 <= c[0] <= X1 and Z0 <= c[1] <= Z1
def dump(name, els): json.dump({"elements": els}, open(f"{out}/{name}.json", "w"), separators=(",", ":")); print(name, len(els))
base = ld(f"{osm}/roads.json"); have = {e["id"] for e in base}
add = [e for e in ld(f"{full}/roads_all.json") if e["type"] == "way" and "highway" in e.get("tags", {}) and e["id"] not in have and inside(e)]
dump("roads", base + add)
base = ld(f"{osm}/points.json"); have = {e["id"] for e in base}
def as_node(e):  # ways/relations become a point at their centroid (build_world expects lat/lon)
    if "lat" in e: return e
    pts = [(g["lat"], g["lon"]) for g in e.get("geometry", [])] or [(g["lat"], g["lon"]) for m in e.get("members", []) for g in m.get("geometry", [])]
    if not pts: return None
    return {"type": "node", "id": e["id"], "lat": sum(q[0] for q in pts) / len(pts), "lon": sum(q[1] for q in pts) / len(pts), "tags": e.get("tags", {})}
pois = [as_node(e) for e in ld(f"{full}/pois_all.json") if e["id"] not in have and inside(e)]
dump("points", base + [e for e in pois if e])
seen = set()
for f in glob.glob(f"{osm}/bld_*.json") + (glob.glob(f"{osm2}/bld_*.json") if osm2 else []):
    seen.update(e["id"] for e in ld(f))
dump("bld_extra", [e for e in ld(f"{full}/buildings_all.json") if e["id"] not in seen and e["type"] != "node" and inside(e)])
dump("landuse", ld(f"{full}/landuse_all.json"))
for n in ("barriers", "trees", "power", "leisure", "misc"):
    pass
