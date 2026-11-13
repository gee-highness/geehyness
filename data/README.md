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
- `dem.json` — 40 m elevation grid from Copernicus GLO-30 (`python3 -I scripts/fetch_dem_glo30.py 40 data/dem.json`; needs tifffile imagecodecs scipy) for the corridor (x -28500..7200, z -24200..5000)

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

## Height refinement (OSM-synced)
`dem_glo30_raw.json` = raw GLO-30 grid. `dem.json` = that grid after `python3 -I scripts/refine_dem.py /tmp/osm /tmp/osm2 data/dem_glo30_raw.json data/dem.json data/height_report.json data/ndsm_debug.png`:
roof/canopy bias removed where OSM confirms buildings/vegetation, terrain pulled onto smoothed grade-limited road profiles. `height_report.json` lists blobs taller than the ground that OSM does not explain (candidate unmapped buildings). Pavements/kerbs are far below GLO-30's 30 m resolution, so they stay derived from OSM road geometry.

## Current pipeline (Manzini-only world, 17 x 12 km) - use THIS, the commands above are historical
Bounds live at the top of `scripts/build_world.py` / `fetch_dem_glo30.py` (`X0, X1, Z0, Z1 = -10500, 6500, -6500, 5500`). `build_world.py` clips every OSM input to them.
```
# inputs: /tmp/osmm (merged extract from merge_osm_full.py), /tmp/osmm/osm2, /tmp/osm3
python3 -I scripts/fetch_dem_glo30.py 20 data/dem_glo30_raw.json            # 20 m grid from Copernicus GLO-30
python3 -I scripts/refine_dem.py /tmp/osmm /tmp/osmm/osm2 data/dem_glo30_raw.json data/dem.json data/height_report.json data/ndsm_debug.png
python3 -I scripts/build_world.py /tmp/osmm data/dem.json public/assets/world /tmp/osmm/osm2 /tmp/osm3   # ~15 s
python3 -I scripts/apply_mapillary.py                                        # real poles / lamps / signs into meta.json
```
Do NOT build from the bare `/tmp/osm` + `/tmp/osm2` extracts: that drops the merged buildings, land use and the third fetch.

## Real imagery (run before build_world.py; both are picked up automatically when the files exist)
```
python3 -I scripts/fetch_s2.py      # Sentinel-2 10 m true colour -> data/s2_ground.png (whole map ground colour, roof colour fallback)
python3 -I scripts/fetch_ortho.py   # 17 cm NDMA drone survey of Manzini (OpenAerialMap, CC-BY 4.0, 820 MB download) ->
                                    # data/ortho_1m.jpg (+mask, meta) and public/assets/world/ortho.jpg (2 m ground layer, desktop only)
```

## Buildings missing from OSM
`data/bld_ms.json.gz` = Microsoft ML building footprints (ODbL) not already in OSM, made by
`python3 -I scripts/merge_ms_buildings.py /tmp/osmm /tmp/osmm/osm2 <quadkey 300301322 .csv.gz> /tmp/osmm/bld_ms.json`.
Before building: `gunzip -c data/bld_ms.json.gz > /tmp/osmm/bld_ms.json` (build_world.py reads it as one more building file).

## Everything needed to rebuild is in this folder (no re-download required)
| File | What | Use |
|---|---|---|
| `build-inputs.zip` | merged OSM inputs: `osmm/` (roads, points, land use, all `bld_*.json` incl. `bld_ms.json`, `osm2/`) and `osm3/` | `unzip -q data/build-inputs.zip -d /tmp` -> `/tmp/osmm`, `/tmp/osm3` |
| `glo30_S27_E031.tif` | Copernicus GLO-30 elevation tile | `fetch_dem_glo30.py 20 data/dem_glo30_raw.json data/glo30_S27_E031.tif` |
| `ms_buildings_300301322.csv.gz` | Microsoft building footprints (source for `bld_ms.json.gz`) | `merge_ms_buildings.py` |
| `ortho_50cm.jpg` | Manzini aerial survey resampled to 0.5 m on the game grid (bounds in `ortho_meta.json`); white = no data | future detail work (facades, lots, markings) |
| `ortho_1m.jpg` + `ortho_1m_mask.png` | same at 1 m | read by `build_world.py` (roof colour + shape) |
| `ortho_uneswa_7cm.tif` | University of Eswatini (Kwaluseni) campus, 7 cm GeoTIFF, UTM 36S, CC-BY 4.0 (OpenAerialMap, R. Brown / M. Dlamini, 2019) | not used yet |
| `s2_ground.png` | Sentinel-2 true colour on the game grid | read by `build_world.py` |
NOT in the repo: the original 17 cm Manzini GeoTIFF (822 MB, over GitHub's 100 MB file limit). `scripts/fetch_ortho.py` re-downloads it from OpenAerialMap.
Dev helpers: `scripts/dev/shot.cjs` (screenshots: `Q='?hq' node scripts/dev/shot.cjs name:x:z [name:x:z:topHeight]`), `scripts/dev/cars.cjs`, `scripts/roadscan.cjs`.
