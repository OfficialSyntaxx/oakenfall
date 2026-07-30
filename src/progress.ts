/* How a hold advances: what it has studied, and how far it has grown.
 *
 * Two small systems that belong together because both answer "how far along is
 * this hold" — one by what the player chose to learn, one by what the hold has
 * become on its own.
 */
import { G } from './state';
import { toast } from './hud';
import { TECH_TREE, HOLD_TIERS } from './defs';
import { sfx, buzz } from './audio';


/* ── STUDY ── one project at a time, begun from the Town Centre. */

/** Not already known, and its prerequisite is. */
export function techAvailable(t: any): boolean {
  return !G.researched[t.id] && (!t.req || G.researched[t.req]);
}

export function startResearch(id: string): void {
  if (G.activeResearch) { toast('Research is already underway.', true); return; }
  const t = TECH_TREE.find((x: any) => x.id === id);
  if (!t || G.researched[id]) return;
  // Check the whole cost before spending any of it — a half-paid study that
  // fails on the second resource would quietly rob the stores.
  for (const [k, amt] of Object.entries(t.cost) as [string, number][]) {
    if ((G.stockpile[k] || 0) < amt) { toast('Not enough ' + k + ' for ' + t.name + '.', true); return; }
  }
  for (const [k, amt] of Object.entries(t.cost) as [string, number][]) G.stockpile[k] -= amt;
  G.activeResearch = { id, remaining: t.time, total: t.time };
  toast('🔬 Research begun: ' + t.name);
}

/* ── HOLD TIERS ── Outpost, Hamlet, Village and up. Derived from population
   and buildings rather than stored, so a hold that shrinks slips back down. */

let currentTierIdx = 0;
/** Read the tier. Not exported as a binding, because an importer cannot assign
 *  to one and every other module only ever reads it. */
export function getTier(): number { return currentTierIdx; }
export function resetTier(): void { currentTierIdx = 0; }

export function computeTierIdx(): number {
  const pop = G.villagers.length;
  // Roads do not make a village, and the town centre was there from the start.
  const bld = G.buildings.filter((b: any) => b.type !== 'road' && b.type !== 'townCenter').length;
  let idx = 0;
  for (let i = HOLD_TIERS.length - 1; i >= 0; i--) {
    if (pop >= HOLD_TIERS[i].pop && bld >= HOLD_TIERS[i].bld) { idx = i; break; }
  }
  return idx;
}

export function checkTierUp(): void {
  const idx = computeTierIdx();
  if (idx > currentTierIdx) {
    currentTierIdx = idx;
    const t = HOLD_TIERS[idx];
    toast(t.ic + ' Your hold has grown into a ' + t.name + '!');
    sfx('tier');
    buzz([20, 40, 20]);
  } else if (idx < currentTierIdx) {
    // Shrunk, through loss rather than choice. Tracked, but not announced —
    // the hold already knows it lost someone.
    currentTierIdx = idx;
  }
}
