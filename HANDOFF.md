# SHESHA — session handoff

Open-world racing game on the real **Manzini → Matsapha → Lobamba → Ezulwini → Mbabane** MR3 corridor (Eswatini).
Angular 21 + three.js, wrapped for Android with Capacitor. Branch: `ccr-cac88f1d-gkebu8`.

## State at handoff
Everything below is committed and pushed. Last commit: *"Ground everything … typed-array geometry buffers"*.

**Built and visually checked (headless Chromium screenshots):** real OSM world, 66k buildings with inferred uses, signs,
pavements/kerbs, parking lanes + bays, street trees, utility poles + wires, parked cars (streamed, box LOD), 29 drivable cars + garage,
AI traffic on real roads, overpasses (layer-solved elevation, ramps, decks, parapets, piers), railway + level crossings, bus shelters,
speed-limit signs + HUD limit, roundabout islands, rough roads, viewpoints, barriers, real trees, pylons + wires, solar, pitches, pools,
parking lots, tanks/silos, speed humps, HUD/intro/car-select UI, haptics fixes, collisions, physics.

**NOT yet verified (do these first):**
1. Slope-grounding fix (walls/fences/hedges, pylon legs, tank rims, props on true surface, AI cars) — code is in, render check not seen.
2. Performance numbers after the last two optimisation commits (**measured at the end of the session**: world-sync 15.4 → 6.1 ms/frame after typed-array buffers; physics ~1.0–1.4 ms; JS heap ~700 MB (still high — find the remaining big allocators); 177 draw calls; but **~644k triangles in the Manzini test view — run `__shesha.breakdown()` there to find what is still heavy, likely trees/parking-lot cars/props**; all measured on a slow headless CPU, so real phones are unknown).
   Original note: Previous measure (headless, slow CPU): heap 624 MB (was 1.28 GB),
   physics 1.0 ms, but "sync" 15 ms from building-generation spikes. Fix applied (typed-array `GeoBuf`, skip <14 m² buildings, 1.6 ms stream budget) — re-measure.
3. APK has not been rebuilt since the *second OSM batch* + optimisation + grounding work. Rebuild and send.
4. The "under the deck" bug fix (car snapping onto a bridge from below) was made but not re-rendered.
5. Real-device behaviour (60 fps, rumble, controller feel) has never been tested — only headless software-GL.

## Where things are
| What | Where |
|---|---|
| World data (generated) | `public/assets/world/` (`roads.json`, `buildings.json`, `features.json`, `meta.json`, `height.bin`, `groundcolor.png`, `groundclass.png`, `trees.bin`) |
| Converter (OSM → game data) | `scripts/build_world.py` (args: `<osm_dir> <dem.json> <out_dir> [osm2_dir]`) |
| Elevation fetch | `scripts/fetch_dem.py` → `/tmp/dem.json` (AWS terrain tiles, 250 m grid) |
| Texture shrink | `scripts/optimize_textures.py` |
| Ferrari decimation | `scripts/decimate_ferrari.py` (needs `pip install --target /tmp/pylib DracoPy trimesh fast-simplification pygltflib`) |
| Physics benchmark | `scripts/physics_test.mjs` (build cmd in its header) |
| World builder / terrain / roads / physics queries | `src/app/game/graphics/world-builder.ts` |
| Buildings (uses → walls/roofs/windows/signs, lazy chunk streaming) | `city-builder.ts` |
| Pavements, bays, poles, signals, parked cars, clouds | `street-builder.ts` |
| Overpass structures | `bridge-builder.ts` |
| Rail, shelters, speed signs, roundabouts, viewpoints | `extras-builder.ts` |
| Barriers, trees, power, pitches, pools, parking, tanks, humps | `features-builder.ts` |
| Shared geometry buffer + `slab()` terrain-following walls | `geo-buf.ts` |
| Vehicle physics / collisions | `src/app/game/physics/raycast-vehicle.ts`, `collision.ts` |
| Car catalogue / AI traffic | `src/app/game/cars.ts`, `road-traffic.ts` |
| UI | `components/hud`, `intro`, `car-select`, `map-modal`, … |
| Credits | `public/assets/CREDITS.txt` |

