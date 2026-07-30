/* Passing happenings — a merchant on the road, a festival, a healer, a rich
 * vein of stone.
 *
 * At most one timed event runs at a time. That cap is the whole design: two
 * overlapping bonuses would be impossible to read on the HUD, and the shop
 * refuses to sell a second one rather than silently stacking it.
 *
 * The event is not saved. It is a mood the world is in for a minute of play, and
 * a hold reloaded a day later should not resume a half-finished festival.
 */
import { G } from './state';
import { toast } from './hud';
import { sfx } from './audio';
import { gainResource } from './economy';

/* Which game mode is running decides how often a merchant turns up and how good
   the trade is; the mode table lives with main.ts's run setup. */
type Deps = { merchantOften: () => boolean; tradeMul: () => number };
let dep: Deps = { merchantOften: () => false, tradeMul: () => 1 };
export function initEvents(deps: Deps): void { dep = deps; }

export type ActiveEvent = { type: string; endsAt: number; data?: any } | null;

let active: ActiveEvent = null;

export function activeEvent(): ActiveEvent { return active; }
export function isEventRunning(): boolean { return !!active; }
export function isFestivalOn(): boolean { return !!active && active.type === 'festival'; }
export function isMerchantHere(): boolean { return !!active && active.type === 'merchant'; }

/** Begin a timed event. Refuses if one is already running, so the caller can use
 *  the result to decide whether to charge the player. */
export function startEvent(type: string, seconds: number): boolean {
  if (active) return false;
  active = { type, endsAt: G.worldTime + seconds };
  if (type === 'festival') sfx('festival');
  return true;
}

/** Clear a finished event and say so. Called once per world tick. */
export function eventTick(): void {
  if (active && G.worldTime >= active.endsAt) {
    if (active.type === 'merchant') toast('🧳 The merchant packs up and moves on.');
    else if (active.type === 'festival') toast('🎉 The festival winds down.');
    active = null;
  }
}

/** Forget any running event — for starting or loading a hold. */
export function clearEvent(): void { active = null; }

/* ── THE ROLL ── weighted by nothing more than a cut-up unit interval. Two of the
   five outcomes are instant rather than timed, so a roll that lands on them
   leaves the field clear for the next one. */
export function rollRandomEvent(): void {
  if (active) return;                                   // one at a time
  let roll = Math.random();
  // Merchant-friendly modes bias the roll toward the merchant branch rather than
  // rerolling until it hits, which would skew every other outcome too.
  if (dep.merchantOften() && roll > 0.30) roll = Math.random() < 0.45 ? 0.1 : roll;

  if (roll < 0.30) {
    startEvent('merchant', 70);
    toast('🧳 A traveling merchant arrives — trade rates improved for a while!');
  } else if (roll < 0.50) {
    // A wandering healer, who works for food and will not be stiffed.
    const sickCount = G.villagers.filter((v: any) => v.sick).length;
    if (sickCount > 0 && G.stockpile.food >= 8) {
      G.stockpile.food -= 8;
      G.villagers.forEach((v: any) => { v.sick = false; v.sickTimer = 0; });
      toast('🌿 A wandering healer cures ' + sickCount + ' sick villager' + (sickCount > 1 ? 's' : '') + ' for 8 food.');
    } else if (sickCount > 0) {
      toast('🌿 A healer passed by, but the stores couldn\'t afford their fee (8 food).');
    }
  } else if (roll < 0.70) {
    startEvent('festival', 55);
    toast('🎉 A festival lifts every heart — the hold works faster for a while!');
  } else if (roll < 0.85) {
    // A rich vein: one stone deposit refills to twice its normal size.
    const cand = G.stoneTiles.filter((t: any) => t.resourceAmount < t.maxResource);
    if (cand.length) {
      const t = cand[Math.floor(Math.random() * cand.length)];
      t.resourceAmount = t.maxResource * 2;
      toast('⛏️ Miners report a rich vein — a stone deposit has doubled!');
    }
  } else {
    const got = gainResource('food', 6 + Math.floor(Math.random() * 8));
    if (got > 0) toast('🍄 Foragers return with ' + got + ' extra food from the woods.');
  }
}

/* ── WHAT AN EVENT IS WORTH ── both fold in the game mode, so callers multiply by
   one number rather than remembering to ask twice. */

export function eventTradeBonus(): number {
  return (isMerchantHere() ? 1.35 : 1) * (dep.tradeMul() || 1);
}
export function eventSpeedBonus(): number { return isFestivalOn() ? 1.25 : 1; }
