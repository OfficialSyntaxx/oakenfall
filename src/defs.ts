/* Static game definitions — the rules content, free of behaviour.
 *
 * Everything here is plain data: no closures, no references to live game state.
 * That is the criterion for living in this module. Tables that close over the
 * running hold (QUESTS checking totals, DECREE_DEFS' effects) deliberately stay
 * in main.ts until that state is itself modularised.
 */

export const BUILD_DEFS = {
  house:       { name:'House',          icon:'🏚️', cost:{wood:30,stone:0},  desc:'Shelters settlers. +3 capacity.', role:null },
  road:        { name:'Road',           icon:'🛤️', cost:{wood:0,stone:8},   desc:'Paved path — settlers move 30% faster on roads, and processors beside a road linked to the Town Center work 12% faster.', role:null },
  bridge:      { name:'Bridge',         icon:'🌉', cost:{wood:20,planks:6}, desc:'A plank span over the river. Opens the far bank to your settlers — but every bridge is a door raiders can use too. A Guard Post within 3 tiles keeps a crossing watched.', role:null, onWater:true },
  forestCamp:  { name:'Forestry Camp',  icon:'🪓', cost:{wood:40,stone:10}, desc:'Assign a Lumberjack to fell timber from the woods.', role:'lumberjack' },
  miningPost:  { name:'Mining Post',    icon:'⛏️', cost:{wood:30,stone:20}, desc:'Assign a Miner to delve stone from outcrops.', role:'miner' },
  fishingHut:  { name:'Fishing Hut',    icon:'🎣', cost:{wood:35,stone:5},  desc:'Build along the river. Assign a Fisher to net food.', role:'fisher', needsWater:true },
  huntingCabin:{ name:'Hunting Cabin',  icon:'🏹', cost:{wood:35,stone:0},  desc:'Build near the wilds. Assign a Hunter to track game.', role:'hunter' },
  farm:        { name:'Farm',           icon:'🌾', cost:{wood:35,stone:0},  desc:'Assign a Farmer to tend crops for food. +15% yield beside the river.', role:'farmer' },
  granary:     { name:'Granary',        icon:'🏺', cost:{wood:45,stone:15}, desc:'Raises storage limits for wood, stone, and food by 90 each.', role:null },
  tradingPost: { name:'Trading Post',   icon:'⚖️', cost:{wood:50,stone:10}, desc:'Exchange surplus goods at fixed rates.', role:null },
  watchtower:  { name:'Watchtower',     icon:'🗼', cost:{wood:40,stone:25}, desc:'Wardens watch the treeline, cutting wolf raid risk sharply.', role:null },
  tavern:      { name:'Tavern',         icon:'🍺', cost:{wood:55,stone:10}, desc:'Warmth and ale ease the toil — settlers tire 20% slower.', role:null },
  sawmill:     { name:'Sawmill',        icon:'🪚', cost:{wood:50,stone:20}, desc:'Saws raw timber into planks (4 wood → 2 planks). Planks unlock finer construction.', role:null, proc:{in:{wood:4}, out:{planks:2}, every:12} },
  windmill:    { name:'Windmill',       icon:'🌬️', cost:{wood:45,stone:25,planks:8}, desc:'Grinds grain into flour (5 food → 3 flour). Its sails turn day and night.', role:null, proc:{in:{food:5}, out:{flour:3}, every:14} },
  bakery:      { name:'Bakery',         icon:'🍞', cost:{wood:35,stone:15,planks:12}, desc:'Bakes hearty bread (2 flour → 3 bread). Bread fills bellies better than raw fare.', role:null, proc:{in:{flour:2}, out:{bread:3}, every:12} },
  guardPost:   { name:'Guard Post',     icon:'🛡️', cost:{wood:40,stone:20,planks:6}, desc:'Assign a Guard to stand watch. Guards drive off bandits before they reach the stores.', role:'guard' },
  palisade:    { name:'Palisade',       icon:'🪵', cost:{wood:12,stone:0}, desc:'A wall of sharpened timber. Blocks passage and slows raiders — ring your hold for safety.', role:null },
  well:        { name:'Well',           icon:'⛲', cost:{wood:10,stone:24}, desc:'A stone well. Water on hand means fire near it is far less likely to catch and far quicker to douse — space wells through your timber as firebreaks.', role:null },
  lampPost:    { name:'Lamp Post',      icon:'🏮', cost:{wood:8,stone:6}, desc:'A pitch-soaked lantern hung on a timber post. Casts a warm pool of light after dark — line your roads and squares to push back the night.', role:null },
  pasture:     { name:'Pasture',        icon:'🐑', cost:{wood:40,stone:5}, desc:'Grazes livestock for a steady trickle of food, and the herd grows on its own. But in winter the animals need fodder (food from your stores) or they dwindle — a food source that also has an appetite.', role:null },
  forester:    { name:'Forester\'s Grove', icon:'🌲', cost:{wood:25,stone:10}, desc:'Woods tire as they\'re felled, and a fully-worked stand goes barren. A Forester\'s Grove replants nearby forest — reviving barren ground and keeping the timber sustainable.', role:null },
  manor:       { name:'Manor',          icon:'🏛️', cost:{wood:40,stone:10,planks:25}, desc:'A grand timber-framed hall. Shelters +6 settlers in comfort.', role:null, needsTech:'framing' },
};

