#!/usr/bin/env node
/* Gameplay test: does the simulation actually behave?
 *
 * The smoke test proves the game boots and renders. This drives the real player
 * flow — unlock the admin panel, order a workplace through the Steward — and
 * then checks that idle settlers reason their way into the work the hold needs,
 * which is the claim the utility AI makes.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8237;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.ogg':'audio/ogg', '.json':'application/json',
  '.webmanifest':'application/manifest+json' };

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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

const snap = () => page.evaluate(() => window.__oakDebug());
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await page.waitForSelector('#begin-btn');
await page.click('#begin-btn');
await page.waitForTimeout(2500);

let s = await snap();
check('game starts with settlers', s.villagers > 0, `${s.villagers} settlers, day ${s.day}`);
check('debug snapshot available', !!s.version, 'v' + s.version);

// Unlock the admin panel (checks the promo-code path still works).
await page.click('#more-btn');
await page.click('#redeem-btn');
await page.fill('#redeem-input', 'Joy904');
await page.click('#redeem-go');
await page.waitForTimeout(600);
const adminOpen = await page.locator('[data-admin="res"]').count();
check('admin panel unlocks via promo code', adminOpen > 0);
// Deliberately NOT granting resources: overflowing stores are exactly the case
// where the utility AI should decline to hire anyone, so filling them would test
// the opposite of what we want. The hold's starting stock affords a camp.

// Order a workplace through the Steward, exercising the command parser too.
await page.keyboard.press('Escape').catch(() => {});
await page.click('body', { position: { x: 640, y: 700 } }).catch(() => {});
await page.waitForTimeout(300);
await page.click('#steward-btn');
await page.waitForTimeout(400);
await page.fill('#steward-input', 'build a forestry camp');
await page.click('#steward-go');
await page.waitForTimeout(600);
await page.click('body', { position: { x: 640, y: 700 } }).catch(() => {});

// Give the hold time to carry the order out and for folk to take up the work.
await page.waitForTimeout(9000);
s = await snap();
const camps = s.buildings.filter((b) => b === 'forestCamp').length;
check('steward carries out a build order', camps >= 1, `${camps} forestry camp(s) raised`);
check('settlers take up needed work unprompted', (s.roles.lumberjack || 0) > 0,
  'roles: ' + JSON.stringify(s.roles));
check('wildlife is alive in the world', s.critters > 0, `${s.critters} critters`);
check('no uncaught errors', errors.length === 0, errors[0] || '');

await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length}/${checks.length} checks FAILED` : `\nAll ${checks.length} checks PASS`);
process.exit(failed.length ? 1 : 0);
