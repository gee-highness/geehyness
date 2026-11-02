# SHESHA master plan: GTA3-style optimised, recognisable Eswatini, 60 fps on a Redmi Note 13 Pro

Supersedes nothing: `FIDELITY_PLAN.md` (what to model), `REALISM_IDEAS.md` (levers), `PLAN.md` (old roadmap). This file is the **ordering + budgets + gates**.

## 0. Honest framing
- Target device: Redmi Note 13 Pro (Snapdragon 7s Gen 2, Adreno 710, 8 GB, 1080x2400 @120 Hz, runs the game in Android WebView/Chrome, WebGL2). A mid-range GPU with a **fill-rate and thermal** ceiling, not a geometry ceiling.
- Every number I have so far comes from headless software GL (1-5 fps). **They say nothing about real fps.** Phase 0 exists to fix that; nothing in Phases 2+ is "done" until it is measured on the phone.
- 60 fps is achievable only by doing what GTA3 did: *a small, hard budget per frame, streamed content, baked lighting, cheap far-LOD, and fog to hide it.* Not by tuning the current "generate everything at runtime" design.

## 1. Frame budget (the contract)
Frame = 16.6 ms (cap at 60 even on the 120 Hz panel, for even pacing and heat).
| Resource | Budget (Low/Auto default) | Today (Manzini CBD, measured on CPU renderer) |
|---|---|---|
| Triangles submitted | <= 150k | ~310-640k |
| Draw calls | <= 90 | ~175-340 |
| Internal resolution | ~0.7x of 1080x2400 landscape (about 1000x460) with FXAA-less clean edges; dynamic 0.55-0.85 | pixel-ratio cap, MSAA on |
| Texture memory | <= 96 MB resident, all compressed (KTX2/Basis) | 59 x 1k JPG decoded RGBA, ~250 MB+ |
| JS main-thread work/frame | <= 6 ms (physics 1, AI 1, streaming 1.5, render submit 2.5) | sync 6-15 ms spikes |
| Allocations in frame loop | 0 (no `new Vector3`, arrays, closures) | unknown, GC pauses likely |
| Shadow map | none on Low; 1 x 1024 only on High | 1024-2048 sun map |
| Dynamic lights | 0 (night uses emissive + baked glow) | lamp rig + beam |
| Peak RAM (JS+GPU) | < 1.2 GB (WebView gets killed past ~1.5 GB) | ~700 MB heap seen |

## 2. Phase 0 - measure on the real phone (1 day, blocks everything)
1. Add `?bench` mode + in-game overlay (key F already): ms CPU/GPU split (`EXT_disjoint_timer_query_webgl2`), tris, calls, textures, geometries, heap, GC count (via `performance.measureUserAgentSpecificMemory` where available), long-frame log.
2. Scripted **autopilot lap** (fixed route through Manzini CBD -> MR3 -> Matsapha -> Ezulwini -> Mbabane, day + rain + night) that writes a JSON report: p50/p95/p99 frame time, per-section tris/calls, thermal drift over 10 min.
3. User steps (I will write them into README): `chrome://inspect` USB debugging on the Redmi, run the lap, send the JSON. Also run the same on the Chrome browser (PWA) vs the Capacitor WebView: pick the faster shell.
4. Gate: we know the real p95 and whether the bottleneck is **fill-rate (resolution), vertex/triangle, draw-call/CPU, or GC**. The rest of this plan is re-weighted by that answer.

## 3. GTA3-style performance architecture (the core work)
GTA3 on PS2/Android ran by: sector streaming, per-sector pre-baked data, 2-3 LOD levels per model, vertex-colour baked lighting, blob shadows, short draw distance hidden by fog, hard caps on cars/peds, no runtime generation. We copy each.

