#!/usr/bin/env node
/* Steward's Word tests.
 *
 * The command console is the game's signature feature and the easiest thing to
 * ship broken, because a parser that misreads you still "works". These drive
 * the real console in the real game and check what the hold actually does.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8248;
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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await page.waitForSelector('#begin-btn');
await page.click('#begin-btn');
await page.waitForTimeout(1500);

// Unlock the admin panel so we can grant materials — this test is about the
// steward's understanding, not about waiting out an economy.
await page.click('#more-btn');
await page.click('#redeem-btn');
await page.fill('#redeem-input', 'Joy904');
await page.click('#redeem-go');
await page.waitForTimeout(400);

const snap = () => page.evaluate(() => window.__oakDebug());
async function grant() {
  if (!(await page.locator('[data-admin="res"]').count())) {
    await page.click('#decision-done', { timeout: 1200 }).catch(() => {});
    await page.click('#more-btn', { timeout: 1200 }).catch(() => {});
    await page.click('#redeem-btn', { timeout: 1200 }).catch(() => {});
    await page.click('#admin-open', { timeout: 1200 }).catch(() => {});
  }
  await page.click('[data-admin="res"]', { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(150);
}
async function order(text) {
  await page.click('#decision-done', { timeout: 1000 }).catch(() => {});
  await page.click('#steward-btn');
  await page.waitForSelector('#steward-input', { timeout: 3000 });
  await page.fill('#steward-input', text);
  await page.click('#steward-go');
  await page.waitForTimeout(250);
  const msg = (await page.locator('#steward-msg').textContent()) || '';
  const queue = await page.locator('#steward-orders .inbox-row').count();
  await page.click('#sheet-close').catch(() => {});
  return { msg: msg.trim(), queue };
}
const countOf = async (type) => (await snap()).buildings.filter((b) => b === type).length;

await grant();

// --- One sentence, several orders.
const multi = await order('build 2 farms and put 3 to mining');
check('a compound order is understood as two', multi.queue === 2, `${multi.queue} queued — "${multi.msg}"`);
await page.waitForTimeout(4500);
const afterMulti = await snap();
check('both halves of a compound order are carried out',
  afterMulti.buildings.filter((b) => b === 'farm').length >= 2 && (afterMulti.roles.miner || 0) >= 1,
  `${afterMulti.buildings.filter((b) => b === 'farm').length} farms, roles ${JSON.stringify(afterMulti.roles)}`);

// --- A workplace should land where its work is, not merely where there is room.
await order('build a forestry camp');
await page.waitForTimeout(3000);
const near = await page.evaluate(() => {
  const g = window.__oakGrid();
  const camp = window.__oakDebug().placements.filter((b) => b.t === 'forestCamp').pop();
  if (!camp) return null;
  let trees = 0;
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
    const row = g[camp.gy + y];
    // 'f' plain forest, 'F' forest in the wilds — both are trees to fell.
    if (row && (row[camp.gx + x] === 'f' || row[camp.gx + x] === 'F')) trees++;
  }
  return { trees, camp };
});
check('a forestry camp is sited at the treeline', near && near.trees > 0,
  near ? `${near.trees} forest tiles within two of ${near.camp.gx},${near.camp.gy}` : 'no camp raised');

// --- Staffing when nobody is idle: the point of asking.
const before = await snap();
const idleBefore = before.roles.idle || 0;
const guard = await order('put 2 to guarding');
await page.waitForTimeout(2500);
const afterGuard = await snap();
check('a trade can be staffed with no idle hands left',
  (afterGuard.roles.guard || 0) >= 1,
  `idle was ${idleBefore}; roles now ${JSON.stringify(afterGuard.roles)}`);

// --- Tearing down must not build.
await grant();
await order('build a palisade');
await page.waitForTimeout(2500);
const palisades = await countOf('palisade');
const dem = await order('tear down a palisade');
await page.waitForTimeout(2500);
const after = await countOf('palisade');
check('"tear down" removes rather than raises', after < palisades,
  `${palisades} -> ${after} — "${dem.msg}"`);

// --- Questions answer instead of queueing work.
const ask = await order('how much wood do we have');
check('a question is answered', /\d+ wood/.test(ask.msg), ask.msg);
const qBefore = ask.queue;
const help = await order('help');
check('help explains itself', /build 3 houses/.test(help.msg), help.msg.slice(0, 60));
check('questions queue no orders', help.queue === qBefore, `${qBefore} -> ${help.queue}`);

// --- Mending spends wood on the worn, not on the whole.
await order('stop');   // clear the queue so the mend order is the one being watched
if (!(await page.locator('[data-admin="decay"]').count())) {
  await page.click('#more-btn').catch(() => {});
  await page.click('#redeem-btn').catch(() => {});
  await page.click('#admin-open').catch(() => {});
}
await page.click('[data-admin="decay"]', { timeout: 2000 });
await page.waitForTimeout(200);
const wornBefore = (await snap()).worn;
await grant();
const mend = await order('mend the hold');
await page.waitForTimeout(6000);
const worn = (await snap()).worn;
check('the hold can be worn down for the test', wornBefore > 0, `${wornBefore} worn`);
check('mending repairs worn buildings', worn < wornBefore, `${wornBefore} -> ${worn} worn — "${mend.msg}"`);

// --- A blocked order must not deadlock the queue behind it.
await order('stop');
const blocked = await order('build 40 manors and build a well');
check('a long order queues behind nothing', blocked.queue === 2, `${blocked.queue} queued`);
await page.waitForTimeout(25000);
const wells = await countOf('well');
const manors = await countOf('manor');
check('a stalled order rotates and lets the next one run', wells > 0,
  `${wells} wells raised while ${manors} manors waited on stone`);

/* --- Standing orders: a RULE, not a task.
   The distinction is the whole feature — a one-shot gather finishes and is
   forgotten, a standing order is finished only when repealed. */
