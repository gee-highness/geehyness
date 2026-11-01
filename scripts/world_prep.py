#!/usr/bin/env python3
"""
Toy Circuit world prep (run on your PC, not inside Blender).

Turns real open data into the files the Blender script and the game compiler use:
  height.npy      float32 metres, 4 m grid, row 0 = north
  height16.png    16-bit preview/heightmap (see meta.json for the metre range)
  hillshade.png   quick visual check
  meta.json       grid origin, resolution, z range, EPSG
  chunks/*.bin    optional 129x129 uint16 height chunks (512 m, shared borders)
  ground_class.npy / ground_class.png   class index raster (see CLASSES)

Needs: numpy, rasterio, pyproj, Pillow (scipy optional for smoothing).

Usage:
  python world_prep.py dem  --tiles ./dem_tiles --out ./world
  python world_prep.py ground --out ./world --geojson landuse.geojson buildings.geojson water.geojson
  python world_prep.py chunks --out ./world

World frame: x = UTM easting - origin easting, y = UTM northing - origin northing
(x east, y north, metres). Blender uses the same frame. The game plan's z grows
southward, so game_z = -y.
"""
import argparse, glob, json, math, os
import numpy as np

EPSG = 32736                           # UTM 36S, verify for your area (plan section 19)
BBOX = (31.10, -26.58, 31.45, -26.30)  # lon_min, lat_min, lon_max, lat_max (plan section 18)
ORIGIN_LONLAT = (31.3667, -26.4833)    # approx Manzini centre, world (0, 0); adjust if you like
RES = 4.0                              # metres per cell
CHUNK = 512.0                          # metres per chunk, 128 cells, 129 vertices
HIGHVELD_MIN_M = 1000.0                # above this the default grass class becomes highveld (tune)
ROCK_SLOPE_DEG = 30.0                  # steeper than this becomes rock/scree

# id: (name, preview rgb)
CLASSES = {
    1: ("dry_bushveld_grass", (201, 196, 138)),
    2: ("highveld_grassland", (169, 196, 122)),
    3: ("valley_pasture", (127, 184, 90)),
    4: ("cane_and_pineapple", (94, 158, 74)),
    5: ("timber_plantation", (63, 122, 58)),
    6: ("rock_and_scree", (168, 159, 145)),
    7: ("bare_soil_and_dirt", (176, 140, 98)),
    8: ("urban_ground", (140, 140, 148)),
    9: ("industrial_hardstanding", (110, 112, 120)),
    10: ("river_sand_and_gravel", (214, 200, 160)),
    12: ("wetland_reed", (110, 150, 110)),
}


def transformer(src, dst):
    from pyproj import Transformer
    return Transformer.from_crs(src, dst, always_xy=True)


def origin_utm():
    t = transformer("EPSG:4326", f"EPSG:{EPSG}")
    return t.transform(*ORIGIN_LONLAT)


def grid_spec():
    """Chunk-aligned grid in world metres. Returns x0 (west), y0 (north), cols, rows, origin."""
    oe, on = origin_utm()
    t = transformer("EPSG:4326", f"EPSG:{EPSG}")
    xs, ys = [], []
    for lon in (BBOX[0], BBOX[2]):
        for lat in (BBOX[1], BBOX[3]):
            e, n = t.transform(lon, lat)
            xs.append(e - oe)
            ys.append(n - on)
    x0 = math.floor(min(xs) / CHUNK) * CHUNK
    x1 = math.ceil(max(xs) / CHUNK) * CHUNK
    y1 = math.floor(min(ys) / CHUNK) * CHUNK
    y0 = math.ceil(max(ys) / CHUNK) * CHUNK
    cols = int(round((x1 - x0) / RES))
    rows = int(round((y0 - y1) / RES))
    return x0, y0, cols, rows, (oe, on)


