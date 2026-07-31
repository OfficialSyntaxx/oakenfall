#!/usr/bin/env node
/* Frame budget: how long the game takes to think and to draw, on a phone.
 *
 * Never measured before this. The target is a phone at 60fps, which is 16.7ms
 * for everything — and the game gets only part of that, since the browser needs
 * the rest to composite and paint.
 *
 * What is measured is the time INSIDE update() and render(), sampled by
 * src/perf.ts, not the wall-clock frame delta. A headless browser does not pace
 * to a display and a loaded CI machine reports its own load, so frame deltas
 * here would be noise. The game's own work is the part we control and the part
 * that is comparable between runs.
 *
 * Two worlds are measured, because they stress different halves:
 *   · a fresh hold, zoomed in — the ordinary case, and the floor.
 *   · a grown hold at full zoom-out on a Large map — every tile the camera can
 *     see, every settler, every critter. This is the frame that decides whether
 *     a mid-range phone stays smooth in the late game.
 *
 * The thresholds are deliberately generous: this runs in CI on shared hardware
 * and is meant to catch a REGRESSION — a change that doubles the cost of a
 * frame — not to certify a device. A real phone number needs a real phone.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8309;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.ogg':'audio/ogg', '.json':'application/json', '.webmanifest':'application/manifest+json' };

/* A frame's worth of game work. Chosen so a doubling fails and normal variance
   between CI runs does not. The render budget is larger than update because
   drawing an isometric world is genuinely the expensive half. */
const BUDGET = {
  fresh:  { update: 4, render: 20 },
  grown:  { update: 4, render: 14 },
  /* The terrain pass at full zoom-out, which is what the detail-LOD in
     drawTerrain exists to hold down. Before it: 5.4ms p50 here, 62% of the whole
     render. After: 2.3ms p50, stable across runs.
     Judged on p50, not p95 — on shared CI hardware this pass's p95 swung between
     2.7 and 4.2ms run to run while its p50 did not move at all, and a threshold
     that close to the noise floor fails for reasons that have nothing to do with
     the code. 4ms sits clearly between the two states. */
  terrainZoomedOut: 4,
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await page.waitForSelector('#begin-btn');
// Large map: the worst case for anything that iterates the world.
await page.click('[data-group="mapSize"] [data-val="46"]');
await page.click('#begin-btn');
await page.waitForTimeout(2500);
await page.click('#onboard-x').catch(() => {});

const snap = () => page.evaluate(() => window.__oakDebug());

/** Sample for `ms`, with the timing ring cleared first so nothing from the
 *  previous phase leaks in. */
async function measure(ms) {
  await page.evaluate(() => { window.__oakPerf(false); window.__oakPerf(true); });
  await page.waitForTimeout(ms);
  const perf = (await snap()).perf;
  return perf;
}

const show = (label, p) =>
  `${label} p50 ${p.p50}ms · p95 ${p.p95}ms · worst ${p.worst}ms (${p.n} frames)`;

// ---- the ordinary case ----
const fresh = await measure(4000);
console.log('\nfresh hold, default zoom');
console.log('  ' + show('update', fresh.update));
console.log('  ' + show('render', fresh.render));
check('a fresh hold thinks within budget', fresh.update.p95 <= BUDGET.fresh.update,
  `p95 ${fresh.update.p95}ms vs ${BUDGET.fresh.update}ms`);
check('a fresh hold draws within budget', fresh.render.p95 <= BUDGET.fresh.render,
  `p95 ${fresh.render.p95}ms vs ${BUDGET.fresh.render}ms`);
check('sampling actually ran', fresh.render.n > 30, `${fresh.render.n} frames sampled`);

// ---- grow the hold ----
// Admin grants reach a late-game world in seconds; playing there would take an
// hour. Every grant goes through the game's own code paths.
await page.click('#more-btn'); await page.click('#redeem-btn');
await page.fill('#redeem-input', 'Joy904'); await page.click('#redeem-go');
await page.waitForTimeout(500);
const admin = async (kind) => {
  const t = page.locator(`[data-admin="${kind}"]`);
  if (!(await t.isVisible().catch(() => false))) {
    for (const sel of ['#decision-done', '#v-continue', '#sheet-close', '#more-btn', '#redeem-btn', '#admin-open']) {
      await page.click(sel, { timeout: 700 }).catch(() => {});
    }
  }
  await t.click({ timeout: 2500 });
  await page.waitForTimeout(150);
};
await admin('res');
for (let i = 0; i < 8; i++) await admin('settlers');   // 40 settlers
await page.click('#sheet-close').catch(() => {});

// Let them build, and let the wildlife re-seed across a season turn.
await page.click('#steward-btn').catch(() => {});
await page.waitForSelector('#steward-input', { timeout: 3000 }).catch(() => {});
await page.fill('#steward-input', 'build 12 houses').catch(() => {});
await page.click('#steward-go').catch(() => {});
await page.click('#sheet-close').catch(() => {});
await page.waitForTimeout(20000);

// Zoom all the way out, so the camera can see the whole island at once.
const cdp = await ctx.newCDPSession(page);
const spread = (d) => ([{ x: 195 - d, y: 430, id: 0 }, { x: 195 + d, y: 430, id: 1 }]);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: spread(160) });
for (let d = 150; d >= 20; d -= 20) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: spread(d) });
  await page.waitForTimeout(40);
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(600);

