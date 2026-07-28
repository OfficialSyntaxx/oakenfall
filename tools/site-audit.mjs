#!/usr/bin/env node
/* Website audit: crawl the built site and report what is broken, stale or heavy.
 *
 * Checks every page for dead internal links, missing assets, requests to third
 * parties, missing social/meta tags, page weight, and basic accessibility
 * (images without alt text, buttons without a name, contrast-critical roles).
 * Prints a report; fails only on things that are unambiguously broken.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8290;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png',
  '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ogg':'audio/ogg', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.woff2':'font/woff2', '.ico':'image/x-icon' };

const missing = new Set();
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    missing.add(p); res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

const pages = fs.readdirSync(SITE, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(SITE, d.name, 'index.html')))
  .map((d) => '/' + d.name + '/');
pages.unshift('/');

const problems = [];
const rows = [];

for (const route of pages) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const external = new Set(), failed = new Set();
  let bytes = 0;
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== '127.0.0.1') external.add(u.hostname);
  });
  page.on('response', async (r) => {
    if (r.status() >= 400) failed.add(r.url().replace(`http://127.0.0.1:${PORT}`, '') + ` (${r.status()})`);
    try { const b = await r.body(); bytes += b.length; } catch (e) {}
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));

  await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(600);

  const info = await page.evaluate(() => {
    const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.content || null;
    const links = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
      .filter((h) => h && !/^(https?:|mailto:|tel:|#)/.test(h));
    const imgsNoAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
    const btnsNoName = [...document.querySelectorAll('button')]
      .filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title).length;
    // Links inside a sentence are exempt — they inherit the line height of the
    // prose and cannot be 44px without breaking the paragraph. Standalone
    // controls have no such excuse.
    const inProse = (el) => !!el.closest('p, li, td, .prose, .district-body');
    // data-hitslop="N" marks a control that keeps small chrome on purpose (no
    // room in the HUD) but extends its touch area by N px on every side via a
    // pseudo-element. The rect can't show that, so the markup declares it.
    const slop = (el) => 2 * (parseFloat(el.dataset.hitslop) || 0);
    const smallTargets = [...document.querySelectorAll('a, button')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height + slop(el) < 44 && !inProse(el);
    }).map((el) => (el.textContent || el.getAttribute('aria-label') || '?').trim().slice(0, 24));
    return {
      title: document.title,
      desc: meta('description'),
      og: !!meta('og:image'),
      lang: document.documentElement.lang || null,
      h1: document.querySelectorAll('h1').length,
      links: [...new Set(links)],
      imgsNoAlt, btnsNoName, smallTargets,
    };
  });

  rows.push({ route, ...info, kb: Math.round(bytes / 1024), external: [...external], failed: [...failed], errs });
  await ctx.close();
}

// ---- report ----
console.log('\nPAGE                 KB     TITLE');
for (const r of rows) console.log(`${r.route.padEnd(20)} ${String(r.kb).padStart(5)}  ${(r.title || '(none)').slice(0, 54)}`);

/* Two tiers. Most findings are judgement calls a person should look at; a few
   are the project's own rules and fail the run. Requests to a third party are
   the sharpest of those — "everything ships from our origin, offline always
   works" is the constraint the whole asset pipeline exists to keep. */
const fatal = [];
const say = (label, list, hard) => {
  if (!list.length) return;
  problems.push(label);
  if (hard) fatal.push(label);
  console.log(`\n${hard ? 'FAIL  ' : ''}${label}`);
  for (const l of list) console.log('  · ' + l);
};

say('Pages with no meta description:', rows.filter((r) => !r.desc).map((r) => r.route));
say('Pages with no og:image (bad link previews):', rows.filter((r) => !r.og).map((r) => r.route));
say('Pages with no <html lang>:', rows.filter((r) => !r.lang).map((r) => r.route));
say('Pages without exactly one <h1>:', rows.filter((r) => r.h1 !== 1).map((r) => `${r.route} (${r.h1})`));
say('Third-party requests (nothing may leave our origin):',
  rows.filter((r) => r.external.length).map((r) => `${r.route} → ${r.external.join(', ')}`), true);
say('Failed requests:', rows.filter((r) => r.failed.length).map((r) => `${r.route} → ${r.failed.join(', ')}`), true);
say('JavaScript errors:', rows.filter((r) => r.errs.length).map((r) => `${r.route} → ${r.errs[0]}`), true);
say('Images without alt text:', rows.filter((r) => r.imgsNoAlt).map((r) => `${r.route} (${r.imgsNoAlt})`));
say('Buttons with no accessible name:', rows.filter((r) => r.btnsNoName).map((r) => `${r.route} (${r.btnsNoName})`));
say('Tap targets under 44px on a phone (prose links exempt):',
  rows.filter((r) => r.smallTargets.length).map((r) => `${r.route} — ${r.smallTargets.join(', ')}`));
say('Heavy pages (over 1.5MB):', rows.filter((r) => r.kb > 1536).map((r) => `${r.route} (${r.kb}KB)`));

// Dead internal links, resolved against what the server actually has.
const dead = [];
for (const r of rows) {
  for (const l of r.links) {
    const target = l.startsWith('/') ? l : path.posix.join(r.route, l);
    const f = path.join(SITE, target.endsWith('/') ? target + 'index.html' : target);
    if (!fs.existsSync(f) && !fs.existsSync(f + '/index.html')) dead.push(`${r.route} → ${l}`);
  }
}
say('Dead internal links:', [...new Set(dead)], true);

// Pages nothing links to.
const linked = new Set(['/']);
for (const r of rows) for (const l of r.links) if (l.startsWith('/')) linked.add(l.endsWith('/') ? l : l + '/');
const BY_DESIGN = new Set(['/game/', '/valley/']);   // iframe target; homepage alias
say('Orphan pages (published, linked from nowhere):',
  rows.map((r) => r.route).filter((p) => !linked.has(p) && !BY_DESIGN.has(p)));

await browser.close();
server.close();
console.log(problems.length ? `\n${problems.length} categories of finding — see above.` : '\nNo findings.');
if (fatal.length) {
  console.log(`${fatal.length} of them break a rule the site is meant to keep:\n  ${fatal.join('\n  ')}`);
  process.exit(1);
}
