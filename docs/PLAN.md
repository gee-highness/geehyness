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

## F. Cops & robbers (night stealth)
- [x] F1 Truly dark nights (moonlight only), sparse lit windows, lamp light pools, sky from true solar elevation.
- [x] F2 Stealth model: sight radius from headlights / brake lights / ambient (170 m by day, 20 m lights-off at night, +105 low beam, +230 high beam); hearing radius from speed, throttle, skids, horn (+260), crashes.
- [x] F3 Cop AI (`police.ts`): PATROL -> ALERT (investigate last known position) -> CHASE (road-graph pursuit, radio to nearby units) -> SEARCH -> PATROL; line of sight over building footprints, field of view; siren + strobe; bust = close and slow for 2.2 s; escape = nobody chasing for 18 s.
- [x] F5 Street lamps really light the world: 16 nearest lamps feed a shader uniform used by roads, kerbs, walls, roofs, terrain, props (`lamp-light.ts`); light pools on the ground; strength follows night.
- [x] F6 Same system for all emitters (24 coloured slots: lamps, signals by phase colour, shop signs / lit windows, AI headlights, cop strobes, player brake glow); quality tiers cap the count. Lit-window noise fixed.
- [ ] F4 Cop headlights as real light cones, roadblocks, helicopter, difficulty levels, scoring; AI traffic that reacts to sirens.

## G. Online (parked, design only - NOT started)
Goal: when online, other human players are the police; the AI cops are only fillers when there are too few humans.
- Roles: one or more ROBBERS (current player behaviour) and any number of COPS. Same world seed + same OSM data on every client.
- The cop AI is already isolated behind `Police` (state, `colliders()`, `status`): a human cop replaces one `Cop` entry, so detection is
  evaluated server-side from the robber's `Stealth {visRadius, noiseRadius}` against each human cop's position, heading and line of sight.
- Authority: small authoritative server (WebSocket) owning role, busted/escaped, time of day and weather; clients send input + pose at 20 Hz,
  render others with interpolation; physics stays client-side with server sanity checks.
- Needed first: a lobby/role screen, pose sync (position, yaw, speed, lights, horn, siren), shared clock, bust/escape rules on the server, voice or quick-chat.
- Not now: leave `Police` as the single place to extend.

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
