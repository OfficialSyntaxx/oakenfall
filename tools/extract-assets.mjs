#!/usr/bin/env node
/* Extract every embedded base64 asset from index.html into real files.
 *
 * The game historically inlined ~15MB of PNG/OGG as data URIs so it could be
 * one self-contained file. That cost is paid on every load — the whole payload
 * must download and parse before anything renders, which is punishing on
 * mobile (and 12MB of it is music that is OFF by default). This pulls them into
 * public/assets/ so they can be cached and lazy-loaded, and bundled locally by
 * Capacitor — still fully offline, just no longer inline.
 *
 * Handles every shape present in the file:
 *   key: 'data:<mime>;base64,AAA'   → SPRITE_URLS, AUDIO_B64, MUSIC_B64
 *   key: 'AAA'                      → TERRAIN_B64, some DECOR_B64
 *   key: ['AAA','BBB']              → VANIM_B64, some DECOR_B64
 *
 * Writes public/assets/<group>/... and src/asset-manifest.json.
 * Does not modify index.html — extraction is deliberately separate from rewrite.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const OUT = path.join(ROOT, 'public', 'assets');

const GROUPS = [
  { name: 'SPRITE_URLS', group: 'sprites', ext: 'png' },
  { name: 'VANIM_B64',   group: 'vanim',   ext: 'png' },
  { name: 'DECOR_B64',   group: 'decor',   ext: 'png' },
  { name: 'TERRAIN_B64', group: 'terrain', ext: 'png' },
  { name: 'AUDIO_B64',   group: 'audio',   ext: 'ogg' },
  { name: 'MUSIC_B64',   group: 'music',   ext: 'ogg' },
];

// Body of `const NAME = { ... }` via brace matching (values contain no braces).
function blockOf(name) {
  const start = html.indexOf(`const ${name}`);
  if (start === -1) return null;
  const open = html.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) return html.slice(open + 1, i); }
  }
  return null;
}

const stripDataUri = (s) => s.replace(/^data:[^;]+;base64,/, '');

const manifest = {};
let files = 0, bytes = 0;

function write(group, ext, key, b64, index) {
  const dir = path.join(OUT, group);
  fs.mkdirSync(dir, { recursive: true });
  const name = index === undefined ? `${key}.${ext}` : `${key}-${index}.${ext}`;
  const buf = Buffer.from(stripDataUri(b64), 'base64');
  fs.writeFileSync(path.join(dir, name), buf);
  files++; bytes += buf.length;
  const url = `assets/${group}/${name}`;
  if (index === undefined) manifest[group][key] = url;
  else (manifest[group][key] ||= []).push(url);
}

// Manual scanner. Regex is unusable here: a 6MB quoted string blows the stack
// through backtracking, so we walk the body and slice with indexOf instead.
function* entriesOf(body) {
  let i = 0;
  const isIdent = (c) => /[A-Za-z0-9_$]/.test(c);
  while (i < body.length) {
    // skip comments and whitespace
    if (body[i] === '/' && body[i + 1] === '/') { const nl = body.indexOf('\n', i); i = nl === -1 ? body.length : nl + 1; continue; }
    if (body[i] === '/' && body[i + 1] === '*') { const e = body.indexOf('*/', i); i = e === -1 ? body.length : e + 2; continue; }
    if (!isIdent(body[i])) { i++; continue; }

    let s = i;
    while (i < body.length && isIdent(body[i])) i++;
    const key = body.slice(s, i);
    while (i < body.length && /\s/.test(body[i])) i++;
    if (body[i] !== ':') continue;
    i++;
    while (i < body.length && /\s/.test(body[i])) i++;

    if (body[i] === "'") {
      const end = body.indexOf("'", i + 1);              // base64 has no escapes
      if (end === -1) break;
      yield { key, values: [body.slice(i + 1, end)], array: false };
      i = end + 1;
    } else if (body[i] === '[') {
      const close = body.indexOf(']', i);
      if (close === -1) break;
      const values = [];
      let j = i + 1;
      while (j < close) {
        const q = body.indexOf("'", j);
        if (q === -1 || q > close) break;
        const qe = body.indexOf("'", q + 1);
        if (qe === -1 || qe > close) break;
        values.push(body.slice(q + 1, qe));
        j = qe + 1;
      }
      yield { key, values, array: true };
      i = close + 1;
    }
  }
}

for (const { name, group, ext } of GROUPS) {
  const body = blockOf(name);
  if (!body) { console.log(`skip ${name} (not found)`); continue; }
  manifest[group] = {};
  let n = 0;
  for (const { key, values, array } of entriesOf(body)) {
    const usable = values.filter((v) => stripDataUri(v).length >= 40);
    if (!usable.length) continue;
    if (array) usable.forEach((v, idx) => write(group, ext, key, v, idx));
    else write(group, ext, key, usable[0]);
    n++;
  }
  console.log(`${name.padEnd(12)} -> ${String(n).padStart(3)} entries  (running ${(bytes / 1024 / 1024).toFixed(2)} MB)`);
}

fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src', 'asset-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nextracted ${files} files, ${(bytes / 1024 / 1024).toFixed(2)} MB total`);
console.log('manifest -> src/asset-manifest.json');
