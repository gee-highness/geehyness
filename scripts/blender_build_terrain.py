"""
Toy Circuit: build real terrain, ground textures and every OSM street in Blender.

Run inside Blender (Scripting tab > Open > Run Script). Written against the Blender 4.x Python API
(bpy, numpy are bundled); check the API notes if you use another version.

Inputs (made by world_prep.py and osm_export.sh):
  WORLD/height.npy, meta.json, ground_class.npy
  OSM/highways.geojson, waterways.geojson   (EPSG:32736 metres)
  TEX/<class_name>/color.jpg   optional PBR colour maps (ambientCG or Poly Haven, CC0). Missing = flat colour.

Frame: X east, Y north, Z up, metres from the world origin (Manzini). 1 Blender unit = 1 m.
Start with a small AREA, check it, then enlarge it.
"""
import json, math, os, re
import numpy as np

# ---------------- settings ----------------
WORLD = r"C:\toycircuit\world"
OSM = r"C:\toycircuit\osm"
TEX = r"C:\toycircuit\textures"
AREA = (-1000.0, -1000.0, 1000.0, 1000.0)   # xmin, ymin, xmax, ymax in metres from the origin: Manzini centre, 2 x 2 km
STEP = 2                  # 1 = 4 m mesh, 2 = 8 m, 4 = 16 m (use coarser for far areas)
CARVE_ROADS = True        # flatten and blend the terrain under streets (plan section 20)
CARVE_WATER = True        # cut channels along waterways (plan section 21)
BUILD_ROADS = True
MAX_GRADE = 0.12          # 12 percent maximum change of road height along its length
SHOULDER = 6.0            # metres of embankment blend beside the road
TILE_M = {"default": 6.0} # texture repeat length in metres per class name
CLASS_NAMES = {1: "dry_bushveld_grass", 2: "highveld_grassland", 3: "valley_pasture", 4: "cane_and_pineapple",
               5: "timber_plantation", 6: "rock_and_scree", 7: "bare_soil_and_dirt", 8: "urban_ground",
               9: "industrial_hardstanding", 10: "river_sand_and_gravel", 12: "wetland_reed"}
CLASS_RGB = {1: (.79, .77, .54), 2: (.66, .77, .48), 3: (.5, .72, .35), 4: (.37, .62, .29), 5: (.25, .48, .23),
             6: (.66, .62, .57), 7: (.69, .55, .38), 8: (.55, .55, .58), 9: (.43, .44, .47), 10: (.84, .78, .63),
             12: (.43, .59, .43)}
# class width in metres when OSM gives no width or lanes (plan section 20)
ROAD_WIDTH = {"motorway": 7.0, "motorway_link": 5.0, "trunk": 7.0, "trunk_link": 5.0, "primary": 7.0,
              "primary_link": 5.0, "secondary": 6.6, "secondary_link": 4.5, "tertiary": 6.0, "tertiary_link": 4.5,
              "residential": 5.5, "unclassified": 5.5, "living_street": 4.5, "road": 5.5, "service": 3.5,
              "track": 3.0, "pedestrian": 3.0, "footway": 1.6, "path": 1.2, "cycleway": 2.0, "steps": 1.5}
SKIP_RIBBON = {"proposed", "construction", "platform", "bus_guideway", "raceway", "corridor", "elevator"}
UNPAVED = {"unpaved", "gravel", "dirt", "ground", "grass", "sand", "mud", "compacted", "fine_gravel", "earth"}


# ---------------- pure numpy helpers (no bpy) ----------------
def load_world():
    meta = json.load(open(os.path.join(WORLD, "meta.json")))
    h = np.load(os.path.join(WORLD, "height.npy")).astype("float32")
    cls = None
    p = os.path.join(WORLD, "ground_class.npy")
    if os.path.exists(p):
        cls = np.load(p)
    return meta, h, cls


def parse_tags(props):
    tags = dict(props)
    for k, v in re.findall(r'"([^"]+)"=>"([^"]*)"', props.get("other_tags") or ""):
        tags[k] = v
    return tags


