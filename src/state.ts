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

  // ── what stands on the land ─────────────────────────────────────────────
  /** Everything raised, roads included. Draw order and every "is there a X
   *  nearby" check walk this list. */
  buildings: [] as any[],
  /** Named quarters the hold grows into as buildings cluster. */
  districts: [] as any[],
  districtTimer: 8,

  // ── the stores ──────────────────────────────────────────────────────────
  /** What the hold holds right now. Capped per resource; see BASE_CAP. */
  stockpile: { wood: 60, stone: 25, food: 40 } as Record<string, number>,
  /** Lifetime gathered, never spent down — quests and deeds count against it. */
  totals: { wood: 0, stone: 0, food: 0 } as Record<string, number>,

  // ── who else is out there ───────────────────────────────────────────────
  /** Raiders currently on the map. Empty between raids. */
  raiders: [] as any[],
  /** Ambient wildlife: deer, ducks, foxes and the rest. Decorative, but they
   *  are also what a hunter hunts. */
  critters: [] as any[],

  // ── the turning world ───────────────────────────────────────────────────
  /** Seconds into the current day/night cycle. Everything that moves, lights
   *  or grows reads it; isokit is handed a copy each frame via setKitTime. */
  worldTime: 30,                // start mid-dawn
  dayCount: 1,
  /** How many raids the hold has come through. */
  wolfEvents: 0,
  /** A long-running weather turn (drought, cold snap) and a running sickness,
   *  or null when the valley is having an ordinary time of it. */
  climate: null as any,
  plague: null as any,

  // ── the run ─────────────────────────────────────────────────────────────
  landId: 'valley',
  scenarioId: 'endless',
  /** Goal met and acknowledged. Play continues afterwards — winning Oakenfall
   *  ends the objective, not the hold. */
  scenarioWon: false,
  questsCompleted: {} as Record<string, boolean>,
  journal: { peakPopulation: 0, daysSurvived: 0, wolvesSurvived: 0, buildingsRaised: 0, settlersWelcomed: 0, wintersEndured: 0 },
  /** One row per day: {day, pop, food, wood, stone}. Drives the graphs. */
  statHistory: [] as any[],
  /** The written record — births, deaths, first winters, raids weathered. */
  chronicle: [] as any[],
  deeds: {} as Record<string, any>,
  decrees: { curfew: false, tithe: false, openGates: false, rationing: false },
  onboardDone: false,

  // ── study ───────────────────────────────────────────────────────────────
  researched: {} as Record<string, boolean>,
  activeResearch: null as any,  // {id, remaining, total}

  // ── coin ────────────────────────────────────────────────────────────────
  coins: 0,
  /** Cumulative coin flow by category, for the economy view. */
  ledger: { in: { bounties: 0, deeds: 0, routes: 0, quests: 0, tithe: 0 }, out: { shop: 0 } },
  dailyBounties: [] as any[],   // [{id,key,n,reward,done,desc}]
  dailyProgress: {} as Record<string, number>,
  /** Standing caravan contracts, and the offers not yet taken up. */
  tradeRoutes: [] as any[],
  routeOffers: [] as any[],

  // ── festival ────────────────────────────────────────────────────────────
  festivalBoon: null as string | null,   // 'harvest' | 'courage' | 'craft'
  lastFestivalYear: 0,

  // ── the player's own ────────────────────────────────────────────────────
  holdName: 'Oakenfall',
  /** Crest colour picked at creation, and the banner currently flying. */
  crestChoice: 0,
  bannerIdx: 0,
  /** sku → true for anything bought or redeemed. Persists in saves. */
  unlocks: {} as Record<string, boolean>,
};