World coordinates: metres, **x east, z south**, origin Manzini (−26.4966, 31.3826). Heights in decimetres in the JSON.

## Raw data the converter needs — now in the repo under `data/` (see `data/README.md` for the exact unzip + rebuild commands)
- `eswatini-osm.zip` → `roads.json, bld_manzini.json, bld_ezulwini.json, points.json` (Overpass, from Termux).
- `eswatini-osm2.zip` → `barriers, trees, power, leisure, misc, bld_lobamba, bld_malkerns, bld_matsapha1/2, bld_mbabane1/2`.
- Rebuild: `fetch_dem.py` then `python3 -I scripts/build_world.py <osm> /tmp/dem.json public/assets/world <osm2>` (takes ~3–5 min; run in background).
The generated files in `public/assets/world/` are also committed, so the game runs without rebuilding.

## Run / test / build
```
npm install --legacy-peer-deps
npx ng build                         # → dist/app/browser
python3 -m http.server 4300 --directory dist/app/browser &
```
Headless checks use Playwright (preinstalled): launch with `--use-gl=swiftshader --enable-unsafe-swiftshader`, wait for `button.go:not([disabled])`,
press Enter. Debug hooks on `window.__shesha`: `info()`, `breakdown()`, `perf()`, `tp(x,z,yaw)`, `tpRoad(x,z)`, `tpBay(x,z)`, `tpOver(x,z,under)`.
In-game: **F** = FPS/resolution readout, **V** = car select, **H** = vibration, **M** map, **C** camera, **P** photo.

**APK**: needs Java 21 + Android SDK (not preinstalled):
```
mkdir -p /opt/android-sdk/cmdline-tools && curl -O https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip   # unzip → /opt/android-sdk/cmdline-tools/latest
yes | sdkmanager --licenses; sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"
echo "sdk.dir=/opt/android-sdk" > android/local.properties
```
Maven Central rate-limits (HTTP 429) through the proxy — add `~/.gradle/init.d/mirror.gradle` rewriting `repo.maven.apache.org`
to `https://maven-central.storage-download.googleapis.com/maven2/`. Then `npx ng build && npx cap sync android && cd android && ./gradlew assembleDebug --no-daemon`.
APK → `android/app/build/outputs/apk/debug/app-debug.apk` (~93 MB). Send with the file tool.

## Gotchas learned
- **Never `pkill/pgrep -f` a pattern that also appears in your own command line** — it kills the shell. Use `[x]pattern` tricks or PIDs.
- The user interrupts long foreground commands: run anything >2 min with `nohup … &` and a Monitor.
- `urllib` default User-Agent is blocked by some hosts; use curl with a UA.
- Draco: the original `ferrari.glb` is Draco-compressed (decoder in `public/assets/draco/`); the game uses `ferrari-lod.glb` (decimated, no Draco).
- Terrain height used by *everything* is `calculateRawTerrainHeight` (piecewise-linear on the 80 m mesh) — never use another height function or things float/sink.
- Anything placed on a road/pavement should use `groundHeightAt(x,z[,y])`, not terrain height.
- `GeoBuf.pos.length / 3` is the "next vertex index" idiom (compat getter).