def bilinear(h, meta, x, y):
    """Height in metres at world x, y (arrays ok)."""
    res = meta["res"]
    c = (np.asarray(x) - meta["x0"]) / res
    r = (meta["y0"] - np.asarray(y)) / res
    c = np.clip(c, 0, h.shape[1] - 1.001)
    r = np.clip(r, 0, h.shape[0] - 1.001)
    c0, r0 = np.floor(c).astype(int), np.floor(r).astype(int)
    fc, fr = c - c0, r - r0
    return (h[r0, c0] * (1 - fc) * (1 - fr) + h[r0, c0 + 1] * fc * (1 - fr)
            + h[r0 + 1, c0] * (1 - fc) * fr + h[r0 + 1, c0 + 1] * fc * fr)


def resample(pts, spacing=3.0):
    pts = np.asarray(pts, dtype="float64")
    if len(pts) < 2:
        return pts, np.zeros(len(pts))
    seg = np.hypot(*np.diff(pts, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] < 1e-6:
        return pts[:1], np.zeros(1)
    n = max(2, int(math.ceil(s[-1] / spacing)) + 1)
    t = np.linspace(0, s[-1], n)
    return np.column_stack([np.interp(t, s, pts[:, 0]), np.interp(t, s, pts[:, 1])]), t


def smooth_profile(z, ds, window_m=30.0, max_grade=MAX_GRADE):
    """Low-pass the height along a road, then clamp the grade (plan section 20)."""
    k = max(1, int(window_m / max(ds, 0.1)) | 1)
    if len(z) > k:
        pad = k // 2
        zp = np.pad(z, pad, mode="edge")
        z = np.convolve(zp, np.ones(k) / k, mode="valid")
    z = z.copy()
    lim = max_grade * ds
    for i in range(1, len(z)):
        z[i] = min(max(z[i], z[i - 1] - lim), z[i - 1] + lim)
    for i in range(len(z) - 2, -1, -1):
        z[i] = min(max(z[i], z[i + 1] - lim), z[i + 1] + lim)
    return z


def stamp(h, meta, xy, z, half_w, blend):
    """Set the terrain to z within half_w of the line and blend to natural height over `blend` metres."""
    res = meta["res"]
    rad = half_w + blend
    n = int(math.ceil(rad / res)) + 1
    for (x, y), zz in zip(xy, z):
        c = int(round((x - meta["x0"]) / res))
        r = int(round((meta["y0"] - y) / res))
        r0, r1, c0, c1 = max(r - n, 0), min(r + n + 1, h.shape[0]), max(c - n, 0), min(c + n + 1, h.shape[1])
        if r0 >= r1 or c0 >= c1:
            continue
        rr, cc = np.mgrid[r0:r1, c0:c1]
        d = np.hypot(meta["x0"] + cc * res - x, meta["y0"] - rr * res - y)
        w = np.clip(1.0 - np.maximum(d - half_w, 0) / max(blend, 1e-3), 0, 1)
        w = w * w * (3 - 2 * w)
        sub = h[r0:r1, c0:c1]
        h[r0:r1, c0:c1] = sub * (1 - w) + zz * w


def in_area(pts, area, pad=20.0):
    x, y = pts[:, 0], pts[:, 1]
    return not (x.max() < area[0] - pad or x.min() > area[2] + pad or y.max() < area[1] - pad or y.min() > area[3] + pad)


def road_width(tags):
    if "width" in tags:
        try:
            return max(float(re.findall(r"[\d.]+", tags["width"])[0]), 1.0)
        except (IndexError, ValueError):
            pass
    if "lanes" in tags:
        try:
            return max(int(tags["lanes"]) * 3.4, 3.0)
        except ValueError:
            pass
    return ROAD_WIDTH.get(tags.get("highway", ""), 5.0)


def load_lines(name, meta, area):
    """Read a UTM GeoJSON of lines, return list of (tags, Nx2 world-metre array)."""
    p = os.path.join(OSM, name)
    if not os.path.exists(p):
        return []
    out = []
    for f in json.load(open(p))["features"]:
        g = f["geometry"]
        if not g:
            continue
        parts = [g["coordinates"]] if g["type"] == "LineString" else (g["coordinates"] if g["type"] == "MultiLineString" else [])
        for part in parts:
            a = np.array(part, dtype="float64")[:, :2]
            a[:, 0] -= meta["origin_e"]
            a[:, 1] -= meta["origin_n"]
            if len(a) >= 2 and in_area(a, area):
                out.append((parse_tags(f["properties"]), a))
    return out


def prepare_roads(roads, h, meta):
    """Resample, compute the smoothed profile for each street, return dicts."""
    prepared = []
    for tags, line in roads:
        hw = tags.get("highway", "")
        if hw in SKIP_RIBBON:
            continue
        xy, s = resample(line)
        if len(xy) < 2:
            continue
        ds = float(s[1] - s[0]) if len(s) > 1 else 3.0
        z = bilinear(h, meta, xy[:, 0], xy[:, 1])
        bridge = tags.get("bridge", "no") not in ("no", "") or tags.get("tunnel", "no") not in ("no", "")
        if bridge:   # keep the deck straight between its ends, do not follow the valley floor
            z = np.linspace(z[0], z[-1], len(z))
        else:
            z = smooth_profile(z, ds)
        prepared.append(dict(tags=tags, xy=xy, z=z, w=road_width(tags), bridge=bridge,
                             unpaved=tags.get("surface", "") in UNPAVED or (hw == "track" and "surface" not in tags)))
    return prepared


def ribbon_arrays(road, h, meta, lift=0.04):
    """Vertices and quads for one street ribbon."""
    xy, z, w = road["xy"], road["z"], road["w"]
    d = np.gradient(xy, axis=0)
    ln = np.maximum(np.hypot(d[:, 0], d[:, 1]), 1e-6)
    nrm = np.column_stack([-d[:, 1] / ln, d[:, 0] / ln])
    left = xy + nrm * w / 2
    right = xy - nrm * w / 2
    zz = z + lift
    v = np.empty((len(xy) * 2, 3))
    v[0::2] = np.column_stack([left, zz])
    v[1::2] = np.column_stack([right, zz])
    i = np.arange(len(xy) - 1) * 2
    quads = np.column_stack([i, i + 1, i + 3, i + 2])
    return v, quads


def ground_weights(cls, r0, r1, c0, c1, margin=4):
    """Per chunk: 4 palette classes and a (n, n, 4) weight array, softened at the edges."""
    R0, R1, C0, C1 = max(r0 - margin, 0), min(r1 + margin, cls.shape[0]), max(c0 - margin, 0), min(c1 + margin, cls.shape[1])
    blk = cls[R0:R1, C0:C1]
    ids, counts = np.unique(blk[(r0 - R0):(r1 - R0), (c0 - C0):(c1 - C0)], return_counts=True)
    order = ids[np.argsort(-counts)]
    palette = [int(i) for i in order[:4]]
    while len(palette) < 4:
        palette.append(palette[-1])
    w = np.zeros(blk.shape + (4,), "float32")
    for k, cid in enumerate(palette):
        w[..., k] = (blk == cid)
    w[w.sum(-1) == 0, 0] = 1.0
    for _ in range(2):   # 3 x 3 box blur twice
        p = np.pad(w, ((1, 1), (1, 1), (0, 0)), mode="edge")
        w = sum(p[a:a + w.shape[0], b:b + w.shape[1]] for a in range(3) for b in range(3)) / 9.0
    w = w[(r0 - R0):(r1 - R0), (c0 - C0):(c1 - C0)]
    w = w / np.maximum(w.sum(-1, keepdims=True), 1e-6)
    return palette, w


# ---------------- Blender part ----------------
def build():
    import bpy

    def collection(name):
        if name in bpy.data.collections:
            return bpy.data.collections[name]
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
        return c

    def make_object(name, verts, faces, coll, smooth=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        me.update()
        if smooth:
            try:
                me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
            except Exception:
                pass
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        return ob

    def terrain_material(name, mask_img, palette):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Roughness"].default_value = 0.92
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        uv = nt.nodes.new("ShaderNodeUVMap")
        mask = nt.nodes.new("ShaderNodeTexImage")
        mask.image = mask_img
        mask.interpolation = "Linear"
        mask.extension = "EXTEND"
        nt.links.new(uv.outputs["UV"], mask.inputs["Vector"])
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(mask.outputs["Color"], sep.inputs["Color"])
        # alpha is the 4th weight: read it from the image alpha output
        chans = [sep.outputs["Red"], sep.outputs["Green"], sep.outputs["Blue"], mask.outputs["Alpha"]]
        texco = nt.nodes.new("ShaderNodeTexCoord")
        total = None
        for k, cid in enumerate(palette):
            name_c = CLASS_NAMES.get(cid, "dry_bushveld_grass")
            path = os.path.join(TEX, name_c, "color.jpg")
            if os.path.exists(path):
                tex = nt.nodes.new("ShaderNodeTexImage")
                tex.image = bpy.data.images.load(path, check_existing=True)
                mp = nt.nodes.new("ShaderNodeMapping")
                s = 1.0 / TILE_M.get(name_c, TILE_M["default"])
                mp.inputs["Scale"].default_value = (s, s, s)
                nt.links.new(texco.outputs["Object"], mp.inputs["Vector"])
                nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
                col = tex.outputs["Color"]
            else:
                rgb = nt.nodes.new("ShaderNodeRGB")
                rgb.outputs[0].default_value = (*CLASS_RGB.get(cid, (.5, .5, .5)), 1.0)
                col = rgb.outputs[0]
            scale = nt.nodes.new("ShaderNodeVectorMath")
            scale.operation = "SCALE"
            nt.links.new(col, scale.inputs[0])
            nt.links.new(chans[k], scale.inputs[3])
            if total is None:
                total = scale.outputs["Vector"]
            else:
                add = nt.nodes.new("ShaderNodeVectorMath")
                add.operation = "ADD"
                nt.links.new(total, add.inputs[0])
                nt.links.new(scale.outputs["Vector"], add.inputs[1])
                total = add.outputs["Vector"]
        nt.links.new(total, bsdf.inputs["Base Color"])
        return mat

    meta, h, cls = load_world()
    res, n = meta["res"], int(meta["chunk"] / meta["res"])
    print(f"World grid {h.shape[1]} x {h.shape[0]} at {res} m, height {meta['zmin']:.0f} to {meta['zmax']:.0f} m")

    roads = prepare_roads(load_lines("highways.geojson", meta, AREA), h, meta) if (BUILD_ROADS or CARVE_ROADS) else []
    print(f"{len(roads)} streets in the area")

    if CARVE_WATER:
        for tags, line in load_lines("waterways.geojson", meta, AREA):
            xy, s = resample(line, 4.0)
            if len(xy) < 2:
                continue
            z = smooth_profile(bilinear(h, meta, xy[:, 0], xy[:, 1]), 4.0, 40.0, 0.05)
            depth = {"river": 2.5, "stream": 1.0, "canal": 1.5, "drain": 0.7, "ditch": 0.5}.get(tags.get("waterway", ""), 0.8)
            stamp(h, meta, xy, z - depth, depth * 1.5 + 1.0, depth * 4 + 3.0)
    if CARVE_ROADS:
        for rd in sorted(roads, key=lambda r: r["w"]):
            if rd["bridge"]:
                continue
            stamp(h, meta, rd["xy"], rd["z"], rd["w"] / 2 + 0.5, SHOULDER)

    terr = collection("Terrain")
    ci0 = int((AREA[0] - meta["x0"]) // meta["chunk"])
    ci1 = int((AREA[2] - meta["x0"]) // meta["chunk"])
    cj0 = int((meta["y0"] - AREA[3]) // meta["chunk"])
    cj1 = int((meta["y0"] - AREA[1]) // meta["chunk"])
    ci0, cj0 = max(ci0, 0), max(cj0, 0)
    ci1, cj1 = min(ci1, meta["cols"] // n - 1), min(cj1, meta["rows"] // n - 1)
    made = 0
    for cj in range(cj0, cj1 + 1):
        for ci in range(ci0, ci1 + 1):
            r0, c0 = cj * n, ci * n
            blk = h[r0:r0 + n + 1:STEP, c0:c0 + n + 1:STEP]
            nr, nc = blk.shape
            xs = meta["x0"] + (c0 + np.arange(nc) * STEP) * res
            ys = meta["y0"] - (r0 + np.arange(nr) * STEP) * res
            X, Y = np.meshgrid(xs, ys)
            verts = np.column_stack([X.ravel(), Y.ravel(), blk.ravel()])
            idx = np.arange(nr * nc).reshape(nr, nc)
            faces = np.column_stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()])
            # Blender winding: counter-clockwise seen from above, so reverse the row-down order
            faces = faces[:, ::-1]
            ob = make_object(f"terrain_{ci}_{cj}", verts.tolist(), faces.tolist(), terr)
            # UV 0..1 across the chunk for the ground mask
            me = ob.data
            uvl = me.uv_layers.new(name="mask_uv")
            lv = np.empty(len(me.loops), dtype=np.int32)
            me.loops.foreach_get("vertex_index", lv)
            u = (verts[lv, 0] - (meta["x0"] + c0 * res)) / meta["chunk"]
            v = (verts[lv, 1] - (meta["y0"] - (r0 + n) * res)) / meta["chunk"]
            uvl.data.foreach_set("uv", np.column_stack([u, v]).ravel())
            if cls is not None:
                palette, w = ground_weights(cls, r0, min(r0 + n, cls.shape[0]), c0, min(c0 + n, cls.shape[1]))
                img = bpy.data.images.new(f"mask_{ci}_{cj}", w.shape[1], w.shape[0], alpha=True, float_buffer=False)
                px = np.flipud(w)    # Blender images start at the bottom-left
                img.pixels.foreach_set(px.astype("float32").ravel())
                img.colorspace_settings.name = "Non-Color"
                img.alpha_mode = "CHANNEL_PACKED"
                img.pack()
                ob.data.materials.append(terrain_material(f"ground_{ci}_{cj}", img, palette))
            made += 1
    print(f"Built {made} terrain chunks")

    if BUILD_ROADS:
        rc = collection("Streets")
        paved, dirt = [], []
        for rd in roads:
            if rd["tags"].get("highway", "") in ("footway", "path", "steps", "cycleway", "pedestrian"):
                continue   # drivable ribbons only; footways stay on the map layer
            v, q = ribbon_arrays(rd, h, meta)
            (dirt if rd["unpaved"] else paved).append((v, q))

        def merge(parts):
            vs, fs, off = [], [], 0
            for v, q in parts:
                vs.append(v)
                fs.append(q + off)
                off += len(v)
            return (np.vstack(vs), np.vstack(fs)) if vs else (None, None)

        for label, parts, colr in (("streets_paved", paved, (0.08, 0.08, 0.09, 1)), ("streets_unpaved", dirt, (0.45, 0.33, 0.2, 1))):
            v, f = merge(parts)
            if v is None:
                continue
            ob = make_object(label, v.tolist(), f.tolist(), rc)
            m = bpy.data.materials.new(label)
            m.diffuse_color = colr
            m.use_nodes = True
            m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = colr
            m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.85
            ob.data.materials.append(m)
        print(f"Built {len(paved)} paved and {len(dirt)} unpaved street ribbons")
    print("Done. Check seams, road heights and ground masks, then enlarge AREA.")


if __name__ == "__main__":
    build()
