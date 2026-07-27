#!/usr/bin/env node
/* Land editor test.
 *
 * Proves the editor is reachable, that painting actually changes the ground,
 * that a land code round-trips, and that a hand-made land can be played.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8244;
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

const ctx = await browser.newContext({ viewport: { width: 900, height: 780 }, permissions: [] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await page.waitForSelector('#editor-btn');

await page.click('#editor-btn');
await page.waitForTimeout(900);
check('editor opens', await page.locator('#editor-ui:not(.hidden)').count() > 0);
check('HUD is out of the way', await page.locator('#hud-top').isVisible() === false);

const blank = await page.evaluate(() => window.__oakDebug().terrain);
check('editor starts on blank ground', !blank.forest && !blank.water, JSON.stringify(blank));

// Paint a forest with a drag across the middle of the canvas.
await page.click('#editor-brushes button[data-brush="forest"]');
await page.click('button[data-esize="4"]');
const box = await page.locator('#game').boundingBox();
await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45);
await page.mouse.down();
for (let i = 0; i <= 12; i++) {
  await page.mouse.move(box.x + box.width * (0.35 + 0.025 * i), box.y + box.height * (0.45 + 0.01 * i));
}
await page.mouse.up();
await page.waitForTimeout(200);
const painted = await page.evaluate(() => window.__oakDebug().terrain);
check('painting lays down forest', (painted.forest || 0) > 20, `${painted.forest || 0} forest tiles`);

// Water too, so the code has more than one run type to carry.
await page.click('#editor-brushes button[data-brush="water"]');
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
await page.mouse.down();
for (let i = 0; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.6 - 0.02 * i), box.y + box.height * (0.6 + 0.02 * i));
await page.mouse.up();
await page.waitForTimeout(200);

// Share code round-trip: copy, wipe, paste back, same ground.
const before = await page.evaluate(() => window.__oakDebug().terrain);
await page.click('#editor-share');
await page.waitForTimeout(200);
const code = await page.inputValue('#editor-code');
check('share code is produced', code.startsWith('OAK1') && code.length > 20, `${code.length} chars`);
await page.click('#editor-clear');
await page.waitForTimeout(150);
const cleared = await page.evaluate(() => window.__oakDebug().terrain);
check('clear wipes the land', !cleared.forest && !cleared.water);
await page.fill('#editor-code', code);
await page.click('#editor-load');
await page.waitForTimeout(300);
const after = await page.evaluate(() => window.__oakDebug().terrain);
check('land code round-trips', JSON.stringify(after) === JSON.stringify(before),
  `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);

// Play it: the hold should be founded on the hand-made ground and tick along.
await page.click('#editor-play');
await page.waitForTimeout(2000);
const live = await page.evaluate(() => window.__oakDebug());
check('editor UI closes on play', await page.locator('#editor-ui.hidden').count() > 0);
check('HUD returns', await page.locator('#hud-top').isVisible() === true);
check('the hold is founded on the painted land', live.buildings.length > 0 && live.villagers === 3,
  `${live.buildings.join(',')} · ${live.villagers} settlers`);
check('painted terrain survives into play', (live.terrain.forest || 0) > 20, JSON.stringify(live.terrain));
await page.waitForTimeout(1500);
const live2 = await page.evaluate(() => window.__oakDebug());
check('the world runs', live2.time > live.time, `t ${live.time} -> ${live2.time}`);
check('no uncaught errors', errors.length === 0, errors[0] || '');

await ctx.close();
await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length}/${checks.length} checks FAILED` : `\nAll ${checks.length} checks PASS`);
process.exit(failed.length ? 1 : 0);
