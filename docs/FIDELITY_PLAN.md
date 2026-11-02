# SHESHA fidelity plan: a recognisable low-poly Eswatini

Goal: a player who knows the corridor says "that is the Galp on the MR3", "that is the Spar", "that is the Mbabane bus rank" without reading a sign.
Style stays low-poly (flat shading, procedural materials, no photo textures). Fidelity comes from **shape, colour, signage, proportions and placement**, not detail.

## 0. What the world holds today (from the last build)
| Building class (`use`) | Count | Today |
|---|---|---|
| Houses / sheds / carports (0, 8, 17) | ~113k | inferred roofs, procedural walls |
| Apartments (2), shops (3), supermarkets (4), malls (5), offices/banks (6) | ~1.5k | generic box + brand sign plate |
| Warehouses (7) | 888 | ribbed box |
| Schools 80 · churches 30 · clinics 28 · fuel 18 · hotels 17 · gov 14 · restaurants 42 | ~230 | one generic style per class |
| Street furniture | 61 bus stops, 68 signals, 12 mapped lamps, 868 house numbers | generic |

Only ~230 non-residential "destination" buildings plus ~300 brand shops carry real identity. That is the target set: **small enough to do properly**.

## 1. Four fidelity tiers
| Tier | What | How | Budget |
|---|---|---|---|
| T0 Landmarks | ~40 places everyone knows (Galp + Nissan tower, Manzini bus rank, Spar, Mbabane CBD towers, Ezulwini craft centres, Mzimene bridge, Parliament, Gables, Sibebe view...) | hand-modelled from reference photos | <= 1.5k triangles each, instanced parts |
| T1 Brand templates | fuel (Galp, Shell, Engen, Total, Puma, Sasol), supermarkets (Spar, Shoprite, Pick n Pay, Boxer, OK), banks (Standard, FNB, Nedbank), telcos (MTN, Eswatini Mobile), fast food (KFC, Debonairs, Wimpy...) | one parametric template per brand, matched by OSM `name`/`brand` | shared geometry |
| T2 Archetypes | school block, clinic, church, hotel, government, market, bus shelter, taxi rank | per-class template with 3 variants + real colours from OSM `building:colour`/`roof:colour` where mapped | shared geometry |
| T3 Generic | houses, sheds | current system + satellite roof palette | unchanged |

## 2. Data sources, in order of trust
1. **Your photos / screenshots** (best: three Galp shots already show the canopy, pylon and Nissan tower). Each landmark needs 3 images: front, side, a street-level view down the road.
2. **OSM tags** already merged: `brand`, `name`, `building:levels`, `height`, `roof:shape`, `roof:colour`, `building:colour`, `addr:*`.
3. **Mapillary** (free licence) if you provide a free API token: I can pull street-level frames near any coordinate.
4. **Wikimedia Commons** (open licence): rate-limited from this sandbox right now; retry later.
5. **Not used**: Google Street View / Google Maps imagery (cannot be copied into the game).

## 3. Specification file (one place to describe every landmark)
`data/landmarks.json`, read by the converter and the city builder:
```
{ "id": "galp-manzini-mr3", "match": {"osm": "name~Galp", "near": [-26.4975, 31.3768, 60]},
  "template": "fuel", "brand": "galp",
  "params": {"canopy": {"fascia": "#f26522", "under": "#e5e5e5", "columns": 6, "size": [22, 11]}, "pylon": {"height": 8, "logo": "diamond"}, "flagpoles": 4},
  "extras": [{"template": "pylon-tower", "at": [x, z], "name": "Nissan", "colors": ["#ffffff", "#d71920"]}],
  "refs": ["photos/galp-1.jpg", "photos/galp-2.jpg"] }
```
Rule: if a landmark entry matches, it replaces the inferred building; otherwise the tier-1/2 template for its class applies.

## 4. Workstreams
### A. Fuel stations (18 sites, 6 brands) - first, because it is the template for the rest
- Canopy: flat white slab, brand-colour fascia band all round, light-grey lit underside, 4-6 columns, correct footprint from the OSM polygon (not a fixed 16 x 9).
- Price pylon: tall white column, brand logo disc/diamond at the top, black price board, small canopy sign.
- Forecourt: concrete slab, pump islands with brand-colour pumps, shop kiosk with brand stripe, flagpoles (Galp), air/water point, bin.
- Done when: all 3 Galps are recognisable from 150 m against your photos.

