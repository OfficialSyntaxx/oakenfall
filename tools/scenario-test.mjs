#!/usr/bin/env node
/* Scenario + land tests.
 *
 * Two claims worth proving: that picking a land actually changes the terrain
 * that gets generated (not just a label), and that a goal can be reached and
 * offers to continue rather than ending the hold.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8243;
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

async function newHold({ land, goal }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
  await page.waitForSelector('#begin-btn');
  if (land) await page.click(`.diff-opts[data-group="land"] button[data-val="${land}"]`);
  if (goal) await page.click(`.diff-opts[data-group="goal"] button[data-val="${goal}"]`);
  await page.click('#begin-btn');
  await page.waitForTimeout(1600);
  return { ctx, page, errors, snap: () => page.evaluate(() => window.__oakDebug()) };
}

// --- Lands must actually shape the ground ---
const valley = await newHold({ land: 'valley' });
const vs = await valley.snap();
check('valley generates', !!vs.terrain, JSON.stringify(vs.terrain));
await valley.ctx.close();

const highland = await newHold({ land: 'highland' });
const hs = await highland.snap();
check('highland is stone-rich vs valley', (hs.terrain.stone || 0) > (vs.terrain.stone || 0),
  `stone ${vs.terrain.stone || 0} -> ${hs.terrain.stone || 0}`);
check('highland is timber-poor vs valley', (hs.terrain.forest || 0) < (vs.terrain.forest || 0),
  `forest ${vs.terrain.forest || 0} -> ${hs.terrain.forest || 0}`);
check('land is recorded on the hold', hs.land === 'highland', hs.land);
await highland.ctx.close();

const marsh = await newHold({ land: 'marshes' });
const ms = await marsh.snap();
check('marshes are wetter than the valley', (ms.terrain.water || 0) > (vs.terrain.water || 0),
  `water ${vs.terrain.water || 0} -> ${ms.terrain.water || 0}`);
await marsh.ctx.close();

// --- A goal can be set, tracked, reached, and declined as an ending ---
const run = await newHold({ goal: 'winters' });
let s = await run.snap();
check('goal is set from the picker', s.scenario === 'winters', `${s.scenario} (${s.scenarioProgress})`);

// Unlock admin, then push the seasons round until five winters have passed.
await run.page.click('#more-btn');
await run.page.click('#redeem-btn');
await run.page.fill('#redeem-input', 'Joy904');
await run.page.click('#redeem-go');
await run.page.waitForTimeout(500);
// Reopen the admin panel when something else has claimed the sheet. Decision
// events start firing a few days in and replace whatever panel is open, which
// silently ate every remaining click the first time this test was written.
async function ensureAdmin() {
  if (await run.page.locator('[data-admin="tSeason"]').count()) return;
  await run.page.click('#decision-done', { timeout: 1500 }).catch(() => {});
  await run.page.click('#more-btn', { timeout: 1500 }).catch(() => {});
  await run.page.click('#redeem-btn', { timeout: 1500 }).catch(() => {});
  await run.page.click('#admin-open', { timeout: 1500 }).catch(() => {});
  await run.page.waitForTimeout(150);
}
for (let i = 0; i < 30; i++) {
  await ensureAdmin();
  // Bounded timeout: a swallowed 30s Playwright default turns a 20s test into a
  // 10-minute one that gets killed with no output at all.
  await run.page.click('[data-admin="tSeason"]', { timeout: 2500 }).catch(() => {});
  await run.page.waitForTimeout(200);
  s = await run.snap();
  if (s.scenarioWon) break;
}
check('seasons turn when skipped', s.winters > 0, `${s.winters} winters endured`);
check('goal is reached', s.scenarioWon === true, `${s.scenarioProgress}`);
const victoryShown = await run.page.locator('#victory-card').count();
check('victory notice appears', victoryShown > 0);
if (victoryShown) {
  await run.page.click('#v-continue');
  await run.page.waitForTimeout(400);
  const gone = await run.page.locator('#victory-card').count();
  const still = await run.snap();
  check('carrying on keeps the hold', gone === 0 && still.villagers > 0,
    `${still.villagers} settlers, day ${still.day}`);
}
check('no uncaught errors', run.errors.length === 0, run.errors[0] || '');
await run.ctx.close();

await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length}/${checks.length} checks FAILED` : `\nAll ${checks.length} checks PASS`);
process.exit(failed.length ? 1 : 0);
