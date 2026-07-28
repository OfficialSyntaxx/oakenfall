/* Asset URL tables.
 *
 * These were ~15MB of inlined base64 until the files were pulled out into
 * public/assets/. They are pure data with no dependencies, which makes them the
 * safe first thing to lift out of main.ts.
 *
 * Every consumer assigns these straight to `.src`, and each has a procedural
 * fallback in the renderer — art is an upgrade layer, never a dependency.
 */

export const SPRITE_URLS = {
  townCenter: 'assets/sprites/townCenter.png',
  house: 'assets/sprites/house.png',
  manor: 'assets/sprites/manor.png',
  watchtower: 'assets/sprites/watchtower.png',
  guardPost: 'assets/sprites/guardPost.png',
  tavern: 'assets/sprites/tavern.png',
  bakery: 'assets/sprites/bakery.png',
  granary: 'assets/sprites/granary.png',
  sawmill: 'assets/sprites/sawmill.png',
  tradingPost: 'assets/sprites/tradingPost.png',
  windmill: 'assets/sprites/windmill.png',
  fishingHut: 'assets/sprites/fishingHut.png',
  huntingCabin: 'assets/sprites/huntingCabin.png',
  farm: 'assets/sprites/farm.png',
  forestCamp: 'assets/sprites/forestCamp.png',
  miningPost: 'assets/sprites/miningPost.png',
  palisade: 'assets/sprites/palisade.png',
  well: 'assets/sprites/well.png',
  lampPost: 'assets/sprites/lampPost.png',
  pasture: 'assets/sprites/pasture.png',
  forester: 'assets/sprites/forester.png',
  bridge: 'assets/sprites/bridge.png',
  deer: 'assets/sprites/deer.png',
  boar: 'assets/sprites/boar.png',
  rabbit: 'assets/sprites/rabbit.png',
  fox: 'assets/sprites/fox.png',
  duck: 'assets/sprites/duck.png',
  sheep: 'assets/sprites/sheep.png',
  raider_bandit: 'assets/sprites/raider_bandit.png',
  raider_brute: 'assets/sprites/raider_brute.png',
  raider_archer: 'assets/sprites/raider_archer.png',
  portrait_peasant: 'assets/sprites/portrait_peasant.png',
  portrait_lumberjack: 'assets/sprites/portrait_lumberjack.png',
  portrait_miner: 'assets/sprites/portrait_miner.png',
  portrait_fisher: 'assets/sprites/portrait_fisher.png',
  portrait_farmer: 'assets/sprites/portrait_farmer.png',
  portrait_guard: 'assets/sprites/portrait_guard.png',
}

export const VANIM_B64 = {
  guard_idle: ['assets/vanim/guard_idle-0.png', 'assets/vanim/guard_idle-1.png', 'assets/vanim/guard_idle-2.png', 'assets/vanim/guard_idle-3.png'],
  guard_run: ['assets/vanim/guard_run-0.png', 'assets/vanim/guard_run-1.png', 'assets/vanim/guard_run-2.png'],
  run_meat: ['assets/vanim/run_meat-0.png', 'assets/vanim/run_meat-1.png', 'assets/vanim/run_meat-2.png'],
  idle: ['assets/vanim/idle-0.png', 'assets/vanim/idle-1.png', 'assets/vanim/idle-2.png', 'assets/vanim/idle-3.png'],
  run: ['assets/vanim/run-0.png', 'assets/vanim/run-1.png', 'assets/vanim/run-2.png'],
  run_wood: ['assets/vanim/run_wood-0.png', 'assets/vanim/run_wood-1.png', 'assets/vanim/run_wood-2.png'],
  work_axe: ['assets/vanim/work_axe-0.png', 'assets/vanim/work_axe-1.png', 'assets/vanim/work_axe-2.png'],
  work_pickaxe: ['assets/vanim/work_pickaxe-0.png', 'assets/vanim/work_pickaxe-1.png', 'assets/vanim/work_pickaxe-2.png'],
  work_knife: ['assets/vanim/work_knife-0.png', 'assets/vanim/work_knife-1.png', 'assets/vanim/work_knife-2.png'],
}