## Added in the follow-up session
- Android package id is now `sz.shesha.racing` (java sources moved; rebuild APK).
- Quality tiers Auto/High/Med/Low (`Q`, HUD rail): pixel-ratio cap, shadows, shadow-map size, chunk draw distance, rain + pedestrian density. `SettingsService`, `SceneManager.setQuality`.
- Weather (`G`, HUD rail): Sunny/Overcast/Mist/Tropical rain; GPU-animated rain streaks + lightning (`weather.ts`), gloom on sun/sky, wet roads.
- Window shader baked into a shared mask atlas (`windowAtlas()` in `city-builder.ts`).
- 3D building collisions: footprints carry a vertical extent; flat roofs are landable (`CollisionWorld.roofAt`, used by `groundHeightAt`/`queryGround`).
- Pedestrians on pavements (`pedestrians.ts`), they step clear of fast cars. `__shesha.peds()` debug hook.
- Parked-car detail radius cut 230 -> 100 m (was ~469k of ~1M triangles). `__shesha.wb` exposes the WorldBuilder.
- Third OSM fetch pipeline written (`scripts/fetch_osm3.py`, `build_world.py` 5th arg, game consumers) but **data not fetched** (Overpass blocked in the sandbox) - see `data/README.md`.

## Added in the third session
- GTA-Atlas-style full-screen GPS map (`map-modal`): land-use tint from the ground raster, yellow/white roads, blue place names, POI blips, speed traps, click/A waypoint + GPS line + world beacon, fast-travel list. Radar restyled to match (blips, waypoint on the rim, north marker).
- Full controller layer (`gamepad.service.ts` header documents the map): right-stick look (`CameraRig.look`), R3 recentre, L3 horn, D-pad indicators/headlights/hazards, Share modifier layer, Home = photo. Edges are now polled once per frame in `App.handlePad` (they were being swallowed before). Help screen on I / F1 / Share+Options.
- `DriveStateService` (indicators auto-cancel, hazards, headlights auto at night/rain), `SceneManager.setLights` lamp rig + beam, horn + relay tick audio.
- Termux: `scripts/termux_osm.sh` -> `scripts/fetch_osm_all.py` (all categories, resumable). Run it, then rebuild the world per `data/README.md`.
- *.apk is git-ignored (an APK was accidentally committed in 6a49cb5 and removed in the next commit; it still sits in history).

## Fourth session (enhancement plan, slice 1)
- Measured: after GC the live JS heap is <100 MB (the ~600 MB `usedJSHeapSize` was uncollected garbage). Real mobile risks are GPU/texture memory (59 x 1k JPG textures), draw calls (150-340) and triangles (260-690k). Parked-car detail radius now 60 m; static geometry drops its CPU copy after upload (`GeoBuf.toGeometry`).
- Terrain: 40 m grid sampled (bicubic) from Copernicus GLO-30 native 30 m posts via `scripts/fetch_dem_glo30.py` (replaces AWS terrarium z13, which was resampled + offset ~1 px); `data/dem.json` and `public/assets/world` regenerated.
- Road graph + GPS (`game/road-graph.ts`, `NavigationService`): A* over OSM ways, turn-by-turn guidance on the HUD, route drawn on map + radar, auto re-route. Debug: `__shesha.nav`.
- Neo-Eswatini (futuristic procedural theme) is designed but NOT started; traffic lights/lane AI not started; textures not compressed (no KTX2 tool in sandbox).

## Fifth session
- Full roadmap and status: `docs/PLAN.md`. Stylized world-space procedural materials (`stylized.ts`, no image textures), satellite-derived roof palette, procedural infill houses (`CityBuilder.infill`), overhead debug camera `__shesha.top(x,z,h)`.

## Ideas not done yet
- Draw house numbers from `meta.addr`; pedestrian crossings use; building collision with real roof ramps.
- Real-device profiling (60 fps, rumble, controller feel) - never done.

## Sixth session (latest) - read this first
**Branch** `ccr-cac88f1d-gkebu8`, everything committed and pushed. Latest APK was built from the last world commit (then only docs/scripts changed).
Plans: `docs/FIDELITY_PLAN.md` (brand-faithful stations/chains/landmarks, tiers + phases), `docs/REALISM_IDEAS.md` (every realism lever, impact/effort, recommended order), `docs/PLAN.md` (older roadmap).

