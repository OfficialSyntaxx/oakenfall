/* The live hold.
 *
 * One exported object, not a pile of exported bindings, and that is the whole
 * point: `import { grid }` gives an importer a READ-ONLY view — `grid = []` in
 * another module is a compile error — which is why the split stalled for so
 * long. `G` is a const binding whose contents are mutable, so any module can do
 * `G.grid = []` as an ordinary property write.
 *
 * Migration is per cluster, not big-bang. Each cluster moves here, its
 * references in main.ts become `G.x`, the suite runs, and it ships. What is
 * here so far is the map; villagers, economy and UI still live in main.ts.
 *
 * The long game: `serializeState`/`restoreState` collapse into save/load of G's
 * own fields, so the save format stops being a hand-maintained list that drifts
 * from the state it mirrors. It drifted once already — TC_X was missing from
 * saves until the land editor put a hold somewhere other than the middle.
 */

/** One square of ground. Loosely typed for now: the tile shape is still being
 *  written to from a dozen places in main.ts and tightening it is its own job. */
export interface Tile {
  gx: number; gy: number;
  type: string;                 // grass | dirt | forest | stone | water
  wilds: boolean;
  ford?: boolean;
  resourceAmount: number;
  maxResource: number;
  baseMax?: number;
  regrowAt: number;
  workers: number;
  building: any;
  [k: string]: any;
}

export const G = {
  /** Map is MAP_SIZE × MAP_SIZE tiles. Set from the difficulty picker, and
   *  from a save's own grid — an old hold keeps the size it was built at. */
  MAP_SIZE: 36,
  grid: [] as Tile[][],

  /** The town centre occupies 2×2 from (TC_X,TC_Y); TC_CX/TC_CY are its middle,
   *  which is what the camera and every distance check actually use. */
  TC_X: 16,
  TC_Y: 16,
  TC_CX: 16.5,
  TC_CY: 16.5,

  /** Lookup lists the simulation walks every tick, rebuilt by reindexTiles.
   *  Kept as flat arrays because scanning the whole grid per tick to find the
   *  forest was the thing they were introduced to stop. */
  forestTiles: [] as Tile[],
  stoneTiles: [] as Tile[],
  waterTiles: [] as Tile[],
  wildsTiles: [] as Tile[],

  // ── the people ──────────────────────────────────────────────────────────
  /** Every settler alive in the hold. Loosely typed while updateVillager and
   *  the role scoring still live in main.ts; tightening it is its own step. */
  villagers: [] as any[],
  /** Names already given out, so the hold does not raise two Wrens. Persisted:
   *  reusing a dead settler's name reads as a bug to a player who knew them. */
  usedNames: [] as string[],
  /** The departed, and where their stone stands in the memorial grove. */
  memorials: [] as any[],
  /** role → true once two or more Masters of that trade form a guild. */
  guilds: {} as Record<string, boolean>,
  /** Monotonic counter handing each settler a distinct idling spot, so a hold
   *  with nothing to do does not stack every spare hand on one tile. */
  idleSlotCounter: 0,
  /** World-seconds until the next pairing-off and the next birth roll. */
  courtshipTimer: 90,
  birthTimer: 130,
};