### 3.1 Bake everything at build time (biggest win, removes runtime generation spikes)
- Today: `city-builder` etc. generate geometry on the phone while driving (the 6-15 ms sync spikes, GC garbage, 66-120k buildings processed).
- New: `scripts/bake_chunks.mjs` (Node, reuses the same builder code) writes **one binary file per 128 m chunk per LOD** (`chunks/L0_x_z.bin`, `L1`, `L2`): interleaved quantised vertex data (int16 position, snorm8 normal, uint8 colour), uint16 indices, pre-merged **per material**, with draco/meshopt compression (meshopt decoder is tiny and fast in WebView).
- Runtime streaming = fetch + `new BufferGeometry` from typed arrays on a **Web Worker** (transfer ArrayBuffers; zero main-thread parse). Main thread only uploads (budget 1 chunk/frame).
- Includes baked: ambient occlusion in vertex colour (darker at wall bases/under eaves), windows as baked tiny geometry-free colour bands or a single atlas UV (no per-pixel shader), roof colours, shop signs as atlas quads.
- Also bake: collision grids (spatial hash as typed arrays), road-graph, `groundHeightAt` lookup (grid texture), so the physics step is table lookups.

### 3.2 LOD and culling
- **L0** (0-120 m): full detail (props, awnings, signs). **L1** (120-350 m): merged shells, flat roofs/hips only, no props, no windows geometry. **L2** (350-900 m): per-chunk silhouettes: extruded footprints merged into one mesh/chunk, vertex-coloured, <= 600 tris. Beyond: terrain + a baked skyline ring (hills: Sibebe, Mdzimba) + fog.
- Chunk-level frustum + distance culling already exists; add **occlusion by "is the chunk behind a hill"** using a coarse horizon table baked per chunk, and drop L0 for chunks whose centre is below the camera horizon line.
- Fog (exp2) tuned so L2->nothing transition is invisible; this is exactly how GTA3 hid pop-in. Draw distance default 350 m on Low, 600 m High.
- Hierarchical instancing: trees (billboards beyond 60 m, 2 LOD meshes before), poles, lamps, bins, cones, parked cars (box LOD beyond 40 m) via `InstancedMesh` with **one draw call per type per chunk group**.

### 3.3 Draw-call and state reduction
- Material count target **<= 6 for the whole static world** (terrain, road, building-vertex-colour, glass/emissive, foliage, props atlas). Roads+markings baked into one texture atlas / vertex paint; no per-shape materials.
- Sort: opaque front-to-back, transparent last; no `alphaTest` where a mesh can be cut instead; no per-object `onBeforeCompile` variants (each is a separate shader program = hitching). Reduce shader variants to <= 8, **precompile on a loading screen** (`renderer.compile` + warm every program).
- Replace the window-mask fragment shader and procedural noise with baked vertex colour + one small tiling detail texture. Fragment cost, not triangles, is what an Adreno 710 will choke on at 1080p.

### 3.4 Fill-rate (the likely real bottleneck)
- Render scale starts 0.7; dynamic resolution controller (target 15 ms GPU) steps 0.55 <-> 0.9 with hysteresis; **UI drawn at native res on top** so HUD stays crisp.
- No MSAA; no post-processing chain; no real-time reflections (wet roads = a darker colour + a baked specular streak shader term, not SSR); sky is a gradient/low-res cubemap.
- Overdraw: kill double-sided on solids, depth pre-pass **not** used (tile GPU), draw sky last at far plane (already), terrain skirt under roads removed.

### 3.5 Lighting and shadows (GTA3 used none dynamic)
- Sun: baked directional shading in vertex colour per time-of-day set (3 keyframes: day/dusk/night, blended in the vertex shader with one uniform).
- **Blob shadows** under cars/peds/trees (one instanced decal quad each) instead of a shadow map on Low/Auto. Shadow map only on High and only for the player car + near buildings.
- Night: emissive window/lamp quads (additive, instanced) - no point lights. Headlight cone = a single projected additive quad/mesh.

### 3.6 CPU, GC and memory
- Frame loop audit: no allocations (reuse scratch vectors, preallocate arrays, typed arrays for AI/peds/traffic state: struct-of-arrays).
- Physics: fixed 60 Hz, vehicle raycast with **cached ground height from the baked grid**; collision broadphase = spatial hash; sleep far dynamic bodies.
- AI traffic/peds: hard caps by tier (Low: 14 cars, 10 peds; High 28/24), simulated within 250 m only, **only rendered within 120 m** (silhouette beyond), pool and recycle; lane following by graph index not by raycast.
- Memory: compressed textures (KTX2/UASTC->ETC2/ASTC; toolchain: `basisu`/`toktx` in CI, not the sandbox), `geometry.dispose()` on chunk unload with a **pool** of buffers to avoid GC churn, JS heap < 150 MB live.
- Audio: 8-voice cap; engine = looped samples + pitch, not oscillator graphs per car.