export const DECOR_B64 = {
  explosion: ['assets/decor/explosion-0.png', 'assets/decor/explosion-1.png', 'assets/decor/explosion-2.png', 'assets/decor/explosion-3.png'],
  splash: ['assets/decor/splash-0.png', 'assets/decor/splash-1.png', 'assets/decor/splash-2.png', 'assets/decor/splash-3.png', 'assets/decor/splash-4.png'],
  plankStack: 'assets/decor/plankStack.png',
  oak: 'assets/decor/oak.png',
  roadTile: 'assets/decor/roadTile.png',
  clouds: ['assets/decor/clouds-0.png', 'assets/decor/clouds-1.png', 'assets/decor/clouds-2.png'],
  sacksCrate: 'assets/decor/sacksCrate.png',
  sack: 'assets/decor/sack.png',
  waterRocks: ['assets/decor/waterRocks-0.png', 'assets/decor/waterRocks-1.png', 'assets/decor/waterRocks-2.png', 'assets/decor/waterRocks-3.png'],
  fence: 'assets/decor/fence.png',
  hayStack: 'assets/decor/hayStack.png',
  farmland: 'assets/decor/farmland.png',
  corn: 'assets/decor/corn.png',
  cornYoung: 'assets/decor/cornYoung.png',
  hay: 'assets/decor/hay.png',
  bush1: ['assets/decor/bush1-0.png', 'assets/decor/bush1-1.png', 'assets/decor/bush1-2.png', 'assets/decor/bush1-3.png'],
  bush3: ['assets/decor/bush3-0.png', 'assets/decor/bush3-1.png', 'assets/decor/bush3-2.png', 'assets/decor/bush3-3.png'],
  stump: 'assets/decor/stump.png',
  boulders: 'assets/decor/boulders.png',
  berryBush: 'assets/decor/berryBush.png',
  cattails: 'assets/decor/cattails.png',
  wildflowers: 'assets/decor/wildflowers.png',
  mushrooms: 'assets/decor/mushrooms.png',
  fallenLog: 'assets/decor/fallenLog.png',
  standingStones: 'assets/decor/standingStones.png',
  rocks: ['assets/decor/rocks-0.png', 'assets/decor/rocks-1.png', 'assets/decor/rocks-2.png', 'assets/decor/rocks-3.png'],
  dust: ['assets/decor/dust-0.png', 'assets/decor/dust-1.png', 'assets/decor/dust-2.png', 'assets/decor/dust-3.png', 'assets/decor/dust-4.png', 'assets/decor/dust-5.png'],
  fire: ['assets/decor/fire-0.png', 'assets/decor/fire-1.png', 'assets/decor/fire-2.png', 'assets/decor/fire-3.png', 'assets/decor/fire-4.png', 'assets/decor/fire-5.png'],
}

export const TERRAIN_B64 = {
  grass_010: 'assets/terrain/grass_010.png',
  grass_067: 'assets/terrain/grass_067.png',
  grass_098: 'assets/terrain/grass_098.png',
  water_066: 'assets/terrain/water_066.png',
  water_045: 'assets/terrain/water_045.png',
  dirt_073: 'assets/terrain/dirt_073.png',
  dirt_083: 'assets/terrain/dirt_083.png',
  stone_081: 'assets/terrain/stone_081.png',
  stone_102: 'assets/terrain/stone_102.png',
}

export const AUDIO_B64 = {
  tap: 'assets/audio/tap.ogg',
  warn: 'assets/audio/warn.ogg',
  open: 'assets/audio/open.ogg',
  close: 'assets/audio/close.ogg',
  mine: 'assets/audio/mine.ogg',
  chop: 'assets/audio/chop.ogg',
}

export const MUSIC_URLS = { elvendawn: 'assets/music/elvendawn.ogg', windsofvalor: 'assets/music/windsofvalor.ogg' };
