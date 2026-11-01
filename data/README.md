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
- `dem.json` — 250 m elevation grid for the corridor (x -28500..7200, z -24200..5000)