def build_dem(tiles_dir, out_dir, smooth):
    import rasterio
    from rasterio.merge import merge
    from rasterio.transform import from_origin
    from rasterio.warp import reproject, Resampling
    from PIL import Image

    os.makedirs(out_dir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(tiles_dir, "*.tif")))
    if not files:
        raise SystemExit(f"No .tif tiles in {tiles_dir}. See Part D, step 1, for how to download GLO-30.")
    x0, y0, cols, rows, (oe, on) = grid_spec()
    pad = 0.02
    srcs = [rasterio.open(f) for f in files]
    mosaic, tr = merge(srcs, bounds=(BBOX[0] - pad, BBOX[1] - pad, BBOX[2] + pad, BBOX[3] + pad))
    src_crs = srcs[0].crs
    nodata = srcs[0].nodata
    src = mosaic[0].astype("float32")
    if nodata is not None:
        src[src == nodata] = np.nan
    dst = np.full((rows, cols), np.nan, dtype="float32")
    dst_tr = from_origin(oe + x0, on + y0, RES, RES)
    reproject(source=src, destination=dst, src_transform=tr, src_crs=src_crs,
              dst_transform=dst_tr, dst_crs=f"EPSG:{EPSG}",
              resampling=Resampling.cubic, src_nodata=np.nan, dst_nodata=np.nan)
    if np.isnan(dst).any():
        print(f"Warning: {int(np.isnan(dst).sum())} empty cells (missing tile?). Filling from nearest.")
        from scipy import ndimage
        idx = ndimage.distance_transform_edt(np.isnan(dst), return_distances=False, return_indices=True)
        dst = dst[tuple(idx)]
    if smooth > 0:
        from scipy import ndimage
        dst = ndimage.gaussian_filter(dst, smooth).astype("float32")

    zmin, zmax = float(dst.min()), float(dst.max())
    np.save(os.path.join(out_dir, "height.npy"), dst)
    meta = dict(epsg=EPSG, res=RES, chunk=CHUNK, x0=x0, y0=y0, cols=cols, rows=rows,
                origin_e=oe, origin_n=on, origin_lonlat=ORIGIN_LONLAT, bbox=BBOX,
                zmin=zmin, zmax=zmax)
    json.dump(meta, open(os.path.join(out_dir, "meta.json"), "w"), indent=2)

    u16 = np.round((dst - zmin) / max(zmax - zmin, 1e-6) * 65535).astype("<u2")
    Image.fromarray(u16, mode="I;16").save(os.path.join(out_dir, "height16.png"))
    gy, gx = np.gradient(dst, RES)
    shade = np.clip(0.5 + 0.5 * (-gx * 0.7 - gy * 0.7) / (1 + np.hypot(gx, gy)), 0, 1)
    Image.fromarray((shade * 255).astype("u1")).save(os.path.join(out_dir, "hillshade.png"))
    print(f"Grid {cols} x {rows} cells at {RES} m. Height {zmin:.1f} to {zmax:.1f} m. Wrote {out_dir}")
    print("height16 value -> metres: zmin + v / 65535 * (zmax - zmin)")


# ---- ground classes -------------------------------------------------------------

def classify(props):
    """Return (class_id, priority) for an OSM feature, or None. Higher priority wins."""
    g = lambda k: (props.get(k) or "").lower()
    lu, nat, leis = g("landuse"), g("natural"), g("leisure")
    other = g("other_tags")
    if g("building") or "building" in other:
        return 8, 90
    if nat in ("bare_rock", "scree", "cliff", "rock") or lu == "quarry":
        return 6, 70
    if nat in ("sand", "beach", "shingle") or nat == "water" or g("waterway"):
        return 10, 80
    if nat in ("wetland", "reedbed"):
        return 12, 60
    if lu in ("forest",) or nat == "wood":
        return 5, 50
    if lu in ("farmland", "orchard", "vineyard", "plant_nursery", "farmyard"):
        return 4, 40
    if lu in ("meadow", "grass", "recreation_ground", "village_green", "cemetery") or leis in ("park", "pitch", "golf_course", "garden"):
        return 3, 40
    if lu in ("industrial", "railway", "garages", "depot"):
        return 9, 60
    if lu in ("residential", "commercial", "retail", "construction", "education", "institutional"):
        return 8, 55
    if nat in ("scrub", "heath", "grassland") or lu in ("brownfield", "greenfield"):
        return 7 if nat == "heath" else 1, 30
    return None


