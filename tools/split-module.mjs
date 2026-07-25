#!/usr/bin/env node
/* Move top-level declarations out of src/main.ts into a module, and import them
 * back. Brace/bracket-balanced so it never truncates a table mid-way.
 *
 * Only ever used on declarations verified to be self-contained — anything that
 * closes over game state has to stay in main.ts until that state is itself
 * modularised.
 *
 * Usage: node tools/split-module.mjs <module> <header-file> <name> [name...]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAIN = path.join(ROOT, 'src', 'main.ts');
const [, , moduleName, headerFile, ...names] = process.argv;
if (!moduleName || !names.length) {
  console.error('usage: split-module.mjs <module> <header-file> <name>...');
  process.exit(1);
}

let src = fs.readFileSync(MAIN, 'utf8');
const taken = [];

// Find `const NAME` / `let NAME` / `function NAME` at column 0 and return the
// full declaration, balanced across (), [] and {} and ending at its terminator.
function extract(name) {
  const re = new RegExp(`^(?:const|let|function)\\s+${name}\\b`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index;
  const isFn = /^function/.test(m[0]);

  // Walk forward honouring strings and comments so braces inside them are
  // ignored. `open` is the character that begins the region we must balance.
  const scan = (from, open, close) => {
    let depth = 0, inStr = null;
    for (let i = from; i < src.length; i++) {
      const c = src[i], prev = src[i - 1];
      if (inStr) { if (c === inStr && prev !== '\\') inStr = null; continue; }
      if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
      if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e === -1 ? src.length : e + 1; continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) return i; }
    }
    return -1;
  };

  if (isFn) {
    // A function's parameter list closes to depth 0 before the body opens, so
    // balancing generically stops early and decapitates it. Find the body brace
    // explicitly, then balance braces alone.
    const paramOpen = src.indexOf('(', start);
    const paramClose = scan(paramOpen, '(', ')');
    const bodyOpen = src.indexOf('{', paramClose);
    const bodyClose = scan(bodyOpen, '{', '}');
    if (bodyClose === -1) return null;
    return { start, end: bodyClose + 1, text: src.slice(start, bodyClose + 1) };
  }

  // const/let: balance an object/array initialiser, else run to the semicolon.
  const eq = src.indexOf('=', start);
  let j = eq + 1;
  while (j < src.length && /\s/.test(src[j])) j++;
  if (src[j] === '{' || src[j] === '[') {
    const close = scan(j, src[j], src[j] === '{' ? '}' : ']');
    if (close === -1) return null;
    let end = close + 1;
    if (src[end] === ';') end++;
    return { start, end, text: src.slice(start, end) };
  }
  const semi = src.indexOf(';', start);
  return { start, end: semi + 1, text: src.slice(start, semi + 1) };
}

for (const name of names) {
  const found = extract(name);
  if (!found) { console.error('  NOT FOUND:', name); process.exit(1); }
  taken.push({ name, text: found.text });
  src = src.slice(0, found.start) + src.slice(found.end);
  console.log('  moved', name, `(${found.text.length} chars)`);
}

const header = fs.existsSync(headerFile) ? fs.readFileSync(headerFile, 'utf8') : '';
const body = taken.map((t) => 'export ' + t.text.trimStart()).join('\n\n');
fs.writeFileSync(path.join(ROOT, 'src', moduleName + '.ts'), header + '\n' + body + '\n');

// Import them back into main.ts, just after its leading block comment.
const importLine = `import { ${names.join(', ')} } from './${moduleName}';\n`;
const anchor = src.indexOf('*/');
src = anchor === -1 ? importLine + src : src.slice(0, anchor + 2) + '\n' + importLine + src.slice(anchor + 2);
fs.writeFileSync(MAIN, src);

console.log(`→ src/${moduleName}.ts (${names.length} declarations)`);
