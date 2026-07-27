#!/usr/bin/env node
/* Turn freshly generated art into game-ready sprites.
 *
 * Drop PNGs into ./incoming named after the thing they are (forestCamp.png,
 * deer.png, stump.png) and run this. For each one it:
 *   1. knocks out the flat background the generator was asked for,
 *   2. trims to the opaque bounding box,
 *   3. colour-grades it into the hold's palette — darkened and earth-tinted,
 *      which is what keeps a new asset from glowing next to the old ones,
 *   4. scales it down to sprite size and writes public/assets/<kind>/<name>.png,
 *   5. prints the SPRITE_URLS / SPRITE_SCALE / SPRITE_ANCHOR_Y lines to paste.
 *
 * No image library: the repo already carries Chromium for the test suite, so
 * the pixel work happens on a canvas there. One less dependency to keep alive,
 * and the same colour maths the game itself uses.
 *
 * Anchors are a first guess. Eyeball them with tools/shots.mjs — a building
 * that floats or sinks is an anchor, not a bug in the art.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const DROP = path.join(ROOT, process.argv[2] || 'incoming');
const KIND = process.argv[3] || 'sprites';     // sprites | decor
const OUT = path.join(ROOT, 'public', 'assets', KIND);
const MAX = 256;                                // sprites are drawn at ~80px wide

if (!fs.existsSync(DROP)) {
  console.error(`No ${path.relative(ROOT, DROP)}/ directory — create it and put the PNGs in.`);
  process.exit(1);
}
const files = fs.readdirSync(DROP).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!files.length) { console.error(`${path.relative(ROOT, DROP)}/ is empty.`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();

const done = [];
for (const file of files) {
  const name = path.basename(file, path.extname(file));
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(path.join(DROP, file)).toString('base64');

  const out = await page.evaluate(async ({ dataUrl, MAX }) => {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const px = d.data;

    // 1. Knock out the flat background. Flood from the edges rather than
    //    thresholding every pixel, so white highlights INSIDE the subject
    //    survive — a whitewashed wall is not the background.
    const w = c.width, h = c.height;
    const bg = new Uint8Array(w * h);
    const isPale = (i) => px[i] > 228 && px[i + 1] > 228 && px[i + 2] > 228;
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, x + (h - 1) * w); }
    for (let y = 0; y < h; y++) { stack.push(y * w, w - 1 + y * w); }
    while (stack.length) {
      const p = stack.pop();
      if (bg[p]) continue;
      if (!isPale(p * 4)) continue;
      bg[p] = 1;
      const x = p % w, y = (p / w) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - w);
      if (y < h - 1) stack.push(p + w);
    }
    for (let p = 0; p < w * h; p++) if (bg[p]) px[p * 4 + 3] = 0;

    // 2. Opaque bounding box.
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;

    // 3. Grade into the hold's palette: pull toward warm earth, drop the
    //    brightness a little. Generated art is consistently lighter and cooler
    //    than the Kenney/Tiny Swords base, and the mismatch is obvious in game.
    const TINT = [214, 196, 160];      // warm parchment-stone
    const AMT = 0.16, DARK = 0.90;
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      if (!px[i + 3]) continue;
      for (let k = 0; k < 3; k++) {
        const v = px[i + k] * DARK;
        px[i + k] = Math.max(0, Math.min(255, Math.round(v + (TINT[k] * (v / 255) - v) * AMT)));
      }
    }
    g.putImageData(d, 0, 0);

    // 4. Trim and scale.
    const tw = x1 - x0 + 1, th = y1 - y0 + 1;
    const scale = Math.min(1, MAX / Math.max(tw, th));
    const o = document.createElement('canvas');
    o.width = Math.max(1, Math.round(tw * scale));
    o.height = Math.max(1, Math.round(th * scale));
    const og = o.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(c, x0, y0, tw, th, 0, 0, o.width, o.height);
    return { url: o.toDataURL('image/png'), w: o.width, h: o.height, srcW: tw, srcH: th };
  }, { dataUrl, MAX });

  if (!out) { console.log(`SKIP  ${file} — no opaque pixels after background removal`); continue; }
  const buf = Buffer.from(out.url.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, name + '.png'), buf);
  done.push({ name, ...out, bytes: buf.length });
  console.log(`ok    ${name}.png  ${out.srcW}x${out.srcH} → ${out.w}x${out.h}  (${(buf.length / 1024).toFixed(1)}KB)`);
}

await browser.close();

if (done.length && KIND === 'sprites') {
  console.log('\n--- src/assets.ts: add to SPRITE_URLS ---');
  for (const d of done) console.log(`  ${d.name}: 'assets/sprites/${d.name}.png',`);
  console.log('\n--- src/main.ts: starting points, then eyeball with tools/shots.mjs ---');
  console.log('SPRITE_SCALE:   ' + done.map((d) => `${d.name}: 80`).join(', '));
  console.log('SPRITE_ANCHOR_Y:' + done.map((d) => `${d.name}: 18`).join(', '));
  console.log('\nA sprite that floats or sinks in game is an anchor to nudge, not a bad asset.');
}
