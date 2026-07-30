/* Coin earned by promising something and delivering it.
 *
 * Two forms of the same bargain. A daily bounty is the hold setting itself a
 * target before dusk. A trade route is a standing caravan contract: so much of
 * a good every few days, paid in coin, and broken if the caravan leaves empty
 * twice. Both are the reason to produce a surplus rather than just enough.
 */
import { G } from './state';
import { toast } from './hud';
import { sheetNav } from './sheet';
import { clamp } from './math';
import { hasActiveBuilding } from './buildings';
import { logCoinIn } from './economy';
import { sfx, buzz } from './audio';

type Deps = {
  /** Game-mode multiplier on bounty payouts. */
  bountyCoinMul: () => number;
};
let dep: Deps = { bountyCoinMul: () => 1 };
export function initContracts(deps: Deps): void { dep = deps; }

/* ── DAILY BOUNTIES ── two a day, rolled at dawn, paid on completion. */

const BOUNTY_POOL = [
  { id: 'bwood',  key: 'wood',   min: 30, max: 60, ic: '🪵', name: 'Timber Drive',   d: (n: number) => 'Gather ' + n + ' wood today' },
  { id: 'bstone', key: 'stone',  min: 20, max: 45, ic: '🪨', name: 'Quarry Push',    d: (n: number) => 'Gather ' + n + ' stone today' },
  { id: 'bfood',  key: 'food',   min: 25, max: 50, ic: '🌾', name: 'Harvest Rally',  d: (n: number) => 'Gather ' + n + ' food today' },
  { id: 'bbread', key: 'bread',  min: 4,  max: 10, ic: '🍞', name: 'Warm Ovens',     d: (n: number) => 'Bake ' + n + ' bread today' },
  { id: 'bplank', key: 'planks', min: 5,  max: 12, ic: '🪚', name: 'Mill Work',      d: (n: number) => 'Saw ' + n + ' planks today' },
  { id: 'bbuild', key: 'built',  min: 1,  max: 2,  ic: '🔨', name: 'Raise the Hold', d: (n: number) => 'Construct ' + n + ' building' + (n > 1 ? 's' : '') + ' today' },
];

export function rollDailyBounties(): void {
  // The progress counters reset with the bounties — they only ever mean "today".
  G.dailyProgress = { wood: 0, stone: 0, food: 0, bread: 0, planks: 0, flour: 0, built: 0 };
  const pool = [...BOUNTY_POOL];
  G.dailyBounties = [];
  for (let i = 0; i < 2 && pool.length; i++) {
    const bt = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const n = bt.min + Math.floor(Math.random() * (bt.max - bt.min + 1));
    G.dailyBounties.push({
      id: bt.id, key: bt.key, n, reward: 8 + Math.floor(n / 4),
      done: false, ic: bt.ic, name: bt.name, desc: bt.d(n),
    });
  }
}

export function checkBounties(): void {
  for (const b of G.dailyBounties) {
    if (b.done || (G.dailyProgress[b.key] || 0) < b.n) continue;
    b.done = true;
    const paid = Math.round(b.reward * dep.bountyCoinMul());
    G.coins += paid;
    logCoinIn('bounties', paid);
    sfx('coin');
    buzz(12);
    toast('💰 Bounty complete: ' + b.name + ' — +' + paid + ' coins!');
  }
}

/* ── TRADE ROUTES ── recurring caravan contracts. Needs a Trading Post, which
   is what ties the merchant economy to what the hold has actually built. */

const ROUTE_GOODS = [
  { type: 'planks', ic: '🪚', label: 'planks',     unit: 2.4 },
  { type: 'bread',  ic: '🍞', label: 'bread',      unit: 2.2 },
  { type: 'wood',   ic: '🪵', label: 'timber',     unit: 0.7 },
  { type: 'stone',  ic: '🪨', label: 'stone',      unit: 0.9 },
  { type: 'food',   ic: '🌾', label: 'provisions', unit: 0.8 },
];
const ROUTE_TOWNS = ['Greyford', 'Ashmere', 'Dunhollow', 'Pinebrook', 'Coldwater', 'Marren', 'Highcross', 'Thornwick'];

