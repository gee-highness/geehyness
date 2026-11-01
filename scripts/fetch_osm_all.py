#!/usr/bin/env python3
"""Fetch (almost) everything OpenStreetMap knows about the Manzini -> Mbabane corridor. Built for Termux:
standard library only, small memory (tile-by-tile, streamed to disk), resumable, retries over several Overpass mirrors.

    python3 scripts/fetch_osm_all.py [out_dir] [--bbox S,W,N,E] [--only name,name] [--tiles N]

Output (out_dir, default ~/osm_all), one Overpass-style JSON per category, `{"elements":[...]}` with `out geom`:
  points3  cliffs3  hydro3        <- exactly what scripts/build_world.py reads as its 5th argument
  roads_all  buildings_all  landuse_all  pois_all  furniture_all  power_all  rail_all  boundaries_all  places_all  routes_all
Re-run after an interruption: finished tiles are skipped (progress is kept in out_dir/.done).
"""
import json, os, sys, time, urllib.parse, urllib.request

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opt = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else "1") for a in sys.argv[1:] if a.startswith("--")}
OUT = os.path.expanduser(args[0] if args else "~/osm_all"); os.makedirs(OUT, exist_ok=True)
S, W, N, E = [float(v) for v in opt.get("--bbox", "-26.62,31.05,-26.28,31.48").split(",")]
ONLY = set(opt["--only"].split(",")) if "--only" in opt else None
TILES = int(opt.get("--tiles", "0"))   # 0 = automatic per category
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]

# category -> (selectors, tiles per side)
CATS = {
    "points3": (['node["highway"~"^(street_lamp|stop|give_way|traffic_sign|crossing|bus_stop|traffic_signals|speed_camera|milestone|turning_circle)$"]', 'node["traffic_sign"]', 'node["addr:housenumber"]', 'node["traffic_calming"]'], 4),
    "cliffs3": (['way["natural"~"^(cliff|ridge|rock|scree|bare_rock|valley|arete)$"]', 'way["man_made"="embankment"]', 'way["barrier"="retaining_wall"]', 'node["natural"~"^(peak|saddle|cliff|rock|stone)$"]'], 4),
    "hydro3": (['way["waterway"]', 'way["natural"~"^(water|wetland|spring|bay)$"]', 'way["water"]', 'way["landuse"="reservoir"]', 'node["natural"="spring"]', 'node["man_made"~"^(water_tower|water_well|water_tap|water_works|storage_tank)$"]'], 4),
    "roads_all": (['way["highway"]', 'way["bridge"]', 'way["tunnel"]', 'way["junction"]', 'node["highway"]', 'way["aeroway"]', 'node["aeroway"]', 'way["amenity"="parking"]', 'way["service"]'], 5),
    "buildings_all": (['way["building"]', 'way["building:part"]', 'relation["building"]', 'node["building"]', 'way["roof:shape"]'], 6),
    "landuse_all": (['way["landuse"]', 'relation["landuse"]', 'way["natural"]', 'relation["natural"]', 'way["leisure"]', 'relation["leisure"]', 'way["surface"="sand"]', 'way["wood"]', 'way["tree_row"]', 'node["natural"="tree"]', 'way["agricultural"]', 'way["crop"]'], 5),
    "pois_all": (['node["amenity"]', 'way["amenity"]', 'node["shop"]', 'way["shop"]', 'node["tourism"]', 'way["tourism"]', 'node["emergency"]', 'node["office"]', 'way["office"]', 'node["craft"]', 'node["healthcare"]', 'way["healthcare"]', 'node["historic"]', 'way["historic"]', 'node["sport"]', 'way["sport"]', 'node["name"]'], 4),
    "furniture_all": (['node["barrier"]', 'way["barrier"]', 'node["man_made"]', 'way["man_made"]', 'node["highway"~"^(street_lamp|bus_stop|crossing|stop|give_way|traffic_signals)$"]', 'node["amenity"~"^(bench|waste_basket|bicycle_parking|post_box|telephone|drinking_water|shelter|toilets|atm)$"]', 'node["information"]', 'node["advertising"]', 'way["advertising"]'], 4),
    "power_all": (['node["power"]', 'way["power"]', 'node["telecom"]', 'way["telecom"]', 'way["pipeline"]', 'node["utility"]', 'way["man_made"="pipeline"]', 'way["communication"]'], 4),
    "rail_all": (['way["railway"]', 'node["railway"]', 'relation["route"="railway"]', 'way["public_transport"]', 'node["public_transport"]'], 3),
    "boundaries_all": (['relation["boundary"]', 'way["boundary"]', 'relation["admin_level"]', 'relation["type"="boundary"]', 'way["protect_class"]'], 2),
    "places_all": (['node["place"]', 'way["place"]', 'relation["place"]', 'node["ele"]'], 2),
    "routes_all": (['relation["route"]', 'relation["type"="route_master"]', 'relation["type"="restriction"]'], 3),
}

def post(q):
    data = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(8):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data, {"User-Agent": "shesha-osm-fetch/2.0 (termux; project owner)"})
            return json.load(urllib.request.urlopen(req, timeout=400))["elements"]
        except Exception as ex:
            wait = min(120, 8 * (attempt + 1)); print(f"  retry {attempt + 1} ({type(ex).__name__}: {str(ex)[:60]}) in {wait}s", flush=True); time.sleep(wait)
    return None

done_file = os.path.join(OUT, ".done"); done = set(open(done_file).read().split()) if os.path.exists(done_file) else set()
for name, (sels, n) in CATS.items():
    if ONLY and name not in ONLY: continue
    n = TILES or n
    spool = os.path.join(OUT, f"{name}.jsonl"); seen = set()
    if os.path.exists(spool):                      # rebuild the id set from what is already on disk
        with open(spool) as f:
            for line in f:
                try: o = json.loads(line); seen.add((o["type"][0], o["id"]))
                except Exception: pass
    out = open(spool, "a")
    total = n * n
    for i in range(n):
        for j in range(n):
            tag = f"{name}:{n}:{i}:{j}"
            if tag in done: continue
            s, nn = S + (N - S) * i / n, S + (N - S) * (i + 1) / n; w, e = W + (E - W) * j / n, W + (E - W) * (j + 1) / n
            q = "[out:json][timeout:360];(" + "".join(f"{sel}({s:.5f},{w:.5f},{nn:.5f},{e:.5f});" for sel in sels) + ");out geom;"
            print(f"[{name}] tile {i * n + j + 1}/{total} ...", flush=True)
            els = post(q)
            if els is None: print("  giving up on this tile; re-run later to resume"); continue
            new = 0
            for el in els:
                k = (el["type"][0], el["id"])
                if k in seen: continue
                seen.add(k); out.write(json.dumps(el, separators=(",", ":")) + "\n"); new += 1
            out.flush(); done.add(tag); open(done_file, "a").write(tag + "\n")
            print(f"  +{new} elements", flush=True); time.sleep(3)
    out.close()
    # stream the spool into the final {"elements":[...]} file without holding it in memory
    if all(f"{name}:{n}:{i}:{j}" in done for i in range(n) for j in range(n)):
        with open(spool) as src, open(os.path.join(OUT, f"{name}.json"), "w") as dst:
            dst.write('{"elements":['); first = True
            for line in src:
                line = line.strip()
                if not line: continue
                dst.write(("" if first else ",") + line); first = False
            dst.write("]}")
        print(f"[{name}] complete -> {name}.json ({len(seen)} elements)", flush=True)
print("done. Zip with:  cd", OUT, "&& zip -q ../eswatini-osm-full.zip *.json")