export const ROLE_DEFS = {
  idle:      {label:'Idle',       ic:'💤', needsBuilding:null},
  guard:     {label:'Guard',      ic:'🛡️', needsBuilding:'guardPost'},
  lumberjack:{label:'Lumberjack', ic:'🪓', needsBuilding:'forestCamp'},
  miner:     {label:'Miner',      ic:'⛏️', needsBuilding:'miningPost'},
  farmer:    {label:'Farmer',     ic:'🌾', needsBuilding:'farm'},
  fisher:    {label:'Fisher',     ic:'🎣', needsBuilding:'fishingHut'},
  hunter:    {label:'Hunter',     ic:'🏹', needsBuilding:'huntingCabin'},
};

export const TECH_TREE = [
  { id:'tools',    name:'Sharpened Tools', ic:'🪓', desc:'+15% wood & stone yield.', cost:{wood:30,stone:20}, time:60 },
  { id:'crops',    name:'Crop Rotation',   ic:'🌱', desc:'+20% farm yield.', cost:{food:25,wood:15}, time:60 },
  { id:'masonry',  name:'Stone Masonry',   ic:'🧱', desc:'Buildings cost 15% less stone.', cost:{stone:40}, time:75 },
  { id:'herbs',    name:'Herbal Lore',     ic:'🌿', desc:'Illness is rarer and passes 40% faster.', cost:{food:30}, time:70 },
  { id:'ale',      name:'Oaken Ale',       ic:'🍺', desc:'Tavern rest bonus improves (settlers tire 30% slower).', cost:{planks:20}, time:80, req:'tools' },
  { id:'cellars',  name:'Deep Cellars',    ic:'🏺', desc:'+60 storage for every resource.', cost:{planks:30,stone:20}, time:90, req:'masonry' },
  { id:'militia',  name:'Drilled Militia', ic:'⚔️', desc:'Guards count double against bandits.', cost:{planks:25,bread:15}, time:90 },
  { id:'hearth',   name:'Hearthfires',     ic:'🔥', desc:'Warm hearths lift every settler\'s spirits (+8 morale).', cost:{wood:20,bread:10}, time:70 },
  { id:'framing',  name:'Timber Framing',  ic:'🏛️', desc:'Unlocks the Manor — grand housing for 6 settlers.', cost:{planks:35,stone:15}, time:100, req:'tools' },
  // ── Second tier — deeper research gated behind the first ──
  { id:'terracing',name:'Hill Terracing',  ic:'⛰️', desc:'+15% farm yield again — terraced fields catch every drop.', cost:{stone:35,food:20}, time:110, req:'crops' },
  { id:'aqueduct', name:'Aqueducts',       ic:'🌊', desc:'Every farm counts as irrigated (+15%), river or no.', cost:{stone:50,planks:20}, time:120, req:'masonry' },
  { id:'coldstore',name:'Cold Storage',    ic:'🧊', desc:'Food spoils half as fast — cellars keep the winter stores.', cost:{planks:25,stone:30}, time:110, req:'cellars' },
  { id:'charter',  name:'Guild Charter',   ic:'⚜️', desc:'Guild bonuses rise from +10% to +15% hold-wide.', cost:{planks:30,bread:20}, time:120, req:'hearth' },
];

export const HOLD_TIERS = [
  { name:'Outpost', ic:'⛺', pop:0,  bld:0 },
  { name:'Hamlet',  ic:'🏕️', pop:6,  bld:4 },
  { name:'Village', ic:'🏘️', pop:12, bld:8 },
  { name:'Town',    ic:'🏰', pop:20, bld:12 },
];

export const SEASON_NAMES = ['Spring','Summer','Autumn','Winter'];

export const WEATHER_TABLE = {
  // [clear, rain, storm, snow] weights per season
  0:[0.55,0.35,0.10,0],    // spring — rainy
  1:[0.75,0.15,0.10,0],    // summer
  2:[0.60,0.28,0.12,0],    // autumn
  3:[0.55,0,0.10,0.35],    // winter — snowfall
};

export const MM_COLORS = { grass:'#2a3f22', dirt:'#4a3a26', forest:'#1c3022', stone:'#3a3a34', water:'#1c3242' };

export const VILLAGER_TINTS = [null, '#c98a5a', '#6f8f4a', '#7d6ec6', '#b3603a', '#4f8f9c', '#a9863f', '#8a5566'];

export const RAIDER_VARIANTS = ['bandit','brute','archer'];

export const NUM_WORDS = { a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, couple:2, few:3, several:4, some:3 };

