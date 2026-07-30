/* What stands on the land: raising it, removing it, and asking about it.
 *
 * The queries here — is there a working X, where is the nearest Y with a free
 * slot, where is the town centre — are what the villager AI and the steward are
 * really made of, so they need to be importable rather than pushed in.
 */
import { G } from './state';
import { toast } from './hud';
import { chron } from './chronicle';
import { BUILD_DEFS } from './defs';
import { dist2 } from './math';
import { tileAt } from './mapgen';

type Deps = {
  /** Called when a building is removed, so a sheet showing it can close. */
  onRemoved: (b: any) => void;
  /** Game-mode decay multiplier. Peaceful is 0 — nothing ever wears out. */
  decayMul: () => number;
};
let dep: Deps = { onRemoved: () => {}, decayMul: () => 1 };
export function initBuildings(deps: Deps): void { dep = deps; }

/** The town hall: every hauler's fallback drop-off, and the anchor for the
 *  camera, the road network and half the distance checks in the game.
 *
 *  This function once called ITSELF — infinite recursion, throwing on every
 *  invocation for fourteen versions. Nothing looked broken because the frame
 *  loop swallows exceptions; hauling, road logistics, seeking food and seeking
 *  sleep were all quietly dead. Worth remembering how small the fault was. */
export function findTC(): any {
  return G.buildings.find((b: any) => b.type === 'townCenter') || null;
}

export function addBuilding(type: string, gx: number, gy: number): any {
  const b: any = {
    id: 'b' + Math.random().toString(36).slice(2, 9),
    type, gx, gy, w: 1, h: 1, workers: 0, condition: 100,
  };
  if (type === 'townCenter') { b.w = 2; b.h = 2; }
  if (BUILD_DEFS[type] && BUILD_DEFS[type].proc) b.procTimer = BUILD_DEFS[type].proc.every;
  G.buildings.push(b);
  // Every tile of the footprint points back at the building, so a tap anywhere
  // on it selects it and nothing else can be raised on top.
  for (let yy = gy; yy < gy + b.h; yy++) {
    for (let xx = gx; xx < gx + b.w; xx++) {
      if (G.grid[yy] && G.grid[yy][xx]) G.grid[yy][xx].building = b;
    }
  }
  return b;
}

export function removeBuilding(b: any): void {
  for (let yy = b.gy; yy < b.gy + b.h; yy++) {
    for (let xx = b.gx; xx < b.gx + b.w; xx++) {
      if (G.grid[yy] && G.grid[yy][xx] && G.grid[yy][xx].building === b) G.grid[yy][xx].building = null;
    }
  }
  // Anyone walking to it, or working in it, has nowhere to be now.
  G.villagers.forEach((v: any) => {
    if (v.targetBuilding !== b) return;
    v.targetBuilding = null;
    v.path = [];
    v.pathTarget = null;
    if (/^walking/.test(v.state) || v.state === 'working' || v.state === 'farming') v.state = 'idle';
  });
  const i = G.buildings.indexOf(b);
  if (i >= 0) G.buildings.splice(i, 1);
  dep.onRemoved(b);
}

export function buildingCenter(b: any): { gx: number; gy: number } {
  return { gx: b.gx + b.w / 2 - 0.5, gy: b.gy + b.h / 2 - 0.5 };
}

export function popCapacity(): number {
  let cap = 4;                                  // the town centre sleeps four
  for (const b of G.buildings) {
    if (b.type === 'house') cap += 3;
    else if (b.type === 'manor') cap += 6;
  }
  return cap;
}

export function hasBuildingType(type: string): boolean {
  return G.buildings.some((b: any) => b.type === type);
}
/** Standing AND not a ruin. A building below 35 condition stops giving its
 *  bonus, so "is there a farm" is rarely the question worth asking. */
export function hasActiveBuilding(type: string): boolean {
  return G.buildings.some((b: any) => b.type === type && (b.condition === undefined || b.condition >= 35));
}

/** Nearest building of any of `types`. With requireSlot, skips any already
 *  worked by three settlers, so hands spread across workplaces. */
export function nearestBuildingOfTypes(types: string[], fromGX: number, fromGY: number, requireSlot?: boolean): any {
  let best = null, bestD = Infinity;
  for (const b of G.buildings) {
    if (!types.includes(b.type)) continue;
    if (requireSlot && b.workers >= 3) continue;
    const c = buildingCenter(b);
    const dd = dist2(fromGX, fromGY, c.gx, c.gy);
    if (dd < bestD) { bestD = dd; best = b; }
  }
  return best;
}

/** BFS the road and bridge network out from the town centre; a processor with a
 *  connected road in its 8-neighbourhood earns the logistics bonus. This is
 *  what makes roads worth laying rather than decorative. */
export function recomputeLogistics(): void {
  const tc = findTC();
  if (!tc) { G.buildings.forEach((b: any) => { b._roadLinked = false; }); return; }

  const isRoadTile = (x: number, y: number) => {
    const t = tileAt(x, y);
    return !!(t && t.building && (t.building.type === 'road' || t.building.type === 'bridge'));
  };
  const seen = new Set<string>();
  const queue: [number, number][] = [];
  // Seed with road tiles touching the town centre's footprint, diagonals included.
  for (let y = tc.gy - 1; y <= tc.gy + tc.h; y++) {
    for (let x = tc.gx - 1; x <= tc.gx + tc.w; x++) {
      if (isRoadTile(x, y) && !seen.has(x + ',' + y)) { seen.add(x + ',' + y); queue.push([x, y]); }
    }
  }
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const k = (x + dx) + ',' + (y + dy);
      if (!seen.has(k) && isRoadTile(x + dx, y + dy)) { seen.add(k); queue.push([x + dx, y + dy]); }
    }
  }
  for (const b of G.buildings) {
    if (!BUILD_DEFS[b.type] || !BUILD_DEFS[b.type].proc) { b._roadLinked = false; continue; }
    let linked = false;
    for (let dy = -1; dy <= b.h && !linked; dy++) {
      for (let dx = -1; dx <= b.w; dx++) {
        if (seen.has((b.gx + dx) + ',' + (b.gy + dy))) { linked = true; break; }
      }
    }
    b._roadLinked = linked;
  }
}

