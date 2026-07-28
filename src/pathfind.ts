/* Where a settler may stand, and how they get there.
 *
 * Pure over the grid — no canvas, no villager, no side effects — which makes it
 * the one piece of the simulation that can be reasoned about entirely on its
 * own. `moveToward` deliberately stays in main.ts: it walks a villager along a
 * path and belongs with the villagers, not with the map.
 */
import { G } from './state';
import { riverFrozen } from './time';

/** Structures a settler walks over rather than into. */
const WALK_THROUGH = new Set(['farm', 'road', 'bridge']);

/** Water is impassable unless bridged, forded, or frozen over. */
function waterCrossable(t: any): boolean {
  return !!((t.building && t.building.type === 'bridge') || t.ford || riverFrozen());
}

export function tileWalkable(gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= G.MAP_SIZE || gy >= G.MAP_SIZE) return false;
  const t = G.grid[gy] && G.grid[gy][gx];
  if (!t) return false;
  if (t.type === 'water' && !waterCrossable(t)) return false;
  if (t.building && !WALK_THROUGH.has(t.building.type)) return false;
  return true;
}

/** Nearest walkable tile to (gx,gy), searched in expanding rings. Keeps wander
 *  and work targets off the water — a fisher ends up on the shore, never
 *  standing in the river. */
export function nearestWalkable(gx: number, gy: number, maxR?: number): { gx: number; gy: number } | null {
  gx = Math.round(gx); gy = Math.round(gy); maxR = maxR || 5;
  if (tileWalkable(gx, gy)) return { gx, gy };
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (tileWalkable(gx + dx, gy + dy)) return { gx: gx + dx, gy: gy + dy };
    }
  }
  return null;
}

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

/** A* over the grid. Returns the waypoints after the start, or [] if there is
 *  no route — callers hold position rather than beelining, because the old
 *  fallback let settlers walk across open water. */
export function pathFind(fromGX: number, fromGY: number, toGX: number, toGY: number): { gx: number; gy: number }[] {
  const startGX = Math.round(fromGX), startGY = Math.round(fromGY);
  const goalGX = Math.round(toGX), goalGY = Math.round(toGY);
  if (startGX === goalGX && startGY === goalGY) return [];
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < G.MAP_SIZE && y < G.MAP_SIZE;
  if (!inBounds(startGX, startGY) || !inBounds(goalGX, goalGY)) return [];

  const key = (x: number, y: number) => x * 1000 + y;
  const open: any[] = [{ x: startGX, y: startGY, g: 0, h: Math.abs(startGX - goalGX) + Math.abs(startGY - goalGY), parent: null }];
  open[0].f = open[0].h;
  const closed = new Set<number>();
  const bestG: Record<number, number> = { [key(startGX, startGY)]: 0 };

  /* The cap scales a little with map size so long, obstructed routes resolve
     instead of the settler giving up and standing still on bigger holds. */
  const ITER_CAP = Math.min(600, Math.max(240, G.MAP_SIZE * G.MAP_SIZE / 2));
  let iters = 0;
  while (open.length > 0 && iters++ < ITER_CAP) {
    // Min-f node. The open set stays small enough that a linear scan beats a heap.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];

    if (cur.x === goalGX && cur.y === goalGY) {
      const path: { gx: number; gy: number }[] = [];
      let n = cur;
      while (n.parent) { path.unshift({ gx: n.x, gy: n.y }); n = n.parent; }
      return path;
    }
    const k = key(cur.x, cur.y);
    if (closed.has(k)) continue;
    closed.add(k);

    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const t = G.grid[ny] && G.grid[ny][nx];
      if (!t) continue;
      if (t.type === 'water' && !waterCrossable(t)) continue;
      // The goal tile is enterable even when occupied — that is the point of
      // walking to a building.
      const isGoal = nx === goalGX && ny === goalGY;
      if (!isGoal && t.building && !WALK_THROUGH.has(t.building.type)) continue;
      // Wading a ford is slower than a bridge, so the route prefers the bridge.
      const wade = (t.type === 'water' && !(t.building && t.building.type === 'bridge')) ? 1.4 : 0;
      const g = cur.g + (dx !== 0 && dy !== 0 ? 1.41 : 1) + wade;
      if (bestG[nk] !== undefined && bestG[nk] <= g) continue;
      bestG[nk] = g;
      const h = Math.abs(nx - goalGX) + Math.abs(ny - goalGY);
      open.push({ x: nx, y: ny, g, h, f: g + h, parent: cur });
    }
  }
  return [];
}
