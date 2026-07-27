#!/usr/bin/env node
/* Save-slot tests.
 *
 * Four holds have to stay four holds: saving into one must not touch another,
 * a rename must survive a reload, continuing must load the slot you picked,
 * and a single-save hold from before slots existed must land in slot 1.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8246;
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

const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const URL = `http://127.0.0.1:${PORT}/game/`;
const home = async () => { await page.goto(URL, { waitUntil: 'load' }); await page.waitForSelector('#slot-list .slot'); };

await home();
check('four slots are offered', await page.locator('#slot-list .slot').count() === 4);
check('all slots start empty', (await page.locator('#slot-list .slot.empty').count()) === 4);
check('no continue button with nothing saved', await page.locator('#continue-btn.hidden').count() === 1);

// --- Slot 1: found a hold called Ashford and save it.
await page.fill('#hold-name-input', 'Ashford');
await page.click('#begin-btn');
await page.waitForTimeout(1500);
await page.click('#more-btn'); await page.click('#save-btn');
await page.waitForTimeout(500);
const day1 = (await page.evaluate(() => window.__oakDebug())).day;

// --- Slot 3: a different hold, on a different land.
await home();
await page.click('#slot-list .slot[data-slot="3"]');
await page.fill('#hold-name-input', 'Brackwater');
await page.click('.diff-opts[data-group="land"] button[data-val="marshes"]');
await page.click('#begin-btn');
await page.waitForTimeout(1500);
await page.click('#more-btn'); await page.click('#save-btn');
await page.waitForTimeout(500);

await home();
const labels = await page.locator('#slot-list .slot-name').evaluateAll((els) => els.map((e) => e.value));
check('each hold keeps its own slot', labels[0] === 'Ashford' && labels[2] === 'Brackwater', labels.join(' | '));
check('untouched slots stay empty', (await page.locator('#slot-list .slot.empty').count()) === 2);
const meta = await page.locator('#slot-list .slot[data-slot="1"] .slot-meta').textContent();
check('a slot shows what is in it', /Day \d+ · \d+ settler/.test(meta), meta.trim());

// --- Continue loads the slot you picked, not simply the last one saved.
await page.click('#slot-list .slot[data-slot="1"]');
await page.click('#continue-btn');
await page.waitForTimeout(1800);
const back = await page.evaluate(() => window.__oakDebug());
check('continue loads the chosen slot', back.land === 'valley', `land ${back.land}, day ${back.day}`);
check('the loaded hold is the one saved', back.day >= day1, `day ${day1} -> ${back.day}`);

await home();
await page.click('#slot-list .slot[data-slot="3"]');
await page.click('#continue-btn');
await page.waitForTimeout(1800);
const marsh = await page.evaluate(() => window.__oakDebug());
check('the other slot loads its own land', marsh.land === 'marshes', marsh.land);

// --- Founding over an occupied slot has to be confirmed.
await home();
await page.click('#slot-list .slot[data-slot="1"]');
page.once('dialog', (d) => d.dismiss());
await page.click('#begin-btn');
await page.waitForTimeout(500);
check('declining an overwrite keeps you on the title screen',
  await page.locator('#title-overlay:not(.hidden)').count() === 1);
check('declining an overwrite spares the hold',
  (await page.locator('#slot-list .slot[data-slot="1"] .slot-meta').textContent()).indexOf('Day') === 0);

// --- Renaming sticks across a reload.
await home();
await page.fill('#slot-list .slot[data-slot="3"] .slot-name', 'Brackwater Deep');
await page.locator('#slot-list .slot[data-slot="1"] .slot-name').focus(); // commit via change
await page.waitForTimeout(300);
await home();
const renamed = await page.inputValue('#slot-list .slot[data-slot="3"] .slot-name');
check('a renamed slot stays renamed', renamed === 'Brackwater Deep', renamed);

// --- Erasing one slot leaves the other alone.
page.once('dialog', (d) => d.accept());
await page.click('#slot-list .slot[data-slot="3"] .slot-del');
await page.waitForTimeout(300);
check('erasing empties that slot', await page.locator('#slot-list .slot[data-slot="3"].empty').count() === 1);
check('erasing spares the others', await page.locator('#slot-list .slot[data-slot="1"].empty').count() === 0);

// --- A pre-slots save migrates into slot 1.
const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const p2 = await ctx2.newPage();
await p2.goto(URL, { waitUntil: 'load' });
await p2.waitForSelector('#begin-btn');
await p2.fill('#hold-name-input', 'Oldhold');
await p2.click('#begin-btn');
await p2.waitForTimeout(1500);
await p2.click('#more-btn'); await p2.click('#save-btn');
await p2.waitForTimeout(400);
// Rewrite it the way the single-save era stored it, then reload.
await p2.evaluate(() => {
  const raw = localStorage.getItem('oakenfall-save-1');
  localStorage.clear();
  localStorage.setItem('oakenfall-save', raw);
});
await p2.goto(URL, { waitUntil: 'load' });
await p2.waitForSelector('#slot-list .slot');
const migrated = await p2.inputValue('#slot-list .slot[data-slot="1"] .slot-name');
check('an old single save migrates to slot 1', migrated === 'Oldhold', migrated);
await p2.click('#continue-btn');
await p2.waitForTimeout(1800);
const old = await p2.evaluate(() => window.__oakDebug());
check('the migrated hold plays', old.villagers > 0, `${old.villagers} settlers, day ${old.day}`);
await ctx2.close();

check('no uncaught errors', errors.length === 0, errors[0] || '');
await ctx.close();
await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length}/${checks.length} checks FAILED` : `\nAll ${checks.length} checks PASS`);
process.exit(failed.length ? 1 : 0);
