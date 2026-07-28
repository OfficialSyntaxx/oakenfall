/* The live hold.
 *
 * One exported object, not a pile of exported bindings, and that is the whole
 * point: `import { grid }` gives an importer a READ-ONLY view — `grid = []` in
 * another module is a compile error — which is why the split stalled for so
 * long. `G` is a const binding whose contents are mutable, so any module can do
 * `G.grid = []` as an ordinary property write.
 *
 * Migration is per cluster, not big-bang. Each cluster moves here, its
 * references in main.ts become `G.x`, the suite runs, and it ships. Here now:
 * the map, the people, what stands on the land, the stores, and the world/run/
 * coin state — everything a save records. What is left in main.ts is UI and
 * session state: selection, build mode, camera, the sheet stack.
 *
 * The save format is declared at the bottom of this file rather than written
 * out by hand in main.ts, which is what the migration was for. It drifted once
 * — TC_X was missing from saves until the land editor let a player put a hold
 * somewhere other than the middle of the map — and assertSaveCoverage() now
 * makes that specific mistake impossible to commit quietly.
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

/* ─────────────────────────────────────────────────────────────────────────
   THE SAVE FORMAT
   Every field of G is classified below, and assertSaveCoverage() refuses to
   let one go unclassified. That guard is the whole reason this section
   exists: the save format used to be a list hand-maintained in main.ts, and
   it drifted — TC_X was missing for months, and nobody noticed until the land
   editor let a player put their hold somewhere other than the middle of the
   map, at which point every save loaded the town centre in the wrong place.
   Adding a field to G now forces a decision about what happens to it on save.
   ───────────────────────────────────────────────────────────────────────── */

/** Fields written to the save as-is.
 *  'replace' — take the saved value, or the default below if absent.
 *  'merge'   — layer the saved value over the default, so a field added to an
 *              object since the save was written arrives with its default
 *              rather than as undefined. */
export const SAVED_FIELDS: Record<string, 'replace' | 'merge'> = {
  worldTime: 'replace', dayCount: 'replace', wolfEvents: 'replace',
  climate: 'replace', plague: 'replace',
  landId: 'replace', scenarioId: 'replace', scenarioWon: 'replace',
  questsCompleted: 'replace', statHistory: 'replace', chronicle: 'replace',
  deeds: 'replace', onboardDone: 'replace',
  researched: 'replace', activeResearch: 'replace',
  coins: 'replace', dailyBounties: 'replace',
  tradeRoutes: 'replace', routeOffers: 'replace',
  festivalBoon: 'replace', lastFestivalYear: 'replace',
  holdName: 'replace', crestChoice: 'replace', bannerIdx: 'replace',
  unlocks: 'replace',
  usedNames: 'replace', memorials: 'replace', idleSlotCounter: 'replace',
  stockpile: 'merge', totals: 'merge', journal: 'merge',
  dailyProgress: 'merge', decrees: 'merge', ledger: 'merge',
};

/** What a missing field falls back to on load. Deliberately NOT the values G
 *  starts a fresh game with: a loaded hold begins with an empty larder and
 *  fills it from the save, where a new one is granted starting supplies. */
export const LOAD_DEFAULTS: Record<string, any> = {
  worldTime: 30, dayCount: 1, wolfEvents: 0,
  climate: null, plague: null,
  landId: 'valley', scenarioId: 'endless', scenarioWon: false,
  questsCompleted: {}, statHistory: [], chronicle: [], deeds: {}, onboardDone: false,
  researched: {}, activeResearch: null,
  coins: 0, dailyBounties: [], tradeRoutes: [], routeOffers: [],
  festivalBoon: null, lastFestivalYear: 0,
  holdName: 'Oakenfall', crestChoice: 0, bannerIdx: 0, unlocks: {},
  usedNames: [], memorials: [], idleSlotCounter: 0,
  stockpile: { wood: 0, stone: 0, food: 0, planks: 0, flour: 0, bread: 0 },
  totals: { wood: 0, stone: 0, food: 0, planks: 0, flour: 0, bread: 0 },
  journal: { peakPopulation: 0, daysSurvived: 0, wolvesSurvived: 0, buildingsRaised: 0, settlersWelcomed: 0, wintersEndured: 0 },
  dailyProgress: { wood: 0, stone: 0, food: 0, bread: 0, planks: 0, flour: 0, built: 0 },
  decrees: { curfew: false, tithe: false, openGates: false, rationing: false },
  ledger: { in: { bounties: 0, deeds: 0, routes: 0, quests: 0, tithe: 0 }, out: { shop: 0 } },
};

/** Saved, but not as a plain copy — main.ts rebuilds each one, because the
 *  live objects hold references (a tile's building, a settler's partner) that
 *  a naive round trip would turn into duplicates. */
export const REBUILT_FIELDS = ['grid', 'buildings', 'villagers'];

/** Not stored: derived from the rebuilt grid on load. */
export const DERIVED_FIELDS = ['MAP_SIZE', 'TC_X', 'TC_Y', 'TC_CX', 'TC_CY',
  'forestTiles', 'stoneTiles', 'waterTiles', 'wildsTiles'];

/** Not stored: recomputed or simply allowed to start over. Guilds re-form from
 *  settler skills, districts re-cluster from buildings, and a raid in progress
 *  does not survive a reload by design — the hold gets its breath back. */
export const TRANSIENT_FIELDS = ['guilds', 'districts', 'districtTimer',
  'raiders', 'critters', 'courtshipTimer', 'birthTimer'];

/** Read a save's plain fields onto G. */
export function loadSavedFields(data: any) {
  for (const [k, how] of Object.entries(SAVED_FIELDS)) {
    const saved = data[k];
    const dflt = LOAD_DEFAULTS[k];
    if (how === 'merge') (G as any)[k] = Object.assign({}, dflt, saved && typeof saved === 'object' ? saved : null);
    else (G as any)[k] = saved ?? dflt;
  }
}

/** Collect G's plain fields for writing. */
export function saveFields(): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(SAVED_FIELDS)) out[k] = (G as any)[k];
  return out;
}

/** Throws if any field of G has escaped classification. Called once at boot so
 *  a field added without a decision fails loudly and immediately, rather than
 *  quietly going missing from saves for months. */
export function assertSaveCoverage() {
  const known = new Set([...Object.keys(SAVED_FIELDS), ...REBUILT_FIELDS, ...DERIVED_FIELDS, ...TRANSIENT_FIELDS]);
  const stray = Object.keys(G).filter((k) => !known.has(k));
  const noDefault = Object.keys(SAVED_FIELDS).filter((k) => !(k in LOAD_DEFAULTS));
  const problems = [
    ...stray.map((k) => `G.${k} is saved nowhere and declared nowhere — add it to SAVED_FIELDS, REBUILT_FIELDS, DERIVED_FIELDS or TRANSIENT_FIELDS in state.ts`),
    ...noDefault.map((k) => `SAVED_FIELDS.${k} has no entry in LOAD_DEFAULTS`),
  ];
  if (problems.length) throw new Error('save format drift:\n  ' + problems.join('\n  '));
}
