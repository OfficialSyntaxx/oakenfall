#!/usr/bin/env node
/* Health check: play a hold for a long while and look for rot.
 *
 * The other suites assert that specific features work. This one asks whether
 * the game stays healthy when simply left running — the failures that only
 * appear after a few dozen days, which no single-feature test would catch:
 * numbers going NaN or negative, settlers stuck in one state forever, the
 * population quietly dying out, a save that doesn't survive a round trip.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8275;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.ogg':'audio/ogg', '.json':'application/json', '.webmanifest':'application/manifest+json' };

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

const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const page = await ctx.newPage();
const errors = [], warns = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') warns.push(m.text().slice(0, 160)); });

await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await page.waitForSelector('#begin-btn');
await page.click('#begin-btn');
await page.waitForTimeout(1500);
await page.click('#onboard-x').catch(() => {});
await page.click('#more-btn'); await page.click('#redeem-btn');
await page.fill('#redeem-input', 'Joy904'); await page.click('#redeem-go');
await page.waitForTimeout(400);

const snap = () => page.evaluate(() => window.__oakDebug());
async function admin(kind) {
  if (!(await page.locator(`[data-admin="${kind}"]`).count())) {
    await page.click('#decision-done', { timeout: 1000 }).catch(() => {});
    await page.click('#v-continue', { timeout: 1000 }).catch(() => {});
    await page.click('#more-btn', { timeout: 1000 }).catch(() => {});
    await page.click('#redeem-btn', { timeout: 1000 }).catch(() => {});
    await page.click('#admin-open', { timeout: 1000 }).catch(() => {});
  }
  await page.click(`[data-admin="${kind}"]`, { timeout: 1500 }).catch(() => {});
}

// Give the hold enough to actually build something, then let it run itself.
await admin('res');
await page.click('#sheet-close').catch(() => {});
await page.click('#steward-btn'); await page.waitForSelector('#steward-input');
await page.fill('#steward-input', 'build 4 houses and 2 farms and 2 forestry camps and a mining post and a granary');
await page.click('#steward-go'); await page.click('#sheet-close');

const DAYS = 40;
const history = [];
let anomalies = [];
for (let d = 0; d < DAYS; d++) {
  await admin('tDay');
  await page.waitForTimeout(260);
  const s = await snap();
  history.push(s);
  // Numbers must stay real and non-negative.
  for (const [k, v] of Object.entries(s.stockpile)) {
    if (!Number.isFinite(v)) anomalies.push(`day ${s.day}: stockpile.${k} = ${v}`);
    if (v < 0) anomalies.push(`day ${s.day}: stockpile.${k} negative (${v})`);
  }
  if (!Number.isFinite(s.coins) || s.coins < 0) anomalies.push(`day ${s.day}: coins = ${s.coins}`);
}
const last = history[history.length - 1];
console.log(`\nran ${DAYS} day-skips → day ${last.day}, ${last.villagers} settlers, ` +
  `roles ${JSON.stringify(last.roles)}, stores ${JSON.stringify(last.stockpile)}\n`);

check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
check('no console errors', warns.length === 0, warns.slice(0, 2).join(' | '));
/* The frame loop swallows exceptions on purpose, so a fault shows up here and
   nowhere else. findTC threw on every call for fourteen versions without one
   visible crash. */
check('the game swallowed no errors', last.errors.length === 0, last.errors.slice(0, 2).join(' | '));
check('no NaN or negative resources', anomalies.length === 0, anomalies.slice(0, 3).join(' | '));
check('days actually advanced', last.day >= DAYS, `day ${last.day}`);
check('the hold survived', last.villagers > 0, `${last.villagers} settlers`);
check('the hold grew', last.villagers >= history[0].villagers,
  `${history[0].villagers} → ${last.villagers}`);
check('settlers are not all idle', (last.roles.idle || 0) < last.villagers,
  JSON.stringify(last.roles));
/* Asked of the whole run, not the last frame. A five-settler hold with two
   spare hands may genuinely have only farmers standing at the moment the run
   ends — that is the AI weighing needs, not a hold stuck in one trade. Judging
   it on the final snapshot alone failed about one run in four for no reason. */
const tradesEverWorked = new Set(history.flatMap((s) => Object.keys(s.roles)).filter((r) => r !== 'idle'));
check('more than one trade is worked', tradesEverWorked.size > 1,
  `over ${DAYS} days: ${[...tradesEverWorked].join(', ')} — now ${JSON.stringify(last.roles)}`);
