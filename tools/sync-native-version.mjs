#!/usr/bin/env node
/* Keep the native app versions in step with GAME_VERSION.
 *
 * A store build carries its own version numbers, and hand-maintained copies of
 * a number drift — the same failure the CHANGELOG guard exists to stop. This
 * derives both platforms' versions from the one in src/main.ts, so bumping the
 * game bumps the app.
 *
 * versionCode / CURRENT_PROJECT_VERSION must increase monotonically for every
 * upload, so semver becomes an integer: major*10000 + minor*100 + patch.
 * 1.77.2 → 17702. That stays ordered as long as minor and patch stay under 100.
 *
 * Runs as part of `npm run cap:sync`.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'src/main.ts'), 'utf8');
const m = main.match(/const GAME_VERSION = '([\d.]+)'/);
if (!m) { console.error('GAME_VERSION not found in src/main.ts'); process.exit(1); }

const version = m[1];
const [maj, min, pat] = version.split('.').map(Number);
if (min > 99 || pat > 99) {
  console.error(`version ${version}: minor/patch must stay under 100 or versionCode stops being ordered`);
  process.exit(1);
}
const code = maj * 10000 + min * 100 + pat;

const edit = (rel, fn) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log(`skip  ${rel} (not scaffolded)`); return; }
  const before = fs.readFileSync(p, 'utf8');
  const after = fn(before);
  if (before !== after) { fs.writeFileSync(p, after); console.log(`wrote ${rel}`); }
  else console.log(`ok    ${rel} (already ${version})`);
};

edit('android/app/build.gradle', (s) => s
  .replace(/versionCode \d+/, `versionCode ${code}`)
  .replace(/versionName "[^"]*"/, `versionName "${version}"`));

edit('ios/App/App.xcodeproj/project.pbxproj', (s) => s
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${code};`)
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`));

console.log(`native version ${version} (build ${code})`);