export function makeRouteOffer(): any {
  const g = ROUTE_GOODS[Math.floor(Math.random() * ROUTE_GOODS.length)];
  const amt = [6, 8, 10, 12, 15][Math.floor(Math.random() * 5)];
  const every = 2 + Math.floor(Math.random() * 3);        // every 2–4 days
  // Priced off what the good is worth plus a premium for the wait, so a slow
  // route pays more per delivery than a fast one.
  const coins = Math.max(3, Math.round(amt * g.unit + every * 1.5));
  const town = ROUTE_TOWNS[Math.floor(Math.random() * ROUTE_TOWNS.length)];
  return {
    id: 'r' + Math.random().toString(36).slice(2, 8), name: town, ic: g.ic,
    giveType: g.type, giveAmt: amt, coins, everyDays: every,
  };
}

/** Keep three offers on the table at all times. */
export function refreshRouteOffers(): void {
  while (G.routeOffers.length < 3) G.routeOffers.push(makeRouteOffer());
}

export function acceptRoute(id: string): void {
  if (!hasActiveBuilding('tradingPost')) { toast('Build a Trading Post to broker caravan routes.', true); return; }
  if (G.tradeRoutes.length >= 3) { toast('You can hold at most three trade routes.', true); return; }
  const i = G.routeOffers.findIndex((o: any) => o.id === id);
  if (i < 0) return;
  const o = G.routeOffers.splice(i, 1)[0];
  o.nextDay = G.dayCount + o.everyDays;
  o.missed = 0;
  G.tradeRoutes.push(o);
  const label = ROUTE_GOODS.find((g) => g.type === o.giveType)!.label;
  toast(o.ic + ' Caravan route to ' + o.name + ' agreed — ' + o.giveAmt + ' ' + label +
    ' every ' + o.everyDays + ' days.');
  refreshRouteOffers();
  // Accepting or ending a route only ever happens from the routes sheet, so
  // redrawing whatever view is current redraws exactly that sheet.
  sheetNav.rerender();
}

export function cancelRoute(id: string): void {
  const i = G.tradeRoutes.findIndex((r: any) => r.id === id);
  if (i < 0) return;
  const r = G.tradeRoutes.splice(i, 1)[0];
  toast('🐫 The route to ' + r.name + ' is dissolved.');
  sheetNav.rerender();
}

/** Called at each dawn: fulfil or miss whatever caravans are due. */
export function processTradeRoutes(): void {
  for (const r of G.tradeRoutes.slice()) {
    if (G.dayCount < r.nextDay) continue;
    const g = ROUTE_GOODS.find((x) => x.type === r.giveType)!;
    if ((G.stockpile[r.giveType] || 0) >= r.giveAmt) {
      G.stockpile[r.giveType] -= r.giveAmt;
      G.coins += r.coins;
      logCoinIn('routes', r.coins);
      r.missed = 0;
      toast(r.ic + ' Caravan to ' + r.name + ' paid 💰' + r.coins + ' for ' + r.giveAmt + ' ' + g.label + '.');
    } else {
      r.missed = (r.missed || 0) + 1;
      // One miss is a warning; two breaks the contract and the hold's word
      // with it, which is why it costs morale rather than only coin.
      if (r.missed >= 2) {
        G.tradeRoutes.splice(G.tradeRoutes.indexOf(r), 1);
        toast('🐫 The route to ' + r.name + ' was broken — the caravan left empty twice.', true);
        G.villagers.forEach((v: any) => { if (v.morale !== undefined) v.morale = clamp(v.morale - 4, 0, 100); });
        continue;
      }
      toast('⚠️ No ' + g.label + ' ready for the ' + r.name + ' caravan — one more miss ends the route.', true);
    }
    r.nextDay = G.dayCount + r.everyDays;
  }
}

/** The goods table, for the sheets that list a route's terms. */
export function routeGoodLabel(type: string): string {
  const g = ROUTE_GOODS.find((x) => x.type === type);
  return g ? g.label : type;
}
