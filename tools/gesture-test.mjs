#!/usr/bin/env node
/* Gestures: the hands-on-the-map layer, driven as a real finger would.
 *
 * This is the part of the game with the least to show for itself. A pan or a
 * pinch changes nothing in the world — no building appears, no settler moves —
 * so every other suite would pass with the whole input layer dead. The camera
 * is the only witness, which is why __oakDebug reports zoom, pan and what is
 * selected.
 *
 * Multi-touch needs raw CDP: Playwright's touchscreen API is one finger only,
 * and a pinch is by definition two.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const PORT = 8295;
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

// A phone, with touch, because touch is the primary path.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
await page.waitForSelector('#begin-btn');
await page.click('#begin-btn');
await page.waitForTimeout(1800);
await page.click('#onboard-x').catch(() => {});

const snap = () => page.evaluate(() => window.__oakDebug());
const cdp = await ctx.newCDPSession(page);

/** Dispatch a raw touch frame. Points are {x, y}; an empty list ends the touch. */
async function touchFrame(type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })),
  });
}

/** One finger down, dragged in steps, then up. */
async function drag(from, to, steps = 8, holdMs = 16) {
  await touchFrame('touchStart', [from]);
  for (let i = 1; i <= steps; i++) {
    await touchFrame('touchMove', [{
      x: from.x + (to.x - from.x) * (i / steps),
      y: from.y + (to.y - from.y) * (i / steps),
    }]);
    await page.waitForTimeout(holdMs);
  }
  await touchFrame('touchEnd', []);
}

// ---- pan ----
const beforePan = (await snap()).pan;
await drag({ x: 200, y: 430 }, { x: 100, y: 300 }, 8, 30);
await page.waitForTimeout(120);
const afterPan = (await snap()).pan;
check('a one-finger drag pans the map',
  Math.abs(afterPan.x - beforePan.x) > 40 && Math.abs(afterPan.y - beforePan.y) > 40,
  `${beforePan.x},${beforePan.y} → ${afterPan.x},${afterPan.y}`);

// ---- flick inertia ----
// A fast release should keep the camera moving after the finger is gone. Sampled
// twice AFTER touchend, so only momentum can account for the difference.
await drag({ x: 300, y: 600 }, { x: 120, y: 300 }, 6, 8);
const glide0 = (await snap()).pan;
await page.waitForTimeout(220);
const glide1 = (await snap()).pan;
check('a flick keeps gliding after the finger lifts',
  Math.hypot(glide1.x - glide0.x, glide1.y - glide0.y) > 4,
  `moved ${Math.round(Math.hypot(glide1.x - glide0.x, glide1.y - glide0.y))}px after release`);
await page.waitForTimeout(900);   // let the glide settle before measuring zoom

// ---- pinch ----
const zoomBefore = (await snap()).zoom;
const cx = 195, cy = 430, spread = (d) => ([{ x: cx - d, y: cy }, { x: cx + d, y: cy }]);
await touchFrame('touchStart', spread(40));
for (let d = 50; d <= 150; d += 20) { await touchFrame('touchMove', spread(d)); await page.waitForTimeout(30); }
await touchFrame('touchEnd', []);
await page.waitForTimeout(150);
const zoomAfter = (await snap()).zoom;
check('a pinch outward zooms in', zoomAfter > zoomBefore * 1.2, `${zoomBefore} → ${zoomAfter}`);

// The anchor bug this guards: recomputing the pinch's world point each move fed
// the camera back into itself and threw the view into the void. A sane zoom is
// the evidence it is still captured once.
check('the pinch stays anchored rather than flying off',
  zoomAfter <= 2.4 && Math.abs((await snap()).pan.x) < 20000,
  `zoom ${zoomAfter}, pan x ${(await snap()).pan.x}`);

