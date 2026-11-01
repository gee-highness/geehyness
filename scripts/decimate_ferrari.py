"""Offline: decode the Draco Ferrari, drop the hidden interior, decimate the rest, write a light GLB.
   PYTHONPATH=/tmp/pylib python3 scripts/decimate_ferrari.py"""
import re, numpy as np, trimesh, fast_simplification as fs
src = 'public/assets/models/cars/ferrari.glb'; dst = 'public/assets/models/cars/ferrari-lod.glb'
scene = trimesh.load(src)
DROP = re.compile(r'interior|leather|carpet|leds|wiper|brake|steering|carbon_fibre_trim|seat|belt|pedal|dash', re.I)
before = after = 0
for gname in list(scene.geometry.keys()):
    g = scene.geometry[gname]; before += len(g.faces)
    nodes = [n for n in scene.graph.nodes_geometry if scene.graph[n][1] == gname]
    if DROP.search(gname) or any(DROP.search(n) for n in nodes):
        for n in nodes: scene.graph.transforms.remove_node(n)
        del scene.geometry[gname]; continue
    f = len(g.faces)
    if f > 600:
        ratio = 0.16 if f > 20000 else 0.3
        v, ff = fs.simplify(np.asarray(g.vertices, np.float32), np.asarray(g.faces, np.int32), target_reduction=1 - ratio)
        m = trimesh.Trimesh(v, ff, process=False)
        try: m.visual = trimesh.visual.TextureVisuals(material=g.visual.material)
        except Exception: pass
        m.vertex_normals  # smooth normals computed and exported
        scene.geometry[gname] = m; g = m
    after += len(g.faces)
print('faces', before, '->', after)
scene.export(dst)
