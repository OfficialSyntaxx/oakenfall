/* What stands on the land: raising it, removing it, and asking about it.
 *
 * The queries here — is there a working X, where is the nearest Y with a free
 * slot, where is the town centre — are what the villager AI and the steward are
 * really made of, so they need to be importable rather than pushed in.
 */
import { G } from './state';
import { BUILD_DEFS } from './defs';
import { dist2 } from './math';
import { tileAt } from './mapgen';

type Deps = {
  /** Called when a building is removed, so a sheet showing it can close. */
  onRemoved: (b: any) => void;
};
let d: Deps = { onRemoved: () => {} };
export function initBuildings(deps: Deps): void { d = deps; }

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
  d.onRemoved(b);
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
