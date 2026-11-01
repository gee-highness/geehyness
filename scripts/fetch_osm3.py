#!/usr/bin/env python3
"""Third OSM fetch (run where Overpass is reachable): street lamps, traffic signs, stops, addresses, cliffs, hydrology.

Usage: python3 -I scripts/fetch_osm3.py <out_dir>        # then zip it into data/eswatini-osm3.zip
Writes <out_dir>/points3.json, cliffs3.json, hydro3.json (Overpass `out geom` JSON, same shape as the other extracts),
tiled so no single request times out. Feed the folder to build_world.py as its 5th argument.
"""
import json, os, sys, time, urllib.request, urllib.parse

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
S, W, N, E = -26.62, 31.05, -26.28, 31.48   # corridor bbox (Matsapha-Manzini gap, Malagwane Hill included)
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
QUERIES = {
    "points3": ['node["highway"~"^(street_lamp|stop|give_way|traffic_sign|crossing|bus_stop)$"]', 'node["traffic_sign"]', 'node["addr:housenumber"]', 'node["highway"="street_lamp"]'],
    "cliffs3": ['way["natural"~"^(cliff|ridge|rock|scree|bare_rock)$"]', 'way["man_made"="embankment"]', 'way["barrier"="retaining_wall"]'],
    "hydro3": ['way["waterway"~"^(river|stream|canal|drain|ditch)$"]', 'way["natural"~"^(water|wetland)$"]', 'way["water"]'],
}

def post(q):
    data = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(6):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data, {"User-Agent": "shesha-osm-fetch/1.0 (contact: project owner)"})
            return json.load(urllib.request.urlopen(req, timeout=300))["elements"]
        except Exception as ex:
            print("retry", ep, ex); time.sleep(10 * (attempt + 1))
    raise SystemExit("Overpass unreachable")

STEPS = 4
for name, sels in QUERIES.items():
    seen, els = set(), []
    for i in range(STEPS):
        for j in range(STEPS):
            s, n = S + (N - S) * i / STEPS, S + (N - S) * (i + 1) / STEPS
            w, e = W + (E - W) * j / STEPS, W + (E - W) * (j + 1) / STEPS
            q = "[out:json][timeout:240];(" + "".join(f"{s_}({s},{w},{n},{e});" for s_ in sels) + ");out geom;"
            for el in post(q):
                k = (el["type"], el["id"])
                if k not in seen: seen.add(k); els.append(el)
            time.sleep(2)
    json.dump({"elements": els}, open(f"{OUT}/{name}.json", "w"), separators=(",", ":"))
    print(name, len(els))