check('buildings still standing', last.buildings.length > 1, `${last.buildings.length}`);
check('wildlife still alive', last.critters > 0, `${last.critters} critters`);
/* The resource-fly effect is the only thing tying a gathered load to its HUD
   counter, and it lives for under a second — no screenshot catches it. Forty
   days of ordinary work is the surest place to ask whether it still fires. */
check('gathered loads still fly to the HUD', last.fx.fly > 0, `${last.fx.fly} fly effects`);

// Food economy: a hold with farms should not be starving after 40 days.
check('the hold is fed', last.stockpile.food > 0 || last.stockpile.bread > 0,
  `food ${Math.floor(last.stockpile.food)}, bread ${Math.floor(last.stockpile.bread)}`);

// --- save → reload → same hold ---
await admin('res');
await page.click('#sheet-close').catch(() => {});
await page.click('#more-btn').catch(() => {});
await page.click('#save-btn').catch(() => {});
await page.waitForTimeout(700);
const before = await snap();
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#slot-list .slot');
await page.click('#continue-btn');
await page.waitForTimeout(2200);
const after = await snap();
check('a saved hold reloads', after.villagers > 0, `${after.villagers} settlers`);
check('reload keeps the day', Math.abs(after.day - before.day) <= 1, `${before.day} → ${after.day}`);
check('reload keeps the settlers', after.villagers === before.villagers, `${before.villagers} → ${after.villagers}`);
check('reload keeps the buildings', after.buildings.length === before.buildings.length,
  `${before.buildings.length} → ${after.buildings.length}`);
check('reload keeps the map', after.terrain.grass === before.terrain.grass,
  `grass ${before.terrain.grass} → ${after.terrain.grass}`);
check('reload keeps the town centre', after.placements.some((b) => b.t === 'townCenter'));

await ctx.close();   // the soft-lock run needs the CPU to itself

/* --- the hold must never be able to lock itself out of recovery ---
 * Spending the starting timber on housing — which is exactly what the tutorial
 * tells a new player to do — used to leave every trade unavailable (each needs
 * its workplace, every workplace needs wood), every settler idle, and no path
 * back. Reachable in the first five minutes and invisible to every other suite,
 * so it gets a permanent guard here. */
const ctx2 = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const p2 = await ctx2.newPage();
await p2.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await p2.waitForSelector('#begin-btn');
await p2.click('#begin-btn');
await p2.waitForTimeout(1600);
await p2.click('#onboard-x').catch(() => {});
await p2.click('#more-btn'); await p2.click('#redeem-btn');
await p2.fill('#redeem-input', 'Joy904'); await p2.click('#redeem-go');
await p2.waitForTimeout(300);
await p2.click('#sheet-close').catch(() => {});
await p2.click('#steward-btn'); await p2.waitForSelector('#steward-input');
await p2.fill('#steward-input', 'build 2 houses');   // spends every last log
await p2.click('#steward-go'); await p2.click('#sheet-close');
await p2.waitForTimeout(9000);
// Clear the queue first: a standing build order spends each delivery the moment
// it lands, which looks exactly like wood never being gathered at all.
await p2.click('#steward-btn'); await p2.waitForSelector('#steward-input');
await p2.fill('#steward-input', 'stop'); await p2.click('#steward-go');
await p2.click('#sheet-close').catch(() => {});
const broke = await p2.evaluate(() => window.__oakDebug());
/* This is the setup, not the check: what matters is that the hold can no
   longer afford the cheapest workplace (a forestry camp, 40 wood), which is
   what makes the trap a trap. Demanding a near-zero store instead raced the
   lumberjacks — a few logs delivered between the build finishing and the
   reading failed a run that had set the trap perfectly well. */
check('spending all timber on housing leaves no workplace affordable', broke.stockpile.wood < 40,
  `wood ${Math.floor(broke.stockpile.wood)}`);
await p2.click('#speed-btn');                        // let it run
let recovered = null;
for (let i = 0; i < 10; i++) {
  await p2.waitForTimeout(10000);
  await p2.click('#decision-done', { timeout: 500 }).catch(() => {});
  const r = await p2.evaluate(() => window.__oakDebug());
  if (r.stockpile.wood >= 40) { recovered = r; break; }   // enough for a forestry camp again
}
check('settlers work by hand with no workplace standing',
  recovered !== null, recovered ? `wood back to ${Math.floor(recovered.stockpile.wood)}` : 'wood never recovered — SOFT-LOCKED');
await ctx2.close();


await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length}/${checks.length} checks FAILED` : `\nAll ${checks.length} checks PASS`);
process.exit(failed.length ? 1 : 0);
