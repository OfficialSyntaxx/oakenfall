/* Lives: friendship, marriage, birth, growing up, and passing on.
 *
 * The part of the simulation the player remembers. Settlers who work near each
 * other become friends or grate on each other, the fond ones wed, children are
 * born and come of age, elders slow, and the dead are laid out in a memorial
 * grove by the town centre. One cycle, so it lives in one module.
 *
 * Reports through initLives() rather than reaching for main.ts's toast and
 * chronicle. It also needs one thing back from main: when a settler passes,
 * anything the UI is holding onto them for has to let go.
 */
import { G } from './state';
import { clamp } from './math';
import { roleLabel } from './defs';
import { skillTier } from './skills';

type Deps = {
  toast: (msg: string, urgent?: boolean) => void;
  chron: (type: string, a?: any, b?: any, n?: any) => void;
  /** Called after a settler is removed, so the sheet showing them can close. */
  onPassed: (v: any) => void;
  /** How many settlers the hold's housing can hold. */
  popCapacity: () => number;
  /** Raise a new settler. Returns the villager, so a newborn can be placed
   *  beside its parents and set to the 'child' stage. */
  spawnVillager: (nameOverride?: any, traitOverride?: any) => any;
};
let d: Deps = { toast: () => {}, chron: () => {}, onPassed: () => {}, popCapacity: () => 0, spawnVillager: () => null };
export function initLives(deps: Deps): void { d = deps; }

export function hasTrait(v: any, id: string): boolean { return v.trait && v.trait.id === id; }
export function relTo(v: any, o: any): any {
  return (v.relations || (v.relations = [])).find((r: any) => r.name === o.name);
}
/** A settler's short memory — four moments, most recent first. */
export function remember(v: any, text: string): void {
  if (!v.memories) v.memories = [];
  if (v.memories[0] === text) return;
  v.memories.unshift(text);
  if (v.memories.length > 4) v.memories.pop();
}

/** Friendships and rivalries already announced, so a reload does not re-toast
 *  every bond the hold ever formed. Keyed by the pair, not the direction. */
const _relMoments = new Set<string>();
/** Rebuild that set from a restored hold, silently. */
export function seedRelMoments(): void {
  _relMoments.clear();
  G.villagers.forEach((v: any) => (v.relations || []).forEach((r: any) => {
    const key = [v.name, r.name].sort().join('|');
    if (r.type === 'friend' && r.s > 40) _relMoments.add('fr' + key);
    if (r.type === 'rival' && r.s < -25) _relMoments.add('rv' + key);
  }));
}

export function bumpRel(v: any, o: any, amount: number): void {
  if (v === o) return;
  if (!v.relations) v.relations = [];
  let r = relTo(v, o);
  if (!r) {
    if (v.relations.length >= 5) return;          // five is as many as anyone tracks
    // The diligent and the glutton do not see eye to eye about a day's work.
    const rivalry = (hasTrait(v, 'diligent') && hasTrait(o, 'glutton')) ||
                    (hasTrait(v, 'glutton') && hasTrait(o, 'diligent'));
    r = { name: o.name, type: rivalry ? 'rival' : 'friend', s: 0 };
    v.relations.push(r);
  }
  const mult = r.type === 'rival' ? -0.6 : (hasTrait(v, 'lucky') ? 1.2 : 1);
  r.s = clamp(r.s + amount * mult, -100, 100);
  const key = [v.name, o.name].sort().join('|');
  if (r.type === 'friend' && r.s > 40 && !_relMoments.has('fr' + key)) {
    _relMoments.add('fr' + key);
    d.toast('🤝 ' + v.name + ' and ' + o.name + ' became fast friends.');
    d.chron('friends', v.name, o.name);
    remember(v, 'became friends with ' + o.name);
    remember(o, 'became friends with ' + v.name);
  } else if (r.type === 'rival' && r.s < -25 && !_relMoments.has('rv' + key)) {
    _relMoments.add('rv' + key);
    d.toast('😤 ' + v.name + ' and ' + o.name + " can't abide each other's pace of work.", true);
    d.chron('rivals', v.name, o.name);
  }
}

let _relAcc = 0;
/** Every ten seconds, not every frame: this is O(n²) over the hold. */
export function relationsTick(dt: number): void {
  _relAcc += dt;
  if (_relAcc < 10) return;
  _relAcc = 0;
  for (let i = 0; i < G.villagers.length; i++) {
    for (let j = i + 1; j < G.villagers.length; j++) {
      const a = G.villagers[i], b = G.villagers[j];
      if (a.state === 'spawning' || b.state === 'spawning') continue;
      if (Math.hypot(a.gx - b.gx, a.gy - b.gy) < 2.4) { bumpRel(a, b, 6); bumpRel(b, a, 6); }
    }
  }
}

/* ── AGING & GENERATIONS ── settlers grow up, grow old, and pass on. Paced on
   its own clock so lives are observable within a session but gentle on the
   workforce, since births keep pace. */
export const AGE_YEAR = 720, ADULT_AGE = 1.5, ELDER_BEFORE = 1.2, LIFESPAN_BASE = 5.5;

/** Let go of whatever a settler had claimed — a tile, a workplace slot, a load
 *  in their arms — so it does not stay reserved by someone who is gone or
 *  headed elsewhere. */
export function releaseClaims(v: any): void {
  if (v.targetTile) { v.targetTile.workers = Math.max(0, v.targetTile.workers - 1); v.targetTile = null; }
  if (v.targetBuilding) { v.targetBuilding.workers = Math.max(0, v.targetBuilding.workers - 1); v.targetBuilding = null; }
  v.path = [];
  v.pathTarget = null;
  v.carrying = null;
}