### B. Chain retail (Spar, Shoprite, Pick n Pay, Boxer, OK, Pep, banks, telcos, KFC/Debonairs)
- Fascia colour block + logo-shaped sign (not just a text plate), awning colour per brand, trolley bay and parking where the OSM footprint has room.
- Mall facade variants (Riverstone, Manzini Mall style: long low block, signage tower).

### C. Civic and institutional (schools 80, churches 30, clinics 28, hospitals, gov 14, hotels 17)
- Schools: single-storey L / U blocks, red or green corrugated roofs, fenced yard, flagpole, coloured gate.
- Churches: tower/spire variants, ZCC-style compound.
- Clinics/hospitals: white block, green/red cross, ambulance bay.
- Government/Parliament/palace: distinctive roofs and flags.

### D. Town structure (Manzini, Matsapha, Lobamba, Ezulwini, Malkerns, Mbabane)
- CBD street walls: rows of connected shopfronts with continuous awnings and consistent heights per street.
- Market stalls (16 mapped), bus ranks (taxi rank shelters, queue lines), traffic circles with real island planting.
- Per-town colour palette from your photos (Mbabane greys and blues vs Manzini creams and reds).

### E. Roads and street furniture
- Lane markings and widths per road class matched to your photos (MR3 double-yellow centre, dashed white, edge lines, painted islands, zebra crossings).
- Kerbs, pavements and drainage grates; speed-limit and warning signs with the real Eswatini sign set.
- Street lamps (mapped ones exact, rest by spacing along MR3), electricity poles and wires, bus shelters, bins, billboards.

### F. Landscape
- Mzimene and Lusushwana rivers and their bridges, Ezulwini valley farmland, Sibebe rock, jacaranda and eucalyptus rows along the route, red-earth verges.

## 5. Phases
| Phase | Scope | Output | Needs from you |
|---|---|---|---|
| 1 | Template engine + landmarks.json + fuel stations | all 18 stations brand-correct | 1 photo each of Shell, Engen, Total, Puma |
| 2 | Chain retail + banks + telcos | ~300 branded shopfronts | Spar, Shoprite, Pick n Pay front photos |
| 3 | T0 landmark batch 1: Manzini CBD (10 places) | recognisable CBD drive | 3 photos per place |
| 4 | Roads and furniture pass on MR3 (Manzini to Mbabane) | markings, signs, lamps, shelters | kerb, marking, sign close-ups |
| 5 | Civic + institutional archetypes | schools, clinics, churches, gov | 1-2 photos of each type |
| 6 | T0 batch 2: Ezulwini, Lobamba, Mbabane CBD | recognisable whole route | 3 photos per place |
| 7 | Landscape + water + vegetation | rivers, bridges, valley | 4-5 route photos |
| 8 | Polish: lighting, night signage, audio props | | |

## 6. Verification (so "looks like the real thing" is measurable)
- **Same-view comparison**: for every landmark, render the game from the photo's position and heading (`__shesha.tp`) and publish a photo-vs-game side-by-side. A landmark is done only after you approve it.
- **Budgets**: <= 1.5k triangles per landmark, templates share geometry, nothing new beyond 450 m draw distance.
- **Physics safety**: every new solid gets a collision shape and is scanned against road centrelines (`collision.probe` sweep).
- **Regression**: headless render for errors, plus triangle/draw-call counts before and after each phase.

## 7. Risks
- OSM footprints can be wrong or offset; the converter already nudges small buildings off roads, and landmarks.json pins the exact place where needed.
- Triangle budget in the CBD (~310k at the last measurement): templates must stay instanced and distance-faded.
- Only photos give facade truth. Without them the result is brand-correct but not one-to-one.

## 8. Immediate next actions
1. Build the template engine and the fuel-station template, matched to the three Galp photos.
2. Create landmarks.json with the Galp + Nissan tower entry as the reference example.
3. You send the Phase-1 photos; I render the same-view comparisons.
