#!/usr/bin/env python3
"""Image index for the whole playable rectangle (positions only, no pixels): [lon, lat, compass, capture_year, sequence_idx, pano].
   MAPILLARY_TOKEN=... python3 -I scripts/fetch_mapillary_images.py data/mapillary_images.json   (resumable; 4 threads; Mapillary data CC BY-SA 4.0)"""
import json, os, sys, time, threading, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
TOKEN = os.environ["MAPILLARY_TOKEN"]; OUT = sys.argv[1]; SPOOL = OUT + ".jsonl"
W, E, S, N = 31.096, 31.454, -26.542, -26.278; STEP = 0.008
done = set(); lock = threading.Lock()
if os.path.exists(SPOOL + ".done"): done = set(open(SPOOL + ".done").read().split())
out = open(SPOOL, "a"); dn = open(SPOOL + ".done", "a")
def fetch(w, s, e, n, depth=0):
    q = urllib.parse.urlencode({"access_token": TOKEN, "bbox": f"{w:.5f},{s:.5f},{e:.5f},{n:.5f}", "fields": "id,captured_at,compass_angle,geometry,is_pano,sequence", "limit": 2000})
    j = None
    for a in range(5):
        try: j = json.load(urllib.request.urlopen(urllib.request.Request("https://graph.mapillary.com/images?" + q, headers={"User-Agent": "Mozilla/5.0"}), timeout=90)); break
        except Exception: time.sleep(2 * (a + 1))
    if j is None: return False
    d = j.get("data", [])
    if len(d) >= 2000 and depth < 4:
        mw, mn = (w + e) / 2, (s + n) / 2
        return all([fetch(a, b, c, dd, depth + 1) for a, b, c, dd in ((w, s, mw, mn), (mw, s, e, mn), (w, mn, mw, n), (mw, mn, e, n))])
    with lock:
        for f in d:
            lon, lat = f["geometry"]["coordinates"]
            out.write(json.dumps([f["id"], round(lon, 6), round(lat, 6), round(f.get("compass_angle", -1)), f.get("captured_at", 0) // 31557600000 + 1970, f.get("sequence", ""), 1 if f.get("is_pano") else 0], separators=(",", ":")) + "\n")
        out.flush()
    return True
def job(t):
    w, s = t; k = f"{w:.4f},{s:.4f}"
    if k in done: return
    if fetch(w, s, min(w + STEP, E), min(s + STEP, N)):
        with lock: dn.write(k + "\n"); dn.flush()
tiles = [(W + i * STEP, S + j * STEP) for i in range(int((E - W) / STEP) + 1) for j in range(int((N - S) / STEP) + 1)]
print("tiles", len(tiles), "already done", len(done), flush=True)
with ThreadPoolExecutor(4) as ex:
    for i, _ in enumerate(ex.map(job, tiles)):
        if i % 50 == 0: print("tile", i, flush=True)
seen, rows, seqs = set(), [], {}
for line in open(SPOOL):
    r = json.loads(line)
    if r[0] in seen: continue
    seen.add(r[0]); si = seqs.setdefault(r[5], len(seqs)); rows.append([r[1], r[2], r[3], r[4], si, r[6]])
json.dump({"source": "Mapillary images index, CC BY-SA 4.0", "cols": "lon,lat,compass,year,seq,pano", "n": len(rows), "images": rows}, open(OUT, "w"), separators=(",", ":"))
print("done", len(rows), "images in", len(seqs), "sequences")
