#!/usr/bin/env node
/* Does anything spill off the side of the screen, in either orientation?
 *
 * The gap this fills: site-audit only ever loaded the site at 390×844, so the
 * website in landscape on a phone had never been checked at all, and the game's
 * own suites check touch-target SIZE in both orientations but not whether the
 * layout holds together.
 *
 * Horizontal overflow is the failure worth catching automatically. It is the
 * one layout fault that is unambiguous — a page the reader has to scroll
 * sideways to finish a sentence on is broken, not a matter of taste — and it is
 * invisible in a screenshot unless you happen to look at the right edge.
 *
 * Three viewports: a tall phone, the same phone turned sideways, and a small
 * older phone, which is where a fixed-width element usually shows up first.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8327;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml',
  '.woff2':'font/woff2', '.ogg':'audio/ogg', '.json':'application/json',
  '.webmanifest':'application/manifest+json' };

const VIEWPORTS = [
  { name: 'portrait',  w: 390, h: 844 },
  { name: 'landscape', w: 844, h: 390 },
  { name: 'small',     w: 360, h: 640 },
];

const PAGES = ['/', '/hold/', '/play/', '/almanac/', '/wiki/', '/chronicle/',
               '/credits/', '/support/', '/press/', '/tavern/', '/privacy/'];

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
const findings = [];

/* Runs in the page. Reports the page's own sideways scroll, and names the
   elements responsible — an overflow figure with no culprit is not actionable.
   A few pixels are ignored: sub-pixel rounding and scrollbar gutters produce
   1–2px of slop that means nothing. */
const OVERFLOW = () => {
  const vw = document.documentElement.clientWidth;
  const SLOP = 2;
  const over = document.documentElement.scrollWidth - vw;
  const culprits = [];
  if (over > SLOP) {
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      // Anything deliberately pinned off-screen, or scrolling inside its own
      // box, is not the page overflowing.
      if (cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > vw + SLOP || r.left < -SLOP) {
        const p = el.parentElement;
        // Blame the outermost offender, not every child inside it.
        if (p && (p.getBoundingClientRect().right > vw + SLOP || p.getBoundingClientRect().left < -SLOP)) continue;
        culprits.push({
          tag: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
               (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
          left: Math.round(r.left), right: Math.round(r.right),
        });
      }
      if (culprits.length >= 4) break;
    }
  }
  return { over: Math.max(0, Math.round(over)), culprits };
};

// ---- the website ----
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  for (const route of PAGES) {
    await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
    const r = await page.evaluate(OVERFLOW);
    if (r.over > 0) {
      findings.push({ where: `site ${route} (${vp.name})`, over: r.over, culprits: r.culprits });
    }
    if (errs.length) {
      findings.push({ where: `site ${route} (${vp.name})`, errors: errs.splice(0) });
    }
  }
  await ctx.close();
}

// ---- the game, with a panel open in each orientation ----
const PANELS = [
  { name: 'build palette', open: async (p) => { await p.click('#build-fab'); await p.waitForSelector('.build-card'); } },
  { name: 'hub · goals',   open: async (p) => { await p.click('#quest-btn'); await p.waitForTimeout(400); } },
  { name: 'hub · journal', open: async (p) => { await p.click('#quest-btn'); await p.waitForTimeout(300); await p.locator('[data-tab="journal"]').click(); } },
  { name: "steward",       open: async (p) => { await p.click('#steward-btn'); await p.waitForSelector('#steward-input'); } },
];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
  await page.waitForSelector('#begin-btn');

  // The title screen is a long form and the first thing anyone sees.
  const title = await page.evaluate(OVERFLOW);
  if (title.over > 0) findings.push({ where: `game title screen (${vp.name})`, over: title.over, culprits: title.culprits });

  await page.click('#begin-btn');
  await page.waitForTimeout(2400);
  await page.click('#onboard-x').catch(() => {});

  for (const panel of PANELS) {
    await page.click('#sheet-close').catch(() => {});
    await page.waitForTimeout(200);
    try { await panel.open(page); } catch (e) {
      findings.push({ where: `game ${panel.name} (${vp.name})`, errors: [`could not open: ${String(e.message).slice(0, 70)}`] });
      continue;
    }
    await page.waitForTimeout(400);
    const r = await page.evaluate(OVERFLOW);
    if (r.over > 0) findings.push({ where: `game ${panel.name} (${vp.name})`, over: r.over, culprits: r.culprits });
  }
  if (errs.length) findings.push({ where: `game (${vp.name})`, errors: errs });
  await ctx.close();
}

await browser.close();
server.close();

console.log(`\nchecked ${PAGES.length} pages + ${PANELS.length + 1} game screens across ` +
            `${VIEWPORTS.map((v) => `${v.w}×${v.h}`).join(', ')}\n`);
if (!findings.length) {
  console.log('Nothing spills off the side, in any orientation.');
  process.exit(0);
}
for (const f of findings) {
  if (f.errors) { console.log(`${f.where}\n   JS errors: ${f.errors.join(' | ')}`); continue; }
  console.log(`${f.where}\n   overflows by ${f.over}px`);
  for (const c of f.culprits) console.log(`     ${c.tag}  (${c.left} → ${c.right})`);
}
console.log(`\n${findings.length} finding(s).`);
process.exit(1);
