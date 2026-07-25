#!/usr/bin/env node
/* Capture screenshots of the running game so UI changes can be eyeballed, not
 * just asserted. Writes to /tmp/shots/. Usage: node tools/shots.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const OUT = '/tmp/shots';
const PORT = 8233;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.ogg': 'audio/ogg', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json' };

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

for (const [label, w, h, expand] of [
  ['portrait', 390, 844, false],
  ['portrait-expanded', 390, 844, true],
  ['landscape', 844, 390, false],
  ['landscape-expanded', 844, 390, true],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
  await page.waitForSelector('#begin-btn', { timeout: 10000 });
  await page.click('#begin-btn');
  await page.waitForTimeout(3000);
  const isExpanded = await page.evaluate(() => document.getElementById('hud-top').classList.contains('expanded'));
  if (isExpanded !== expand) { await page.click('#hud-more'); await page.waitForTimeout(400); }
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, label + '.png') });
  console.log('shot:', label);
  await ctx.close();
}
await browser.close();
server.close();