await order('stop');
const keep = await order('always keep 40 food');
check('a standing order is accepted', /standing order/i.test(keep.msg) && /40 food/.test(keep.msg), keep.msg);

const keptState = await page.evaluate(() => window.__oakDebug().standing);
check('the standing order is recorded in the hold',
  Array.isArray(keptState) && keptState.some((r) => r.res === 'food' && r.target === 40),
  JSON.stringify(keptState));

// Re-stating it REPLACES rather than stacking.
const keep2 = await order('always keep 60 food');
const keptState2 = await page.evaluate(() => window.__oakDebug().standing);
check('restating a standing order replaces it', keptState2.length === 1 && keptState2[0].target === 60,
  JSON.stringify(keptState2) + ' — "' + keep2.msg + '"');

// A number past 50 is a slip in "build 200 houses" and an ordinary granary here.
await order('always keep 200 food');
const bigTarget = await page.evaluate(() => window.__oakDebug().standing);
check('a standing order accepts a number past the build ceiling',
  bigTarget[0] && bigTarget[0].target > 50, JSON.stringify(bigTarget));

// "stop" clears the queue but must NOT silently repeal the rules.
await order('build 2 houses');
const stopped = await order('stop');
const afterStop = await page.evaluate(() => window.__oakDebug().standing);
check('"stop" clears orders but keeps standing rules', afterStop.length === 1,
  `${afterStop.length} rule(s) — "${stopped.msg}"`);
check('and says the rules still hold', /still hold/i.test(stopped.msg), stopped.msg.slice(0, 80));

/* The rule has to DO something. A rule can only act if there is somewhere to
   work from, so raise the camp first — otherwise the steward correctly records
   the rule as blocked and the assertion tests nothing. */
await order('build 1 forestry camp');
await page.waitForTimeout(2500);
const hasCamp = (await snap()).buildings.includes('forestCamp');
check('a forestry camp exists for the rule to work from', hasCamp, 'no forestCamp raised');
await order('stop');
// Aim just above what the hold actually holds, so a gather is genuinely due.
const haveWood = Math.floor((await snap()).stockpile.wood || 0);
await order(`always keep ${haveWood + 20} wood`);
if (!(await page.locator('[data-admin="tDay"]').count())) {
  await page.click('#more-btn').catch(() => {});
  await page.click('#redeem-btn').catch(() => {});
  await page.click('#admin-open').catch(() => {});
}
await page.click('[data-admin="tDay"]', { timeout: 2000 }).catch(() => {});
await page.waitForTimeout(1600);
await page.click('#sheet-close').catch(() => {});
const selfQueued = await page.evaluate(() => window.__oakDebug().orders);
check('a standing order re-supplies the hold without being asked again',
  selfQueued.includes('gather'), `wood ${haveWood}, target ${haveWood + 20}, queue: ${JSON.stringify(selfQueued)}`);
await order('stop keeping wood');
await order('stop');

const repealed = await order('stop keeping food');
const afterRepeal = await page.evaluate(() => window.__oakDebug().standing);
check('a standing order can be repealed by name', afterRepeal.length === 0, repealed.msg);

// A rule the hold could never keep must be refused at the point of asking.
const crafted = await order('always keep 40 planks');
check('a standing order for a crafted good is refused with the reason',
  /crafted at a workshop/i.test(crafted.msg), crafted.msg.slice(0, 90));

// --- "Why is nothing happening?" — the queue always knew and never said.
await order('stop');
const why0 = await order('why');
check('"why" with nothing ordered says so', /nothing is stuck/i.test(why0.msg), why0.msg.slice(0, 60));

/* A GUARANTEED blockage: empty the crafted stores, then order a manor (which
   wants planks). The order can neither proceed nor be dropped. */
if (!(await page.locator('[data-admin="craftClear"]').count())) {
  await page.click('#more-btn').catch(() => {});
  await page.click('#redeem-btn').catch(() => {});
  await page.click('#admin-open').catch(() => {});
}
await page.click('[data-admin="craftClear"]', { timeout: 2000 }).catch(() => {});
await page.click('#sheet-close').catch(() => {});
await page.waitForTimeout(200);
await order('build 1 manor');
await page.waitForTimeout(1500);
const why1 = await order('why');
check('"why" names what an order is waiting on',
  /waiting on \d+ more planks|no room near the hold/i.test(why1.msg), why1.msg.slice(0, 110));
await order('stop');

// --- Who is standing about?
const idle = await order('who is idle');
check('the steward can name idle hands', /idle|at work/i.test(idle.msg), idle.msg.slice(0, 70));

// --- Cancelling.
const cancelled = await order('stop');
check('cancelling clears the queue', cancelled.queue === 0, cancelled.msg);

// --- Gibberish is refused, not silently swallowed.
const huh = await order('asdfgh qwerty');
check('nonsense is refused plainly', /did not catch/.test(huh.msg), huh.msg.slice(0, 50));

check('no uncaught errors', errors.length === 0, errors[0] || '');
await ctx.close();
await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length}/${checks.length} checks FAILED` : `\nAll ${checks.length} checks PASS`);
process.exit(failed.length ? 1 : 0);
