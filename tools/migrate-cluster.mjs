#!/usr/bin/env node
/* Rewrite bare references to a cluster of globals into properties of G.
 *
 *   node tools/migrate-cluster.mjs villagers usedNames memorials
 *
 * Prints what it would change and writes src/main.ts. Two traps have bitten
 * every previous pass and are handled here:
 *
 *  1. A name preceded by a dot is a property access on something else —
 *     `data.villagers` in restoreState must NOT become `data.G.villagers`. But
 *     `...villagers` is a spread of the real binding and MUST be rewritten, and
 *     the character before it is also a dot.
 *  2. A name followed by a colon may be an object key (`villagers:` in
 *     serializeState) or the false branch of a ternary. Keys are left alone;
 *     every skipped site is printed so a human confirms which it was.
 *
 * Strings and comments are skipped outright — the names appear in toast text.
 *
 * One case the script cannot fix and only reports: a shorthand property.
 * `{ usedNames, journal }` in serializeState becomes `{ G.usedNames, journal }`,
 * which is a syntax error — it wants `usedNames: G.usedNames`. Those are listed
 * at the end; expand them by hand. Declarations get the same treatment
 * (`let G.villagers = []`) and are listed too, because a cluster moving to G
 * means deleting them here and adding them to state.ts.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'src', 'main.ts');
const names = process.argv.slice(2);
if (!names.length) { console.error('usage: migrate-cluster.mjs <name> [name...]'); process.exit(1); }

const src = fs.readFileSync(FILE, 'utf8');

/* Mark every byte that sits inside a string, template or comment so the rewrite
 * ignores it. A real parser would be better; this file is 7,800 lines of
 * @ts-nocheck and a scanner is what it can afford.
 *
 * Template literals need real nesting. The UI is built from templates holding
 * `${...}` holes holding further templates, and a scanner that closes the outer
 * backtick at the first inner one desynchronises for the rest of the file — the
 * next apostrophe in ordinary prose opens a string that never closes, and
 * thousands of lines silently look like text. Interpolation holes are CODE and
 * must stay unmasked: `${villagers.length}` is a reference like any other.
 */
function maskRanges(s) {
  const masked = new Uint8Array(s.length);

  // Returns the index just past the closing backtick.
  function template(i) {
    masked[i++] = 1;                                  // the opening `
    while (i < s.length) {
      if (s[i] === '\\') { masked[i] = masked[i + 1] = 1; i += 2; continue; }
      if (s[i] === '`') { masked[i] = 1; return i + 1; }
      if (s[i] === '$' && s[i + 1] === '{') {
        masked[i] = masked[i + 1] = 1;
        i = code(i + 2, true);                        // the hole is live code
        if (s[i] === '}') masked[i++] = 1;
        continue;
      }
      masked[i++] = 1;
    }
    return i;
  }

  // Scans code; when insideHole, stops at the '}' that closes the hole.
  function code(i, insideHole) {
    let depth = 0;
    while (i < s.length) {
      const c = s[i], d = s[i + 1];
      if (insideHole && c === '}' && depth === 0) return i;
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '/' && d === '/') { const j = s.indexOf('\n', i); const e = j < 0 ? s.length : j; masked.fill(1, i, e); i = e; continue; }
      else if (c === '/' && d === '*') { const j = s.indexOf('*/', i + 2); const e = j < 0 ? s.length : j + 2; masked.fill(1, i, e); i = e; continue; }
      else if (c === '`') { i = template(i); continue; }
      else if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < s.length && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') j++; j++; }
        masked.fill(1, i, Math.min(j + 1, s.length));
        i = j + 1; continue;
      }
      i++;
    }
    return i;
  }

  code(0, false);
  return masked;
}
const masked = maskRanges(src);

const skipped = [], changed = [];
const lineOf = (idx) => src.slice(0, idx).split('\n').length;

let out = '';
let last = 0;
const re = new RegExp(`(?<![\\w$])(${names.join('|')})(?![\\w$])`, 'g');
for (const m of src.matchAll(re)) {
  const i = m.index;
  if (masked[i]) continue;

  const before = src.slice(Math.max(0, i - 3), i);
  const isSpread = before.endsWith('...');
  const isProperty = before.endsWith('.') && !isSpread;
  const after = src.slice(i + m[0].length).match(/^\s*:/);

  if (isProperty) { skipped.push(`${lineOf(i)}  property access   ${src.slice(i - 12, i + 24).replace(/\n/g, ' ')}`); continue; }
  if (after) { skipped.push(`${lineOf(i)}  key or ternary    ${src.slice(i - 12, i + 34).replace(/\n/g, ' ')}`); continue; }

  out += src.slice(last, i) + 'G.' + m[0];
  last = i + m[0].length;
  changed.push(lineOf(i));
}
out += src.slice(last);

console.log(`rewrote ${changed.length} references across ${new Set(changed).size} lines`);

/* Anything that now reads `let G.x` or `{ G.x,` is a site the rewrite cannot
   leave valid on its own. Surface them loudly rather than letting tsc find
   them one at a time. */
const needsHand = [];
for (const m of out.matchAll(new RegExp(`(let|var|const)\\s+G\\.(${names.join('|')})\\b`, 'g'))) needsHand.push(`${out.slice(0, m.index).split('\n').length}  declaration — delete here, add to state.ts`);
for (const m of out.matchAll(new RegExp(`[{,]\\s*G\\.(${names.join('|')})\\s*[,}]`, 'g'))) needsHand.push(`${out.slice(0, m.index).split('\n').length}  shorthand property — expand to \`x: G.x\``);
if (needsHand.length) {
  console.log(`\nMUST be fixed by hand (${needsHand.length}):`);
  for (const s of needsHand) console.log('  ' + s);
}
if (skipped.length) {
  console.log(`\nleft alone (${skipped.length}) — check each is really a property or a key:`);
  for (const s of skipped) console.log('  ' + s);
}
fs.writeFileSync(FILE, out);
