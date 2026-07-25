#!/usr/bin/env node
/* Screenshot the terrain under each weather so the living-surface effects can be
 * judged by eye — they are invisible on a clear spring day, which is the default.
 * Drives the admin panel to force each condition. Writes to /tmp/shots/.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const OUT = '/tmp/shots';
const PORT = 8241;
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
fs.mkdirSync(OUT, { recursive: true });

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await page.waitForSelector('#begin-btn');
await page.click('#begin-btn');
await page.waitForTimeout(2500);

// Unlock the admin panel once.
await page.click('#more-btn');
await page.click('#redeem-btn');
await page.fill('#redeem-input', 'Joy904');
await page.click('#redeem-go');
await page.waitForTimeout(600);

const openAdmin = async () => {
  await page.click('body', { position: { x: 450, y: 560 } }).catch(() => {});
  await page.waitForTimeout(250);
  await page.click('#more-btn');
  await page.click('#redeem-btn');
  await page.waitForTimeout(300);
  await page.click('#admin-open').catch(() => {});
  await page.waitForTimeout(300);
};

// Ground cover eases in over time, so let each state settle before shooting.
// The admin sheet sits over the lower half of the screen and there is no clean
// way to dismiss it without tapping the world (which selects things), so shoot
// the band above it instead. Daylight first — these effects are invisible at night.
const CLIP = { x: 0, y: 0, width: 900, height: 380 };
for (const [label, action, settle] of [
  ['terrain-clear', 'wClear', 2500],
  ['terrain-rain',  'wRain',  10000],
  ['terrain-snow',  'wSnow',  16000],
]) {
  await page.click('[data-admin="tDawn"]').catch(() => {});
  await page.waitForTimeout(400);
  await page.click(`[data-admin="${action}"]`).catch(async () => { await openAdmin(); await page.click(`[data-admin="${action}"]`); });
  await page.waitForTimeout(settle);
  await page.click('[data-admin="tDawn"]').catch(() => {});   // keep it light while it settles
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, label + '.png'), clip: CLIP });
  console.log('shot:', label);
}

await browser.close();
server.close();
