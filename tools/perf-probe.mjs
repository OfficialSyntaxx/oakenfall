#!/usr/bin/env node
/* Where does a frame actually go?
 *
 * The architecture question ("do we need an ECS / behaviour trees?") is only
 * answerable with numbers. This loads a busy hold, samples the JS profiler for
 * a few seconds, and prints the heaviest functions by self time.
 */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const SITE=path.resolve(import.meta.dirname,'..','_site'); const PORT=8270;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ogg':'audio/ogg','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]); if(p.endsWith('/'))p+='index.html'; const f=path.join(SITE,p); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();} r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(r);});
await new Promise(r=>server.listen(PORT,r));
const CHROME=['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p=>fs.existsSync(p));
const b=await chromium.launch(CHROME?{executablePath:CHROME}:{});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const page=await ctx.newPage();
await page.goto(`http://127.0.0.1:${PORT}/game/`,{waitUntil:'load'});
await page.waitForSelector('#begin-btn');
await page.click('.diff-opts[data-group="mapSize"] button[data-val="46"]');   // large map
await page.click('#begin-btn'); await page.waitForTimeout(1500);
await page.click('#onboard-x').catch(()=>{});
// Load the hold up: settlers, buildings, wildlife.
await page.click('#more-btn'); await page.click('#redeem-btn');
await page.fill('#redeem-input','Joy904'); await page.click('#redeem-go'); await page.waitForTimeout(400);
for(let i=0;i<6;i++){ await page.click('[data-admin="settlers"]').catch(()=>{}); }
await page.click('[data-admin="maxout"]').catch(()=>{});
await page.click('#sheet-close').catch(()=>{});
await page.click('#steward-btn'); await page.waitForSelector('#steward-input');
await page.fill('#steward-input','build 12 houses and 4 farms and 3 forestry camps and 3 mining posts');
await page.click('#steward-go'); await page.click('#sheet-close');
await page.waitForTimeout(30000);
const snap = await page.evaluate(()=>window.__oakDebug());
console.log(`hold: ${snap.villagers} settlers, ${snap.buildings.length} buildings, ${snap.critters} critters, ${snap.day} days`);

// --- frame rate ---
const fps = await page.evaluate(()=>new Promise(res=>{
  let n=0; const t0=performance.now();
  const tick=()=>{ n++; if(performance.now()-t0 < 4000) requestAnimationFrame(tick); else res(n/((performance.now()-t0)/1000)); };
  requestAnimationFrame(tick);
}));
console.log(`fps: ${fps.toFixed(1)}`);

// --- profiler ---
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
await page.waitForTimeout(5000);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map();
const byId = new Map(profile.nodes.map(n=>[n.id,n]));
const total = profile.samples.length;
for(const id of profile.samples){
  const n = byId.get(id); if(!n) continue;
  const f = n.callFrame;
  const key = (f.functionName || '(anonymous)') + (f.url.includes('bundle') ? '' : ' ['+(f.url.split('/').pop()||'native')+']');
  self.set(key, (self.get(key)||0)+1);
}
console.log('\ntop self time (% of samples):');
[...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,14)
  .forEach(([k,v])=>console.log(`  ${(v/total*100).toFixed(1).padStart(5)}%  ${k}`));
await ctx.close(); await b.close(); server.close();