### 3.7 Thermals and pacing
- Cap 60 fps explicitly (`rAF` skip on 120 Hz); governor also watches frame-time drift over minutes and trims render scale 5% when p95 creeps (thermal throttling is real on this SoC).
- "Battery saver" tier: 30 fps lock + 0.55 scale.

## 4. Fix what we can SEE (from your reference photos)
Ordered by how visible it is in play.
| # | Observed in photos | Fix |
|---|---|---|
| 1 | **Fuel stations**: Engen (blue canopy fascia, tall blue pylon with red oval logo, LED prices), Total (red thin-edge canopy, brown/grey columns, red column pylon), Galp (orange/white, Nissan tower beside), Puma (GREEN pylon with red service panels), Mitra (blue/grey, teal logo) | Done v1 in `city-builder.ts` `FUEL_BRANDS`. TODO: Galp canopy size/placement vs kiosk overlap, forecourt concrete slab, LED price numbers as emissive texture, Nissan tower landmark, per-site `landmarks.json` |
| 2 | **Manzini interchange** (curved concrete overpass over a roundabout, grouped round/oval piers with arch-like bents, panelled retaining walls on the approach ramp, slotted parapet with posts, lattice pylon behind, graffiti on abutment) | v1 parapet slots + panel tint + 4 grouped piers in `bridge-builder.ts` (built, not yet seen). TODO: verify visually; curved deck follows polyline (check kinks), abutment wall with painted mural texture variants, tall curved-arm street lamps along the deck |
| 3 | **Roundabout under the deck**: grass island with kerb, direction signs on posts, yellow edge lines, worn tar | Roundabout islands exist; add yellow edge-line pass, patchy tar colour noise (vertex), green direction signs |
| 4 | **Pavements**: reddish brick/paver pattern with white kerb edge; wet-slab pavements in Manzini CBD | Pavers exist; match colour (maroon-brown), add white painted kerb band |
| 5 | **Manzini CBD frontage**: stepped/parapet flat-roof shops, verandah roof over pavement with posts, big painted fascia boards (e.g. "...TRADERS"), corrugated-iron shed shops, palm trees, curved single-arm street lamps | Add `verandah` archetype (posts to kerb, mono-pitch iron roof) for CBD shopfront rows; step-parapet gable on facades; fascia board atlas with painted-text variants; palm trees in CBD planting list; lamp model with curved arm |
| 6 | **Traffic**: Honda Fit/Jazz, Toyota Corolla/Camry, Ford Figo, white Toyota Quantum minibuses, hatchbacks, SA-style green-yellow Eswatini plates, left-hand traffic | Confirm left-side driving everywhere (lanes, spawn, AI, junction priority). Quantum taxi as the dominant AI vehicle in towns, stopping at ranks; plate texture "CSD 123 AB"-style on cars |
| 7 | **Matsapha Lifestyle Centre / modern retail**: two-storey glazed block, dark steel pergola frame, black cladding tower, large parking with painted bays, shopping-trolley bays | `retail-modern` archetype: glass band + steel grid pergola (instanced bars), dark tower element; parking bays already exist |
| 8 | **Mbabane aerial**: dense CBD terraced onto a hillside, Sibebe-like granite dome behind, green roofs, mixed 3-8 storey blocks | Mountain ring skyline mesh (baked heightfield beyond play area), roof colour palette by zone (green/blue/red corrugated + grey flat), height from OSM `building:levels` else zone default |
| 9 | **Weather look**: overcast grey sky, wet reflective slabs | Already weather presets; add tuned overcast sky colour and wet-slab sheen via vertex term |

