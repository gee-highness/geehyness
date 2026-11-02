# Realism: every lever we have

Impact: H / M / L (how much a player feels it). Effort: S (hours) / M (a day or two) / L (a week+). Items marked **[have]** exist today and only need tuning.

## 1. Look of the world
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Brand-correct fuel stations, chain shops, banks (Galp orange canopy + logo pylon etc.) | H | M | Phase 1-2 of FIDELITY_PLAN |
| Hand-modelled landmarks from your photos (Galp + Nissan tower, Spar, bus rank, CBD towers) | H | M each | Photo-vs-game approval loop |
| Real building heights: Google Open Buildings 2.5D (Africa heights, 4 m grid) or Overture `height` | H | M | Only ~126 buildings have OSM levels today; heights make skylines true |
| Real roof and wall colours sampled from satellite imagery per building | H | M | Replaces the weighted-random palette |
| Rooftop clutter by type: water tanks, solar water heaters, satellite dishes, AC units, chimneys | M | S | Instanced props, almost free |
| Per-town colour grading and palette (Mbabane greys/blues, Manzini creams/reds) | M | S | |
| Building signs from every OSM POI name (not just chains), shop windows lit at night | M | S | Names already in `points.json` |
| Real house numbers drawn on gates (868 mapped) | L | S | `meta.addr` is already emitted |
| Billboards and painted adverts (Eswatini Mobile, MTN, Simunye, Coca-Cola) | M | S | |
| Walls and fences from imagery: concrete block walls, razor wire, palisade fences, security gates | M | M | Common visual signature of Eswatini streets |
| Ground cover from ESA WorldCover (10 m): sugar cane, pineapple, grassland, bare red earth, forest | H | M | Replaces the current colour raster |
| Real tree positions and heights from Meta/WRI 1 m canopy height; species by zone (jacaranda in towns, eucalyptus plantations, acacia, gum) | H | M | |
| Roadside vegetation: tall grass, aloe, banana plants, hedges | M | S | |
| Roadside red-earth verges, gravel shoulders, potholes and patched asphalt | H | S | Texture + a few decals |

## 2. Roads and street details
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Lane markings per road class matched to photos: yellow edge lines, double-yellow centre, dashed white, stop lines, zebra crossings, painted islands | H | M | |
| Kerbs with painted yellow/black, drain grates, manhole covers, tactile paving | M | S | |
| Real Eswatini signs: speed limits, give way, stop, school, cattle, humps, directional green signs with real place names | H | M | Mapillary map-features gives sign positions if you supply a token |
| Real lamp, pole and hydrant positions (Mapillary) | M | M | 12 mapped lamps today |
| Road works, cones, barriers, diversion signs on a few streets | M | S | Gameplay texture |
| Speed humps and rumble strips with the right paint | M | S | **[have]** humps, add paint and signs |
| Tar patches, cracks, wear in lanes, oil stains | M | S | **[have]** asphalt shader, add decals |
| Level crossings with bells and barriers | M | S | **[have]** crossings; add animated boom + bell |
| Toll booths, border post, weighbridge | L | M | |

## 3. Light, weather and time
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Real sun position by date, latitude and time (season, long shadows at dawn) | H | S | **[have]** day/night; make date-aware |
| Moon phases, star field from real catalogue, Milky Way at night | M | S | |
| Valley mist at dawn in Ezulwini, haze on the horizon, distance fog by humidity | H | S | **[have]** Mist; make it local and time-driven |
| Rain: puddles that fill and reflect, wet-road reflections, wipers, drops on the windscreen, spray from tyres | H | M | **[have]** rain streaks and wet roads |
| Thunderstorm cycle with lightning, wind gusts that sway trees and flags | M | S | **[have]** lightning |
| Smoke from sugarcane burning, dust clouds on dirt roads, exhaust smoke | M | M | |
| Soft shadows, ambient occlusion, light shafts, bloom, lens flare, tone-mapping tuned like film | H | M | Mobile cost needs the governor; desktop first |
| Headlights as real cones lighting the road and signs, with brights/dip, fog lights | H | M | **[have]** emitters; add cones |
| Street lamps with sodium glow and falloff, shop and window light spill | M | S | **[have]** emitter system |
| Reflections: cube-map from the sky on cars, glass and wet asphalt | H | M | |

## 4. Cars
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Damage: dents, broken lights, hanging bumpers, smoke from engine, performance loss | H | L | Biggest single "this is a real car" feature |
| Per-car engine sound from recorded loops (idle, rev, redline), turbo whistle and blow-off, exhaust pops, gearbox whine, tyre squeal per surface | H | M | **[have]** synth audio; swap for sample layers |
| Cockpit: working gauges, animated steering wheel, wipers, indicators, mirrors (rear-view render) | H | L | |
| Suspension and body motion visible: roll, dive, squat, wheel travel, tyre bulge | M | S | **[have]** physics; drive the meshes |
| Tyre marks, burnout smoke, skid decals on asphalt | H | M | |
| Real number plates (Eswatini format) and a plate on every AI car | M | S | |
| Brake discs glowing, heat shimmer | L | S | **[have]** rotor temperature |
| Manual gearbox with clutch, h-pattern and paddles, launch control, TCS/ABS toggles | M | M | **[have]** auto box and stability assist |
| Fuel, engine temperature, tyre wear and temperature as real constraints; refuel at the Galp | H | M | Ties the fuel stations to gameplay |
| Per-car handling from real specs (mass, power, wheelbase, drivetrain, tyre size) | H | M | **[have]** 29 cars; verify numbers |
| Suspension, drivetrain and tyre tuning with live telemetry | M | S | **[have]** tuning dialog |