/** Position by the running count of the departed, wrapping over the grove's 40
 *  plots — when an old grave is reclaimed a new one takes its place, rather
 *  than every grave stacking on the last once the cap is reached. */
export function memorialSpot(): { gx: number; gy: number } {
  const n = (G.journal.passed || 0) % 40;
  return { gx: G.TC_X - 4 + (n % 4) * 0.85, gy: G.TC_Y + 3 + Math.floor(n / 4) * 0.85 };
}

export function agingTick(dt: number): void {
  const dy = dt / AGE_YEAR;
  for (const v of [...G.villagers]) {
    if (v.age === undefined) { v.age = 2; v.stage = 'adult'; v.lifespan = LIFESPAN_BASE; }
    if (v.state === 'spawning') continue;
    v.age += dy;
    if (v.stage === 'child' && v.age >= ADULT_AGE) {
      v.stage = 'adult';
      d.toast('🌿 ' + v.name + ' has come of age and joins the work.');
      d.chron('ofage', v.name);
      remember(v, 'came of age');
    } else if (v.stage === 'adult' && v.age >= v.lifespan - ELDER_BEFORE) {
      v.stage = 'elder';
    } else if (v.stage !== 'child' && v.age >= v.lifespan) {
      passVillager(v);
    }
  }
}

export function passVillager(v: any): void {
  G.villagers = G.villagers.filter((x: any) => x !== v);
  releaseClaims(v);
  G.villagers.forEach((o: any) => {
    if (o.relations) o.relations = o.relations.filter((r: any) => r.name !== v.name);
    if (o.partner === v.name) {
      o.partner = null;
      o.morale = clamp((o.morale || 65) - 12, 0, 100);
      remember(o, 'lost ' + v.name);
    }
    if (o.parents && o.parents.includes(v.name)) o.morale = clamp((o.morale || 65) - 6, 0, 100);
  });
  d.onPassed(v);

  const spot = memorialSpot();
  G.memorials.push({ name: v.name, gx: spot.gx, gy: spot.gy });
  // The grove is finite — the oldest graves are quietly reclaimed by the
  // forest, which keeps the render list and the save bounded over long games.
  if (G.memorials.length > 40) G.memorials.shift();
  G.journal.passed = (G.journal.passed || 0) + 1;

  const seasons = Math.floor((v.age || 2) * 4);
  if (skillTier(v, v.role).label === 'Master') {
    d.toast('🕊️ ' + v.name + ', a Master ' + roleLabel(v.role) + ', has passed at ' + seasons +
      ' seasons — a grievous loss to the hold.');
    // The whole hold mourns a master.
    G.villagers.forEach((o: any) => { if (o.morale !== undefined) o.morale = clamp(o.morale - 3, 0, 100); });
  } else {
    d.toast('🕊️ ' + v.name + ' passed peacefully at ' + seasons + ' seasons — laid to rest in the grove.');
  }
  d.chron('passed', v.name, null, seasons);
}

/* ── FAMILIES ── settlers pair off and raise children. Both are on their own
   slow clocks rather than the frame: a hold should grow at the pace of a story,
   not of a spreadsheet. */

export function familyTick(dt: number): void {
  G.courtshipTimer -= dt;
  if (G.courtshipTimer <= 0) {
    G.courtshipTimer = 80 + Math.random() * 60;
    const single = G.villagers.filter((v: any) => !v.partner && v.morale > 50 && v.state !== 'spawning');
    if (single.length >= 2) {
      const a = single[Math.floor(Math.random() * single.length)];
      // A close friend is the likelier match; failing that, anyone unattached.
      const friendMatch = (a.relations || [])
        .filter((r: any) => r.type === 'friend' && r.s > 50)
        .map((r: any) => single.find((o: any) => o.name === r.name))
        .filter(Boolean)[0];
      const b = friendMatch || single[Math.floor(Math.random() * single.length)];
      if (a !== b) {
        a.partner = b.name; b.partner = a.name;
        remember(a, 'wed ' + b.name); remember(b, 'wed ' + a.name);
        a.morale = clamp(a.morale + 15, 0, 100);
        b.morale = clamp(b.morale + 15, 0, 100);
        d.toast('💞 ' + a.name + ' and ' + b.name + ' have wed beneath the pines!');
        d.chron('wed', a.name, b.name);
        G.journal.weddings++;
      }
    }
  }

  G.birthTimer -= dt;
  if (G.birthTimer <= 0) {
    G.birthTimer = 120 + Math.random() * 80;
    // No room and no food is no time to have a child.
    if (G.villagers.length >= d.popCapacity() || G.stockpile.food <= 30) return;
    const couples = G.villagers.filter((v: any) =>
      v.partner && v.morale > 55 && G.villagers.some((o: any) => o.name === v.partner));
    if (!couples.length) return;
    const parent = couples[Math.floor(Math.random() * couples.length)];
    const other = G.villagers.find((o: any) => o.name === parent.partner);
    const inherited = Math.random() < 0.5 ? parent.trait : (other ? other.trait : parent.trait);
    const child = d.spawnVillager(null, inherited);
    child.gx = parent.gx; child.gy = parent.gy;
    child.parents = [parent.name, parent.partner];
    child.age = 0;
    child.stage = 'child';
    d.toast('👶 A child is born to ' + parent.name + ' and ' + parent.partner + ' — welcome, ' + child.name + '!');
    d.chron('born', child.name, parent.name + ' and ' + parent.partner);
    G.journal.childrenBorn++;
  }
}
