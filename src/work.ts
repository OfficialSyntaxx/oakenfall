/* What the hold needs, and who goes and does it.
 *
 * A utility score per trade, so an unemployed settler can work out what is
 * worth doing instead of waiting to be told, and an employed one can reconsider
 * when the balance shifts. This is the closest thing Oakenfall has to an AI,
 * and the numbers in it have been wrong in instructive ways — see the comments
 * on each threshold, which record what the wrong value actually did.
 */
import { G } from './state';
import { BUILD_DEFS, ROLE_DEFS } from './defs';
import { riverFrozen } from './time';
import { capFor } from './economy';
import { remember } from './lives';

export interface RoleNeed {
  role: string;
  /** Raw need spread over the hands already on it — what makes hiring fan out. */
  score: number;
  /** The hold's undivided appetite for this trade. */
  raw: number;
  workers: number;
  byHand?: boolean;
}

type Deps = {
  /** Is there a working building of this type — not just a ruin? */
  hasActiveBuilding: (type: string) => boolean;
  /** Hold tier; guards are only worth posting once there is something to raid. */
  currentTier: () => number;
  /** Put a settler into a trade. Handles the walk and the claim release. */
  reassignRole: (v: any, role: string) => void;
};
let dep: Deps = {
  hasActiveBuilding: () => false, currentTier: () => 0, reassignRole: () => {},
};
export function initWork(deps: Deps): void { dep = deps; }

/* Recomputed at most once a second: every idle settler asks the same question
   in the same frame, and the answer cannot have changed between them. */
let _needCache: RoleNeed[] | null = null;
let _needAt = -1;

export function roleNeedScores(): RoleNeed[] {
  if (_needCache && G.worldTime - _needAt < 1) return _needCache;

  const pop = Math.max(1, G.villagers.length);
  const count: Record<string, number> = {};
  for (const v of G.villagers) count[v.role] = (count[v.role] || 0) + 1;
  const frac = (k: string) => (G.stockpile[k] || 0) / Math.max(1, capFor(k));

  const out: RoleNeed[] = [];
  const add = (role: string, workplace: string, score: number) => {
    if (!dep.hasActiveBuilding(workplace)) return;        // nowhere to do the work
    out.push({ role, score: score / (1 + (count[role] || 0)), raw: score, workers: count[role] || 0 });
  };

  // Food is the survival pressure: weighted by how many mouths depend on it,
  // and sharply once the stores would not last long.
  const hungry = (1 - frac('food')) * 1.6 + ((G.stockpile.food || 0) < pop * 3 ? 1.4 : 0);
  add('farmer', 'farm', hungry);
  add('fisher', 'fishingHut', riverFrozen() ? 0 : hungry * 0.95);
  add('hunter', 'huntingCabin', hungry * 0.9);
  add('lumberjack', 'forestCamp', (1 - frac('wood')) * 1.25);
  add('miner', 'miningPost', (1 - frac('stone')) * 1.05);
  if (dep.currentTier() >= 2) add('guard', 'guardPost', 0.85);   // worth raiding now

  /* Last resort only. With NO workplace standing at all, folk gather deadfall
     and forage by hand — badly, but enough to climb back. Without this, a hold
     that spends its last timber on housing can never gather wood again, has no
     way to raise the camp that would let it, and starves with every settler
     idle: reachable in the first five minutes by doing exactly what the tutorial
     says. It is a fallback rather than a competing option, so a camp you just
     built never sits idle while your folk forage instead — and it only wakes
     when the hold cannot afford even the cheapest workplace, so a fresh hold
     still waits for the player to build rather than foraging on turn one. */
  const cheapestWorkplace = (BUILD_DEFS.forestCamp && BUILD_DEFS.forestCamp.cost.wood) || 40;
  if (!out.length && (G.stockpile.wood || 0) < cheapestWorkplace) {
    const byHand = (role: string, score: number) => out.push({
      role, score: score / (1 + (count[role] || 0)), raw: score, workers: count[role] || 0, byHand: true,
    });
    byHand('lumberjack', (1 - frac('wood')) * 0.55);
    byHand('hunter', hungry * 0.5);
  }

  out.sort((a, b) => b.score - a.score);
  _needCache = out;
  _needAt = G.worldTime;
  return out;
}

/** An unemployed adult takes up the most-needed trade — unless the hold is on
 *  fire, when free hands are worth more than another woodcutter, because idle
 *  adults are the bucket brigade. True if they took work. */
export function seekWork(v: any): boolean {
  if (G.buildings.some((b: any) => b._fire > 0)) return false;
  const best = roleNeedScores()[0];
  if (!best || best.score < 0.35) return false;
  dep.reassignRole(v, best.role);
  v.ambientEmote = '💡';
  return true;
}

/** An employed settler reconsiders now and then: a hold that has run its granary
 *  dry while six people fell timber should see some of them pick up a scythe.
 *  Player-assigned roles are not sacred, but they are sticky — switching costs a
 *  walk, so nothing moves unless the need is clearly greater elsewhere. */
export function maybeSwitchTrade(v: any): boolean {
  if (v.stage === 'child' || v.role === 'idle') return false;
  // Staggered per settler so the hold does not reconsider in one lump.
  if (v._tradeCheck === undefined) v._tradeCheck = G.worldTime + 20 + Math.random() * 30;
  if (G.worldTime < v._tradeCheck) return false;
  v._tradeCheck = G.worldTime + 30 + Math.random() * 30;
  if (G.buildings.some((b: any) => b._fire > 0)) return false;

  const scores = roleNeedScores();
  if (!scores.length) return false;

  /* Compare pressure PER HEAD, not the published score. A fixed margin against
     scores that are already divided by worker count is effectively unreachable
     once a few people hold a trade — the first version of this never fired
     once. What matters is how hard each trade pulls per person: my trade's need
     shared among those doing it, against the candidate's need if I joined. */
  const mine = scores.find((s) => s.role === v.role);
  const minePressure = mine ? mine.raw / Math.max(1, mine.workers) : 0;
  let pick: RoleNeed | null = null, pickPressure = 0;
  for (const cand of scores) {
    if (cand.role === v.role) continue;
    const p = cand.raw / (cand.workers + 1);
    if (p > pickPressure) { pick = cand; pickPressure = p; }
  }

  /* This floor only exists to stop churn when nothing much is needed; the ratio
     below is what decides "clearly stronger". Set too high (0.4) it vetoed real
     imbalances — a trade pulling 2.25x harder than the one being left. */
  if (!pick || pickPressure < 0.2) return false;
  // A trade in surplus frees you outright; otherwise the pull must be clearly
  // stronger, since switching costs a walk across the hold.
  const worthIt = minePressure <= 0.05 ? true : pickPressure > minePressure * 1.8;
  if (!worthIt) return false;

  dep.reassignRole(v, pick.role);
  v.ambientEmote = '🔁';
  remember(v, 'took up ' + (ROLE_DEFS[pick.role] ? ROLE_DEFS[pick.role].label : pick.role));
  return true;
}
