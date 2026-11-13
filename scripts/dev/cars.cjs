const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:4300/?hq', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__shesha && window.__shesha.wb && window.__shesha.wb.ready, null, { timeout: 180000 });
  await p.waitForTimeout(2500); await p.keyboard.press('Enter'); await p.waitForTimeout(2500);
  const spot = await p.evaluate(() => { const st = window.__shesha.wb.streets; let best = null;
    for (const [k, l] of st.carCells) { if (l.length >= 4) { const c = l[0]; const d = Math.hypot(c.x + 400, c.z); if (!best || d < best.d) best = { d, x: c.x, z: c.z, n: l.length }; } } return best; });
  console.log(JSON.stringify(spot));
  await p.evaluate(([x,z]) => { const v = window.__shesha.veh, wb = window.__shesha.wb; v.position.set(x - 3.2, wb.groundHeightAt(x - 3.2, z + 2.2) + 1, z + 2.2); v.velocity.set(0,0,0); v.quaternion.setFromAxisAngle({x:0,y:1,z:0}, Math.atan2(3.2, -2.2) ); }, [spot.x, spot.z]);
  await p.waitForTimeout(9000);
  await p.addStyleTag({ content: 'app-hud, app-radar, [class*="hud"], .fixed, .absolute { opacity: 0 !important }' });
  await p.screenshot({ path: 'cars_ground.png' });
  await p.evaluate(([x,z]) => window.__shesha.top(x,z,11), [spot.x, spot.z]); await p.waitForTimeout(3000); await p.screenshot({ path: 'cars_top.png' });
  await b.close();
})();
