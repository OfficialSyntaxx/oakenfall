#!/usr/bin/env node
/* Saves: what happens to a hold when its record goes wrong.
 *
 * Written after finding that every load failure — no save, unreadable save,
 * save from a newer version — returned the same bare false, and the caller
 * answered every one of them by founding a NEW hold. A player who pressed
 * Continue on a slot the title screen advertised as "Day 47" could land in an
 * empty valley without a word, and the autosave ninety seconds later would
 * write over what they had lost.
 *
 * So the assertions here are mostly about what must NOT happen: the game must
 * not start a hold nobody asked for, and it must not overwrite a damaged save
 * before the player has been told about it. Each case plants a specific kind of
 * damage in storage and then presses Continue.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8305;
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

const URL = `http://127.0.0.1:${PORT}/game/`;
const SLOT = 'oakenfall-save-1';

/** A fresh page that shares one storage origin, so a save written by one run is
 *  still there for the next. */
const ctx = await browser.newContext({ viewport: { width: 900, height: 820 } });
const errors = [];

async function newPage() {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  return page;
}

/** Play far enough to have a hold worth losing, then save it. */
async function foundAndSave() {
  const page = await newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#begin-btn');
  await page.click('#begin-btn');
  await page.waitForTimeout(2200);
  await page.click('#onboard-x').catch(() => {});
  await page.click('#more-btn'); await page.click('#save-btn');
  await page.waitForTimeout(700);
  const saved = await page.evaluate((k) => localStorage.getItem(k), SLOT);
  await page.close();
  return saved;
}

/** Put `text` in the slot (null deletes), open the title screen, press Continue,
 *  and report what the game did about it. */
async function continueWith(text, backup) {
  const page = await newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(({ k, v, b }) => {
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    if (b === null) localStorage.removeItem(k + ':prev'); else if (b !== undefined) localStorage.setItem(k + ':prev', b);
  }, { k: SLOT, v: text, b: backup });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#begin-btn');
  await page.click('#continue-btn').catch(() => {});
  await page.waitForTimeout(2000);
  const state = await page.evaluate((k) => ({
    // The title overlay still up means the game did NOT start a hold.
    titleUp: !document.getElementById('title-overlay').classList.contains('hidden'),
    toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent),
    stored: localStorage.getItem(k),
    day: window.__oakDebug ? window.__oakDebug().day : null,
    settlers: window.__oakDebug ? window.__oakDebug().villagers : null,
  }), SLOT);
  await page.close();
  return state;
}

// ---- a real save, to damage in the cases below ----
const good = await foundAndSave();
check('a founded hold writes a save', !!good && good.length > 1000, `${good ? good.length : 0} bytes`);

// ---- the happy path still works ----
{
  const r = await continueWith(good, null);
  check('a sound save loads', !r.titleUp && r.settlers > 0, `${r.settlers} settlers, day ${r.day}`);
}

// ---- truncated: the write was cut off half way ----
{
  const r = await continueWith(good.slice(0, Math.floor(good.length * 0.6)), null);
  check('a truncated save does not start a hold nobody asked for', r.titleUp,
    r.titleUp ? 'stayed on the title screen' : `started a hold at day ${r.day}`);
  check('a truncated save is left in place, not overwritten', r.stored && r.stored.length > 0,
    `${r.stored ? r.stored.length : 0} bytes still stored`);
  check('the player is told the record could not be read',
    r.toasts.some((t) => /could not be read/i.test(t)), r.toasts.join(' | ') || 'no message shown');
}

// ---- valid JSON, but not a hold ----
{
  const r = await continueWith('{"v":2,"grid":[],"buildings":[],"villagers":[]}', null);
  check('an empty map is refused', r.titleUp, r.titleUp ? 'stayed on the title screen' : 'started anyway');
  check('the damage is described to the player',
    r.toasts.some((t) => /damaged/i.test(t)), r.toasts.join(' | ') || 'no message shown');
}

// ---- a building standing off the edge of the map ----
{
  const d = JSON.parse(good);
  d.buildings.push({ type: 'house', gx: 999, gy: 999, condition: 100 });
  const r = await continueWith(JSON.stringify(d), null);
  check('a building off the map is caught before the world is touched', r.titleUp,
    r.titleUp ? 'stayed on the title screen' : 'restored a broken world');
}

// ---- a save from a version that does not exist yet ----
{
  const d = JSON.parse(good);
  d.v = 99;
  const r = await continueWith(JSON.stringify(d), null);
  check('a save from a newer version is refused, not half-read', r.titleUp,
    r.titleUp ? 'stayed on the title screen' : 'loaded it anyway');
  check('the player is told to update rather than that their hold is broken',
    r.toasts.some((t) => /newer version/i.test(t)), r.toasts.join(' | ') || 'no message shown');
}

// ---- the rollback: damaged save, sound backup ----
{
  const r = await continueWith('}{ not json', good);
  check('a damaged save falls back to the previous record', !r.titleUp && r.settlers > 0,
    r.titleUp ? 'stayed on the title screen with a good backup available' : `${r.settlers} settlers restored`);
  check('the rollback is not silent',
    r.toasts.some((t) => /earlier one was restored/i.test(t)), r.toasts.join(' | ') || 'no message shown');
}

// ---- an empty slot is an empty slot, not a disaster ----
{
  const r = await continueWith(null, null);
  check('an empty slot says so without alarming anyone',
    r.titleUp && r.toasts.some((t) => /no hold saved/i.test(t)),
    r.toasts.join(' | ') || 'no message shown');
}

// ---- the backup is kept, and is never replaced by rubbish ----
{
  const page = await newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(({ k, v }) => { localStorage.setItem(k, v); localStorage.removeItem(k + ':prev'); }, { k: SLOT, v: good });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#begin-btn');
  await page.click('#continue-btn');
  await page.waitForTimeout(2200);
  await page.click('#onboard-x').catch(() => {});
  await page.click('#more-btn'); await page.click('#save-btn');
  await page.waitForTimeout(700);
  const prev = await page.evaluate((k) => localStorage.getItem(k + ':prev'), SLOT);
  check('saving keeps the previous record as a backup', !!prev && prev.length > 1000,
    `${prev ? prev.length : 0} bytes kept`);

  // Now corrupt the live save and save again: the backup must NOT become rubbish.
  await page.evaluate((k) => localStorage.setItem(k, 'garbage'), SLOT);
  await page.click('#save-btn').catch(async () => { await page.click('#more-btn'); await page.click('#save-btn'); });
  await page.waitForTimeout(700);
  const prev2 = await page.evaluate((k) => localStorage.getItem(k + ':prev'), SLOT);
  check('a damaged save never becomes the backup', !!prev2 && prev2.length > 1000 && prev2 !== 'garbage',
    `${prev2 ? prev2.slice(0, 12) : 'gone'}…`);
  await page.close();
}

check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${failed.length ? `${failed.length}/${checks.length} checks FAILED` : `All ${checks.length} checks PASS`}`);
process.exit(failed.length ? 1 : 0);
