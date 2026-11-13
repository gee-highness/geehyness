// usage: node shot.js name:x:z[:top h] ...
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,200)); });
  await p.goto('http://localhost:4300/' + (process.env.Q||''), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__shesha && window.__shesha.wb && window.__shesha.wb.ready, null, { timeout: 180000 });
  await p.waitForTimeout(3000); await p.keyboard.press('Enter'); await p.waitForTimeout(3000);
  for (const a of process.argv.slice(2)) {
    const [name, x, z, top] = a.split(':');
    if (top) await p.evaluate(([x,z,h]) => window.__shesha.top(x,z,h), [+x,+z,+top]);
    else console.log(name, await p.evaluate(([x,z]) => JSON.stringify(window.__shesha.tpRoad(x,z)), [+x,+z]));
    await p.waitForTimeout(+(process.env.W||9000));
    if (process.env.HIDE) await p.addStyleTag({ content: 'app-hud,app-radar,.hud,[class*=hud]{display:none!important}' });
    await p.screenshot({ path: name + '.png' });
  }
  console.log(await p.evaluate(() => JSON.stringify(window.__shesha.info ? window.__shesha.info() : {})));
  await b.close();
})();