### Done this session
- Data: merged the full OSM extract (`scripts/merge_osm_full.py`: 120k buildings, extra roads/POIs, landuse zoning, furniture) -> `build_world.py` (new args: osm dir = merged dir `/tmp/osmm`, dir2 = `/tmp/osmm/osm2`, dir3 = `/tmp/osm3`; raw zips in `data/`). Buildings overlapping roads are nudged clear, or shrunk to a 7x5 m kiosk (never dropped).
- Materials: brick bond, basket-weave pavers, weathered render/slabs, window frames/trims/sills, glass reflections; noise is a texture lookup (`noiseTex()`), sky drawn last (depth-tested at far plane), close-up detail only within ~25 m.
- Collisions: walls/fences/cliffs tested per 3 m piece (side-street mouths stay open), oversized "tank" colliders removed, rural-only guardrails with collision, `CollisionWorld.probe()` debug sweep.
- Driving: reverse (hold brake at standstill, gear shows R), speed-sensitive steering lock, input ramping for keys/touch, tyre relaxation + load sensitivity, stability assist (lighter on RWD), shift delay/rev limiter/engine braking, stronger brakes. Physics benchmark: `scripts/physics_test.mjs` (esbuild command in its header).
- UI: HUD rail no longer overlapped by the clock bar on phones (taps work), spinning-tyre logo (launcher/splash/favicon via `scripts/make_logo.py`; animated SVG on intro + HUD badge).
- Perf: governor draws less distance first then lowers resolution (floor 100% on phones, MSAA on), traffic distance LOD (silhouette beyond 75 m), 300 m tree cells, 64 m parked-car blocks. Manzini CBD ~310k tris, ~175 calls (software renderer; no real-device numbers yet).

### Mapillary (in progress)
- User supplied a Mapillary **access token**. It is NOT in the repo. In the old container it lives in `/tmp/.mly` (mode 600); if the container is gone, ask the user for it again and pass it as `MAPILLARY_TOKEN=...` (env only, never write it to a file in the repo).
- `scripts/fetch_mapillary.py` fetches street lights / poles / signs / traffic lights for the playable rectangle -> `data/mapillary_features.json` (tiles of 0.015 deg, resumable by rerunning). Credit line already added to `public/assets/CREDITS.txt` (CC BY-SA 4.0).
- Test box over Manzini CBD gave 283 features (127 supports, 91 signs, 34 street lights, 18 traffic lights). Photos via `graph.mapillary.com/images?bbox=...` + `thumb_1024_url` work (reference only, never ship images).
- NEXT: when the file exists, feed it to `build_world.py` (real lamps/poles/signs/signals replace the procedural ones), rebuild, check visually.

### Immediate next steps
1. Finish Mapillary integration (above).
2. Phase 1 of `docs/FIDELITY_PLAN.md`: brand fuel stations (Galp orange fascia + diamond-logo pylon, Shell, Engen, Total, Puma, Sasol): add brands to `FUELS`/`KNOWN` in `build_world.py` (Galp is missing), brand-aware `petrolCanopy()` in `city-builder.ts`, `data/landmarks.json` spec, same-view photo-vs-game comparison. User's Galp reference photos: MR3 Manzini, orange/white canopy, tall white pylon with orange G diamond, Nissan red/white tower beside it.
3. Real-device numbers from the user (phone model + FPS from key **F**) before more perf work; remaining perf ideas: worker-thread chunk generation, draw-call merging, LOD for distant buildings.
4. The autopilot tour (`/tmp` scripts, not in repo) found no stuck spots; a full road-blocker rescan on the latest build has not been re-run.

### Run/test notes learned
- Start the test server with `(setsid nohup python3 -m http.server 4300 --directory dist/app/browser >/dev/null 2>&1 &)`; `pgrep -f "http.server 4300"` matches your own command line, so do not use it as an "is it running" check.
- Headless software GL runs ~1-5 fps, so wall-clock driving tests are slow-motion; use `scripts/physics_test.mjs` for real simulated-time numbers.
- New debug hooks on `window.__shesha`: `veh` (vehicle), `wb` (WorldBuilder incl. `collision.probe(x,z,rad,y)`), `top(x,z,h)` overhead camera, `tpRoad(x,z)`, `perf()`, `info()`, `breakdown()`.
- Long foreground commands get interrupted by the user: run builds/tests with `setsid nohup ... &` and a Monitor.

