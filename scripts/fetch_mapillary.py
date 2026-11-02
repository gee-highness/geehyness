#!/usr/bin/env python3
"""Fetch Mapillary map features (street lights, poles, signs, traffic lights, ...) for the playable rectangle.
   MAPILLARY_TOKEN=... python3 -I scripts/fetch_mapillary.py data/mapillary_features.json
   The token is read from the environment only; it is never written to disk. Data licence: CC BY-SA 4.0 (credit: Mapillary contributors)."""
import json, os, sys, time, urllib.parse, urllib.request
TOKEN = os.environ["MAPILLARY_TOKEN"]; OUT = sys.argv[1] if len(sys.argv) > 1 else "data/mapillary_features.json"
W, E, S, N = 31.096, 31.454, -26.542, -26.278; STEP = 0.015
seen, feats = set(), []
def fetch(w, s, e, n, depth=0):
    q = urllib.parse.urlencode({"access_token": TOKEN, "bbox": f"{w:.5f},{s:.5f},{e:.5f},{n:.5f}", "fields": "id,object_value,geometry,first_seen_at", "limit": 2000})
    for attempt in range(4):
        try:
            j = json.load(urllib.request.urlopen("https://graph.mapillary.com/map_features?" + q, timeout=90)); break
        except Exception as ex:
            time.sleep(3 * (attempt + 1)); j = None
    if j is None: print("  failed", w, s); return
    d = j.get("data", [])
    if len(d) >= 2000 and depth < 3:                         # full page: split the tile so nothing is cut off
        mw, mn = (w + e) / 2, (s + n) / 2
        for a, b, c, dd in ((w, s, mw, mn), (mw, s, e, mn), (w, mn, mw, n), (mw, mn, e, n)): fetch(a, b, c, dd, depth + 1)
        return
    for f in d:
        if f["id"] in seen: continue
        seen.add(f["id"]); lon, lat = f["geometry"]["coordinates"]; feats.append([f["object_value"], round(lon, 6), round(lat, 6)])
    time.sleep(0.25)
tiles = [(w, s) for w in [W + i * STEP for i in range(int((E - W) / STEP) + 1)] for s in [S + j * STEP for j in range(int((N - S) / STEP) + 1)]]
for k, (w, s) in enumerate(tiles):
    fetch(w, s, min(w + STEP, E), min(s + STEP, N))
    if k % 25 == 0: print(f"tile {k}/{len(tiles)}  features {len(feats)}", flush=True)
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
json.dump({"source": "Mapillary map features, CC BY-SA 4.0", "features": feats}, open(OUT, "w"), separators=(",", ":"))
print("done", len(feats))