## 5. Infer what we CANNOT see (rules derived from what the photos + OSM show)
For anything unmapped or unphotographed, generate from **zone rules**, deterministic per building id, so the world looks coherent:
- **Zones** (from OSM landuse + distance to CBD + road class): CBD, light industrial (Matsapha: ribbed sheds, container yards), formal residential (plots, walls, red/green tile or iron roofs, gate + hedge), peri-urban/homestead (rondavel + rectangular house clusters, small plots, no walls), rural (sparse, cattle/goat props, maize/sugar-cane fields around Malkerns/Simunye belt), plantation (pine/eucalyptus blocks on hills).
- **Vegetation by altitude** (DEM): Highveld/Middleveld (Mbabane ~1100 m: eucalyptus, pine, grassland, jacaranda, aloes), Middleveld valley Manzini (~650 m: acacia, palms, banana, fig), colour tint by season.
- **Roads**: surface from OSM (`paved/unpaved`): unpaved = dirt colour + rough physics (exists); MR3 = 2 lanes + yellow edge + dashed centre; minor = worn markings; kerbs only in towns; roadside gravel verge outside towns. Default speed limits: town 60, rural 80, MR3 expressway 100/120 (verify from signs; use OSM `maxspeed` first).
- **Street furniture inferred from road class**: lamp spacing 35-40 m on MR3 stretches, none on rural; bus stop shelters at bus-stop nodes; speed humps near schools; "Slow Down" sign stock (a theme of the game); minibus-taxi stops and ranks in towns.
- **Utilities**: lattice pylons from OSM `power=tower` (seen in photos), wooden/concrete poles along residential roads with drooping wires (already), transformer pole every ~8th pole.
- **Buildings without data**: height = levels*3 + roof; wall colour palette weighted to the satellite-derived roof palette; windows count from footprint length; shopfronts get roller-shutters in CBD.
- **People/animals**: school uniforms by zone/time, market traders at `stalls`, goats/cattle near rural roads (cheap instanced animals with simple wander), dogs optional.
- **Sky/terrain**: baked far-hill ring so the horizon is not empty; fog colour matched to the sky at each time-of-day.
Rule of thumb: **if a feature is visible in 2+ of your photos it gets a template; if only in OSM it gets a rule; if in neither it gets nothing** (empty is cheaper than wrong).

## 6. Phases (order matters; each ends in a measured gate)
| Phase | Work | Gate (must pass to continue) |
|---|---|---|
| P0 | Bench mode + autopilot lap + remote-debug instructions; get real numbers | Report from the Redmi: p95 ms, bottleneck class |
| P1 | Quick wins: resolution scale/dyn-res, kill MSAA, kill shadow map on Low, blob shadows, 60 fps cap, shader precompile, frame-loop alloc audit | Re-run lap: p95 <= 20 ms on Low in CBD |
| P2 | Baked chunk pipeline + worker streaming + meshopt + material merge (<= 6) + instancing | No main-thread chunk-gen spikes > 3 ms; calls <= 90; tris <= 150k in CBD |
| P3 | LOD L1/L2 + fog tuning + far-hill ring + horizon culling | Draw distance 350 m with no visible pop at speed 120 km/h |
| P4 | Texture compression (KTX2) + memory pass | GPU+JS < 1.2 GB after 10 min drive |
| P5 | Visual fixes from section 4 (stations v2, interchange, CBD verandahs, retail-modern, taxi Quantum, plates, sidewalk colours) | Side-by-side screenshot vs each reference photo |
| P6 | Zone rules + vegetation/animals/people (section 5) within the budgets | Tris/calls still within budget on every lap section |
| P7 | Soak: 15-min thermal run, day/night/rain, controller + touch, low-battery tier | p99 <= 22 ms, no thermal collapse, no crash/OOM |
Build for any phase is verified headless for correctness and **only counted as done when the phone numbers say so**.

## 7. Process rules
- Every visual change: same-view screenshot next to the reference photo (references stay out of the repo).
- Every perf change: before/after on the lap JSON, committed under `docs/perf/`.
- Budgets are enforced in code: debug overlay turns red when tris/calls/ms exceed the contract.
- Anything that cannot meet its budget gets cut, not shipped (GTA3 rule).

## 8. What I need from you
1. Redmi Note 13 Pro: Android version, which shell you will use (APK vs Chrome PWA), and the P0 lap JSON when I have the bench build ready (instructions in README).
2. Which landmarks matter most (top 10) so P5 spends effort where you drive most.
3. Confirm driving side + default speed limits you want enforced (Eswatini drives on the left).
