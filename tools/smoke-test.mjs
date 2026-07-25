#!/usr/bin/env node
/* Headless smoke test: serve _site, boot the game, and assert it actually runs
 * with external assets — that the canvas draws, assets load over HTTP, and no
 * errors hit the console. Catches exactly the class of breakage the asset
 * externalization could cause.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8231;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.ogg': 'audio/ogg', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(PORT, r));

// Use the environment's pre-installed Chromium rather than downloading one.
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find((p) => fs.existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const results = [];

for (const [label, vw, vh] of [['phone', 390, 844], ['landscape', 844, 390], ['desktop', 1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [], failed = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e.message).slice(0, 160)));
  page.on('requestfailed', (r) => failed.push('NET ' + r.url().replace(/^https?:\/\/[^/]+/, '')));
  // 404s arrive as ordinary responses, so they must be caught here.
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });

  await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
  // Start a hold so the world actually generates and renders.
  await page.waitForSelector('#begin-btn', { timeout: 10000 });
  await page.click('#begin-btn');
  await page.waitForTimeout(3500);

  const state = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    // sample the middle of the canvas — a rendered world is never uniformly blank
    const d = g.getImageData(c.width / 2 - 40, c.height / 2 - 40, 80, 80).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4) colors.add(`${d[i]},${d[i+1]},${d[i+2]}`);
    // Top-level `const` in a classic script never lands on window, so inspect
    // what the network actually delivered instead of reaching for globals.
    const res = performance.getEntriesByType('resource').filter((r) => r.name.includes('/assets/'));
    const byGroup = {};
    for (const r of res) {
      const g2 = (r.name.match(/assets\/([a-z]+)\//) || [])[1] || '?';
      byGroup[g2] = (byGroup[g2] || 0) + 1;
    }
    return {
      distinctColors: colors.size,
      assetsFetched: res.length,
      assetsByGroup: byGroup,
      menuVisible: !document.getElementById('begin-btn')?.closest('#start-overlay,#menu,#overlay')?.classList?.contains('hidden'),
      canvasSize: c.width + 'x' + c.height,
      canvasSized: c.width >= window.innerWidth,  // backing store must match the viewport, not the 300x150 default
    };
  });

  results.push({ label, state, errors, failed: [...new Set(failed)] });
  await ctx.close();
}

await browser.close();
server.close();

let bad = 0;
for (const r of results) {
  const ok = r.state.distinctColors > 8 && r.errors.length === 0 && r.failed.length === 0 && r.state.canvasSized;
  if (!ok) bad++;
  console.log(`\n[${r.label}] ${ok ? 'PASS' : 'FAIL'}`);
  console.log('  render colors :', r.state.distinctColors, '(>8 means a drawn world)');
  console.log('  assets fetched:', r.state.assetsFetched, JSON.stringify(r.state.assetsByGroup));
  console.log('  canvas        :', r.state.canvasSize, r.state.canvasSized ? '(sized)' : '(NOT SIZED — stretched/blurry)');
  if (r.errors.length) console.log('  ERRORS:', r.errors.slice(0, 4));
  if (r.failed.length) console.log('  FAILED REQUESTS:', r.failed.slice(0, 6));
}
console.log(bad ? `\n${bad} viewport(s) FAILED` : '\nAll viewports PASS');
process.exit(bad ? 1 : 0);
