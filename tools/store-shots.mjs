#!/usr/bin/env node
/* Store screenshots, at the sizes the two stores actually demand.
 *
 * Apple rejects a submission whose screenshots are not exactly one of the
 * accepted sizes, and Google wants a 16:9 pair plus its own set. Cropping a
 * phone screenshot by hand to 1290×2796 is the kind of job that goes wrong
 * quietly, so this renders the game AT those sizes instead: the viewport is set
 * to the store's aspect at a device pixel ratio that lands on the exact pixel
 * count, and the game lays itself out for it like any other screen.
 *
 * Six shots, chosen to answer the questions someone scrolling a store page is
 * actually asking: what is it, what do I do, how deep does it go, and does it
 * look good on MY phone.
 *
 * Output: store/<platform>/<size>/NN-name.png — gitignored, since these are
 * build artefacts that would otherwise put megabytes of PNG in the history.
 *
 *   node tools/store-shots.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const OUT = path.join(ROOT, 'store');
const PORT = 8317;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.ogg':'audio/ogg', '.json':'application/json', '.webmanifest':'application/manifest+json' };

/* Each target is the store's required PIXEL size, reached by a CSS viewport at a
   scale factor. The CSS size is what the game lays out for, so it must stay in
   phone territory — a 1290px-wide viewport would give us the desktop layout at
   phone dimensions, which is not what a phone owner would see. */
const TARGETS = [
  { platform: 'ios',     name: '6.7-inch', w: 430, h: 932, dpr: 3, note: 'iPhone 15 Pro Max — 1290×2796' },
  { platform: 'ios',     name: '6.5-inch', w: 414, h: 896, dpr: 3, note: 'iPhone 11 Pro Max — 1242×2688' },
  { platform: 'android', name: 'phone',    w: 412, h: 915, dpr: 2, note: 'Pixel-class — 824×1830' },
];

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

/* The six shots. Each one gets the world into the state it wants and then says
   when it is ready to be photographed. */
const SHOTS = [
  {
    file: '01-the-hold',
    caption: 'A hold at work in the valley',
    async setup(page) {
      await page.waitForTimeout(3000);           // let settlers get to work
      await page.click('#onboard-x').catch(() => {});
    },
  },
  {
    file: '02-build',
    caption: 'Twenty-one buildings to raise',
    async setup(page) {
      await page.click('#build-fab');
      await page.waitForSelector('.build-card');
      await page.click('#grabber-zone').catch(() => {});   // expand the sheet
      await page.waitForTimeout(500);
    },
  },
  {
    file: '03-a-settler',
    caption: 'Every settler is a person, not a number',
    async setup(page) {
      await page.click('#sheet-close').catch(() => {});
      await page.click('#quest-btn');
      await page.waitForTimeout(400);
      await page.locator('[data-tab="folk"]').click();
      await page.waitForTimeout(400);
      await page.locator('.roster-row').first().click();
      await page.click('#grabber-zone').catch(() => {});
      await page.waitForTimeout(500);
    },
  },
  {
    file: '04-the-steward',
    caption: 'Give an order in your own words',
    async setup(page) {
      await page.click('#sheet-close').catch(() => {});
      await page.click('#steward-btn');
      await page.waitForSelector('#steward-input');
      await page.fill('#steward-input', 'build a farm and put two to lumberjack');
      await page.waitForTimeout(400);
    },
  },
  {
    file: '05-night',
    caption: 'Day turns to night, season to season',
    async setup(page) {
      /* Reload before the two landscape shots. Opening panels and tapping a
         settler pans the camera, and a hold sitting in the corner under an
         empty sky is not the picture. Booting re-centres on the hold, and the
         save carries the world across. */
      await recentre(page);
      await unlockAdmin(page);
      await page.locator('[data-admin="tNight"]').click();
      await page.waitForTimeout(300);
      await page.click('#sheet-close').catch(() => {});
      await page.waitForTimeout(1400);
    },
  },
  {
    file: '06-winter',
    caption: 'Survive the winter',
    async setup(page) {
      await recentre(page);
      await unlockAdmin(page);
      /* Actually reach winter rather than just turning the snow on. Snowfall
         over green spring grass, captioned "survive the winter", would be a
         picture of something the game does not do. */
      for (let i = 0; i < 5; i++) {
        const season = (await page.evaluate(() => window.__oakDebug())).season;
        if (season === 'Winter') break;
        await page.locator('[data-admin="tSeason"]').click();
        await page.waitForTimeout(900);
      }
      await page.locator('[data-admin="wSnow"]').click().catch(() => {});
      await page.waitForTimeout(200);
      await page.locator('[data-admin="tDawn"]').click().catch(() => {});
      await page.waitForTimeout(300);
      await page.click('#sheet-close').catch(() => {});
      await page.waitForTimeout(1800);
      const s = await page.evaluate(() => window.__oakDebug());
      if (s.season !== 'Winter') {
        console.error(`  ! winter shot was taken in ${s.season}`);
        process.exitCode = 1;
      }
    },
  },
];

