/* The stores, and what happens to them.
 *
 * Capacity, spoilage, gaining, and the coin ledger. Every other system asks
 * this one how full the hold is — the villager AI to decide what to gather, the
 * work scoring to weigh scarcity, the steward to know what it can afford — so
 * these need to be importable rather than pushed in.
 */
import { G } from './state';
import { toast } from './hud';
import { clamp } from './math';
import { CYCLE_LEN } from './time';

type Deps = {
  /** Game-mode decay multiplier. Peaceful sets it to 0 and nothing spoils. */
  decayMul: () => number;
};
let dep: Deps = { decayMul: () => 1 };
export function initEconomy(deps: Deps): void { dep = deps; }

/** What the hold can hold before a granary. Crafted goods are deliberately
 *  tighter than raw ones: planks and bread are meant to be used, not hoarded. */
export const BASE_CAP: Record<string, number> = {
  wood: 200, stone: 160, food: 180, planks: 80, flour: 60, bread: 60,
};

export function capFor(type: string): number {
  let cap = BASE_CAP[type];
  for (const b of G.buildings) {
    if (b.type === 'granary' && (b.condition === undefined || b.condition >= 35)) cap += 90;
  }
  if (G.researched.cellars) cap += 60;              // Deep Cellars
  return cap;
}

/** Raw food that will not spoil: a small pantry baseline, plus each granary and
 *  the Deep Cellars study. Anything above this slowly goes to the rats. */
export function foodSafeCap(): number {
  let safe = 45;
  for (const b of G.buildings) {
    if (b.type === 'granary' && (b.condition === undefined || b.condition >= 35)) safe += 70;
  }
  if (G.researched.cellars) safe += 50;
  return safe;
}

let _spoilAcc = 0, _spoilDay = 0;
export function foodSpoilTick(dt: number): void {
  const mul = dep.decayMul();
  if (mul <= 0) return;                             // Peaceful: nothing spoils
  const excess = (G.stockpile.food || 0) - foodSafeCap();
  if (excess <= 0) return;
  // Roughly 14% of the EXCESS per day — a well-stocked hold loses a little, an
  // absurdly stocked one loses a lot, and nobody loses their last meal.
  const lost = excess * (0.14 / CYCLE_LEN) * mul * dt * (G.researched.coldstore ? 0.5 : 1);
  G.stockpile.food = Math.max(0, G.stockpile.food - lost);
  _spoilAcc += lost;
  // Mention it about once a day, and only once it is worth mentioning.
  if (G.dayCount !== _spoilDay && _spoilAcc >= 5) {
    _spoilDay = G.dayCount;
    toast('🐀 ' + Math.round(_spoilAcc) + ' food has spoiled for want of storage — raise a Granary.', true);
    _spoilAcc = 0;
  }
}

/* Warn once per resource when the stores fill, and re-arm when they drop. This
   lived on `window` for something only this file has ever read. */
const _capWarned: Record<string, boolean> = {};
/** A new hold starts with nothing warned about. */
export function resetCapWarnings(): void {
  for (const k of Object.keys(_capWarned)) delete _capWarned[k];
}

/** Add to the stores, respecting the cap. Returns what was actually gained,
 *  which is less than `amount` when the store is full. */
export function gainResource(type: string, amount: number): number {
  const cap = capFor(type);
  const before = G.stockpile[type];
  G.stockpile[type] = clamp(G.stockpile[type] + amount, 0, cap);
  const gained = G.stockpile[type] - before;
  if (gained > 0) {
    // Lifetime totals feed quests and deeds. Planks, flour and bread used to
    // go NaN here for want of the `|| 0`.
    G.totals[type] = (G.totals[type] || 0) + gained;
    if (G.dailyProgress[type] !== undefined) G.dailyProgress[type] += gained;
  }
  if (G.stockpile[type] >= cap && amount > 0) {
    if (!_capWarned[type]) {
      _capWarned[type] = true;
      toast(type[0].toUpperCase() + type.slice(1) + ' storage is full! Build a Granary.', true);
    }
  } else {
    _capWarned[type] = false;
  }
  return gained;
}

/** The Harvest Home festival boon, worth a fifth more from every field. */
export function harvestBoonMul(): number { return G.festivalBoon === 'harvest' ? 1.2 : 1; }

/* ── THE LEDGER ── every coin in and out, by category, for the economy view. */
export function logCoinIn(cat: string, amt: number): void {
  if (!G.ledger.in[cat]) G.ledger.in[cat] = 0;
  G.ledger.in[cat] += amt;
}
export function logCoinOut(cat: string, amt: number): void {
  if (!G.ledger.out[cat]) G.ledger.out[cat] = 0;
  G.ledger.out[cat] += amt;
}
