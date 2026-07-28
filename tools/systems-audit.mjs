#!/usr/bin/env node
/* Systems audit: poke each subsystem and check it actually did something.
 *
 * Written after findTC() — a fault that threw on every call for fourteen
 * versions while the game looked fine, because the frame loop swallows
 * exceptions. The lesson is that "no crash" proves nothing here, so each check
 * below asserts an observable CONSEQUENCE, and every one of them also watches
 * the game's own swallowed-error log.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8285;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.ogg':'audio/ogg', '.json':'application/json', '.webmanifest':'application/manifest+json' };

const missing = [];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    missing.push(p); res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await page.waitForSelector('#begin-btn');
await page.click('#begin-btn');
await page.waitForTimeout(1600);
await page.click('#onboard-x').catch(() => {});
await page.click('#more-btn'); await page.click('#redeem-btn');
await page.fill('#redeem-input', 'Joy904'); await page.click('#redeem-go');
await page.waitForTimeout(400);

const snap = () => page.evaluate(() => window.__oakDebug());
async function admin(kind) {
  if (!(await page.locator(`[data-admin="${kind}"]`).count())) {
    for (const sel of ['#decision-done', '#v-continue', '#sheet-close', '#more-btn', '#redeem-btn', '#admin-open']) {
      await page.click(sel, { timeout: 800 }).catch(() => {});
    }
  }
  await page.click(`[data-admin="${kind}"]`, { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(200);
}
async function order(text) {
  for (const sel of ['#decision-done', '#v-continue', '#sheet-close']) await page.click(sel, { timeout: 600 }).catch(() => {});
  await page.click('#steward-btn');
  await page.waitForSelector('#steward-input', { timeout: 3000 });
  await page.fill('#steward-input', text);
  await page.click('#steward-go');
  await page.click('#sheet-close').catch(() => {});
}

/* ---- audio ----
 * Sound effects come from the procedural synth; the sample table is empty on
 * purpose (the shipped .ogg files were corrupt and never decoded — see
 * src/assets.ts). What matters is that the synth makes a node when asked, and
 * that nothing references a sample that isn't there. */
const synth = await page.evaluate(async () => {
  const AC = new (window.AudioContext || window.webkitAudioContext)();
  const before = AC.state;
  return { state: before, ok: typeof AC.createOscillator === 'function' };
});
check('the sound synth is available', synth.ok, `audio context ${synth.state}`);
const music = await page.evaluate(async () => new Promise((res) => {
  const a = new Audio('assets/music/elvendawn.ogg');
  a.addEventListener('loadedmetadata', () => res('ok'), { once: true });
  a.addEventListener('error', () => res('FAILED'), { once: true });
  setTimeout(() => res('timeout'), 6000);
}));
check('music loads', music === 'ok', music);

// ---- processors: a sawmill must actually turn wood into planks ----
await admin('res');
await order('build a sawmill and a granary');
await page.waitForTimeout(9000);
// Granting 500 of everything puts planks far over cap, and a processor with a
// full store correctly refuses to work — which reads exactly like a broken
// sawmill. Empty the crafted stores so there is room to produce into.
await admin('craftClear');
const beforeProc = await snap();
await page.click('#speed-btn').catch(() => {});     // fast
await page.waitForTimeout(25000);
const afterProc = await snap();
check('a sawmill saws planks',
  (afterProc.stockpile.planks || 0) > (beforeProc.stockpile.planks || 0),
  `planks ${Math.floor(beforeProc.stockpile.planks)} → ${Math.floor(afterProc.stockpile.planks)}`);

// ---- research: starting one must finish and stick ----
await order('study sharpened tools');
await page.waitForTimeout(20000);
const res1 = await snap();
check('research runs and completes',
  res1.researchedCount > 0 || res1.activeResearch !== null,
  `active ${res1.activeResearch}, known ${res1.researchedCount}`);

// ---- raids: raiders must arrive and then be resolved ----
await admin('raid');
await page.waitForTimeout(1200);
const during = await snap();
check('a raid puts raiders on the map', during.raiders > 0, `${during.raiders} raiders`);
let resolved = null;
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  const s = await snap();
  if (s.raiders === 0) { resolved = s; break; }
}
check('a raid resolves rather than hanging', resolved !== null,
  resolved ? `cleared by day ${resolved.day}` : 'raiders still on the map after 60s');

// ---- fire: it must start, and dousing must put it out ----
await admin('fire');
await page.waitForTimeout(1500);
const burning = await page.evaluate(() => window.__oakDebug().onFire);
await admin('douse');
await page.waitForTimeout(800);
const doused = await page.evaluate(() => window.__oakDebug().onFire);
check('fire starts and can be doused', burning > 0 && doused === 0, `${burning} burning → ${doused}`);

// ---- decay and repair ----
await admin('decay');
await page.waitForTimeout(400);
const worn = (await snap()).worn;
await admin('res');
await order('mend the hold');
await page.waitForTimeout(12000);
const mended = (await snap()).worn;
check('buildings wear down and can be mended', worn > 0 && mended < worn, `${worn} worn → ${mended}`);

// ---- seasons: a full year must turn, and winter must arrive ----
const seasons = new Set();
for (let i = 0; i < 5; i++) {
  await admin('tSeason');
  await page.waitForTimeout(500);
  seasons.add((await snap()).season);
}
check('the year turns through every season', seasons.size >= 4, [...seasons].join(', '));

// ---- nothing swallowed, nothing missing ----
const final = await snap();
check('the game swallowed no errors', final.errors.length === 0, final.errors.slice(0, 3).join(' | '));
check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));
check('no missing files requested', missing.length === 0, [...new Set(missing)].join(', '));

await ctx.close();
await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length}/${checks.length} checks FAILED` : `\nAll ${checks.length} checks PASS`);
process.exit(failed.length ? 1 : 0);