/** Some trades must be sited at their work: a fishing hut on the bank, a
 *  forestry camp at the treeline. `test` runs against each neighbouring tile;
 *  `need` is the phrase shown when a player picks somewhere unsuitable. */
export const BUILD_NEEDS_ADJ: Record<string, { test: (t: any) => boolean; need: string }> = {
  fishingHut:   { test: (t) => t.type === 'water',  need: 'beside water' },
  forestCamp:   { test: (t) => t.type === 'forest', need: 'at the treeline' },
  miningPost:   { test: (t) => t.type === 'stone',  need: 'by a stone outcrop' },
  huntingCabin: { test: (t) => !!t.wilds,           need: 'along the wilds' },
};


/* ═══ WHAT TIME DOES TO A HOLD ═══════════════════════════════════════════
   Everything below is about buildings changing on their own: weathering,
   clustering into named quarters, and — for a forester's grove — mending the
   land around them. */

/** Full decay over about ten day/night cycles at 1x. Slow enough that repair is
 *  a rhythm rather than a chore, fast enough that neglect shows. */
const DECAY_RATE = 100 / (10 * 245);

export function decayTick(dt: number): void {
  const mul = dep.decayMul();
  for (const b of G.buildings) {
    // Roads do not weather, and the town centre is the one thing that stands.
    if (b.type === 'road' || b.type === 'townCenter') continue;
    if (b.condition === undefined) b.condition = 100;
    if (b.condition > 0) b.condition = Math.max(0, b.condition - DECAY_RATE * mul * dt);
    // Warn once on the way down, and re-arm once mended, so a building on the
    // threshold does not nag every frame.
    if (b.condition < 35 && !b._wornWarned) {
      b._wornWarned = true;
      toast('⚠️ Your ' + (BUILD_DEFS[b.type] ? BUILD_DEFS[b.type].name : b.type) +
        ' is falling into disrepair! (Tap it to repair — or 🔧 Mend the Hold in the coin shop.)', true);
    }
    if (b.condition >= 35) b._wornWarned = false;
  }
}

const DISTRICT_DESC = {
  house:"Hearth", manor:"Hearth", farm:"Harvest", pasture:"Meadow", granary:"Harvest",
  windmill:"Mill", bakery:"Mill", forestCamp:"Timber", sawmill:"Timber", miningPost:"Stone",
  fishingHut:"Wharf", huntingCabin:"Hunters'", guardPost:"Warden", watchtower:"Warden",
  palisade:"Warden", well:"Warden", tavern:"Market", tradingPost:"Market",
};
const DISTRICT_SUFFIX = ['Quarter','Row','End','Green','Rise','Reach','Cross','Gate','Hollow','Bank'];
function _hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
export function computeDistricts(announce){
  const pts = G.buildings.filter(b=>b.type!=='road'&&b.type!=='townCenter'&&b.type!=='bridge');
  const seen = new Set();
  const next = [];
  for(const b of pts){
    if(seen.has(b)) continue;
    const stack=[b], group=[]; seen.add(b);
    while(stack.length){
      const c=stack.pop(); group.push(c);
      for(const o of pts){ if(!seen.has(o) && dist2(c.gx,c.gy,o.gx,o.gy) < 8){ seen.add(o); stack.push(o); } }
    }
    if(group.length < 3) continue;
    const counts={}; group.forEach(g=>{ const d=DISTRICT_DESC[g.type]||'Old'; counts[d]=(counts[d]||0)+1; });
    let dom='Old', best=0; for(const k in counts){ if(counts[k]>best){ best=counts[k]; dom=k; } }
    const cx=group.reduce((s,g)=>s+g.gx,0)/group.length, cy=group.reduce((s,g)=>s+g.gy,0)/group.length;
    const id = dom+':'+Math.round(cx/3)+','+Math.round(cy/3);
    const prev = G.districts.find(d=>d.id===id);
    const name = prev ? prev.name : (dom+' '+DISTRICT_SUFFIX[_hashStr(id)%DISTRICT_SUFFIX.length]);
    next.push({id, name, gx:cx, gy:cy, size:group.length});
    if(!prev && announce) chron('district', name);
  }
  G.districts = next;
}

/* ── FORESTER'S GROVE ── replants tired and barren forest near each grove, so
   timber stays sustainable if you invest in the land. */
let _foresterTimer = 0;
export function foresterTick(dt){
  _foresterTimer -= dt;
  if(_foresterTimer > 0) return;
  _foresterTimer = 8;
  const groves = G.buildings.filter(b=>b.type==='forester' && (b.condition===undefined||b.condition>=35));
  if(!groves.length) return;
  for(const g of groves){
    for(const t of G.forestTiles){
      if(dist2(t.gx,t.gy,g.gx,g.gy) > 20) continue; // within ~4.5 tiles
      const base = t.baseMax || 6;
      if(t.maxResource < base){
        t.maxResource = Math.min(base, t.maxResource + 1); // replant / let the stand recover
        if(t.maxResource>0 && t.resourceAmount<=0 && G.worldTime>=t.regrowAt) t.resourceAmount = Math.min(t.maxResource, 1);
      }
    }
  }
}