/** Reload and continue, which re-centres the camera on the hold. */
async function recentre(page) {
  await page.click('#sheet-close').catch(() => {});
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#continue-btn');
  await page.click('#continue-btn');
  await page.waitForTimeout(2600);
  await page.click('#onboard-x').catch(() => {});
}

/** Open the developer panel, whatever state the sheet is in. */
async function unlockAdmin(page) {
  await page.click('#more-btn');
  await page.click('#redeem-btn');
  await page.waitForTimeout(250);
  if (!(await page.locator('[data-admin="tNight"]').isVisible().catch(() => false))) {
    await page.fill('#redeem-input', 'Joy904').catch(() => {});
    await page.click('#redeem-go').catch(() => {});
    await page.waitForTimeout(450);
    await page.click('#admin-open').catch(() => {});
    await page.waitForTimeout(300);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
let made = 0;

for (const t of TARGETS) {
  const dir = path.join(OUT, t.platform, t.name);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: t.dpr,
    hasTouch: true, isMobile: true,
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/game/`, { waitUntil: 'load' });
  await page.waitForSelector('#begin-btn');
  await page.click('#begin-btn');
  await page.waitForTimeout(2200);

  for (const shot of SHOTS) {
    try { await shot.setup(page); } catch (e) { /* a shot that will not pose is still worth taking */ }
    /* Wait out any toast. They are transient by design and clear themselves in
       2.2s, but one caught mid-fade ("Hold saved.") in a store screenshot reads
       as a permanent part of the interface. */
    await page.waitForFunction(() => {
      const c = document.getElementById('toast-container');
      return !c || c.children.length === 0;
    }, null, { timeout: 6000 }).catch(() => {});
    const file = path.join(dir, shot.file + '.png');
    await page.screenshot({ path: file });
    made++;
  }
  // Prove the pixel size is what the store asked for, rather than assuming the
  // scale factor did what it was told.
  const buf = fs.readFileSync(path.join(dir, SHOTS[0].file + '.png'));
  const px = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  const want = { w: t.w * t.dpr, h: t.h * t.dpr };
  const ok = px.w === want.w && px.h === want.h;
  console.log(`${ok ? '✓' : '✗'} ${t.platform}/${t.name}  ${px.w}×${px.h}  ${t.note}`);
  if (!ok) { console.error(`  expected ${want.w}×${want.h}`); process.exitCode = 1; }
  await ctx.close();
}

await browser.close();
server.close();

fs.writeFileSync(path.join(OUT, 'CAPTIONS.txt'),
  SHOTS.map((s, i) => `${String(i + 1).padStart(2, '0')}  ${s.caption}`).join('\n') + '\n');
console.log(`\n${made} screenshots in store/ — captions in store/CAPTIONS.txt`);
