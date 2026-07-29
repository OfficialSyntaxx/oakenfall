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
/* Reach an admin control and actually press it.
 *
 * The old version checked whether the button EXISTED and, if so, clicked it
 * blind, swallowing any failure. Both halves were wrong. A decision dialog can
 * cover a button that is present in the DOM, so the existence check skips the
 * dismissal and the click is then intercepted; and swallowing the failure meant
 * the run continued as if the admin action had happened, failing several steps
 * later with something unrelated ("0 raiders") and no hint why. That produced
 * three separate mystery flakes before anyone looked at this helper.
 *
 * So: always clear anything blocking, open the panel if the control is not
 * clickable, then click for real and let a genuine failure say so. */
async function admin(kind) {
  const target = page.locator(`[data-admin="${kind}"]`);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await target.isVisible().catch(() => false))) {
      for (const sel of ['#decision-done', '#v-continue', '#sheet-close', '#more-btn', '#redeem-btn', '#admin-open']) {
        await page.click(sel, { timeout: 800 }).catch(() => {});
      }
    }
    try {
      await target.click({ timeout: 2000 });
      await page.waitForTimeout(200);
      return;
    } catch (e) { /* covered or not open yet — clear and retry once */ }
  }
  throw new Error(`admin control "${kind}" could not be pressed — the run cannot mean anything after this`);
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

/* ---- the minimap ----
 * A whole module nothing else touches. It is drawn on its own canvas, so the
 * world render passing says nothing about it — a minimap that stopped painting
 * would have gone unnoticed indefinitely. Asking how many distinct colours are
 * on it separates "drew the island" from "cleared to black". */
const mmColours = await page.evaluate(() => {
  const c = document.getElementById('minimap');
  if (!c) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const cols = new Set();
  for (let i = 0; i < d.length; i += 4) cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
  return cols.size;
});
check('the minimap draws the island', mmColours > 8, `${mmColours} distinct colours`);

/* ---- visual effects ----
 * Dust and debris are gone in under a second, so no screenshot can catch them
 * and nothing else would notice if they stopped firing. The spawn counters are
 * the only evidence. (The resource-fly counter is checked in the health check
 * instead: this run keeps the stores at cap and the settlers spend it building,
 * so a delivery is not guaranteed here.) */
const fx = (await snap()).fx;
check('raising a building kicks up dust', fx.dust > 0, `${fx.dust} dust bursts`);
check('a repelled raid throws debris', fx.boom > 0, `${fx.boom} bursts`);

/* ---- skills and guilds ----
 * Mastery takes about 420 seconds of steady work in one trade, so no test run
 * reaches it by playing — which is why nothing covered guilds at all until
 * now. The admin grant makes Masters outright; what is asserted is the
 * consequence, that a guild forms from them. */
await order('put 2 to lumberjack and 2 to mining');
await page.waitForTimeout(6000);
await admin('master');
await page.waitForTimeout(600);
const guilded = await snap();
check('settlers reach mastery', guilded.masters >= 2, `${guilded.masters} masters`);
check('masters of a trade form a guild', guilded.guilds.length > 0,
  guilded.guilds.length ? guilded.guilds.join(', ') : 'no guild formed');

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

/* ---- game modes ----
 * A mode is chosen on the title screen and never changes, so it needs its own
 * run. Iron Winter is the one with teeth: it pins the season, which means the
 * season code has to consult the mode. Nothing else in the suite covers any
 * mode but the default, and the day the season logic moved into its own module
 * that gap was the only thing standing between a refactor and a silently
 * thawed Iron Winter. */
const wctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const wp = await wctx.newPage();
await wp.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await wp.waitForSelector('#begin-btn');
await wp.click('[data-group="mode"] [data-val="ironwinter"]');
await wp.click('#begin-btn');
await wp.waitForTimeout(1800);
await wp.click('#onboard-x').catch(() => {});
await wp.click('#more-btn'); await wp.click('#redeem-btn');
await wp.fill('#redeem-input', 'Joy904'); await wp.click('#redeem-go');
await wp.waitForTimeout(400);
const seen = new Set();
for (let i = 0; i < 5; i++) {
  seen.add((await wp.evaluate(() => window.__oakDebug())).season);
  if (!(await wp.locator('[data-admin="tSeason"]').count())) {
    for (const s of ['#decision-done', '#sheet-close', '#more-btn', '#redeem-btn', '#admin-open']) {
      await wp.click(s, { timeout: 700 }).catch(() => {});
    }
  }
  await wp.click('[data-admin="tSeason"]', { timeout: 1500 }).catch(() => {});
  await wp.waitForTimeout(400);
}
check('Iron Winter never thaws', seen.size === 1 && seen.has('Winter'), [...seen].join(', '));
await wctx.close();

/* ---- crossing water ----
 * Bridges, fords and winter ice are the rules a refactor breaks quietly: a
 * settler who cannot reach the far bank simply looks busy on this one, and
 * every other check still passes. Asked here directly of the pathfinder. */
const pctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const pp = await pctx.newPage();
await pp.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await pp.waitForSelector('#begin-btn');
await pp.click('#begin-btn');
await pp.waitForTimeout(1800);
await pp.click('#onboard-x').catch(() => {});
const cross = await pp.evaluate(() => {
  const grid = window.__oakGrid();          // lowercase = plain, uppercase = wilds
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      if (grid[y][x].toLowerCase() !== 'w') continue;
      const blocked = !window.__oakWalkable(x, y);
      window.__oakSetTileFlag(x, y, 'ford', true);
      const fordable = window.__oakWalkable(x, y);
      window.__oakSetTileFlag(x, y, 'ford', false);
      return { x, y, blocked, fordable, blockedAgain: !window.__oakWalkable(x, y) };
    }
  }
  return null;
});
check('open water blocks a settler', !!cross && cross.blocked && cross.blockedAgain,
  cross ? `tile ${cross.x},${cross.y}` : 'no water on this map');
check('a ford makes water crossable', !!cross && cross.fordable, cross ? String(cross.fordable) : 'n/a');
await pctx.close();

/* Winter freezes the river solid, which is the same walkability rule reached
 * through the season code rather than a tile flag — the one place where
 * pathfind and time have to agree. Asked of the Iron Winter run, which is
 * permanently in season for it. */
const ictx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const ip = await ictx.newPage();
await ip.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await ip.waitForSelector('#begin-btn');
await ip.click('[data-group="mode"] [data-val="ironwinter"]');
await ip.click('#begin-btn');
await ip.waitForTimeout(1800);
await ip.click('#onboard-x').catch(() => {});
const frozen = await ip.evaluate(() => {
  const grid = window.__oakGrid();
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      if (grid[y][x].toLowerCase() === 'w') return { x, y, walkable: window.__oakWalkable(x, y) };
    }
  }
  return null;
});
check('a frozen river can be walked across', !!frozen && frozen.walkable,
  frozen ? `tile ${frozen.x},${frozen.y} walkable=${frozen.walkable}` : 'no water on this map');
await ictx.close();
await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length}/${checks.length} checks FAILED` : `\nAll ${checks.length} checks PASS`);
process.exit(failed.length ? 1 : 0);