const world = await snap();
console.log(`\ngrown hold: ${world.villagers} settlers · ${world.buildings.length} buildings · ` +
            `${world.critters} critters · zoom ${world.zoom}`);
check('the hold actually grew', world.villagers >= 20 && world.buildings.length >= 8,
  `${world.villagers} settlers, ${world.buildings.length} buildings`);
// The whole point of the Large map is that it is large; a silent fall back to
// the default would quietly measure a third less world.
check('the run is on a Large map at full zoom-out',
  world.terrain && Object.values(world.terrain).reduce((a, b) => a + b, 0) >= 46 * 46 && world.zoom <= 0.5,
  `${world.terrain ? Object.values(world.terrain).reduce((a, b) => a + b, 0) : 0} tiles, zoom ${world.zoom}`);

const grown = await measure(5000);
console.log('  ' + show('update', grown.update));
console.log('  ' + show('render', grown.render));
console.log('  ' + show('frame ', grown.frame));
for (const k of Object.keys(grown).filter((k) => k.startsWith('r.')).sort()) {
  console.log('     ' + show(k.padEnd(11), grown[k]));
}
check('a grown hold thinks within budget', grown.update.p95 <= BUDGET.grown.update,
  `p95 ${grown.update.p95}ms vs ${BUDGET.grown.update}ms`);
check('a grown hold draws within budget', grown.render.p95 <= BUDGET.grown.render,
  `p95 ${grown.render.p95}ms vs ${BUDGET.grown.render}ms`);
/* A hitch is what a player actually notices. Three budgets' worth in one frame
   is a stall, not a slow frame. */
check('no single frame stalls the hold', grown.frame.worst <= BUDGET.grown.render * 3,
  `worst frame ${grown.frame.worst}ms`);
/* Terrain is the single most expensive thing the game draws, and the whole map
   is visible at this zoom. If this regresses, the frame regresses with it. */
check('drawing the whole island stays cheap at full zoom-out',
  grown['r.terrain'] && grown['r.terrain'].p50 <= BUDGET.terrainZoomedOut,
  grown['r.terrain'] ? `terrain p50 ${grown['r.terrain'].p50}ms vs ${BUDGET.terrainZoomedOut}ms` : 'not sampled');

const swallowed = (await snap()).errors;
check('the game swallowed no errors', swallowed.length === 0, swallowed.slice(0, 2).join(' | '));
check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${failed.length ? `${failed.length}/${checks.length} checks FAILED` : `All ${checks.length} checks PASS`}`);
process.exit(failed.length ? 1 : 0);