export const UNLOCK_SKUS = {
  supporter: {ic:'✦', name:'Supporter Pack', desc:'A patron\'s thanks — premium banner dyes, a Patron plaque, and the hold\'s gratitude.'},
  frost:     {ic:'❄️', name:'Frostmark Banners', desc:'A cold-country set of banner colours.'},
  ember:     {ic:'🔥', name:'Emberlands Banners', desc:'A warm, volcanic set of banner colours.'},
};

export const GAME_MODES = {
  settler: {
    name:'Settler', desc:'The classic Oakenfall experience — seasons, wolves, bandits, and bounties.',
    wolfMul:1, banditsEnabled:true, decayMul:1, tradeMul:1, offlineOn:true, bountyCoinMul:1, festivalEvery:0,
  },
  peaceful: {
    name:'Peaceful', desc:'No wolves, no bandits, no decay. Build in tranquillity — but bounties pay half.',
    wolfMul:0, banditsEnabled:false, decayMul:0, tradeMul:1, offlineOn:true, bountyCoinMul:0.5, festivalEvery:0,
  },
  ironwinter: {
    name:'Iron Winter', desc:'Endless winter. Yields are thin, fatigue bites, wolves are bold, decay is fast. For veterans.',
    wolfMul:1.8, banditsEnabled:true, decayMul:1.7, tradeMul:1, offlineOn:false, bountyCoinMul:1.6, festivalEvery:0, forceWinter:true,
  },
  merchant: {
    name:'Merchant', desc:'Trade is king — rates are richer, merchants visit often, bounties pay double. Wolves smell profit.',
    wolfMul:1.2, banditsEnabled:true, decayMul:1, tradeMul:1.3, offlineOn:true, bountyCoinMul:2, festivalEvery:0, merchantOften:true,
  },
};

/* Lands — terrain generation presets. Each shapes what genMap lays down, so a
   Highland start really is stone-rich and thin on timber, and the Marshes really
   do make you fight for dry ground. Pure data: genMap reads these, they know
   nothing about the running game. */
export const LANDS = {
  valley: {
    name:'River Valley', ic:'🏞️',
    desc:'A broad river through good soil. Balanced timber, stone and game — the classic hold.',
    river:{ count:1, width:1, wind:2.4 }, forest:15, stone:7, wilds:6, fords:2, lakes:1,
  },
  forestvale: {
    name:'Forest Vale', ic:'🌲',
    desc:'Deep woods and plentiful game, but stone is scarce — you will trade for it or go without.',
    river:{ count:1, width:1, wind:2.0 }, forest:30, stone:3, wilds:10, fords:2, lakes:1,
  },
  highland: {
    name:'Highlands', ic:'⛰️',
    desc:'Rock everywhere and thin soil. Stone is easy, timber is not, and streams are few.',
    river:{ count:1, width:0, wind:1.4 }, forest:7, stone:18, wilds:5, fords:1, lakes:0,
  },
  marshes: {
    name:'The Marshes', ic:'🪵',
    desc:'Braided waterways cut the land apart. Fish are everywhere; dry ground to build on is not.',
    river:{ count:3, width:1, wind:3.2 }, forest:12, stone:4, wilds:7, fords:4, lakes:3,
  },
  coastal: {
    name:'Coastal Reach', ic:'🌊',
    desc:'Open water along one shore, timber inland. Good fishing, and only one flank to watch.',
    river:{ count:1, width:3, wind:0.8 }, forest:16, stone:6, wilds:6, fords:1, lakes:2,
  },
};

/** A trade's display name — "Lumberjack" for 'lumberjack'. Lives here rather
 *  than in main.ts because more than one module now needs to name a role. */
export function roleLabel(r: string): string {
  return (ROLE_DEFS[r] && ROLE_DEFS[r].label) || r;
}

/** How fast a settler empties, per second at 1× speed. Hunger to starving in
 *  about five and a half minutes; fatigue to exhausted in about seven. Tuned
 *  so a day's work is a real span without the hold feeling like a treadmill. */
export const HUNGER_RATE = 100 / 340;
export const FATIGUE_RATE = 100 / 400;

/** Traits a settler can only EARN, never be born with — they mark what someone
 *  came through. Granted by the events that deserve them. */
export const LEGACY_TRAITS: Record<string, any> = {
  brave:     { id: 'brave',     label: 'Brave',     ic: '🦁', desc: 'Stood through a raid — loses only half morale to attacks.' },
  steadfast: { id: 'steadfast', label: 'Steadfast', ic: '🕯️', desc: "Carries a loved one's memory — steadier morale." },
};

/** Water sits this far below the land surface, and the map edge drops this far
 *  into the sea. Anything drawn ON water — ducks, fish, bridges, reflections —
 *  has to subtract WATER_DROP or it floats above the surface.
 *
 *  These live here rather than beside the terrain renderer because the wiring
 *  block reads them at module load: a `const` declared further down main.ts is
 *  in its temporal dead zone at that point, and the resulting throw lands in a
 *  frame loop that swallows it. */
export const WATER_DROP = 6;
export const EDGE_DROP = 14;
