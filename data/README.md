# Raw map data (OpenStreetMap © contributors, ODbL; elevation: AWS Terrain Tiles / Copernicus-SRTM)

Inputs for `scripts/build_world.py`. To regenerate `public/assets/world/`:

```
mkdir -p /tmp/osm /tmp/osm2
unzip -q data/eswatini-osm.zip  -d /tmp/osm
unzip -q data/eswatini-osm2.zip -d /tmp/osm2
cp data/dem.json /tmp/dem.json          # or re-create it with: python3 -I scripts/fetch_dem.py
python3 -I scripts/build_world.py /tmp/osm /tmp/dem.json public/assets/world /tmp/osm2   # ~3-5 min; run in the background
```

- `eswatini-osm.zip`  — roads, Manzini + Ezulwini buildings, points of interest
- `eswatini-osm2.zip` — barriers, trees, power, leisure/parking, misc, Lobamba/Malkerns/Matsapha/Mbabane buildings
- `dem.json` — 40 m elevation grid (`python3 -I scripts/fetch_dem.py 40 13 data/dem.json`; AWS terrarium z13) for the corridor (x -28500..7200, z -24200..5000)

## Third fetch (lamps, signs, stops, addresses, cliffs, hydrology)
Overpass was unreachable from the build sandbox, so this extract is **not yet in the repo**. Where Overpass works:

```
python3 -I scripts/fetch_osm3.py /tmp/osm3          # ~20-40 min (tiled)
(cd /tmp/osm3 && zip -q ~/geehyness/data/eswatini-osm3.zip *.json)
python3 -I scripts/build_world.py /tmp/osm data/dem.json public/assets/world /tmp/osm2 /tmp/osm3
```
`build_world.py` treats the 5th argument as optional; everything below is skipped when it is absent. The game already renders it:
real street lamps (procedural lamps defer to them), stop/give-way/warning sign plates, bus stops, cliffs/ridges/embankments
(rock slabs with collision), and real river/stream/canal/drain widths. `meta.addr` (house numbers) is emitted but not drawn yet.

## Everything-in-OSM fetch for Termux
```
pkg install -y git python
git clone <this repo> && cd geehyness
bash scripts/termux_osm.sh                       # all categories, resumable (re-run if interrupted)
bash scripts/termux_osm.sh points3,cliffs3,hydro3  # just what build_world.py consumes (about 20-40 min)
```
`scripts/fetch_osm_all.py` is stdlib-only, tiles each category, spools to `~/osm_all/*.jsonl` (so memory stays small) and writes
`<category>.json` when all tiles of that category are done. `points3/cliffs3/hydro3` feed `build_world.py` directly; the other
categories (`roads_all`, `buildings_all`, `landuse_all`, `pois_all`, `furniture_all`, `power_all`, `rail_all`, `boundaries_all`,
`places_all`, `routes_all`) are the full raw dumps for future converters. Move the zip to your PC / back into this repo to rebuild.