## 5. Traffic and people
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Kombi minibus taxis: stop anywhere, hoot, overload, hazard lights | H | M | Iconic Eswatini road behaviour |
| Cattle, goats and dogs on and beside roads, herders, cows blocking lanes | H | M | |
| AI that indicates, overtakes, queues at lights, yields to sirens, tailgates | H | M | **[have]** lanes and signals |
| Pedestrians crossing at zebras, hawkers at junctions, school children at school times, crowds at bus ranks and markets | H | M | **[have]** pavement pedestrians |
| Parked cars that move: people get in, taillights, reversing out | M | M | |
| Delivery trucks, sugar-cane lorries, buses, motorbikes, bicycles | M | M | |
| Emergency vehicles: ambulance and fire engine behaviour | M | S | **[have]** police |
| Police checkpoints, speed traps and fines, roadblocks | M | M | **[have]** cops and speed traps |
| Funeral processions, weddings, royal motorcade events | L | L | Flavour |

## 6. Sound
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Ambient beds per place: birds by day, crickets and frogs at night, roosters, church bells, distant music, market chatter | H | M | |
| Positional audio and Doppler for passing cars, hooters, sirens | H | M | |
| Reverb under bridges and between buildings | M | S | |
| Local radio: SBIS-style stations, news, adverts, songs (licensing needed) | M | M | |
| Surface-specific road noise: asphalt, gravel, cattle grid, bridge joints | M | S | **[have]** surface audio |

## 7. Physics and driving model
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Combined slip tyre model (grip circle), temperature and pressure effects, wet-surface friction and aquaplaning | H | M | **[have]** Pacejka-style tyre with relaxation |
| Differential models (open, LSD, locked), real torque curves per engine | M | M | |
| Bumps and potholes shaking the car, speed-hump launch | M | S | **[have]** humps |
| Collisions with deformation and glancing slides, fence breaks, tree hits | H | L | |
| Drive on real surfaces: gravel, mud, wet grass, sand, dust with different grip | M | S | **[have]** surface classes |
| Fixed-step determinism, substepping at high speed | M | S | **[have]** 60 Hz fixed step |

## 8. Controls and feel
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Force feedback and rich haptics: engine, kerbs, gravel, skids, impacts | H | M | **[have]** rumble hooks |
| Full controller layer with analogue triggers, per-car steering curves | M | S | **[have]** |
| Chase camera with speed pull-back, lag in drifts, FOV kick; cockpit head movement under braking | M | S | **[have]** |
| Dash-style HUD: real gauges, GPS arrows, speed-limit sign | M | S | **[have]** |

## 9. World content and gameplay
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Wider area: Siteki, Nhlangano, Piggs Peak, the border posts | M | L | Needs a bigger DEM and tiles |
| Missions: deliveries, taxi runs, police chase, time trials on MR3, convoy | H | L | |
| Day-night routines: shops open and close, traffic peaks at rush hour, school runs | M | M | |
| Economy: lilangeni, fuel prices, fines, car purchases | M | M | |
| Photo mode with depth of field, exposure, filters, and a gallery | M | S | **[have]** photo mode |
| Multiplayer: human cops and robbers (design in PLAN.md section G) | H | L | |

## 10. Performance as a realism feature (it must run smooth to feel real)
| Idea | Impact | Effort | Notes |
|---|---|---|---|
| Move chunk generation to a worker; GPU instancing for repeated parts; merge draw calls | H | L | |
| Impostors and level-of-detail for distant buildings; texture-free materials | H | M | **[have]** partly |
| Real-device profiling on your phone; tune the governor to its numbers | H | S | Needs your FPS readout |

## Recommended order (largest felt change first)
1. Fuel stations and chain shops brand-correct (Phase 1-2).
2. Lane markings, kerbs and real signs on the MR3 (Phase 4).
3. Ground cover and trees from real data, building heights from Open Buildings.
4. Kombi taxis, cattle and goats, pedestrians at crossings.
5. Rain (puddles, wipers), valley mist, headlight cones, sky reflections.
6. Engine, tyre and ambient sound layers with Doppler.
7. Car damage, cockpit gauges and mirrors, tyre marks and smoke.
8. Fuel and tyre wear tied to the real stations.
9. Hand-modelled landmarks, batch by batch.
10. Missions and a wider map.