## Seventh session
- Offline PWA (`scripts/gen-sw.mjs` -> `sw.js`), Electron Linux build (`electron/`, `npm run dist:linux`), `vercel.json`, release workflow (`.github/workflows/release.yml`, tag `v*` -> AppImage/pacman/tar.gz on the Releases page). SSR removed (static build). Release workflow NOT yet run.
- Fidelity Phase 1 started: brand fuel stations (`FUEL_BRANDS` in `city-builder.ts`: Galp, Engen, Total, Shell, Puma(green), Mitra). Brand canopy fascia, columns, pump islands, price pylons, Galp flagpoles; forecourt spot is road-aware (tries outward/inward/slid positions, else bare kiosk). Sign-plate colours forced to true brand colours. `build_world.py` FUELS/KNOWN now include Galp/Puma/Mitra (needs a world rebuild to bake in).
- Reference photos (Engen Fairview, Total Manzini + Riverstone, Puma Mbabane pylon, Mitra Manzini, Mbabane aerial) were supplied by the user; NOT committed (Google imagery - reference only).
- Visual check was overhead only: canopy rectangle on the Galp at (105,-258) looks mis-sized/overlaps the kiosk - verify with a ground-level view and tune `W/D`, then compare against photos. Nissan tower beside the MR3 Galp not built.
- Mapillary fetch finished in an earlier container (2960 features) but `data/mapillary_features.json` is not in this checkout - confirm, then feed to `build_world.py`.

### Seventh session, later additions
- `docs/MASTER_PLAN.md` (perf budgets + GTA3-style plan), `docs/MAPILLARY_FINDINGS.md` (what the street photos show).
- Distance: L0 buildings 400 m, props 190 m, flat far "cards" 380-820 m, fog floor 0.0014, stream radius 900 m, 400 m mesh cells.
- Mapillary merged into `meta.json` by `scripts/apply_mapillary.py` (re-runnable; reads `data/mapillary_features.json`): real utility poles + wires, steel poles, lamps, signals, signs, billboards (`meta.upoles`, `meta.bills`). Image index `data/mapillary_images.json` (13k, no pixels). Token is NOT in the repo (was `/tmp/.mly`).
- Road tar recoloured warm grey, verge/gravel red-brown, yellow edge lines.
- Release workflow (`release.yml`) builds Linux packages + APK on tag/dispatch; needs the workflow file on the default branch (merge the branch), tag pushes are blocked from the cloud session.
- Still TODO: verify poles/billboards/colours visually, Galp canopy sizing, CBD verandahs, retail-modern, taxi/coach models, far-hill ring, vegetation zones, real-device perf (Phase 0 bench).

