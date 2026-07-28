#!/usr/bin/env node
/* Build the social-share image from the game itself.
 *
 * Every link to the site — Discord, Slack, Twitter, iMessage — renders whatever
 * og:image points at. It pointed at the 180px app icon, which those cards
 * upscale into a blurry square. A real 1200x630 shot of a working hold sells
 * the game in the one place people see it before they click.
 *
 * Grows a hold with the steward, waits for dusk so the windows are lit, hides
 * the HUD with photo mode, and shoots it. Run after any big visual change:
 *   node tools/make-og-image.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const OUT = path.join(ROOT, 'og-image.png');
const PORT = 8293;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png',
  '.ogg':'audio/ogg', '.json':'application/json', '.webmanifest':'application/manifest+json' };

if (!fs.existsSync(path.join(SITE, 'game', 'index.html'))) {
  console.error('No _site/game — run npm run build first.');
  process.exit(1);
}
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
// 1200x630 at 1x: the size every card renderer expects, and small enough that
// a preview fetch is not a 3MB download.
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await page.waitForSelector('#begin-btn');
await page.click('#begin-btn');
await page.waitForTimeout(1800);
await page.click('#onboard-x').catch(() => {});

// Unlock admin, stock the hold, and have the steward raise a village.
await page.click('#more-btn'); await page.click('#redeem-btn');
await page.fill('#redeem-input', 'Joy904'); await page.click('#redeem-go');
await page.waitForTimeout(400);
const admin = async (k) => {
  if (!(await page.locator(`[data-admin="${k}"]`).count())) {
    for (const s of ['#decision-done', '#sheet-close', '#more-btn', '#redeem-btn', '#admin-open']) {
      await page.click(s, { timeout: 700 }).catch(() => {});
    }
  }
  await page.click(`[data-admin="${k}"]`, { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(200);
};
await admin('maxout');
await admin('settlers');
await page.click('#sheet-close').catch(() => {});
await page.click('#steward-btn'); await page.waitForSelector('#steward-input');
await page.fill('#steward-input',
  'build 5 houses and a tavern and a bakery and a well and 2 farms and a forestry camp and a mining post and a lamp post');
await page.click('#steward-go');
await page.click('#sheet-close').catch(() => {});
console.log('raising the hold…');
await page.waitForTimeout(40000);

// Dusk: lit windows and long shadows read far better than flat noon.
await admin('tNight');
await page.waitForTimeout(1200);
await page.click('#sheet-close').catch(() => {});
await page.click('#decision-done', { timeout: 800 }).catch(() => {});

// Photo mode strips every UI layer for one clean frame.
await page.evaluate(() => document.body.classList.add('photo-hide'));
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT });
await page.evaluate(() => document.body.classList.remove('photo-hide'));

const snap = await page.evaluate(() => window.__oakDebug());
console.log(`wrote ${path.relative(ROOT, OUT)} — ${snap.buildings.length} buildings, ${snap.villagers} settlers, ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);

await ctx.close();
await browser.close();
server.close();
