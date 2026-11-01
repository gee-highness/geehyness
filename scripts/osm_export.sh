#!/usr/bin/env bash
# Extract every real street (and land cover) for the Manzini to Ezulwini area from OpenStreetMap.
# Needs: osmium-tool, GDAL (ogr2ogr with the OSM driver), curl.
# Output is in UTM 36S metres (EPSG:32736), the same CRS world_prep.py uses.
set -euo pipefail
mkdir -p osm && cd osm

# 1. Country extract (confirm the exact file name on the Geofabrik Africa page)
[ -f eswatini.osm.pbf ] || curl -L -o eswatini.osm.pbf https://download.geofabrik.de/africa/swaziland-latest.osm.pbf

# 2. Clip to the area of interest. Use -p corridor.geojson instead of -b once you have drawn the corridor in QGIS.
osmium extract -b 31.10,-26.58,31.45,-26.30 eswatini.osm.pbf -o aoi.osm.pbf --overwrite

# 3. EVERY highway way: motorway down to service, tracks, footways, steps. Nothing is filtered out here.
#    other_tags carries surface, lanes, width, oneway, maxspeed, bridge, tunnel, layer, lit, traffic_calming.
ogr2ogr -f GeoJSON highways.geojson aoi.osm.pbf lines -where "highway IS NOT NULL" -t_srs EPSG:32736 -overwrite
ogr2ogr -f GeoJSON waterways.geojson aoi.osm.pbf lines -where "waterway IS NOT NULL" -t_srs EPSG:32736 -overwrite
ogr2ogr -f GeoJSON barriers.geojson aoi.osm.pbf lines -where "barrier IS NOT NULL" -t_srs EPSG:32736 -overwrite

# 4. Polygons for the ground mask and buildings
ogr2ogr -f GeoJSON landuse.geojson aoi.osm.pbf multipolygons \
  -where "landuse IS NOT NULL OR natural IS NOT NULL OR leisure IS NOT NULL" -t_srs EPSG:32736 -overwrite
ogr2ogr -f GeoJSON buildings.geojson aoi.osm.pbf multipolygons -where "building IS NOT NULL" -t_srs EPSG:32736 -overwrite

# 5. Points: signals, crossings, traffic calming, bus stops live in other_tags or tagged fields
ogr2ogr -f GeoJSON points.geojson aoi.osm.pbf points -t_srs EPSG:32736 -overwrite

# 6. Completeness report: counts by highway class. Compare with what you know from driving.
python3 - <<'PY'
import json, collections
f = json.load(open("highways.geojson"))["features"]
c = collections.Counter(x["properties"]["highway"] for x in f)
named = sum(1 for x in f if x["properties"].get("name"))
print(f"{len(f)} highway ways, {named} named")
for k, v in c.most_common():
    print(f"  {k:16s} {v}")
PY
echo "Done. Next: python world_prep.py ground --out ../world --geojson landuse.geojson buildings.geojson waterways.geojson"
