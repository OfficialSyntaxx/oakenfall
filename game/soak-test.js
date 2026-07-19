/* =====================================================================
   OAKENFALL — headless soak test (Node, no browser)
   Validates the villager simulation over 3 simulated hours (~15 in-game
   years) and asserts the invariants that matter: no extinction, no
   frozen villagers, no dangling references, a working birth/death cycle,
   and a healthy re-path rate.

   HOW TO RUN:
     1. Extract the SIM section of the game into ./sim_only.js
        (everything from the top of the game <script> down to the line
         "/* ============ RENDER ..." — i.e. the pure-logic half).
        The SIM section has ZERO rendering calls, so it runs headless.
     2. node soak-test.js
   Wire this as `npm test` so every change to the sim is validated.
   ===================================================================== */
global.render = new Proxy({}, { get: () => () => {} });
global.ui     = new Proxy({}, { get: () => () => {} });
global.performance = { now: () => Date.now() };

const fs = require('fs');
let s = fs.readFileSync('sim_only.js', 'utf8');
s = "global.__stuck=0;\n" +
    s.replace("if(typeof console!=='undefined'&&console.warn)console.warn('watchdog freed',v.first);",
              "global.__stuck++;") +
    "\nmodule.exports={sim,simTick,spawnVillager,addBuilding,CENTER};";
fs.writeFileSync('sim_f.js', s);

const M = require('./sim_f.js');
M.addBuilding('fire', M.CENTER.x, M.CENTER.y);
for (let i = 0; i < 5; i++) M.spawnVillager({});

const DT = 1/30;
let t = 0, minPop = 99, maxPop = 0, extinct = false, frozenEver = false;
const bornEver = new Set();
while (t < 3600) {
  M.simTick(DT); t += DT;
  if (Math.floor(t*2) !== Math.floor((t-DT)*2)) {
    const p = M.sim.villagers.length;
    minPop = Math.min(minPop, p); maxPop = Math.max(maxPop, p);
    if (p === 0) extinct = true;
    M.sim.villagers.forEach(v => {
      if (v.task === 'Idle' && v.taskT > 3) frozenEver = true;
      if (v.parents) bornEver.add(v.id);
    });
  }
}
const V = M.sim.villagers;
const danglR = V.some(v => v.relations.some(r => !V.find(x => x.id === r.id)));
const danglP = V.some(v => v.partner && !V.find(x => x.id === v.partner));
const danglC = V.some(v => v.children.some(c => c && !V.find(x => x.id === c)));

console.log('=========== OAKENFALL SOAK (3 sim hours / ~15 years) ===========');
console.log('population min/max/final :', minPop, '/', maxPop, '/', V.length);
console.log('food (final)            :', Math.round(M.sim.resources.food));
console.log('buildings / memorials   :', M.sim.buildings.length, '/', M.sim.memorials.length);
console.log('watchdog re-paths       :', global.__stuck, '(' + (global.__stuck/60).toFixed(2) + '/min)');
console.log('extinction / frozen     :', extinct, '/', frozenEver);
console.log('dangling refs r/p/c     :', danglR, danglP, danglC);
console.log('villagers born in-sim   :', bornEver.size);
console.log('----------------------------------------------------------------');
const fails = [];
if (extinct) fails.push('extinction');
if (frozenEver) fails.push('villager froze >3s idle');
if (minPop < 2) fails.push('near-extinction');
if (danglR || danglP || danglC) fails.push('dangling references');
if (bornEver.size === 0) fails.push('reproduction loop dead');
if (global.__stuck > 600) fails.push('excessive re-paths');
console.log(fails.length ? ('RESULT: FAIL — ' + fails.join(', ')) : 'RESULT: PASS ✅');
process.exit(fails.length ? 1 : 0);
