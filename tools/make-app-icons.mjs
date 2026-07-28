#!/usr/bin/env node
/* Generate every native app icon and splash screen from the one source icon.
 *
 * Capacitor scaffolds both platforms with its own placeholder art. Shipping
 * that to a store is how an app ends up on someone's home screen wearing
 * somebody else's logo, so this replaces the lot from icon-512.png.
 *
 * No image library — the repo already carries Chromium for the tests, so the
 * pixel work happens on a canvas there, the same trick tools/import-sprites.mjs
 * uses. Run after any change to the source icon:  node tools/make-app-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'icon-512.png');
const NIGHT = '#14120e';                       // the hold's own background

if (!fs.existsSync(SRC)) { console.error('icon-512.png not found'); process.exit(1); }

const ANDROID_RES = path.join(ROOT, 'android/app/src/main/res');
const IOS_ASSETS = path.join(ROOT, 'ios/App/App/Assets.xcassets');

// Launcher icons. Android wants five densities; the adaptive foreground is
// 108dp with the artwork inside the middle 66% because the system crops it.
const MIPMAPS = [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]];
const FOREGROUND = [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]];
// Splash art, per orientation bucket, as Capacitor's template expects.
const SPLASH_LAND = [['mdpi', 480, 320], ['hdpi', 800, 480], ['xhdpi', 1280, 720], ['xxhdpi', 1600, 960], ['xxxhdpi', 1920, 1280]];
const SPLASH_PORT = [['mdpi', 320, 480], ['hdpi', 480, 800], ['xhdpi', 720, 1280], ['xxhdpi', 960, 1600], ['xxxhdpi', 1280, 1920]];

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
const srcUrl = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');

/** kind: 'square' | 'round' | 'foreground' | 'splash' */
async function render(kind, w, h) {
  const url = await page.evaluate(async ({ srcUrl, kind, w, h, NIGHT }) => {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = srcUrl;
    });
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';

    if (kind === 'splash') {
      g.fillStyle = NIGHT; g.fillRect(0, 0, w, h);
      const s = Math.round(Math.min(w, h) * 0.30);          // roomy, never cropped
      g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s);
    } else if (kind === 'foreground') {
      // Adaptive icons get cropped to a system mask — keep the art well inside.
      const s = Math.round(w * 0.66);
      g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s);
    } else if (kind === 'round') {
      g.save();
      g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); g.clip();
      g.drawImage(img, 0, 0, w, h);
      g.restore();
    } else {
      g.drawImage(img, 0, 0, w, h);
    }
    return c.toDataURL('image/png');
  }, { srcUrl, kind, w, h, NIGHT });
  return Buffer.from(url.split(',')[1], 'base64');
}

const write = (p, buf) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
let n = 0;

for (const [d, s] of MIPMAPS) {
  write(path.join(ANDROID_RES, `mipmap-${d}/ic_launcher.png`), await render('square', s, s));
  write(path.join(ANDROID_RES, `mipmap-${d}/ic_launcher_round.png`), await render('round', s, s));
  n += 2;
}
for (const [d, s] of FOREGROUND) {
  write(path.join(ANDROID_RES, `mipmap-${d}/ic_launcher_foreground.png`), await render('foreground', s, s));
  n++;
}
for (const [d, w, h] of SPLASH_LAND) { write(path.join(ANDROID_RES, `drawable-land-${d}/splash.png`), await render('splash', w, h)); n++; }
for (const [d, w, h] of SPLASH_PORT) { write(path.join(ANDROID_RES, `drawable-port-${d}/splash.png`), await render('splash', w, h)); n++; }
write(path.join(ANDROID_RES, 'drawable/splash.png'), await render('splash', 480, 320)); n++;

// iOS: one 1024 app icon, and the splash at the three scales the imageset lists.
// The 1024 is a 2x upscale of a 512 source — acceptable for flat artwork with
// no fine detail, but redraw the source larger if the icon ever gains detail.
write(path.join(IOS_ASSETS, 'AppIcon.appiconset/AppIcon-512@2x.png'), await render('square', 1024, 1024));
n++;
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  write(path.join(IOS_ASSETS, `Splash.imageset/${f}`), await render('splash', 2732, 2732));
  n++;
}

await browser.close();
console.log(`wrote ${n} icon and splash files from icon-512.png`);
