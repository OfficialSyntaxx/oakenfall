#!/usr/bin/env node
/* Touch targets: is every control in the GAME big enough to hit with a thumb?
 *
 * "Mobile touch first — 44px minimum touch targets" is one of the project's
 * hard constraints, and until now nothing enforced it anywhere except the
 * marketing site, where it matters least. The game is the part played on a
 * phone, one-handed, often while walking.
 *
 * Measuring this needs the panels OPEN: almost every control in Oakenfall lives
 * inside the one bottom sheet and does not exist in the DOM until something
 * renders it there. So this walks the game screen by screen, opening each, and
 * measures whatever is actually on the page at the time.
 *
 * Two conventions borrowed from tools/site-audit.mjs, so both audits agree:
 *   · data-hitslop="N" declares a control that stays small on purpose but
 *     extends its touch area by N px a side through a pseudo-element, which no
 *     bounding rect can see.
 *   · A control inside a sentence is exempt; it inherits the prose line height.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8307;
const MIN = 44;
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

/** Measure every visible control on the page right now. Returns the ones that
 *  a thumb would struggle with, smallest first. */
const MEASURE = (min) => {
  const seen = new Map();
  const slop = (el) => 2 * (parseFloat(el.dataset.hitslop) || 0);
  const inProse = (el) => !!el.closest('p, li, .sheet-sub, .cx-line, .v-note');
  const sel = 'button, a[href], input, select, [role="button"], .roster-row, .build-card, .chip, .deed';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;            // not rendered
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    if (el.disabled) continue;                              // can't be tapped anyway
    if (inProse(el)) continue;
    const w = r.width + slop(el), h = r.height + slop(el);
    const size = Math.min(w, h);
    if (size >= min) continue;
    const label = (el.getAttribute('aria-label') || el.textContent || el.id || el.className || '?')
      .trim().replace(/\s+/g, ' ').slice(0, 28);
    const key = label + '|' + Math.round(w) + 'x' + Math.round(h);
    if (!seen.has(key)) seen.set(key, { label, w: Math.round(w), h: Math.round(h), size: Math.round(size) });
  }
  return [...seen.values()].sort((a, b) => a.size - b.size);
};

const findings = [];
let screensVisited = 0;

async function audit(page, screen, min) {
  const small = await page.evaluate(MEASURE, min);
  screensVisited++;
  for (const s of small) findings.push({ screen, ...s });
}

/** Open a screen, measure it, and never let one screen's failure stop the run —
 *  a control that cannot be opened is itself worth reporting. */
async function visit(page, screen, open, min) {
  try {
    await open();
    await page.waitForTimeout(320);
    await audit(page, screen, min);
  } catch (e) {
    findings.push({ screen, label: `!! could not open: ${String(e.message).slice(0, 60)}`, w: 0, h: 0, size: 0 });
  }
}

for (const [orient, vw, vh] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
  await page.waitForSelector('#begin-btn');

  const tag = (s) => `${orient}/${s}`;
  await audit(page, tag('title screen'), MIN);

  await page.click('#begin-btn');
  await page.waitForTimeout(2200);
  await page.click('#onboard-x').catch(() => {});
  await audit(page, tag('HUD'), MIN);

  // Unlock the admin panel so its own controls can be measured too.
  await page.click('#more-btn');
  await audit(page, tag('⚙ menu'), MIN);
  await page.click('#redeem-btn');
  await page.waitForTimeout(300);
  await audit(page, tag('redeem'), MIN);
  await page.fill('#redeem-input', 'Joy904');
  await page.click('#redeem-go');
  await page.waitForTimeout(400);
  await audit(page, tag('admin panel'), MIN);
  await page.click('#sheet-close').catch(() => {});

  await visit(page, tag('build palette'), async () => {
    await page.click('#sheet-close').catch(() => {});
    await page.click('#build-fab');
    await page.waitForSelector('.build-card');
  }, MIN);

  await visit(page, tag('placing a building'), async () => {
    await page.locator('.build-card:not([disabled])').first().click();
    await page.waitForSelector('#confirm-place-btn');
  }, MIN);
  await page.click('#cancel-place-btn').catch(() => {});

  for (const tab of ['goals', 'research', 'shop', 'folk', 'journal']) {
    await visit(page, tag(`hub · ${tab}`), async () => {
      await page.click('#sheet-close').catch(() => {});
      await page.click('#quest-btn');
      await page.waitForTimeout(250);
      await page.locator(`[data-tab="${tab}"]`).click();
    }, MIN);
  }

  await visit(page, tag('decrees'), async () => {
    await page.click('#sheet-close').catch(() => {});
    await page.click('#quest-btn');
    await page.waitForTimeout(250);
    await page.click('#decrees-btn');
  }, MIN);

  await visit(page, tag('events inbox'), async () => {
    await page.click('#sheet-close').catch(() => {});
    await page.click('#quest-btn');
    await page.waitForTimeout(250);
    await page.locator('[data-tab="journal"]').click();
    await page.waitForTimeout(250);
    await page.click('#inbox-btn');
  }, MIN);

  await visit(page, tag('statistics'), async () => {
    await page.click('.sheet-back').catch(() => {});
    await page.waitForTimeout(250);
    await page.click('#stats-btn');
  }, MIN);

  await visit(page, tag("steward's word"), async () => {
    await page.click('#sheet-close').catch(() => {});
    await page.click('#steward-btn');
    await page.waitForSelector('#steward-input');
  }, MIN);

  await visit(page, tag('a settler'), async () => {
    await page.click('#sheet-close').catch(() => {});
    await page.click('#quest-btn');
    await page.waitForTimeout(250);
    await page.locator('[data-tab="folk"]').click();
    await page.waitForTimeout(300);
    await page.locator('.roster-row').first().click();
  }, MIN);

  await visit(page, tag('a building'), async () => {
    await page.click('#sheet-close').catch(() => {});
    const pt = await page.evaluate(() => {
      const d = window.__oakDebug();
      const b = d.placements.find((p) => p.t === 'townCenter');
      return b ? window.__oakScreenAt(b.gx, b.gy) : null;
    });
    if (!pt) throw new Error('no Town Center on screen');
    await page.mouse.click(pt.x, pt.y - 30);
    await page.waitForSelector('#demolish-btn, .sheet-title', { timeout: 2000 });
  }, MIN);

  await ctx.close();
}

await browser.close();
server.close();

// ---- report ----
console.log(`\nvisited ${screensVisited} screens · minimum target ${MIN}px\n`);
if (!findings.length) {
  console.log('Every control is thumb-sized.');
  process.exit(0);
}
const byScreen = new Map();
for (const f of findings) {
  if (!byScreen.has(f.screen)) byScreen.set(f.screen, []);
  byScreen.get(f.screen).push(f);
}
let worst = 999;
for (const [screen, list] of byScreen) {
  console.log(`${screen}`);
  for (const f of list) {
    console.log(`   ${String(f.size).padStart(3)}px  ${f.w}×${f.h}  ${f.label}`);
    worst = Math.min(worst, f.size);
  }
}
console.log(`\n${findings.length} control(s) under ${MIN}px — smallest ${worst}px.`);
console.log('Either grow them, or add data-hitslop="N" where the touch area is genuinely extended.');
process.exit(1);
