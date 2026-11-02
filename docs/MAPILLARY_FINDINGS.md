# What the Mapillary frames show (reference only; images are not stored in the repo)
Sampled ~12 recent frames per town (Manzini CBD, Matsapha, Lobamba, Ezulwini, Mbabane, Malkerns) + 2,960 map features (merged by `scripts/apply_mapillary.py`).

| Area | Observed | Status |
|---|---|---|
| Manzini CBD | Narrow streets, angled/parallel parking both sides, 2-storey brick + painted shopfronts, big painted fascia boards, verandahs, single-arm curved lamps, overhead cables, white long-distance coaches + bakkies (pickups) + Corolla-type sedans, Total station at the rank | stations done; rest TODO (verandah archetype, coach/bakkie AI models) |
| Matsapha / MR3 | Bridge with white vertical-slat balustrade, retaining wall with jersey base, yellow/black chevron kerbs on islands, wide dark tar, Quantum minibuses, palms + eucalyptus, tall lamps with long arms | parapet slots done; chevron kerbs TODO |
| Lobamba / rural MR3 | **Yellow edge lines + white dashed centre**, red-soil verges, hills backdrop, roundabout with paver island + blue keep-left sign, yellow hatch markings, pedestrian steel footbridge, green direction signs, roadside billboards | yellow edge lines DONE; billboards DONE (real positions); footbridge/hatching TODO |
| Mbabane / hills | Granite dome behind the town, eucalyptus + pine, boundary walls/palisade, STOP signs on poles, narrow two-lane, no pavements outside CBD, red verges | skyline ring TODO |
| Power | Wooden utility poles with crossarms + wires everywhere along roads (798 mapped), generic poles 1,381 | real positions + wires DONE |

## Data pulled (all CC BY-SA 4.0, Mapillary contributors)
- `data/mapillary_features.json` 2,960 map features -> merged into `meta.json` by `scripts/apply_mapillary.py`.
- `data/mapillary_images.json` 13,437 photo positions / headings / years in 62 sequences (index only, no pixels), `scripts/fetch_mapillary_images.py`.
- Lane side check: 876 camera positions left of the OSM centreline vs 446 right (66% left; consistent with left-hand traffic, OSM centreline offset blurs it).
- Per-image detections work (objects: poles, signs, lights); 3D reconstruction (`sfm_cluster`) exists but returned 0 points for the Manzini frame tested.
- Photo-cut textures were tried (tar, soil, grass): too blurry/shadowed to beat the CC0 textures, so only **colours** were taken from them (road tar now warm grey 0x5e5c58 instead of navy, verge/gravel red-brown 0x9a6c4c).