// ---- double-tap ----
// Zoom out first so the double-tap has somewhere to go.
await touchFrame('touchStart', spread(150));
for (let d = 140; d >= 40; d -= 20) { await touchFrame('touchMove', spread(d)); await page.waitForTimeout(30); }
await touchFrame('touchEnd', []);
await page.waitForTimeout(200);
const dtBefore = (await snap()).zoom;
for (let i = 0; i < 2; i++) {
  await touchFrame('touchStart', [{ x: 195, y: 500 }]);
  await touchFrame('touchEnd', []);
  await page.waitForTimeout(90);
}
await page.waitForTimeout(200);
const dtAfter = (await snap()).zoom;
check('a double-tap zooms in', dtAfter > dtBefore, `${dtBefore} → ${dtAfter}`);

// ---- tap to select ----
// The Town Center is the one thing guaranteed to be on the map. Centre on it via
// the minimap-free route: read its screen position from the game itself.
const tc = await page.evaluate(() => {
  const d = window.__oakDebug();
  const b = d.placements.find((p) => p.t === 'townCenter');
  return b ? { gx: b.gx, gy: b.gy } : null;
});
check('the hold has a Town Center to tap', !!tc, tc ? `at ${tc.gx},${tc.gy}` : 'none found');
if (tc) {
  // Bring it on screen first: the pinch and glide above left the camera
  // wherever they left it, and a tap outside the viewport is not a tap. Drag
  // toward the centre in bounded steps, since one drag cannot cross more than
  // a screen's worth of map.
  // Zoomed in, the clamped camera cannot always put the map's centre on screen,
  // so back out first — a double-tap above 1.5 zooms to 1.0.
  for (let i = 0; i < 2; i++) {
    await touchFrame('touchStart', [{ x: 195, y: 500 }]);
    await touchFrame('touchEnd', []);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(300);
  let pt = await page.evaluate(({ gx, gy }) => window.__oakScreenAt(gx, gy), tc);
  for (let i = 0; i < 6 && (pt.x < 60 || pt.x > 330 || pt.y < 160 || pt.y > 700); i++) {
    const from = { x: 195, y: 430 };
    const to = {
      x: Math.max(30, Math.min(360, from.x + (195 - pt.x))),
      y: Math.max(170, Math.min(700, from.y + (430 - pt.y))),
    };
    await drag(from, to, 6, 30);
    await page.waitForTimeout(700);   // let any glide finish before re-reading
    pt = await page.evaluate(({ gx, gy }) => window.__oakScreenAt(gx, gy), tc);
  }
  check('the Town Center can be brought on screen',
    pt.x > 20 && pt.x < 370 && pt.y > 140 && pt.y < 720, `at ${Math.round(pt.x)},${Math.round(pt.y)}`);
  // Aim up the roof rather than at the doorstep. Settlers win the hit test over
  // buildings — deliberately, they are small and the thing you meant — so a
  // settler idling on the Town Center's tile would answer the tap instead. Try
  // a few heights and take the first that reaches the building itself.
  let selected = null;
  for (const dy of [-45, -75, -15]) {
    await touchFrame('touchStart', [{ x: pt.x, y: pt.y + dy }]);
    await touchFrame('touchEnd', []);
    await page.waitForTimeout(400);
    selected = (await snap()).selected;
    if (selected === 'building') break;
  }
  check('tapping a building selects it', selected === 'building', `selected: ${selected}`);
  const sheetOpen = await page.locator('#sheet-wrap.open').count();
  check('selecting opens its sheet', sheetOpen > 0, `${sheetOpen} open sheet`);
  await page.click('#sheet-close').catch(() => {});
  await page.waitForTimeout(300);
  check('closing the sheet clears the selection', (await snap()).selected === null,
    `selected: ${(await snap()).selected}`);
}

const swallowed = (await snap()).errors;
check('the game swallowed no errors', swallowed.length === 0, swallowed.slice(0, 2).join(' | '));
check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${failed.length ? `${failed.length} FAILED` : `All ${checks.length} checks PASS`}`);
process.exit(failed.length ? 1 : 0);
