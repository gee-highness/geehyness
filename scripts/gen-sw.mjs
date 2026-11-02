// Post-build: emit sw.js that precaches every built file so the PWA works fully offline.
import {readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {createHash} from 'node:crypto';
const dir = 'dist/app/browser';
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : files.push('/' + relative(dir, p).split('\\').join('/'));
  }
})(dir);
const list = files.filter((f) => f !== '/sw.js' && f !== '/index.csr.html' && f !== '/index.html');
list.push('/');
const ver = createHash('sha1').update(files.join() + Date.now()).digest('hex').slice(0, 10);
writeFileSync(join(dir, 'sw.js'), `const C='shesha-${ver}';
const URLS=${JSON.stringify(list)};
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(C);
for(let i=0;i<URLS.length;i+=8)await Promise.all(URLS.slice(i,i+8).map(u=>c.add(u).catch(()=>{})));
self.skipWaiting();})());});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
const u=new URL(e.request.url);if(u.origin!==location.origin)return;
e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||(e.request.mode==='navigate'?caches.match('/'):null)||fetch(e.request)));});
`);
console.log(`sw.js: ${list.length} files precached, version ${ver}`);