def build_ground(out_dir, geojson_files):
    import rasterio.features
    from rasterio.transform import from_origin
    from PIL import Image

    meta = json.load(open(os.path.join(out_dir, "meta.json")))
    h = np.load(os.path.join(out_dir, "height.npy"), mmap_mode="r")
    rows, cols = h.shape
    oe, on = meta["origin_e"], meta["origin_n"]
    tr = from_origin(oe + meta["x0"], on + meta["y0"], RES, RES)

    gy, gx = np.gradient(np.asarray(h), RES)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    cls = np.where(np.asarray(h) >= HIGHVELD_MIN_M, 2, 1).astype("u1")
    cls[slope > ROCK_SLOPE_DEG] = 6

    shapes = []
    for fn in geojson_files:
        for feat in json.load(open(fn))["features"]:
            c = classify(feat["properties"])
            geom = feat["geometry"]
            if c and geom and geom["type"] in ("Polygon", "MultiPolygon"):
                shapes.append((c[1], c[0], geom))
    shapes.sort(key=lambda s: s[0])
    for _, cid, geom in shapes:   # low priority first so high priority paints last
        m = rasterio.features.rasterize([(geom, 1)], out_shape=(rows, cols), transform=tr, fill=0, dtype="u1")
        cls[m == 1] = cid
    np.save(os.path.join(out_dir, "ground_class.npy"), cls)

    rgb = np.zeros((rows, cols, 3), "u1")
    for cid, (_, col) in CLASSES.items():
        rgb[cls == cid] = col
    Image.fromarray(rgb).save(os.path.join(out_dir, "ground_class.png"))
    counts = {CLASSES[k][0]: int((cls == k).sum()) for k in CLASSES}
    print("Ground class cell counts:", counts)


def build_chunks(out_dir):
    meta = json.load(open(os.path.join(out_dir, "meta.json")))
    h = np.load(os.path.join(out_dir, "height.npy"), mmap_mode="r")
    n = int(CHUNK / RES)
    zmin, zmax = meta["zmin"], meta["zmax"]
    ncx, ncy = meta["cols"] // n, meta["rows"] // n
    os.makedirs(os.path.join(out_dir, "chunks"), exist_ok=True)
    for cj in range(ncy):
        for ci in range(ncx):
            blk = np.asarray(h[cj * n: cj * n + n + 1, ci * n: ci * n + n + 1])
            blk = np.pad(blk, ((0, n + 1 - blk.shape[0]), (0, n + 1 - blk.shape[1])), mode="edge")
            u16 = np.round((blk - zmin) / max(zmax - zmin, 1e-6) * 65535).astype("<u2")
            u16.tofile(os.path.join(out_dir, "chunks", f"h_{ci}_{cj}.bin"))
    print(f"Wrote {ncx * ncy} chunk files (129 x 129 uint16, about 33 KB each, before compression)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("dem"); a.add_argument("--tiles", required=True); a.add_argument("--out", required=True)
    a.add_argument("--smooth", type=float, default=0.0, help="gaussian sigma in cells, 0 = off")
    b = sub.add_parser("ground"); b.add_argument("--out", required=True); b.add_argument("--geojson", nargs="+", required=True)
    c = sub.add_parser("chunks"); c.add_argument("--out", required=True)
    args = ap.parse_args()
    if args.cmd == "dem":
        build_dem(args.tiles, args.out, args.smooth)
    elif args.cmd == "ground":
        build_ground(args.out, args.geojson)
    else:
        build_chunks(args.out)