## Eighth session - Manzini-only, higher fidelity (read this first)
- **World reduced** to Manzini + Matsapha + outskirts (17 x 12 km, bounds in `build_world.py`); OSM inputs are clipped by `clip()`. Districts are now MANZINI, MATSAPHA, FAIRVIEW, NGWANE_PARK, KWALUSENI, AIRPORT, MONENI (`world-pipeline.service.ts`, snaps in `build_world.py`).
- **Terrain**: 20 m grid from Copernicus GLO-30 (`fetch_dem_glo30.py`), refined by `refine_dem.py` (roof/canopy bias removed where OSM confirms it, roads flattened across their width with graded profiles). Mesh spacing follows `meta.dem.step`.
- **Ground**: 10 m colour/class raster; dense building areas become packed earth / paving instead of lawn; ~90k trees by ground class.
- **Look**: the clean full-resolution render is the default (retro pixel look is opt-in with Y). Neutral tone mapping + filmic grade, lighter fog, 2k/4k sun shadows over a 220 m box, roads receive shadows, buildings to 520 m, far cards to 1250 m.
- **Car**: desktop loads the full `ferrari.glb` with clear-coat paint; phones keep `ferrari-lod.glb`.
- `?hq` forces full quality on a software renderer (headless screenshots). Rebuild commands: bottom of `data/README.md`.
- Not verified on a real GPU or phone: frame rate with the longer draw distances and bigger shadow map.
- **Real imagery**: `fetch_ortho.py` (17 cm NDMA aerial survey of Manzini via OpenAerialMap, CC-BY 4.0) gives the 2 m ground layer (`ortho.jpg`, desktop only) and true roof colours; `fetch_s2.py` (Sentinel-2) colours the rest of the map. Building tuple has a 6th value: packed roof sRGB (+ bit 24 = from the aerial photo).
- **Missing buildings**: `merge_ms_buildings.py` adds Microsoft ML footprints not in OSM (`data/bld_ms.json.gz`, +14.5k -> 61k buildings).
- **Road clearance volume** (`WorldBuilder.inRoadVolume`): every carriageway extruded 5 m up. `CollisionWorld.clear` refuses any collider inside it (`keep` flag for building shells, parked cars, animals); the prop `box()` helpers skip visuals inside it; guardrails and bridge parapets leave gaps at junction mouths. `relocateProps()` moves mapped poles/lamps/signs/billboards/trees/masts/tanks to the nearest verge (`vergeSpot`) instead of deleting them. Debug: `__shesha.roadCut()`, `__shesha.roadFix()`. Sweep test: `node scripts/roadscan.cjs` (server on :4300) must report `blocked: 0`.

### Eighth session - state at hand-over (CONTINUE FROM HERE)
Done and pushed on `ccr-cac88f1d-gkebu8` (see bullets above plus):
- **Vehicles**: `car-gen.ts` generates sedan / hatch / bakkie / SUV / Quantum minibus / coach bodies (~1.5k tris, vertex colours, real paint mix). Used by traffic (`road-traffic.ts`), parked cars (`street-builder.placeParked`) and `vehicles-sa.ts`. Kenney GLBs remain only in the player car catalogue. Close-up visual check of each body kind is still owed.
- **Buildings**: roof form from the aerial photo (`build_world.roof_shape`, 7th tuple value: 2 pitched / 1 flat), realistic wall palette in `city-builder.ts`, plain painted render in `stylized.ts` (SK 1), near-white sky light so walls are not blue.
- **Traffic AI**: agents drive whole A* trips through junctions (`routeSpawn`), follow the car ahead with a ~2 s gap, slow for bends/turns, obey signals; volume follows the clock (`setHour`: peaks ~07:25 and ~17:10, near-empty at night). NOT yet watched in motion - verify no cars float/sink on overpasses and that junction turns look right.
- **DONE (ninth session) - races, see below.** Original plan: (user asked: "add races, AI smart and realistic"): plan = `game/race.ts` RaceManager: events between district snaps (Manzini->Moneni, Manzini->Matsapha, Fairview climb, Airport run, Ngwane Park descent, grand tour loop), race line from `RoadGraph.route`, checkpoints every ~250 m, 4 AI racers (`makeCar`) with curvature-based speed, skill spread and mild rubber-banding, countdown, position/timer HUD component, finish banner. Free keys: N, O, U, Z, digits. `festival.service.ts` already has `activeRace`/`raceLap` signals; per-frame hook goes next to `wb.collision.resolve` in `app.ts`.
- Other open asks from the user: every building "the best it can be" (facade detail still generic), better player-catalogue vehicles, real-GPU/phone performance check (draw distances and shadows were raised; ~960k triangles in the CBD on High with the full Ferrari).
- All build inputs are now in `data/` (see the table at the end of `data/README.md`): `unzip -q data/build-inputs.zip -d /tmp`. Only the 822 MB original aerial GeoTIFF is outside the repo. Python deps: `pip install rasterio tifffile imagecodecs scipy`. Test server: `python3 -m http.server 4300 --directory dist/app/browser`; screenshots with `?hq`.

