// sweeps every drivable road centreline within R of a few towns and reports colliders standing in the lane
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:4300/', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__shesha && window.__shesha.wb && window.__shesha.wb.ready, null, { timeout: 180000 });
  await p.waitForTimeout(2000); await p.keyboard.press('Enter');
  for (const [x, z] of [[-7552,-228]]) {
    await p.evaluate(([x,z]) => window.__shesha.tpRoad(x,z), [x,z]); await p.waitForTimeout(9000);
    const r = await p.evaluate(([cx,cz]) => {
      const wb = window.__shesha.wb, col = wb.collision; let n = 0, hits = 0; const ex = [];
      for (const w of wb.roadWays) { if (w.c > 6 || w.dz) continue; const q = w.p;
        for (let i = 0; i + 3 < q.length; i += 2) { const ax=q[i]/10, az=q[i+1]/10, bx=q[i+2]/10, bz=q[i+3]/10; if (Math.hypot(ax-cx, az-cz) > 600) continue;
          const L = Math.hypot(bx-ax,bz-az), m = Math.max(1, Math.ceil(L/3));
          for (let k = 0; k <= m; k++) { const x = ax+(bx-ax)*k/m, z = az+(bz-az)*k/m, y = wb.calculateRawTerrainHeight(x,z)+0.8; n++; const h = col.probe(x,z,Math.min(1.2, w.w/2-0.4),y); if (h.length) { hits++; if (ex.length<8) ex.push([Math.round(x),Math.round(z),h.join(' ')]); } } } }
      return JSON.stringify({ samples:n, blocked:hits, cut: col.cut, fix: window.__shesha.roadFix(), ex: ex.slice(0,4) });
    }, [x,z]);
    console.log(x, z, r);
  }
  await b.close();
})();
