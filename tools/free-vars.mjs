#!/usr/bin/env node
/* Find names that resolve to nothing — src/main.ts's missing guard.
 *
 * main.ts is still `@ts-nocheck`, so a name that stops resolving there is not a
 * compile error. It becomes a global read, and a global read of nothing throws
 * at the moment that line runs. In a render pass wrapped in try/catch (there are
 * several, because iOS Safari throws from drawImage under memory pressure) the
 * throw is swallowed and the feature just silently stops drawing. That is
 * exactly how the sea disappeared for five versions: extracting the terrain made
 * main.ts's `windPhase` a free variable, and nothing anywhere said so.
 *
 * This asks tsc for one error code and one only. A copy of the source tree with
 * `@ts-nocheck` stripped produces thousands of type complaints, none of which we
 * are ready to act on — but TS2304 "Cannot find name" is not a type complaint.
 * It means the name is not there.
 *
 * Run: node tools/free-vars.mjs     (part of `npm run verify`)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.join(import.meta.dirname, '..');

/* Names that genuinely come from outside the module graph. Each one is a real
   host object or a deliberate global handshake — keep this list short, and add
   to it only with a reason. */
const KNOWN_GLOBALS = new Set([
  // The Capacitor bridge, injected by the native shell before the bundle runs.
  'Capacitor',
  // Set by the host page / the debug harness, read defensively.
  'OAKENFALL_HOST', '__oakDebug',
]);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oak-freevars-'));
try {
  // Copy src/ with the nocheck pragmas removed. tools/ is left out: it is Node
  // scripts, and their globals are a different set entirely.
  const src = path.join(tmp, 'src');
  fs.cpSync(path.join(ROOT, 'src'), src, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (!f.endsWith('.ts')) continue;
    const p = path.join(src, f);
    const s = fs.readFileSync(p, 'utf8');
    if (s.startsWith('// @ts-nocheck')) fs.writeFileSync(p, s.replace('// @ts-nocheck\n', ''));
  }
  // Extend the real config rather than parsing it — it has comments in it, and
  // extending means a compiler-option change here can never drift from the one
  // the build uses.
  fs.writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify({
    extends: path.join(ROOT, 'tsconfig.json'),
    include: [path.join(tmp, 'src')],
  }, null, 2));

  let out = '';
  try {
    execFileSync('npx', ['tsc', '--noEmit', '-p', tmp], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }

  const findings = [];
  for (const line of out.split('\n')) {
    // tsc reports paths relative to cwd, so they point off into the temp tree;
    // only the src/-and-after part means anything to a reader.
    const m = line.match(/(src\/\S+?)\((\d+),\d+\): error TS2304: Cannot find name '([^']+)'/);
    if (!m) continue;
    if (KNOWN_GLOBALS.has(m[3])) continue;
    findings.push({ file: m[1], line: +m[2], name: m[3] });
  }

  if (!findings.length) {
    console.log('free-vars: no unresolved names.');
    process.exit(0);
  }
  // Group by name — one missing helper usually shows up at a dozen call sites,
  // and the count is the useful part.
  const byName = new Map();
  for (const f of findings) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name).push(f);
  }
  console.error(`free-vars: ${byName.size} name(s) resolve to nothing —`);
  console.error('these throw at runtime, and a throw inside a render try/catch is silent.\n');
  for (const [name, hits] of [...byName].sort((a, b) => b[1].length - a[1].length)) {
    console.error(`  ${name}  (${hits.length}×)  ${hits[0].file}:${hits[0].line}`);
  }
  console.error('\nEither import it, declare it, or add it to KNOWN_GLOBALS with a reason.');
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