## Ninth session - street races
- `game/graphics/race.ts` (`Race`, `RACES`): 7 events between district snaps (Moneni Dash, MR3 Sprint, Fairview Climb, Ngwane Park Descent, Airport Run, Kwaluseni Ridge, Manzini Grand Tour 20 km). Race line = routed centre-line resampled at 5 m + smoothed; curvature speed profile with a braking pass. 4 AI rivals (generated cars): inside line in bends, overtake traffic/rivals/player on the free side or follow, pace mistakes, staggered launch reaction, mild catch-up (-5 %/+7 %), squeeze past a stationary blocker after 2 s. Gates every ~300 m must be driven through in order; finish gate is white.
- `services/race.service.ts` (HUD signals, menu, personal bests in `localStorage['shesha.races']`), HUD panel/countdown/result + rail button, `NavigationService.follow()` (locked race route: turn-by-turn + map line, no re-route), `SceneManager.raceUpdate`, racer colliders (ids 2000+). Player is held on the grid during the countdown.
- Keys: **N** opens the race menu / abandons; **1-7** pick an event; Esc closes. Debug: `__shesha.race()`, `__shesha.raceSvc`.
- Some snaps (moneni) sit on a disconnected road scrap: `Race.snap()` nudges them onto the main network.
- Verified by simulated-time runs in headless Chromium (all 7 events finish, AI averages 86-151 km/h, no stalls or height pops, player gate/finish logic, grid screenshot). NOT verified: feel/difficulty on a real device with each player car; gamepad binding for the race menu (touch uses the flag rail button).

### Ninth session, optimisation pass
- Far terrain is one indexed mesh (`terrain-far`, tile index ranges rewritten on visibility change): ~140 -> ~4 terrain draw calls. Far traffic silhouettes are one `InstancedMesh` (`traffic-far`). Removed dead `TrafficSimulator` (12 never-updated box cars, ~77 draw calls). Phone profile (Pixel 7 emulation, Auto): CBD ~158 calls / 227k tris, MR3 ~99 calls / 144k tris (was ~340 / 450k+ on desktop High).
- Per-frame allocations removed from camera rig, collision step, scene sync, traffic update.
- Gamepad: Share+R1 opens race menu, D-pad up/down select, Cross starts.
- APK rebuilt (Java + `/opt/android-sdk` were present; `bash` the steps in this file). Still no real-device numbers: ask for key F readout.
- Remaining ideas: worker-thread chunk generation, baked chunks (docs/MASTER_PLAN.md 3.1), KTX2 textures, facade detail, Galp canopy sizing, release workflow (needs merge to default branch).

### Cops removed, first-person fixed
- AI cops are gone (`police.ts`, `police.service.ts`, HUD meters, J key, siren hook). Cops return only as real players in a future multiplayer cops-and-robbers mode: `AudioService.setSiren`, the `police` player car (`cars.ts`), `lamp-light` COP emitter slots and `RoadGraph` are kept for that.
- First person (COCKPIT/BUMPER): camera is rigidly attached to the car (no world-space lag) and the car's own meshes are hidden so roof/pillars/bonnet never block the view (`SceneManager.syncVehicleVisuals`, `CameraRig.update`).

## Multiplayer (free-roam, v1)
- Relay server: `npm run mp-server` (`server/mp-server.mjs`, `ws`, PORT env, default 8787; GET / = room list). Rooms by code, max 16, 60 msg/s cap, input sanitised. Clients keep their own physics and send pose at ~15 Hz.
- Client: `services/multiplayer.service.ts` (connection, roster, chat, pose send), `graphics/remote-players.ts` (dead-reckoned cars, name tags, collision circles id >= 3000), `components/multiplayer` lobby (J, or HUD menu). Server address is typed in the lobby (saved locally) - a hosted `wss://` URL is still needed for phones/internet play.
- Not yet: cops-and-robbers roles (PLAN.md section G), shared clock/weather, lights/siren rendering on remote cars (pose flags are already sent), server-side speed sanity checks, voice.
