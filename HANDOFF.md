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

## Ideas not done yet
- Draw house numbers from `meta.addr`; pedestrian crossings use; building collision with real roof ramps.
- Real-device profiling (60 fps, rumble, controller feel) - never done.
