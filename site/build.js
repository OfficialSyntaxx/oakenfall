#!/usr/bin/env node
// Oakenfall site build. Assembles _site/ from site/ + repo markdown + the
// game file. No dependencies — plain Node. The game's index.html is copied
// through UNMODIFIED (the single-file game is sacred; the site never forks
// game code).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = __dirname;
const OUT = path.join(ROOT, '_site');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Minimal markdown → HTML: headings, lists, links, bold, paragraphs.
// Enough for CHANGELOG.md / CREDITS.md; not a general renderer.
function md(src) {
  const inline = (t) =>
    esc(t)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" rel="noopener">$2</a>');
  const out = [];
  let para = [], list = false;
  const flush = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const endList = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const line of src.split('\n')) {
    const l = line.trimEnd();
    if (/^###\s/.test(l)) { flush(); endList(); out.push('<h4>' + inline(l.slice(4)) + '</h4>'); }
    else if (/^##\s/.test(l)) { flush(); endList(); out.push('<h3>' + inline(l.slice(3)) + '</h3>'); }
    else if (/^#\s/.test(l)) { flush(); endList(); /* drop top title; pages have their own */ }
    else if (/^-\s/.test(l)) { flush(); if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(l.slice(2)) + '</li>'); }
    else if (l === '') { flush(); endList(); }
    else if (list) { out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ' ' + inline(l.trim()) + '</li>'); }
    else para.push(l.trim());
  }
  flush(); endList();
  return out.join('\n');
}

// CHANGELOG.md → one .notice per "## version" section.
function changelogNotices(src) {
  const sections = src.split(/^## /m).slice(1);
  return sections.map((sec) => {
    const nl = sec.indexOf('\n');
    const ver = sec.slice(0, nl).trim();
    const body = md(sec.slice(nl + 1));
    return `<article class="notice"><h3>Notice — v${esc(ver)}</h3>${body}</article>`;
  }).join('\n');
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// ---- build ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

copyDir(path.join(SITE, 'css'), path.join(OUT, 'css'));
copyDir(path.join(SITE, 'js'), path.join(OUT, 'js'));

// The game, untouched, at /game/
fs.mkdirSync(path.join(OUT, 'game'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(OUT, 'game', 'index.html'));

// Home-screen icon, referenced by both the site layout and the game
fs.copyFileSync(path.join(ROOT, 'apple-touch-icon.png'), path.join(OUT, 'apple-touch-icon.png'));

// Optional image assets (hero art, OG/social image, concept art) dropped into
// site/img/ — e.g. AI-generated key art. Copied verbatim to /img/. The OG image
// is auto-detected from a known basename so link shares get real art when it's
// present, and gracefully fall back to the icon when it isn't.
const IMG_SRC = path.join(SITE, 'img');
let ogImage = '/apple-touch-icon.png';
if (fs.existsSync(IMG_SRC)) {
  copyDir(IMG_SRC, path.join(OUT, 'img'));
  fs.rmSync(path.join(OUT, 'img', 'README.md'), { force: true }); // keep the guide out of the deploy
  for (const cand of ['og-oakenfall.jpg', 'og-oakenfall.png', 'og-oakenfall.webp']) {
    if (fs.existsSync(path.join(IMG_SRC, cand))) { ogImage = '/img/' + cand; break; }
  }
}

// Living-world sim (Canvas2D port) served at /living/ — a testbed for the
// "living-sim becomes core" direction. Additive; does not affect / or /play/.
const livingSrc = path.join(ROOT, 'game', 'oakenfall-living-canvas.html');
if (fs.existsSync(livingSrc)) {
  fs.mkdirSync(path.join(OUT, 'living'), { recursive: true });
  fs.copyFileSync(livingSrc, path.join(OUT, 'living', 'index.html'));
}

// 3D prototype (Three.js, procedural placeholder art) served at /3d/ — a
// testbed for the "stylized 3D rebuild" direction. Uses a CDN (site-only, not
// the game's single-file rule); does not affect the game or the homepage.
const poc3dSrc = path.join(ROOT, 'game', 'oakenfall-3d-poc.html');
if (fs.existsSync(poc3dSrc)) {
  fs.mkdirSync(path.join(OUT, '3d'), { recursive: true });
  fs.copyFileSync(poc3dSrc, path.join(OUT, '3d', 'index.html'));
}

// Cinematic scroll landing page = the homepage (/), also at /valley/.
// Standalone HTML (its own <head>/scripts); copied raw, not through layout.
// The old marketing home now lives at /hold/ (slug changed).
const landingSrc = path.join(ROOT, 'game', 'oakenfall-landing.html');
if (fs.existsSync(landingSrc)) {
  fs.copyFileSync(landingSrc, path.join(OUT, 'index.html'));
  fs.mkdirSync(path.join(OUT, 'valley'), { recursive: true });
  fs.copyFileSync(landingSrc, path.join(OUT, 'valley', 'index.html'));
}

const layout = fs.readFileSync(path.join(SITE, 'layout.html'), 'utf8');
const changelogSrc = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const changelog = changelogNotices(changelogSrc);
const credits = md(fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8'));

// Version guard: the game's GAME_VERSION and CHANGELOG.md's top entry must
// agree, or the chronicle silently drifts from the game. Fail the build.
const gameSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const gameVer = (gameSrc.match(/const GAME_VERSION = '([^']+)'/) || [])[1];
const logVer = (changelogSrc.match(/^## (\S+)/m) || [])[1];
if (!gameVer || gameVer !== logVer) {
  throw new Error(`version drift: GAME_VERSION=${gameVer} but CHANGELOG.md top entry=${logVer}`);
}
// Expose the latest version + its notes to the site (for the "new since
// your last visit" banner).
const latestNotes = changelogSrc.split(/^## /m)[1].split('\n').slice(1).join(' ').trim();
fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'js', 'version.js'),
  'window.OAKENFALL_LATEST=' + JSON.stringify({ ver: gameVer, notes: latestNotes.slice(0, 300) }) + ';\n');

const meta = (src, key, fallback) => {
  const m = src.match(new RegExp('<!--\\s*' + key + ':\\s*(.*?)\\s*-->'));
  return m ? m[1] : fallback;
};

for (const file of fs.readdirSync(path.join(SITE, 'pages'))) {
  if (!file.endsWith('.html')) continue;
  let content = fs.readFileSync(path.join(SITE, 'pages', file), 'utf8');
  const slug = meta(content, 'slug', path.basename(file, '.html'));
  const title = meta(content, 'title', 'Oakenfall');
  const desc = meta(content, 'desc', 'Oakenfall — a dark-medieval city-builder in a single file.');
  content = content
    .replace(/<!--\s*(title|desc|slug):[\s\S]*?-->\n?/g, '')
    .replace('<!--CHANGELOG-->', changelog)
    .replace('<!--CREDITS-->', credits);
  const page = layout
    .replace(/{{title}}/g, title)
    .replace(/{{desc}}/g, desc)
    .replace(/{{slug}}/g, slug)
    .replace(/{{ogimage}}/g, ogImage)
    .replace(/{{twittercard}}/g, ogImage === '/apple-touch-icon.png' ? 'summary' : 'summary_large_image')
    .replace('{{content}}', content);
  const dst = slug === 'home' ? path.join(OUT, 'index.html')
    : path.join(OUT, path.basename(file, '.html'), 'index.html');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, page);
  console.log('built', path.relative(ROOT, dst));
}
console.log('done →', path.relative(ROOT, OUT));
