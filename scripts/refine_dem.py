"""Refine the DEM using OSM so buildings, vegetation and roads agree with the heightmap.
Usage: python3 -I scripts/refine_dem.py <osm_dir> <osm2_dir> <dem_in.json> <dem_out.json> [report.json] [ndsm.png]
Needs numpy, scipy, Pillow.

GLO-30 is a surface model (DSM): rooftops and canopy are baked into the ground. At 30 m it cannot see roads
or kerbs, so pavements/roads are NOT detected from height; the OSM road network is the authority there.
Steps (all on the game's 40 m grid):
 1. nDSM = DSM - estimated bare ground (grey opening). Big positive blobs = buildings/trees.
 2. Where OSM confirms a building or vegetation, replace the DSM with the estimated ground (removes the roof/canopy bias).
 3. Blobs OSM does NOT explain are written to the report as candidate unmapped structures.
 4. Road-conform: sample the ground along each at-grade road, smooth the profile, clamp the grade, pull nearby nodes onto it.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import grey_opening, uniform_filter, gaussian_filter, label, map_coordinates, binary_dilation, find_objects

osm_dir, dir2, src, dst = sys.argv[1:5]
rep_path = sys.argv[5] if len(sys.argv) > 5 else None
png_path = sys.argv[6] if len(sys.argv) > 6 else None
LAT0, LON0 = -26.4966, 31.3826
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110574.0
P = lambda lat, lon: ((lon - LON0) * KX, -(lat - LAT0) * KZ)
dem = json.load(open(src)); S, nx, nz, x0, z0 = dem["step"], dem["nx"], dem["nz"], dem["x0"], dem["z0"]
H = np.array(dem["h"], np.float64).reshape(nz, nx); H0 = H.copy()
def els(d, n):
    f = f"{d}/{n}.json"; return json.load(open(f))["elements"] if os.path.exists(f) else []
def poly(e): return [P(g["lat"], g["lon"]) for g in e.get("geometry", [])]

# ---- coverage rasters at 10 m, reduced to the 40 m grid
R = 10; k = S // R
def raster():  # 10 m raster covering the grid
    return Image.new("L", (nx * k, nz * k), 0)
def draw(img, pts, fill=255):
    ImageDraw.Draw(img).polygon([((x - x0) / R, (z - z0) / R) for x, z in pts], fill=fill)
bimg, vimg = raster(), raster()
import glob
for f in glob.glob(f"{osm_dir}/bld_*.json") + glob.glob(f"{dir2}/bld_*.json"):
    for e in json.load(open(f))["elements"]:
        if e["type"] == "way" and len(e.get("geometry", [])) > 3: draw(bimg, poly(e))
for e in els(osm_dir, "roads"):
    t = e.get("tags", {})
    if e["type"] == "way" and "highway" not in t and len(e.get("geometry", [])) > 3 and (t.get("natural") in ("wood", "scrub") or t.get("landuse") in ("forest", "orchard", "vineyard", "plant_nursery")):
        draw(vimg, poly(e))
for e in els(dir2, "trees"):
    if e.get("type") == "node":
        x, z = P(e["lat"], e["lon"]); ImageDraw.Draw(vimg).ellipse([((x - x0) / R) - 2, ((z - z0) / R) - 2, ((x - x0) / R) + 2, ((z - z0) / R) + 2], fill=255)
cov = lambda im: np.asarray(im, np.float64).reshape(nz, k, nx, k).mean(axis=(1, 3)) / 255
B, V = cov(bimg), cov(vimg)

# ---- 1. nDSM
ow = max(3, int(round(120 / S)) | 1)
ground = grey_opening(H, size=(ow, ow)); ground = gaussian_filter(ground, 28.0 / S)
ground = np.clip(ground, H - 8.0, H)   # a roof/canopy is never taller than 8 m here; stops slopes being mistaken for objects
nd = H - ground
slope = np.hypot(*np.gradient(H, S))
# ---- 2. fix biases confirmed by OSM
Bn = uniform_filter(B, ow) > 0.04; Vn = uniform_filter(V, ow) > 0.15
fix = (nd > 1.5) & (Bn | Vn) & (slope < 0.35)
H[fix] = ground[fix]
# ---- 3. unexplained blobs
cand = (nd > 3.0) & ~binary_dilation(Bn | Vn, iterations=max(2, 80 // S))
lab, m = label(cand); cands = []
for i, sl in enumerate(find_objects(lab), 1):
    mask = lab[sl] == i
    if mask.sum() * S * S < 3200: continue
    jj, ii = np.nonzero(mask); jj += sl[0].start; ii += sl[1].start
    cands.append({"x": round(float(x0 + ii.mean() * S)), "z": round(float(z0 + jj.mean() * S)), "cells": int(mask.sum()), "height_m": round(float(nd[jj, ii].max()), 1)})
cands.sort(key=lambda c: -c["cells"] * c["height_m"])

# ---- 4. road conform
def sample(x, z):
    return map_coordinates(H, [(np.asarray(z) - z0) / S, (np.asarray(x) - x0) / S], order=1, mode="nearest")
tw = np.zeros_like(H); th = np.zeros_like(H); tm = np.zeros_like(H); nroads = 0
FE = max(18.0, 0.9 * S)   # shoulder feather, metres
GRADE = {0: .07, 1: .09, 2: .10, 3: .11, 4: .12, 5: .14, 6: .16}
def _inb(e):
    return any(x0 <= P(q["lat"], q["lon"])[0] <= x0 + (nx - 1) * S and z0 <= P(q["lat"], q["lon"])[1] <= z0 + (nz - 1) * S for q in e.get("geometry", [])[::4])
for e in els(osm_dir, "roads"):
    t = e.get("tags", {}); hw = t.get("highway")
    if not _inb(e): continue
    if e["type"] != "way" or not hw or t.get("bridge") or t.get("tunnel") or t.get("layer") not in (None, "0"): continue
    c = {"motorway": 0, "trunk": 1, "primary": 2, "secondary": 3, "tertiary": 4, "residential": 5, "unclassified": 5, "living_street": 5, "service": 6}.get(hw.replace("_link", ""))
    if c is None: continue
    g = np.array(poly(e)); 
    if len(g) < 2: continue
    seg = np.hypot(*np.diff(g, axis=0).T); L = seg.sum()
    if L < 20: continue
    s = np.concatenate([[0], np.cumsum(seg)]); d = np.arange(0, L + 1e-6, 5.0)
    px, pz = np.interp(d, s, g[:, 0]), np.interp(d, s, g[:, 1])
    inside = (px > x0) & (px < x0 + (nx - 1) * S) & (pz > z0) & (pz < z0 + (nz - 1) * S)
    if inside.sum() < 3: continue
    h = sample(px, pz)
    w = max(3, int(round(90 / 5)) | 1); hp = np.pad(h, w // 2, mode="edge"); h = np.convolve(hp, np.ones(w) / w, mode="valid")  # 120 m running mean
    mg = GRADE[c] * 5                                                                                              # grade clamp, both directions
    for _ in range(2):
        for i in range(1, len(h)): h[i] = min(max(h[i], h[i - 1] - mg), h[i - 1] + mg)
        for i in range(len(h) - 2, -1, -1): h[i] = min(max(h[i], h[i + 1] - mg), h[i + 1] + mg)
    hw_ = {0: 9, 1: 5, 2: 5, 3: 5, 4: 4.5, 5: 4, 6: 3}[c]
    # splat onto nodes within the corridor
    for X, Z, Hh, ok in zip(px, pz, h, inside):
        if not ok: continue
        R_ = hw_ + 3 + FE; i0, i1 = int((X - R_ - x0) // S) + 1, int((X + R_ - x0) // S); j0, j1 = int((Z - R_ - z0) // S) + 1, int((Z + R_ - z0) // S)
        for j in range(max(0, j0), min(nz - 1, j1) + 1):
            for i in range(max(0, i0), min(nx - 1, i1) + 1):
                dd = math.hypot(x0 + i * S - X, z0 + j * S - Z)
                wt = 1.0 if dd <= hw_ + 3 else max(0.0, 1 - (dd - hw_ - 3) / FE)
                wt = wt * wt * (3 - 2 * wt)
                if wt > 0: tw[j, i] += wt * wt * (8 - c); th[j, i] += wt * wt * (8 - c) * Hh; tm[j, i] = max(tm[j, i], wt)
    nroads += 1
m_ = tw > 0
blend = tm[m_]; tgt = np.clip(th[m_] / tw[m_], H[m_] - 6, H[m_] + 6)   # never drag the surface more than 6 m: trust the DEM on cliffs/escarpments
H[m_] = H[m_] * (1 - blend) + tgt * blend

# ---- output
dem["h"] = [round(float(v), 1) for v in H.ravel()]; json.dump(dem, open(dst, "w"))
D = H - H0
rep = {"cells": int(H.size), "building_or_canopy_cells_corrected": int(fix.sum()), "mean_drop_m_on_corrected": round(float((H0 - H)[fix].mean()), 2) if fix.any() else 0,
       "roads_conformed": nroads, "nodes_pulled_to_roads": int(m_.sum()), "rms_change_m": round(float(np.sqrt((D ** 2).mean())), 2), "max_change_m": round(float(abs(D).max()), 1),
       "unmapped_structure_candidates": len(cands), "top_candidates": cands[:60]}
print({k_: v for k_, v in rep.items() if k_ != "top_candidates"})
if rep_path: json.dump(rep, open(rep_path, "w"), indent=1)
if png_path:
    a = np.clip(nd / 12, 0, 1); rgb = np.stack([a, a * 0.8, a * 0.5], -1)
    rgb[B > 0.04] = [0.2, 0.5, 1.0]; rgb[V > 0.15] = [0.1, 0.6, 0.2]
    Image.fromarray((rgb * 255).astype(np.uint8)).save(png_path)
