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

const layout = fs.readFileSync(path.join(SITE, 'layout.html'), 'utf8');
const changelog = changelogNotices(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'));
const credits = md(fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8'));

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
    .replace('{{content}}', content);
  const dst = slug === 'home' ? path.join(OUT, 'index.html')
    : path.join(OUT, path.basename(file, '.html'), 'index.html');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, page);
  console.log('built', path.relative(ROOT, dst));
}
console.log('done →', path.relative(ROOT, OUT));
