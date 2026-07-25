#!/usr/bin/env node
/* Replace the inlined base64 asset maps in index.html with URL maps pointing at
 * the files produced by extract-assets.mjs, and patch the three loaders that
 * prefixed raw base64 with a data: scheme.
 *
 * Every consumer already assigns to `.src`, so a URL drops straight in. The
 * procedural fallbacks (canvas art for sprites/terrain/villagers) still cover a
 * slow or failed load — sprites remain an upgrade layer, never a dependency.
 * Assets are same-origin, so canvas photo mode is not tainted.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'asset-manifest.json'), 'utf8'));

let html = fs.readFileSync(INDEX, 'utf8');
const before = Buffer.byteLength(html);

// Replace `const NAME = { ... };` wholesale (brace-matched, then to the semicolon).
function replaceBlock(name, literal) {
  const start = html.indexOf(`const ${name}`);
  if (start === -1) { console.log(`skip ${name} (not found)`); return false; }
  const open = html.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error(`unterminated ${name}`);
  const semi = html.indexOf(';', end);
  html = html.slice(0, start) + literal + html.slice(semi + 1);
  return true;
}

// Pretty-print a manifest group as a JS object literal of URLs.
function literalFor(name, group, note) {
  const entries = Object.entries(manifest[group]).map(([k, v]) =>
    `  ${k}: ${Array.isArray(v) ? '[' + v.map((u) => `'${u}'`).join(', ') + ']' : `'${v}'`},`
  );
  return `// ${note}\nconst ${name} = {\n${entries.join('\n')}\n}`;
}

const NOTE = 'Asset URLs (files, not inlined base64) — bundled locally, cached by the\n// service worker, so offline play is unaffected. Procedural fallbacks still\n// cover a failed or slow load.';

replaceBlock('SPRITE_URLS', literalFor('SPRITE_URLS', 'sprites', NOTE));
replaceBlock('VANIM_B64',   literalFor('VANIM_B64', 'vanim', NOTE));
replaceBlock('DECOR_B64',   literalFor('DECOR_B64', 'decor', NOTE));
replaceBlock('TERRAIN_B64', literalFor('TERRAIN_B64', 'terrain', NOTE));
replaceBlock('AUDIO_B64',   literalFor('AUDIO_B64', 'audio', NOTE));

// Loaders that hand-built a data: URI now get a plain URL.
const patches = [
  ["img.src = 'data:image/png;base64,' + list[i];", 'img.src = list[i];'],
  ["img.src = 'data:image/png;base64,' + b;",       'img.src = b;'],
  ["img.src = 'data:image/png;base64,' + data;",    'img.src = data;'],
];
for (const [from, to] of patches) {
  if (!html.includes(from)) { console.log('WARN loader patch not found:', from); continue; }
  html = html.split(from).join(to);
}

fs.writeFileSync(INDEX, html);
const after = Buffer.byteLength(html);
console.log(`before: ${(before / 1024 / 1024).toFixed(2)} MB`);
console.log(`after : ${(after / 1024 / 1024).toFixed(2)} MB`);
console.log(`saved : ${((before - after) / 1024 / 1024).toFixed(2)} MB`);
