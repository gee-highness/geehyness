"""Second decimation pass for phones: ferrari-lod.glb -> ferrari-lod.glb (in place; run once, original lod kept in git history).
   PYTHONPATH=/tmp/pylib python3 scripts/decimate_ferrari_mobile.py   (pip install --target /tmp/pylib trimesh fast-simplification pygltflib)"""
import numpy as np, trimesh, fast_simplification as fs
p = 'public/assets/models/cars/ferrari-lod.glb'
scene = trimesh.load(p); before = after = 0
for name in list(scene.geometry.keys()):
    g = scene.geometry[name]; f = len(g.faces); before += f; keep = 1.0
    if f > 12000: keep = 0.5
    elif 'wheel' in name.lower() and f > 1500: keep = 0.3
    elif f > 3000: keep = 0.5
    elif f > 800: keep = 0.65
    if keep < 1:
        v, ff = fs.simplify(np.asarray(g.vertices, np.float32), np.asarray(g.faces, np.int32), target_reduction=1 - keep)
        m = trimesh.Trimesh(v, ff, process=False)
        try: m.visual = trimesh.visual.TextureVisuals(material=g.visual.material)
        except Exception: pass
        m.vertex_normals; scene.geometry[name] = m; g = m
    after += len(g.faces)
print('faces', before, '->', after); scene.export(p)
