# SHESHA enhancement plan

Status key: [x] done · [~] in progress · [ ] queued · [data] waits for the rest of the OSM data

## A. Look: stylized, futuristic, non-repeating (all procedural, no image textures)
- [x] A1 World-space procedural material library (`stylized.ts`): asphalt, composite panels, ceramic tiles, ribbed metal, paving slabs, gravel. Hash + domain-warp, so nothing tiles; distance-faded detail (no shimmer).
- [x] A2 Anti-alias + tuning pass on A1 (seam fade, no cracks, richer terrain colour, exposure 0.92, hemisphere 0.9).
- [x] A3 Palette from the satellite review: rust / brick-red / orange-tile / grey / white / blue roofs weighted by building type (see C).
- [ ] A4 Futuristic accents on by default: cool graphite roads, teal/violet fog grade, soft emissive seams at night; Neo mode (`Y`) = full neon + taller towers.
- [ ] A5 Procedural sky gradient + stylised clouds (replace HDRI), sun glow.

## B. Procedural environment generation (runs on whatever OSM data exists, adapts when you load more)
- [x] B1 Infill (~11k houses; only on named/mapped-area streets with <14 real buildings within ~450 m): houses along residential streets where OSM has no buildings (drops out automatically where real data exists).
- [x] B2 Garden trees around infill houses (60%); [ ] tree rows on named streets.
- [data] B3 Zoning classifier (CBD / residential / industrial / rural) from footprint density + landuse + POIs, then per-zone building generators.
- [data] B4 Real `building:levels`, roof shapes, addr plates, shop signs.
- [ ] B5 Landmarks seen in the satellite shots: solar arrays, round water tanks, cemeteries, landfill, sports fields, cloverleaf interchange check.

## C. Roofs observed in the satellite imagery (target distribution)
| Area / type | Look | Share |
|---|---|---|
| Informal / small houses (Kwaluseni, Magevini, Mathangeni) | rust-red & brown corrugated tin, low gable | 38% rust, 20% brick-red |
| Planned estates, hospital, university housing | orange / terracotta tile, rows of identical blocks | rust-orange + tan |
| Suburban villas (Fairview, Jacaranda) | red tile hip roofs, big gardens, mature trees | brick-red, grey |
| Warehouses / Matsapha industrial | ribbed grey, white, pale blue; long parallel ridges | grey 40%, white 30%, blue 20% |
| Malls / CBD | flat white-grey, some blue | white/grey |
| Solar array | dark-blue rectangle grid | landmark |

## D. World / tech
- [x] D1 40 m terrain, road graph + GPS routing, signals, pedestrians, weather, quality tiers.
- [ ] D2 Worker-thread chunk generation, texture-free materials (done with A1), draw-call merging.
- [ ] D3 Real-device profiling (needs a phone).

## E. After the OSM data lands
1. Unzip into `/tmp/osm3`, run `build_world.py ... /tmp/osm3`.
2. Compare overhead screenshots (script in HANDOFF) to the satellite shots.
3. Tune infill density (it should shrink to nothing where OSM is complete).
