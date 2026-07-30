// @ts-nocheck
/* Oakenfall — game entry.
 *
 * Moved verbatim out of index.html as the first step of the TypeScript
 * migration; behaviour is intentionally unchanged so the move itself can be
 * verified before anything is restructured. ts-nocheck comes off module by
 * module as this file is split into src/ and typed.
 *
 * Safe under module scope: the game has no inline HTML event handlers, and
 * every intentional global is an explicit window.* assignment.
 */
import { LANDS, BUILD_DEFS, ROLE_DEFS, TECH_TREE, HOLD_TIERS, SEASON_NAMES, WEATHER_TABLE, MM_COLORS, roleLabel, HUNGER_RATE, FATIGUE_RATE, LEGACY_TRAITS, WATER_DROP, EDGE_DROP, VILLAGER_TINTS, RAIDER_VARIANTS, NUM_WORDS, UNLOCK_SKUS, GAME_MODES } from './defs';

import { TILE_W, TILE_H, clamp, lerp, dist2, hash2, hashStr, project, inProject, fmt } from './math';
import {
  initIsoKit, setKitTime, setSunShadow,
  shade, shadeColor, tileDiamond, roundRect,
  isoBox, isoRoof, plankLines, stoneCourses,
  glowWindow, doorArch, chimneySmoke, drawShadow, tintedFrame,
} from './isokit';
import { installStorage, isNative } from './storage';
import { ADMIN } from './admin';
import { GAME_VERSION, CHANGELOG } from './version';
import { initFeedback, logError, recentErrors, buildDiagnostics, copyFeedback,
  renderFeedbackSheet } from './feedback';
import { G, saveFields, loadSavedFields, assertSaveCoverage } from './state';
import { DAY_LEN, NIGHT_LEN, CYCLE_LEN, SEASON_LEN, setForceWinter, seasonIndex, seasonName,
  seasonYieldMul, seasonFatigueMul, riverFrozen, dayPhaseFrac, isNight, darknessFactor, sunShadow } from './time';

/** The iso kit cannot import a mutable, so the sun is pushed into it. */
function updateSunShadows(){ setSunShadow(...sunShadow()); }
import { tileAt, genMap, reindexTiles } from './mapgen';
import { tileWalkable, nearestWalkable, pathFind } from './pathfind';
import { initVillagers, moveToward, effMultiplier, findResourceTarget, updateVillager,
  resetFrozenFisherNotice } from './villager';
import { camera, panVel, camGlide, view, setViewport, panCameraTo, clampCamera,
  initCameraZoom, screenToWorldPixel, worldToScreen, visibleTileRange, ZOOM_MIN, ZOOM_MAX } from './camera';
import { initSprites, SPRITES, VANIM, DECOR, SPRITE_SCALE, SPRITE_ANCHOR_Y,
  preloadSprites, loadVillagerAnims, villagerAnimFor, blitSprite, loadDecor, } from './sprites';
import { drawMinimap } from './minimap';
import { initLighting, renderClouds, renderVignette, renderWeather, renderLighting } from './lighting';
import { initVillagerRender, drawVillager, drawStatusBubble, drawWorkerBadge, drawRoad } from './villagerrender';
import { initBuildingRender, drawHerd, drawBuilding, drawTorch } from './buildrender';
import { initScenery, buildAtlas, drawTree, drawRock, drawFishSpot, drawAnimal,
  drawMemorial, drawMerchantCart } from './scenery';
import { initTerrain, loadTerrainStamps, terrainStampFor, drawTerrain,
  updateWind, windAt, updateGroundCover } from './terrain';
import { initFX, spawnFly, spawnDust, spawnBoom, renderFlyFX, renderDustFX, renderBoomFX, fxSpawned } from './fx';
import { initContracts, rollDailyBounties, checkBounties, makeRouteOffer, refreshRouteOffers,
  acceptRoute, cancelRoute, processTradeRoutes, routeGoodLabel } from './contracts';
import { initRaiders, raidEntryPoint, launchRaid, raiderTick, wolfTick, banditTick,
  setWolfRisk, resetRaidTimers, hastenRaid } from './raiders';
import { initFire, FLAMMABLE, igniteBuilding, fireTick, fireDrynessMul } from './fire';
import { initProgress, techAvailable, startResearch, computeTierIdx, checkTierUp,
  getTier, resetTier } from './progress';
import { initEconomy, BASE_CAP, capFor, foodSafeCap, foodSpoilTick, gainResource,
  harvestBoonMul, logCoinIn, logCoinOut, resetCapWarnings } from './economy';
import { initSteward, stewardOrders, clearStewardOrders, stewardCommand,
  processStewardOrders, updateStewardStatus, stewardOrderLine } from './steward';
import { initBuildings, BUILD_NEEDS_ADJ, decayTick, computeDistricts, foresterTick, findTC, addBuilding, removeBuilding, buildingCenter, popCapacity,
  hasBuildingType, hasActiveBuilding, nearestBuildingOfTypes, recomputeLogistics } from './buildings';

/** Road links are recomputed on a timer, not per frame — the BFS is cheap but
 *  the network only changes when something is built. */
let _logisticsTimer = 0;
import { initLives, familyTick, ambientIdle, hasTrait, relTo, remember, bumpRel, relationsTick, releaseClaims,
  memorialSpot, agingTick, passVillager, seedRelMoments,
  AGE_YEAR, ADULT_AGE, ELDER_BEFORE, LIFESPAN_BASE } from './lives';
import { initWork, roleNeedScores, seekWork, maybeSwitchTrade } from './work';
import { chron, chronicleAdd } from './chronicle';
import { initUnlocks, ADMIN_PROMO, hasUnlock, isPatron, redeemCode, saveUnlocks, loadUnlocks,
         applyPatronBanners, bannerPalette, BANNER_COLORS, bannerColor } from './unlocks';
import { initSkills, SKILL_TIERS, skillTier, skillMul, gainSkill, hasNearbyMentor,
  GUILD_DEFS, guildBonusVal, recomputeGuilds, guildMulRes, guildFarmMul } from './skills';
import { initWeather, getWeather, setWeather, rollWeather, rollClimate, rollPlague, plagueTick,
  climateFarmMul, climateFireMul, climateHungerMul, climateFatigueMul,
  weatherMoveMul, weatherFarmMul, weatherFatigueMul, WEATHER_DEFS, CLIMATE_DEFS } from './weather';
import { initCritters, spawnWildlife, updateWildlife, blitCritter,
  drawDeer, drawBoar, drawRabbit, drawFish, drawFox, drawDuck, drawFlit, drawBird } from './critters';
import { TCODE, TCODE_R, applyBrushTo, encodeLand, decodeLand } from './landcode';
import { sfx, buzz, startMusic, stopMusic, isSfxOn, setSfxOn, isMusicOn, setMusicOn } from './audio';

import { SPRITE_URLS, VANIM_B64, DECOR_B64, TERRAIN_B64 } from './assets';   // audio tables now belong to src/audio.ts


(function(){
"use strict";

/* =========================================================================
   CONSTANTS
========================================================================= */


/* =========================================================================
   HIGS SPRITE ASSETS  (AI-generated isometric building art)
========================================================================= */
// Asset URLs (files, not inlined base64) — bundled locally, cached by the
// service worker, so offline play is unaffected. Procedural fallbacks still
// cover a failed or slow load.

function applyDifficulty(cfg){
  gameModeId = cfg.modeId || 'settler';
  gameMode = GAME_MODES[gameModeId] || GAME_MODES.settler;
  setForceWinter(!!gameMode.forceWinter);
  if(gameModeId==='merchant'){ cfg.startRes.food = (cfg.startRes.food||0)+10; }
  G.MAP_SIZE = cfg.mapSize;
  G.TC_X = Math.floor(G.MAP_SIZE/2)-1; G.TC_Y = Math.floor(G.MAP_SIZE/2)-1;
  G.TC_CX = G.TC_X+0.5; G.TC_CY = G.TC_Y+0.5;
  setWolfRisk(cfg.wolfMul * gameMode.wolfMul);
  G.stockpile = Object.assign({}, cfg.startRes);
  G.landId = cfg.landId || 'valley';
  G.scenarioId = cfg.goalId || 'endless';
  G.scenarioWon = false;
}





const NAME_POOL = ["Eldric","Brom","Sela","Tamsin","Joran","Wren","Osric","Maela","Garrick","Ysolde",
  "Cormac","Liora","Dunwald","Petra","Aldric","Senna","Halvard","Rosalind","Thane","Briala",
  "Ulric","Maren","Stigr","Edda","Conrad","Isolde","Bram","Freya","Aldous","Cael"];
function rollName(){
  let pool = NAME_POOL.filter(n=>!G.usedNames.includes(n));
  if(pool.length===0){ G.usedNames=[]; pool=NAME_POOL; }
  const n = pool[Math.floor(Math.random()*pool.length)];
  G.usedNames.push(n);
  return n;
}

/* =========================================================================
   UTILITIES
========================================================================= */









/* =========================================================================
   STATE
========================================================================= */
// Safe Town Centre lookup — always returns a building or null, never throws
/* The town hall: every hauler's fallback drop-off, and the anchor a dozen other
   systems measure from. This called ITSELF — infinite recursion, throwing on
   every invocation since the Vite migration. Because the frame loop catches and
   throttles exceptions, it never surfaced as a crash: settlers simply walked to
   the trees, filled their arms, dropped nothing, and went back for more. */
let speedMode = 1; // 1, 2, 0(paused)
let spawnTimer = 18;
// Lifetime journal — persists across sessions within a save; tracks bests for the stats page

/* ── SCENARIOS ── an optional end-goal for the hold. These close over live game
   state, so unlike LANDS they stay here rather than in defs.ts. Reaching one is
   never an ending unless you want it to be: the victory notice offers to conclude
   the tale or to carry on with the hold exactly as it stands. */
const SCENARIOS = {
  endless:  { name:'Endless',        ic:'♾️', desc:'No set goal. Build the hold you want, for as long as you like.',
              done:()=>false, progress:()=>'' },
  winters:  { name:'Five Winters',   ic:'❄️', desc:'Endure five winters. The cold is the oldest enemy.',
              done:()=>G.journal.wintersEndured>=5, progress:()=>G.journal.wintersEndured+'/5 winters' },
  town:     { name:'Rise to a Town', ic:'🏰', desc:'Grow the hold from outpost to town.',
              done:()=>getTier()>=3, progress:()=>HOLD_TIERS[getTier()].name+' → Town' },
  timber:   { name:'Timber Trade',   ic:'🪚', desc:'Saw 300 planks — a hold that exports is a hold that lasts.',
              done:()=>(G.totals.planks||0)>=300, progress:()=>Math.floor(G.totals.planks||0)+'/300 planks' },
  bulwark:  { name:'Bulwark',        ic:'🛡️', desc:'Drive off eight raids without losing the hold.',
              done:()=>(G.journal.raidsRepelled||0)>=8, progress:()=>(G.journal.raidsRepelled||0)+'/8 raids repelled' },
};
function checkScenario(){
  if(G.scenarioWon || G.scenarioId==='endless') return;
  const sc = SCENARIOS[G.scenarioId];
  if(!sc || !sc.done()) return;
  G.scenarioWon = true;
  showVictory(sc);
}
/* Reaching the goal is a moment, not a wall. The notice congratulates, offers a
   chronicle card to keep, and then either bows out or gets out of the way — the
   hold is never taken away from you. */
function showVictory(sc){
  try{ sfx('tier'); }catch(e){}
  chron('goal', sc.name);
  toast('🏆 '+sc.ic+' '+sc.name+' — achieved!');
  const wrap = document.createElement('div');
  wrap.id = 'victory-wrap';
  wrap.innerHTML = `
    <div id="victory-card">
      <div class="v-ic">${sc.ic}</div>
      <div class="v-title">${sc.name}</div>
      <div class="v-sub">Achieved on day ${G.dayCount}, ${seasonName()} — ${G.holdName||'Oakenfall'} stands.</div>
      <div class="v-stats">
        <span>👥 ${G.villagers.length} settlers</span>
        <span>🏗️ ${G.journal.buildingsRaised} raised</span>
        <span>❄️ ${G.journal.wintersEndured} winters</span>
        <span>${HOLD_TIERS[getTier()].ic} ${HOLD_TIERS[getTier()].name}</span>
      </div>
      <button class="action-btn primary" id="v-continue">Carry on with the hold</button>
      <button class="action-btn" id="v-card">🖼️ Keep a chronicle card</button>
      <div class="v-note">Your hold continues exactly as it stands. Nothing is ended unless you choose it.</div>
    </div>`;
  document.body.appendChild(wrap);
  const close = ()=>{ wrap.remove(); };
  wrap.querySelector('#v-continue').addEventListener('click', close);
  wrap.querySelector('#v-card').addEventListener('click', ()=>{ try{ exportHoldCard(); }catch(e){} });
  wrap.addEventListener('click', (e)=>{ if(e.target===wrap) close(); });
}
/* ── STATS ── per-day snapshots for the Statistics view; capped, persists */
function captureStatSnapshot(){
  G.statHistory.push({ day:G.dayCount, pop:G.villagers.length,
    food:Math.round(G.stockpile.food||0), wood:Math.round(G.stockpile.wood||0), stone:Math.round(G.stockpile.stone||0) });
  if(G.statHistory.length>60) G.statHistory.shift();
}
/* ── SEASONAL FESTIVAL ── once a year the hold chooses a lasting boon */
const FESTIVAL_BOONS = [
  {id:'harvest', ic:'🌾', name:'Harvest Feast', desc:'Fields and foragers yield +20% for the year.'},
  {id:'courage', ic:'🛡️', name:'Rite of Courage', desc:'Spirits stay higher (+8 morale) and raids sting less.'},
  {id:'craft',   ic:'🔨', name:'Craftsmen\'s Fair', desc:'Every settler works +15% faster for the year.'},
];
function renderRedeemSheet(){
  const owned = Object.keys(UNLOCK_SKUS).filter(hasUnlock);
  sheetContent.innerHTML = `
    <div class="sheet-sub">Bought a pack on the Oakenfall website? Paste your code below to unlock it here. Codes are verified on your device — the game never goes online.</div>
    ${G.unlocks._admin ? `<button class="action-btn primary" id="admin-open" style="margin:2px 0 8px;">🛠️ Open Admin Panel</button>` : ''}
    <input id="redeem-input" class="redeem-input" type="text" autocomplete="off" spellcheck="false" placeholder="OAK-…  (paste your code)" aria-label="Redeem code">
    <button class="action-btn primary" id="redeem-go" style="margin-top:6px;">🎁 Redeem</button>
    <div id="redeem-msg" class="sheet-sub" style="margin-top:6px;"></div>
    <div class="sheet-sub" style="margin-top:10px;"><b>Your unlocks</b></div>
    <div class="roster-list">
      ${owned.length ? owned.map(s=>`<div class="inbox-row"><span class="ib-day">${UNLOCK_SKUS[s].ic}</span><span class="ib-msg"><b>${UNLOCK_SKUS[s].name}</b> — ${UNLOCK_SKUS[s].desc}</span></div>`).join('')
        : '<div class="sheet-sub" style="opacity:.7;">No unlocks yet. Support the hold from the website to receive a code.</div>'}
    </div>
    ${isPatron() ? `<div class="sheet-sub" style="margin-top:8px;color:var(--amber)">✦ Patron of Oakenfall${G.unlocks._patronName?' — '+G.unlocks._patronName:''}. Thank you.</div>` : ''}`;
  const input = document.getElementById('redeem-input');
  const msg = document.getElementById('redeem-msg');
  const adminOpen = document.getElementById('admin-open');
  if(adminOpen) adminOpen.addEventListener('click', ()=>{ sheetNav.push({ id:'admin', title:'🛠️ Admin Panel', render:()=>renderAdminSheet() }); });
  document.getElementById('redeem-go').addEventListener('click', async ()=>{
    // Hidden admin unlock: a special promo code opens the developer panel.
    if(String(input.value||'').trim() === ADMIN_PROMO){
      G.unlocks._admin = true; saveUnlocks();
      if(typeof sfx==='function') sfx('tier');
      sheetNav.push({ id:'admin', title:'🛠️ Admin Panel', render:()=>renderAdminSheet() });
      return;
    }
    msg.textContent = 'Checking…'; msg.style.color = 'var(--parchment-dim)';
    const r = await redeemCode(input.value);
    if(r.ok){
      msg.style.color = '#8fc46a';
      msg.textContent = r.already ? '✓ '+r.name+' is already yours.' : '✓ Unlocked '+r.name+'! Thank you for supporting Oakenfall.';
      if(!r.already && typeof sfx==='function') sfx('tier');
      renderRedeemSheet();
    } else {
      msg.style.color = '#e8b2a4'; msg.textContent = '✗ '+r.reason;
    }
  });
}
// Hidden developer/admin panel — reached by entering the ADMIN_PROMO code in the
// Redeem sheet. Grants resources/unlocks and a few sandbox conveniences. All
// actions operate on the live game state and are saved like any other change.
// Persistent admin/sandbox toggles (debug only). Read in hot loops.

/* Read-only snapshot of the running hold. Top-level declarations in a module do
   not land on window, so this is the only way for the automated tests (and the
   report/diagnostics tooling) to see what the simulation is actually doing.
   Deliberately a copy — nothing here can be used to mutate game state. */
window.__oakDebug = function(){
  const roles = {};
  for(const v of G.villagers) roles[v.role] = (roles[v.role]||0) + 1;
  return {
    version: GAME_VERSION,
    day: G.dayCount, time: Math.round(G.worldTime*100)/100, editing: editorOn,
    season: seasonName(), weather: getWeather().type,
    villagers: G.villagers.length, roles,
    states: (()=>{ const c={}; for(const v of G.villagers) c[v.state]=(c[v.state]||0)+1; return c; })(),
    /* Claimed work slots vs settlers actually holding one. A gap means tiles
       were claimed and never released, which slowly starves the hold of places
       to work. */
    claims: (()=>{ let n=0; for(const row of G.grid) for(const t of row) n += (t.workers||0); return n; })(),
    /* The frame loop catches exceptions so one bad frame can't kill the game.
       That is right, but it means a fault can run for months in silence — see
       findTC. Anything in here is a real error the game swallowed. */
    errors: recentErrors().map(e=>e.kind+': '+e.msg.slice(0,90)),
    claimants: G.villagers.filter(v=>v.targetTile).length,
    buildings: G.buildings.filter(b=>b.type!=='road').map(b=>b.type),
    placements: G.buildings.filter(b=>b.type!=='road').map(b=>({t:b.type, gx:b.gx, gy:b.gy})),
    worn: G.buildings.filter(b=>b.condition!==undefined && b.condition<70).length,
    fx: fxSpawned(),
    guilds: Object.keys(G.guilds).filter(r=>G.guilds[r]),
    masters: G.villagers.filter(v=>v.role && v.role!=='idle' && skillTier(v,v.role).label==='Master').length,
    onFire: G.buildings.filter(b=>b._fire>0).length,
    activeResearch: G.activeResearch ? G.activeResearch.id : null,
    researchedCount: Object.keys(G.researched).filter(k=>G.researched[k]).length,
    orders: stewardOrders.map(o=>o.kind),
    stockpile: Object.assign({}, G.stockpile),
    coins: G.coins, tier: getTier(),
    needs: (typeof roleNeedScores==='function') ? roleNeedScores().slice(0,3) : [],
    critters: (typeof G.critters!=='undefined') ? G.critters.length : 0,
    raiders: G.raiders.length,
    land: G.landId,
    scenario: G.scenarioId,
    scenarioWon: G.scenarioWon,
    scenarioProgress: (SCENARIOS[G.scenarioId] ? SCENARIOS[G.scenarioId].progress() : ''),
    winters: G.journal.wintersEndured,
    terrain: (()=>{ const c={}; for(const row of G.grid) for(const t of row){ const k = t.wilds?'wilds':t.type; c[k]=(c[k]||0)+1; } return c; })(),
  };
};
/* Terrain as one letter per tile ('w' = wilds), read-only like __oakDebug.
   Kept out of the snapshot itself so every other caller isn't paying for it. */
/* Every settler's working record, read-only. The counts in __oakDebug tell you
   the hold has stalled; this tells you why. */
window.__oakProbe = function(){
  return G.villagers.map(v=>({
    name:v.name, role:v.role, state:v.state,
    workTimer:+(v.workTimer||0).toFixed(2), resKind:v.resKind||null,
    tile: v.targetTile ? {gx:v.targetTile.gx, gy:v.targetTile.gy, amt:v.targetTile.resourceAmount, workers:v.targetTile.workers} : null,
    carrying: v.carrying || null,
    hunger:Math.round(v.hunger), fatigue:Math.round(v.fatigue), morale:Math.round(v.morale||0),
    eff:+effMultiplier(v).toFixed(2), stage:v.stage,
  }));
};
/* One letter per tile: the terrain's initial, uppercased where the tile is
   wilds. It used to return 'w' for wilds AND for water, which made the two
   indistinguishable — a wilds forest read as 'w' rather than forest, and a
   test looking for open water found meadow. */
/** The diagnostics block a bug report attaches. Exposed so a test can check it
 *  is actually assembled — a report that arrives empty is worse than none. */
window.__oakDiagnostics = function(){ return buildDiagnostics(); };
window.__oakGrid = function(){
  return G.grid.map(row=>row.map(t=> t.wilds ? t.type.charAt(0).toUpperCase() : t.type.charAt(0)));
};
/* Pathing across water is the rule most easily broken by a refactor and least
   likely to show up in play — a settler who cannot reach the far bank just
   looks busy elsewhere. Exposed so the systems audit can ask directly whether
   a river blocks, a ford lets you wade, and a bridge lets you cross. */
window.__oakPath = function(fx, fy, tx, ty){ return pathFind(fx, fy, tx, ty); };
window.__oakWalkable = function(gx, gy){ return tileWalkable(gx, gy); };
/** Set a tile flag from a test — the only way to stage a ford without playing
 *  out the research and the build order first. */
window.__oakSetTileFlag = function(gx, gy, key, value){
  const t = G.grid[gy] && G.grid[gy][gx];
  if(!t) return false;
  t[key] = value;
  return true;
};
function adminGrant(kind){
  const bump = (k,n)=>{ G.stockpile[k] = (G.stockpile[k]||0) + n; };
  const toDawn = ()=>{ G.worldTime = Math.floor(G.worldTime/CYCLE_LEN)*CYCLE_LEN + 30; };
  const toNight = ()=>{ G.worldTime = Math.floor(G.worldTime/CYCLE_LEN)*CYCLE_LEN + DAY_LEN + 20; };
  switch(kind){
    // ── Economy ──
    case 'res': ['wood','stone','food','planks','flour','bread'].forEach(k=>bump(k,500)); toast('🛠️ +500 of every resource.'); break;
    case 'coins': G.coins += 1000; toast('🛠️ +1000 coins.'); break;
    case 'coinsBig': G.coins += 10000; toast('🛠️ +10,000 coins.'); break;
    case 'craftClear': ['planks','flour','bread'].forEach(k=>{ G.stockpile[k]=0; }); toast('🛠️ Crafted stores emptied.'); break;
    case 'maxout': ['wood','stone','food','planks','flour','bread'].forEach(k=>{ G.stockpile[k] = capFor ? capFor(k) : 999; }); toast('🛠️ Stores filled to capacity.'); break;
    // ── Progress / unlocks ──
    case 'tech': TECH_TREE.forEach(t=>{ G.researched[t.id] = true; }); G.activeResearch = null; toast('🛠️ All research unlocked.'); break;
    case 'cosmetics': Object.keys(UNLOCK_SKUS).forEach(s=>{ G.unlocks[s]=true; }); applyPatronBanners(); saveUnlocks(); toast('🛠️ All cosmetic packs unlocked.'); break;
    // ── Population ──
    case 'settlers': for(let i=0;i<5;i++) spawnVillager(); toast('🛠️ +5 settlers summoned.'); break;
    case 'settler1': spawnVillager(); toast('🛠️ A settler joins.'); break;
    case 'morale': G.villagers.forEach(v=>{ v.morale = 100; }); toast('🛠️ Every settler is content.'); break;
    /* Mastery takes ~420 seconds of steady work in a trade, so guilds are all
       but unreachable in a test run. Granting it outright is the only way to
       exercise them without playing for an hour. */
    case 'master': G.villagers.forEach(v=>{ if(v.role && v.role!=='idle'){ v.skills = v.skills||{}; v.skills[v.role] = 500; } });
                   recomputeGuilds(true); toast('🛠️ Every settler is a Master of their trade.'); break;
    case 'heal': G.villagers.forEach(v=>{ v.sick = false; v.hunger = 0; v.fatigue = 0; }); toast('🛠️ All settlers healed & rested.'); break;
    // ── Weather ──
    case 'wClear': setWeather('clear'); toast('🛠️ Weather: clear.'); break;
    case 'wRain':  setWeather('rain');  toast('🛠️ Weather: rain.'); break;
    case 'wStorm': setWeather('storm'); toast('🛠️ Weather: storm + lightning.'); break;
    case 'wSnow':  setWeather('snow');  toast('🛠️ Weather: snowfall.'); break;
    // ── Time ──
    case 'tDawn':  toDawn(); toast('🛠️ Jumped to dawn.'); break;
    case 'tNight': toNight(); toast('🛠️ Jumped to night.'); break;
    // Step to just short of the next dawn and let update() cross the boundary
    // itself. Adding a whole cycle outright skipped the crossing entirely, so
    // the day counter never moved and none of the daily rollover — weather,
    // bounties, trade routes, stat snapshot — ever fired.
    case 'tDay':   G.worldTime = (Math.floor(G.worldTime/CYCLE_LEN)+1)*CYCLE_LEN - 0.05; toast('🛠️ Advanced one full day.'); break;
    case 'tSeason': {
      // Same trap as the day skip: land just short of the next season boundary
      // so update() crosses it and the season actually turns (winter tally,
      // wildlife re-seed, toasts). Adding SEASON_LEN outright skipped all of it.
      const target = (Math.floor(G.worldTime/SEASON_LEN)+1)*SEASON_LEN;
      G.worldTime = target - 0.05;
      G.dayCount = Math.floor(G.worldTime/CYCLE_LEN) + 1;   // catch the counter up over the skipped days
      toast('🛠️ Advanced one season.'); break;
    }
    // ── Hazards (test the drama) ──
    case 'raid':   launchRaid(4, true, raidEntryPoint(G.buildings.filter(b=>b.type==='bridge'))); toast('🛠️ Raiders incoming!'); sfx&&sfx('raid'); break;
    /* Pick only from what can actually burn. Excluding roads and wells by name
       was not the same test — igniteBuilding silently refuses anything outside
       FLAMMABLE, so landing on a mining post meant the button did nothing and
       said it had. */
    case 'fire':   { const cand = G.buildings.filter(b=>FLAMMABLE.has(b.type) && (b.condition===undefined||b.condition>0) && !b._fire);
                     if(cand.length){ igniteBuilding(cand[Math.floor(Math.random()*cand.length)], true); toast('🛠️ A fire breaks out!'); }
                     else toast('🛠️ Nothing standing here can burn.'); break; }
    case 'douse':  G.buildings.forEach(b=>{ b._fire = 0; }); toast('🛠️ All fires doused.'); break;
    case 'decay':  { let n=0; G.buildings.forEach(b=>{ if(b.condition!==undefined && b.condition>40){ b.condition=40; n++; } }); toast('🛠️ '+n+' building'+(n!==1?'s':'')+' worn down to 40%.'); break; }
    // ── Toggles ──
    case 'freeze': ADMIN.freezeNeeds = !ADMIN.freezeNeeds; toast('🛠️ Freeze needs: '+(ADMIN.freezeNeeds?'ON':'OFF')); break;
    case 'noraid': ADMIN.noRaids = !ADMIN.noRaids; toast('🛠️ Block raids: '+(ADMIN.noRaids?'ON':'OFF')); break;
    case 'debug':  ADMIN.debug = !ADMIN.debug; toast('🛠️ Debug overlay: '+(ADMIN.debug?'ON':'OFF')); break;
  }
  if(typeof sfx==='function' && kind!=='raid') sfx('tier');
  if(typeof saveGame==='function' && typeof started!=='undefined' && started) saveGame();
  if(sheetContent && sheetContent.querySelector('[data-admin]')) renderAdminSheet(); // refresh toggle labels
}
function renderAdminSheet(){
  const sect = (title, rows)=>`<div class="sheet-sub" style="margin:10px 0 4px;"><b>${title}</b></div><div class="roster-list">${
    rows.map(([k,label])=>`<button class="action-btn list-row" data-admin="${k}" style="text-align:left;">${label}</button>`).join('')}</div>`;
  const onoff = (b)=> b ? ' ✓' : '';
  sheetContent.innerHTML = `
    <div class="sheet-sub">Developer tools. Changes apply to your hold immediately. Use freely — this is your sandbox.</div>
    ${sect('💰 Economy', [['res','📦 +500 of every resource'],['maxout','🏺 Fill all stores to cap'],['craftClear','🧹 Empty crafted stores'],['coins','💰 +1,000 coins'],['coinsBig','💰 +10,000 coins']])}
    ${sect('🌤️ Weather', [['wClear','☀️ Clear'],['wRain','🌧️ Rain'],['wStorm','⛈️ Storm + lightning'],['wSnow','🌨️ Snowfall']])}
    ${sect('🕰️ Time', [['tDawn','🌅 Jump to dawn'],['tNight','🌙 Jump to night'],['tDay','📅 Advance one day'],['tSeason','🍂 Advance one season']])}
    ${sect('👥 Population', [['settler1','🚶 Summon 1 settler'],['settlers','👥 Summon 5 settlers'],['morale','😊 All morale to 100'],['heal','❤️ Heal, feed & rest all'],['master','★ Master every trade']])}
    ${sect('🔓 Unlocks', [['tech','🔬 Unlock all research'],['cosmetics','🎁 Unlock all cosmetic packs']])}
    ${sect('🔥 Hazards', [['raid','🏴 Trigger a raid'],['fire','🔥 Start a fire'],['douse','🪣 Douse all fires'],['decay','🏚️ Wear every building down']])}
    ${sect('🐛 Toggles', [['freeze','🧊 Freeze hunger/fatigue'+onoff(ADMIN.freezeNeeds)],['noraid','🛡️ Block raids'+onoff(ADMIN.noRaids)],['debug','📊 Debug overlay'+onoff(ADMIN.debug)]])}
    <div class="sheet-sub" style="margin-top:10px;opacity:.7;">Reach this panel any time from 🎁 Redeem once unlocked.</div>`;
  sheetContent.querySelectorAll('[data-admin]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ adminGrant(btn.dataset.admin); });
  });
}
/* ── ONBOARDING ── a dismissible objective ribbon that guides a brand-new hold
   through its first steps, then bows out. */
/* ── VISIBLE RAIDS ── the raid's outcome is decided by the defense math, but
   the raiders now march in and are met, so you SEE the hold hold or break.
   Purely a dramatization layer over the already-computed result. */
function drawRaider(r){
  const p = project(r.gx, r.gy);
  const bob = Math.abs(Math.sin(r.phase))*1.6;
  const cx=p.x, cy=p.y-bob;
  try{ drawShadow(cx, p.y+5, 8); }catch(e){}
  // AI sprite path (falls through to the hand-drawn hooded figure if not loaded)
  const rimg = SPRITES['raider_'+(r.variant||'bandit')];
  if(rimg && rimg.complete && rimg.naturalWidth>0){
    const h = 30, w = h*(rimg.naturalWidth/rimg.naturalHeight);
    ctx.save();
    if(r.facing===-1){ ctx.translate(cx*2,0); ctx.scale(-1,1); }
    try{ ctx.drawImage(rimg, cx-w/2, cy-h+7, w, h); }catch(e){}
    ctx.restore();
    return;
  }
  // hooded figure in dark cloth with a torch
  ctx.save();
  ctx.fillStyle='#2a2320';
  ctx.beginPath(); ctx.moveTo(cx, cy-22); ctx.lineTo(cx-6, cy-2); ctx.lineTo(cx+6, cy-2); ctx.closePath(); ctx.fill(); // cloak
  ctx.fillStyle='#1a1512'; ctx.beginPath(); ctx.arc(cx, cy-22, 4, 0, 7); ctx.fill(); // hood
  ctx.fillStyle='rgba(60,40,30,0.9)'; ctx.fillRect(cx-1, cy-2, 2, 4); // legs
  // torch
  const tx=cx+r.facing*7;
  ctx.strokeStyle='#241505'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(tx, cy-4); ctx.lineTo(tx, cy-16); ctx.stroke();
  const fimg = ('fire', G.worldTime*9 + r.gx);
  if(fimg && fimg.complete && fimg.naturalWidth>0){ const w=9,h=w*(fimg.naturalHeight/fimg.naturalWidth); try{ ctx.drawImage(fimg, tx-w/2, cy-16-h, w, h); }catch(e){} }
  else { ctx.fillStyle='#e8782c'; ctx.beginPath(); ctx.ellipse(tx, cy-17, 3, 5, 0, 0, 7); ctx.fill(); }
  ctx.restore();
}
/* ── AMBIENT WILDLIFE ── deer roam the wilds and bolt from folk; birds drift
   the sky. Purely atmospheric — not saved, respawned each session. */
/* Each kind keeps its own temperament: how far it lets you approach, how hard it
   bolts, and how restless it is when left alone. Boar stand their ground far
   longer than deer; rabbits spook at almost anything. */
/* ── DECISION EVENTS ── periodic dilemmas with real, lasting choices. Fire only
   when no sheet is open (so they never interrupt), a few in-game days apart. */
let decisionTimer = 3.2; // in-game days until the first
let _lastDecision = '';
function changeMorale(delta){ G.villagers.forEach(v=>{ if(v.morale!==undefined) v.morale=clamp(v.morale+delta,0,100); }); }
const DECISIONS = [
  { id:'refugees', ic:'🚪', title:'Strangers at the Gate',
    text:'A ragged family stands at the palisade — three souls, footsore and hungry, asking to join the hold.',
    choices:[
      {label:'Take them in', outcome:'The family joins the hold, grateful.', run:()=>{ let n=0; const room=popCapacity()-G.villagers.length; for(let i=0;i<Math.min(2,Math.max(0,room));i++){ spawnVillager(); n++; } G.stockpile.food=Math.max(0,(G.stockpile.food||0)-10); toast(n>0?('👪 '+n+' newcomer'+(n>1?'s':'')+' join the hold.'):'👪 No room — but you shared what you could.'); changeMorale(4); }},
      {label:'Share food, send them on', outcome:'You give them provisions for the road.', run:()=>{ G.stockpile.food=Math.max(0,(G.stockpile.food||0)-8); changeMorale(2); }},
      {label:'Turn them away', outcome:'The gate stays shut. The folk mutter.', run:()=>{ changeMorale(-5); }},
    ]},
  { id:'peddler', ic:'🎁', title:'The Peddler\'s Crate',
    text:'A travelling peddler offers a sealed crate, sight unseen, for 15 coins. "Could be treasure, could be turnips," he grins.',
    cond:()=>G.coins>=15,
    choices:[
      {label:'Buy the crate (15c)', outcome:'You pry it open...', run:()=>{ G.coins-=15; const r=Math.random(); if(r<0.45){ const g=gainResource('planks',12); toast('📦 Fine planks! +'+g); } else if(r<0.8){ const g=gainResource('food',20); toast('📦 Salted stores. +'+g+' food'); } else { toast('📦 ...turnips. Mostly air.'); } }},
      {label:'Decline', outcome:'The peddler shrugs and moves on.', run:()=>{}},
    ]},
  { id:'tribute', ic:'🏴', title:'A Bandit Ultimatum',
    text:'A rider bears a crude banner: pay 25 food in tribute, or the bandits will come for far more.',
    cond:()=>getTier()>=1 && (G.stockpile.food||0)>=25 && (gameMode.banditsEnabled!==false),
    choices:[
      {label:'Pay the tribute', outcome:'They take the food and melt back into the trees.', run:()=>{ G.stockpile.food-=25; changeMorale(-2); }},
      {label:'Refuse them', outcome:'You bar the gate. The folk stand a little taller — but a raid may come.', run:()=>{ changeMorale(3); hastenRaid(25); }},
    ]},
  { id:'scholar', ic:'📚', title:'A Wandering Scholar',
    text:'A scholar seeks shelter and offers, in thanks, to share what they know — if the hold can spare a meal.',
    cond:()=>!!G.activeResearch && (G.stockpile.food||0)>=12,
    choices:[
      {label:'Host them (12 food)', outcome:'By lamplight they hasten your studies.', run:()=>{ G.stockpile.food-=12; if(G.activeResearch) G.activeResearch.remaining=Math.max(0,G.activeResearch.remaining-25); toast('📚 Research hastened.'); changeMorale(2); }},
      {label:'No food to spare', outcome:'They understand, and move on.', run:()=>{}},
    ]},
  { id:'feast', ic:'🍲', title:'The Folk Ask for a Feast',
    text:'The hold has worked hard, and the elders propose a feast to lift every heart — if you can spare the stores.',
    cond:()=>(G.stockpile.food||0)>=20,
    choices:[
      {label:'Hold the feast (20 food)', outcome:'Song and firelight late into the night.', run:()=>{ G.stockpile.food-=20; changeMorale(10); }},
      {label:'Not this time', outcome:'The stores stay full; the mood dips a little.', run:()=>{ changeMorale(-3); }},
    ]},
  { id:'ruins', ic:'🗿', title:'Old Stones in the Wood',
    text:'Foragers report tumbled ruins at the treeline — mossy, half-buried, and possibly worth digging.',
    choices:[
      {label:'Send diggers', outcome:'They set to the old stones...', run:()=>{ const r=Math.random(); if(r<0.55){ const g=gainResource('stone',18); toast('🗿 Dressed stone salvaged! +'+g); } else if(r<0.8){ G.coins+=12; toast('🗿 A cache of old coin! +12'); } else { toast('🗿 The dig collapses — a fright, no more.'); changeMorale(-3); } }},
      {label:'Leave them be', outcome:'Some things are best left sleeping.', run:()=>{}},
    ]},
];
function rollDecision(){
  if(sheetWrap.classList.contains('open')) return; // never interrupt an open panel
  const pool = DECISIONS.filter(d=>d.id!==_lastDecision && (!d.cond || (()=>{ try{return d.cond();}catch(e){return false;} })()));
  if(!pool.length) return;
  const d = pool[Math.floor(Math.random()*pool.length)];
  _lastDecision = d.id;
  selection = {type:null, ref:null};
  openSheet(); sheetNav.reset();
  sheetNav.push({ id:'decision', title:d.ic+' '+d.title, render:()=>renderDecisionSheet(d) });
  if(typeof sfx==='function') sfx('open');
}
function renderDecisionSheet(d){
  sheetContent.innerHTML = `
    <div class="sheet-sub" style="font-style:italic;line-height:1.5;">${d.text}</div>
    <div class="roster-list" style="margin-top:10px;">
      ${d.choices.map((c,i)=>`<button class="action-btn list-row" data-choice="${i}"><span style="flex:1;text-align:left;">${c.label}</span></button>`).join('')}
    </div>`;
  sheetContent.querySelectorAll('[data-choice]').forEach(btn=>btn.addEventListener('click', ()=>{
    const c = d.choices[+btn.dataset.choice];
    try{ c.run(); }catch(e){}
    if(typeof chron==='function') chron('decision', d.title);
    sheetContent.innerHTML = `<div class="sheet-sub" style="line-height:1.5;">${c.outcome}</div>
      <button class="action-btn primary" id="decision-done" style="margin-top:10px;">Continue</button>`;
    document.getElementById('decision-done').addEventListener('click', ()=>deselectAll());
  }));
}
/* ── DECREES ── toggleable hold-wide policies, each a lasting trade-off. */
const DECREE_DEFS = [
  {id:'curfew',    ic:'🌙', name:'Curfew',      on:'Folk stay in after dark — raids are less likely, but spirits chafe.', good:'−30% night raid risk', bad:'−5 morale'},
  {id:'tithe',     ic:'💰', name:'Tithe',       on:'A daily levy fills the coffers, at the cost of goodwill.', good:'+coins each day', bad:'−6 morale'},
  {id:'openGates', ic:'🚪', name:'Open Gates',  on:'Word spreads that all are welcome — newcomers arrive faster, but the hold is easier to reach.', good:'faster immigration', bad:'+20% raid risk'},
  {id:'rationing', ic:'🥣', name:'Rationing',   on:'Careful portions stretch the stores, but hungry work is slow work.', good:'food lasts 20% longer', bad:'−6% work speed'},
];
function decreeRaidMul(){ let m=1; if(G.decrees.curfew && typeof isNight==='function' && isNight()) m*=0.7; if(G.decrees.openGates) m*=1.2; return m; }
function decreeHungerMul(){ return G.decrees.rationing ? 0.8 : 1; }
function decreeWorkMul(){ return G.decrees.rationing ? 0.94 : 1; }
const ONBOARD_STEPS = [
  {hint:'👋 Welcome, steward. Tap 🔨 and raise a House to make room for more settlers.',
   done:()=>G.buildings.some(b=>b.type==='house')},
  {hint:'🪓 Build a Forestry Camp, then tap a settler and set them to Lumberjack — timber builds everything.',
   done:()=>G.buildings.some(b=>b.type==='forestCamp') && G.villagers.some(v=>v.role==='lumberjack')},
  {hint:'🌾 Food is life. Build a Farm and assign a Farmer before the cold comes.',
   done:()=>G.buildings.some(b=>b.type==='farm') && G.villagers.some(v=>v.role==='farmer')},
  {hint:'❄️ Now stock food and firewood — and survive your first winter.',
   done:()=>(G.journal.wintersEndured||0)>=1},
];
function updateOnboard(){
  const el=document.getElementById('onboard-ribbon'); if(!el) return;
  if(G.onboardDone){ el.classList.add('hidden'); return; }
  let step=null;
  for(const s of ONBOARD_STEPS){ let d=false; try{ d=s.done(); }catch(e){} if(!d){ step=s; break; } }
  if(!step){ G.onboardDone=true; el.classList.add('hidden'); toast('✓ You\'ve found your feet, steward — the hold is yours.'); return; }
  const t=document.getElementById('onboard-text'); if(t) t.textContent=step.hint;
  el.classList.remove('hidden');
}
function updateStatuses(){
  const el=document.getElementById('statuses'); if(!el) return;
  const pills=[];
  if(typeof G.climate!=='undefined' && G.climate){ const c=CLIMATE_DEFS[G.climate.type]; pills.push({t:G.climate.ic+' '+c.name, c: G.climate.type==='fair'?'good':'warn'}); }
  if(typeof G.festivalBoon!=='undefined' && G.festivalBoon){ const b=FESTIVAL_BOONS.find(x=>x.id===G.festivalBoon); if(b) pills.push({t:b.ic+' '+b.name, c:'good'}); }
  if(typeof G.tradeRoutes!=='undefined' && G.tradeRoutes.length) pills.push({t:'🐫 '+G.tradeRoutes.length+' route'+(G.tradeRoutes.length>1?'s':''), c:''});
  if(G.buildings.some(b=>b._fire)) pills.push({t:'🔥 Fire!', c:'warn'});
  if(typeof G.plague!=='undefined' && G.plague) pills.push({t:'🤢 Blight', c:'warn'});
  el.innerHTML = pills.map(p=>`<span class="status-pill ${p.c}">${p.t}</span>`).join('');
}
/* ── DEEDS ── one-time achievements; earned map is id→day, persists in saves */
const DEED_DEFS = [
  {id:'firstHome',     ic:'🏠', name:'A Roof Raised',   desc:'Build your first house.',              reward:{coins:5},              check:()=>G.buildings.some(b=>b.type==='house')},
  {id:'hamlet',        ic:'🏘️', name:'Hamlet',          desc:'Grow the hold to 10 settlers.',        reward:{coins:10},             check:()=>G.villagers.length>=10},
  {id:'township',      ic:'🏰', name:'Township',        desc:'Grow the hold to 20 settlers.',        reward:{coins:20},             check:()=>G.villagers.length>=20},
  {id:'firstWinter',   ic:'❄️', name:'First Winter',    desc:'Survive your first winter.',           reward:{coins:12,food:20},     check:()=>G.journal.wintersEndured>=1},
  {id:'ironHeart',     ic:'🥶', name:'Iron Heart',      desc:'Endure three winters.',                reward:{coins:25},             check:()=>G.journal.wintersEndured>=3},
  {id:'bridgeBuilder', ic:'🌉', name:'Bridge Builder',  desc:'Span the river with a bridge.',        reward:{coins:10,planks:6},    check:()=>G.buildings.some(b=>b.type==='bridge')},
  {id:'fullGranary',   ic:'🌾', name:'Full Granary',    desc:'Stockpile 200 provisions.',            reward:{coins:15},             check:()=>(G.stockpile.food||0)>=200},
  {id:'timberBaron',   ic:'🪵', name:'Timber Baron',    desc:'Hold 300 timber at once.',             reward:{coins:15},             check:()=>(G.stockpile.wood||0)>=300},
  {id:'firstWed',      ic:'💞', name:'A Match Made',     desc:'See your first wedding.',              reward:{coins:8},              check:()=>(G.journal.weddings||0)>=1},
  {id:'newLife',       ic:'👶', name:'New Life',        desc:'Welcome a child born in the hold.',    reward:{coins:8,food:15},      check:()=>(G.journal.childrenBorn||0)>=1},
  {id:'greyHairs',     ic:'🧓', name:'Grey Hairs',      desc:'A settler lives to become an elder.',  reward:{coins:12},             check:()=>G.villagers.some(v=>v.stage==='elder')},
  {id:'remembered',    ic:'🪦', name:'Remembered',      desc:'Lay a settler to rest in the grove.',  reward:{coins:8},              check:()=>(G.journal.passed||0)>=1},
  {id:'heldGate',      ic:'🛡️', name:'Held the Gate',   desc:'Survive a raid on the hold.',          reward:{coins:15,stone:15},    check:()=>G.wolfEvents>=1},
  {id:'scholar',       ic:'🔬', name:'Scholar',         desc:'Complete a research along the oak.',   reward:{coins:12},             check:()=>Object.keys(G.researched||{}).length>=1},
  {id:'master',        ic:'★', name:'Master of the Craft',desc:'A settler masters their trade.',      reward:{coins:15},             check:()=>G.villagers.some(v=>skillTier(v,v.role).label==='Master')},
];
function rewardText(r){
  if(!r) return '';
  const parts = [];
  if(r.coins) parts.push('💰'+r.coins);
  if(r.food) parts.push('🌾'+r.food);
  if(r.wood) parts.push('🪵'+r.wood);
  if(r.stone) parts.push('🪨'+r.stone);
  if(r.planks) parts.push('🪚'+r.planks);
  return parts.join(' ');
}
function grantReward(r){
  if(!r) return;
  if(r.coins){ G.coins += r.coins; logCoinIn('deeds', r.coins); }
  if(r.food) gainResource('food', r.food);
  if(r.wood) gainResource('wood', r.wood);
  if(r.stone) gainResource('stone', r.stone);
  if(r.planks) gainResource('planks', r.planks);
}
function checkDeeds(){
  for(const d of DEED_DEFS){
    if(G.deeds[d.id]) continue;
    let earned=false; try{ earned = d.check(); }catch(e){ earned=false; }
    if(earned){
      G.deeds[d.id] = G.dayCount;
      grantReward(d.reward);
      const rt = rewardText(d.reward);
      toast('🏅 Deed earned — '+d.ic+' '+d.name+(rt?' (+'+rt+')':''));
      if(typeof sfx==='function') sfx('deed');
      if(typeof chron==='function') chron('deed', d.name);
    }
  }
}

let eventTimer = 140; // world-seconds until the next random event roll

// Ring buffer of recent errors — auto-attached to bug reports
// Trader's ledger — cumulative coin flow by category, for the economy view.
const SHOP_ITEMS = [
  { id:'festival', ic:'🎉', name:'Feast Day',        cost:30, desc:'Begin a festival at once — the hold works 25% faster for a while.' },
  { id:'merchant', ic:'🧳', name:'Summon Merchant',  cost:25, desc:'A merchant arrives immediately with improved trade rates.' },
  { id:'healer',   ic:'🌿', name:'Healer\'s Visit',  cost:20, desc:'Cure every sick settler in the hold instantly.' },
  { id:'repairs',  ic:'🔧', name:'Mend the Hold',    cost:18, desc:'Instantly repair every building to full condition.' },
  { id:'rations',  ic:'🥖', name:'Emergency Rations',cost:15, desc:'A cart of 25 food arrives at the stores.' },
  { id:'banner',   ic:'🚩', name:'New Banner Dye',   cost:12, desc:'Re-dye the hold banner in a new colour (cycles red → blue → green → gold).' },
];
function renderLedgerSheet(){
  const IN = { bounties:['🎯','Daily bounties'], quests:['📜','Goals'], deeds:['🏅','Deeds'], routes:['🐫','Trade routes'], tithe:['💰','Tithe'] };
  const OUT = { shop:['🛒','Hold Shop'] };
  const totIn = Object.values(G.ledger.in).reduce((a,b)=>a+b,0);
  const totOut = Object.values(G.ledger.out).reduce((a,b)=>a+b,0);
  const row = (ic,label,amt,tot,sign)=>{
    const pct = tot>0 ? Math.round(amt/tot*100) : 0;
    return `<div class="ledger-row"><span class="lg-ic">${ic}</span><span class="lg-label">${label}</span>
      <span class="mini-bar"><span style="display:block;height:100%;width:${pct}%;background:${sign>0?'#6a9a4a':'#a4402c'}"></span></span>
      <span class="lg-amt">${sign>0?'+':'−'}${amt}</span></div>`;
  };
  sheetContent.innerHTML = `
    <div class="sheet-sub">In the coffers now: <b>💰 ${G.coins}</b>.</div>
    <div class="sheet-sub" style="margin-top:8px;"><b>Coin earned</b> — 💰${totIn} all-time</div>
    <div class="roster-list">
      ${Object.keys(IN).map(k=>row(IN[k][0], IN[k][1], G.ledger.in[k]||0, totIn, 1)).join('')}
    </div>
    <div class="sheet-sub" style="margin-top:10px;"><b>Coin spent</b> — 💰${totOut} all-time</div>
    <div class="roster-list">
      ${Object.keys(OUT).map(k=>row(OUT[k][0], OUT[k][1], G.ledger.out[k]||0, totOut, -1)).join('')}
    </div>
    <div class="sheet-sub" style="margin-top:10px;opacity:.8;">Net across the hold's life: <b>${totIn-totOut>=0?'+':'−'}${Math.abs(totIn-totOut)}</b> coins.</div>`;
}
function renderTradeRoutesSheet(){
  refreshRouteOffers();
  const hasPost = hasActiveBuilding('tradingPost');
  const lbl = routeGoodLabel;
  sheetContent.innerHTML = `
    <div class="sheet-sub">Recurring caravan contracts — deliver goods on schedule for a steady flow of coins. Requires a Trading Post.</div>
    ${!hasPost ? '<div class="sheet-sub" style="color:#e8b2a4;">⚠️ No active Trading Post — build one to broker routes.</div>' : ''}
    <div class="sheet-sub" style="margin-top:8px;"><b>Active routes</b> (${G.tradeRoutes.length}/3)</div>
    <div class="roster-list">
      ${G.tradeRoutes.length ? G.tradeRoutes.map(r=>`<div class="route-row">
        <span style="font-size:20px;">${r.ic}</span>
        <span class="rr-main"><b>${r.name}</b><br><span class="rr-sub">${r.giveAmt} ${lbl(r.giveType)} every ${r.everyDays}d → 💰${r.coins} · next day ${r.nextDay}${r.missed?` · <span style="color:#e8b2a4;">missed once</span>`:''}</span></span>
        <button class="chip" data-cancel="${r.id}">End</button>
      </div>`).join('') : '<div class="sheet-sub" style="opacity:.7;">No active routes yet.</div>'}
    </div>
    <div class="sheet-sub" style="margin-top:10px;"><b>Caravans seeking contracts</b></div>
    <div class="roster-list">
      ${G.routeOffers.map(o=>`<button class="action-btn list-row${(!hasPost||G.tradeRoutes.length>=3)?' dim':''}" data-accept="${o.id}">
        <span style="font-size:20px;">${o.ic}</span>
        <span><b>${o.name}</b><br><span style="font-size:11.5px;opacity:.8;">${o.giveAmt} ${lbl(o.giveType)} every ${o.everyDays} days → 💰${o.coins} each run</span></span>
      </button>`).join('')}
    </div>`;
  sheetContent.querySelectorAll('[data-accept]').forEach(b=>b.addEventListener('click', ()=>acceptRoute(b.dataset.accept)));
  sheetContent.querySelectorAll('[data-cancel]').forEach(b=>b.addEventListener('click', ()=>cancelRoute(b.dataset.cancel)));
}
function buyShopItem(id){
  const it = SHOP_ITEMS.find(x=>x.id===id);
  if(!it) return;
  if(G.coins < it.cost){ toast('Not enough coins — complete bounties and goals to earn more.', true); return; }
  const _coinsBefore = G.coins;
  if(id==='festival'){ if(activeEvent){ toast('An event is already underway.', true); return; } G.coins-=it.cost; activeEvent={type:'festival',endsAt:G.worldTime+55}; toast('🎉 A feast day begins!'); sfx('festival'); }
  else if(id==='merchant'){ if(activeEvent){ toast('An event is already underway.', true); return; } G.coins-=it.cost; activeEvent={type:'merchant',endsAt:G.worldTime+70}; toast('🧳 A merchant arrives at your call!'); }
  else if(id==='healer'){ const n=G.villagers.filter(v=>v.sick).length; if(!n){ toast('No one is sick.', true); return; } G.coins-=it.cost; G.villagers.forEach(v=>{v.sick=false;v.sickTimer=0;}); toast('🌿 The healer cures '+n+' settler'+(n>1?'s':'')+'.'); }
  else if(id==='repairs'){ G.coins-=it.cost; let n=0; G.buildings.forEach(b=>{ if(b.condition!==undefined&&b.condition<100){b.condition=100;n++;} }); toast('🔧 '+n+' building'+(n!==1?'s':'')+' restored.'); }
  else if(id==='rations'){ G.coins-=it.cost; const got=gainResource('food',25); toast('🥖 +'+got+' food delivered.'); }
  else if(id==='banner'){ G.coins-=it.cost; G.bannerIdx=(G.bannerIdx+1)%bannerPalette.length; toast('🚩 The hold flies new colours!'+(bannerPalette.length>BANNER_COLORS.length?'':'')); }
  if(_coinsBefore > G.coins) logCoinOut('shop', _coinsBefore - G.coins);
  renderHubSheet('shop');
}
function renderShopSheet(){
  sheetContent.innerHTML = `
    <div class="sheet-sub">Coins: <b>${G.coins}</b> — earned from daily bounties and completed goals.</div>
    ${SHOP_ITEMS.map(it=>`
      <button class="action-btn list-row${G.coins<it.cost?' dim':''}" data-shop="${it.id}">
        <div>${it.ic} <span class="rt">${it.name}</span> — 💰${it.cost}<br><span class="rd">${it.desc}</span></div>
      </button>`).join('')}
    <button class="action-btn list-row" id="routes-btn" style="margin-top:8px;">
      <div>🐫 <span class="rt">Trade Routes</span>${G.tradeRoutes.length?` — ${G.tradeRoutes.length} active`:''}<br><span class="rd">Recurring caravan contracts for a steady coin income.</span></div>
    </button>
    <button class="action-btn list-row" id="ledger-btn" style="margin-top:6px;">
      <div>📒 <span class="rt">Trader's Ledger</span><br><span class="rd">Where your coins come from and where they go.</span></div>
    </button>
  `;
  sheetContent.querySelectorAll('[data-shop]').forEach(btn=>btn.addEventListener('click', ()=>buyShopItem(btn.dataset.shop)));
  document.getElementById('routes-btn').addEventListener('click', ()=>{
    sheetNav.push({ id:'routes', title:'🐫 Trade Routes', render:()=>renderTradeRoutesSheet() });
  });
  document.getElementById('ledger-btn').addEventListener('click', ()=>{
    sheetNav.push({ id:'ledger', title:'📒 Trader\'s Ledger', render:()=>renderLedgerSheet() });
  });
}

/* ── AMBIENT LIFE ── idle & young citizens don't just stand there: they gather
   at the hearth after dark, seek warmth in winter, drift toward friends, and
   the children play. Only steers idle wander targets + a mood bubble — never
   overrides assigned work. */


let journalTimer = 1;
let activeEvent = null; // {type, endsAt, data}

/* ── RANDOM EVENTS ──────────────────────────────────────────────────── */
function rollRandomEvent(){
  if(activeEvent) return; // one at a time
  let roll = Math.random();
  if(gameMode.merchantOften && roll>0.30) roll = Math.random()<0.45 ? 0.1 : roll;
  if(roll < 0.30){
    // Traveling merchant — better trade rates for a while
    activeEvent = { type:'merchant', endsAt: G.worldTime + 70 };
    toast('🧳 A traveling merchant arrives — trade rates improved for a while!');
  } else if(roll < 0.50){
    // Wandering healer — cures all illness for food
    const sickCount = G.villagers.filter(v=>v.sick).length;
    if(sickCount>0 && G.stockpile.food>=8){
      G.stockpile.food -= 8;
      G.villagers.forEach(v=>{ v.sick=false; v.sickTimer=0; });
      toast('🌿 A wandering healer cures '+sickCount+' sick villager'+(sickCount>1?'s':'')+' for 8 food.');
    } else if(sickCount>0){
      toast('🌿 A healer passed by, but the stores couldn\'t afford their fee (8 food).');
    }
  } else if(roll < 0.70){
    // Festival — everyone works faster briefly
    activeEvent = { type:'festival', endsAt: G.worldTime + 55 };
    toast('🎉 A festival lifts every heart — the hold works faster for a while!'); sfx('festival');
  } else if(roll < 0.85){
    // Resource vein — a random stone tile refills to double
    const cand = G.stoneTiles.filter(t=>t.resourceAmount < t.maxResource);
    if(cand.length){
      const t = cand[Math.floor(Math.random()*cand.length)];
      t.resourceAmount = t.maxResource*2;
      toast('⛏️ Miners report a rich vein — a stone deposit has doubled!');
    }
  } else {
    // Bumper forage — small instant food find
    const got = gainResource('food', 6+Math.floor(Math.random()*8));
    if(got>0) toast('🍄 Foragers return with '+got+' extra food from the woods.');
  }
}
function eventTradeBonus(){ return (activeEvent && activeEvent.type==='merchant' ? 1.35 : 1) * (gameMode.tradeMul||1); }
function eventSpeedBonus(){ return activeEvent && activeEvent.type==='festival' ? 1.25 : 1; }

/* ── NAMED DISTRICTS ── clusters of 3+ buildings earn a name, shown on the map
   and announced to the Chronicle when they first form. Recomputed on a slow
   timer; names are deterministic (stable across recomputes and reloads). */
function drawDistrictLabels(){
  if(!G.districts.length || camera.scale < 0.62) return; // hide when zoomed far out
  ctx.save();
  ctx.font = "600 12px 'Cinzel', serif";
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const d of G.districts){
    const p = project(d.gx, d.gy);
    const s = worldToScreen(p.x, p.y);
    if(s.x<-80||s.x>view.w+80||s.y<-40||s.y>view.h+40) continue;
    const y = s.y - 6;
    ctx.lineWidth=3; ctx.strokeStyle='rgba(10,8,4,0.6)'; ctx.strokeText(d.name, s.x, y);
    ctx.fillStyle='rgba(226,205,160,0.82)'; ctx.fillText(d.name, s.x, y);
  }
  ctx.restore();
}

/* ── DISASTERS: FIRE ── timber buildings can catch and spread; a bucket brigade
   (tapping the blaze) and nearby settlers, rain, or winter put it out. */
function drawBuildingFire(b){
  if(!b._fire) return;
  const c = buildingCenter(b);
  const p = project(c.gx, c.gy);
  const baseY = p.y + TILE_H * (b.h > 1 ? b.h * 0.5 : 0.5);
  const n = b._fire>60 ? 3 : (b._fire>30 ? 2 : 1);
  for(let i=0;i<n;i++){
    const ox = (i-(n-1)/2) * 12;
    const img = ('fire', G.worldTime*9 + b.gx*3.1 + i*7);
    if(img && img.complete && img.naturalWidth>0){
      const w = 16 + b._fire*0.12, hgt = w*(img.naturalHeight/img.naturalWidth);
      try{ ctx.drawImage(img, p.x+ox-w/2, baseY-hgt-6, w, hgt); }catch(e){}
    } else {
      ctx.fillStyle='rgba(232,120,40,0.8)';
      ctx.beginPath(); ctx.ellipse(p.x+ox, baseY-10, 5, 9, 0, 0, 7); ctx.fill();
    }
  }
  // ember glow
  ctx.fillStyle=`rgba(255,150,50,${0.12+Math.sin(G.worldTime*8+b.gx)*0.05})`;
  ctx.beginPath(); ctx.arc(p.x, baseY-8, 26, 0, 7); ctx.fill();
}

/* ── VILLAGER BACKSTORIES ───────────────────────────────────────────── */
const BACKSTORY_ORIGINS = ['a burned lowland farm','the old river crossings','a shuttered mining town','the eastern trade roads','a forgotten chapel hamlet','the salt-marsh coast','a woodcutter camp up north','the ruins of Old Kal'];
const BACKSTORY_HOOKS = {
  hardy:'and never once complained of the cold', swift:'outrunning worse things than wolves',
  glutton:'with little more than a legendary appetite', diligent:'seeking honest work and quiet',
  frail:'hoping the pines would be kinder', lucky:'after a coin-flip spared their life',
};
function backstoryFor(v){
  const seed = hashStr(v.name);
  const origin = BACKSTORY_ORIGINS[seed % BACKSTORY_ORIGINS.length];
  const hook = BACKSTORY_HOOKS[v.trait.id] || 'looking for a fresh start';
  return v.name+' came to Oakenfall from '+origin+', '+hook+'.';
}


let selection = { type:null, ref:null }; // type: 'villager'|'building'|'tile'
let buildMode = { active:false, key:null, movingBuilding:null };


// Pick a starting zoom that fits a comfortable slice of the hold on whatever
// screen you're on — small phones and un-maximized windows were far too zoomed
// in (only a few tiles visible). Aims for ~10 tiles across the smaller side.
const TRAIT_POOL = [
  {id:'hardy',    label:'Hardy',    ic:'🛡️', desc:'Tires 20% slower.'},
  {id:'swift',    label:'Swift',    ic:'💨', desc:'Moves 20% faster.'},
  {id:'glutton',  label:'Glutton',  ic:'🍖', desc:'Hungers 30% faster.'},
  {id:'diligent', label:'Diligent', ic:'⚒️', desc:'Works 20% faster.'},
  {id:'frail',    label:'Frail',    ic:'🤧', desc:'Tires 25% faster, more illness risk.'},
  {id:'lucky',    label:'Lucky',    ic:'🍀', desc:'Rarely targeted by wolf raids.'},
];
function rollTrait(){
  return TRAIT_POOL[Math.floor(Math.random()*TRAIT_POOL.length)];
}
// Legacy traits — earned through life events, never rolled at spawn

function spawnVillager(nameOverride, traitOverride){
  const slot = G.idleSlotCounter++;
  // Phyllotaxis (sunflower) spiral: golden-angle rotation with sqrt-scaled radius.
  // This spreads villagers evenly outward forever with no clustering, unlike a
  // fixed 3-ring pattern which starts overlapping once population passes ~9.
  const ang = slot * 2.39996;
  const rad = 1.5 + Math.sqrt(slot) * 0.62;
  const trait = traitOverride || rollTrait();
  const speedBonus = trait.id==='swift' ? 0.26 : 0;
  // Spawn at the Town Center's front door (south face of the 2x2 footprint)
  // rather than a floating point, so new arrivals visibly emerge from the hall.
  const doorGX = G.TC_CX, doorGY = G.TC_CY + 1.05;
  const v = {
    id:'v'+Math.random().toString(36).slice(2,9),
    name: nameOverride || rollName(),
    trait,
    role:'idle',
    state:'spawning',
    spawnTimer: 1.1,
    sick:false, sickTimer:0,
    gx: doorGX, gy: doorGY,
    idleGX: G.TC_CX + Math.cos(ang)*rad, idleGY: G.TC_CY + Math.sin(ang)*rad,
    tx:0, ty:0,
    targetTile:null, targetBuilding:null,
    carrying:null,
    hunger: 10+Math.random()*15,
    fatigue: 5+Math.random()*15,
    workTimer:0, eatTimer:0, sleepTimer:0, idleCooldown:0,
    bobPhase: Math.random()*10,
    speed: 1.3 + Math.random()*0.15 + speedBonus,
    facing: 1,
    path:[], pathTarget:null,
    relations:[], memories:[],
    age: 1.6 + Math.random()*1.4, stage:'adult',
    lifespan: LIFESPAN_BASE + (Math.random()*1.6 - 0.8),
    skills:{},   // role → experience points; grows while working that role
  };
  if(trait.id==='hardy') v.lifespan += 0.8;
  G.villagers.push(v);
  return v;
}

function reassignRole(v, role){
  if(v.stage==='child'){ toast(v.name+' is too young for such work.', true); return; }
  const haulingStates = ['walkingToDropoff','seekingFood','eating','seekingSleep','sleeping'];
  if(!haulingStates.includes(v.state)){
    releaseClaims(v);
    v.state='idle';
  }
  v.role = role;
  v.idleCooldown = 0;
}

const QUESTS = [
  {id:'q1', title:'First Timber', desc:'Gather 100 wood in total.', icon:'🪵', check:()=>G.totals.wood>=100, reward:{stone:25}},
  {id:'q2', title:'Quarry Opened', desc:'Gather 60 stone in total.', icon:'🪨', check:()=>G.totals.stone>=60, reward:{wood:30}},
  {id:'q3', title:'Founding the Hearth', desc:'Build a House.', icon:'🏚️', check:()=>hasBuildingType('house'), reward:{food:20}},
  {id:'q4', title:'Tend the Fields', desc:'Raise a Farm.', icon:'🌾', check:()=>hasBuildingType('farm'), reward:{wood:25}},
  {id:'q5', title:'Net the River', desc:'Raise a Fishing Hut.', icon:'🎣', check:()=>hasBuildingType('fishingHut'), reward:{food:20}},
  {id:'q6', title:'The Hunt Begins', desc:'Raise a Hunting Cabin.', icon:'🏹', check:()=>hasBuildingType('huntingCabin'), reward:{food:20}},
  {id:'q7', title:'A Growing Hold', desc:'Reach a population of 6.', icon:'👥', check:()=>G.villagers.length>=6, reward:{wood:40,stone:20}},
  {id:'q8', title:'The Storehouse', desc:'Build a Granary.', icon:'🏺', check:()=>hasBuildingType('granary'), reward:{stone:30}},
  {id:'q9', title:'Iron Will', desc:'Survive a wolf raid.', icon:'🐺', check:()=>G.wolfEvents>=1, reward:{wood:25}},
  {id:'q10', title:'Open Roads', desc:'Build a Trading Post.', icon:'⚖️', check:()=>hasBuildingType('tradingPost'), reward:{food:25}},
  {id:'q11', title:'Paved Way', desc:'Build 3 road segments.', icon:'🛤️', check:()=>G.buildings.filter(b=>b.type==='road').length>=3, reward:{stone:20}},
  {id:'q12', title:'Survived the Frost', desc:'Endure one full Winter season.', icon:'❄️', check:()=>G.dayCount>=SEASON_LEN/CYCLE_LEN*4+1, reward:{wood:50,food:30}},
];
function checkQuests(){
  for(const q of QUESTS){
    if(G.questsCompleted[q.id]) continue;
    if(q.check()){
      G.questsCompleted[q.id]=true;
      G.coins += 10; logCoinIn('quests', 10);
      sfx('coin');
      for(const k in q.reward) gainResource(k, q.reward[k]);
      toast('Quest complete: '+q.title+'!');
    }
  }
}
function questsDoneCount(){ return QUESTS.filter(q=>G.questsCompleted[q.id]).length; }

function update(rawDt){
  const dt = Math.min(rawDt, 0.08) * speedMode;
  if(dt<=0) return;
  const prevSeason = seasonIndex();
  const prevCycle = Math.floor(G.worldTime/CYCLE_LEN);
  G.worldTime += dt;
  const newCycle = Math.floor(G.worldTime/CYCLE_LEN);
  if(newCycle>prevCycle){ G.dayCount++; rollWeather(); rollClimate(); rollPlague(); rollDailyBounties(); captureStatSnapshot(); processTradeRoutes();
    if(G.decrees.tithe){ const t = Math.max(1, Math.round(G.villagers.length*0.8)); G.coins += t; logCoinIn('tithe', t); }
    decisionTimer -= 1;
    if(decisionTimer<=0 && G.dayCount>3){ decisionTimer = 3 + Math.floor(Math.random()*3); rollDecision(); }
  }
  const newSeason = seasonIndex();
  if(newSeason !== prevSeason){
    const icons = ['🌱','☀️','🍂','❄️'];
    toast(icons[newSeason]+' '+SEASON_NAMES[newSeason]+' has begun.');
    // Re-seed the wilds: game thins for winter, butterflies come with the warm
    // months, fish return once the river runs again.
    try { spawnWildlife(); } catch(e){}
    chron('season', SEASON_NAMES[newSeason]);
    if(newSeason===3){ toast('🧊 The river freezes solid — anything can cross the ice, and the moat is gone.', true); }
    if(prevSeason===3){ resetFrozenFisherNotice(); toast('💧 The thaw — the river runs (and guards it) again.'); }
    if(newSeason===3) G.journal.wintersEndured++;
    // New-year festival: at the turn into spring, the hold chooses a boon.
    if(newSeason===0 && G.dayCount>2){
      const yr = Math.floor(G.worldTime/(SEASON_LEN*4));
      if(yr>G.lastFestivalYear){ G.lastFestivalYear=yr; openFestivalChoice(); }
    }
  }

  wolfTick(dt);

  updateSunShadows();

  banditTick(dt);

  familyTick(dt);
  relationsTick(dt);
  agingTick(dt);

  // Random events
  eventTimer -= dt;
  if(eventTimer<=0){
    eventTimer = 120 + Math.random()*100;
    rollRandomEvent();
  }
  fireTick(dt);
  plagueTick(dt);
  raiderTick(dt);
  G.districtTimer -= dt;
  if(G.districtTimer<=0){ G.districtTimer = 8; computeDistricts(true); }
  decayTick(dt);

  // Food spoilage — raw food kept beyond what your stores can safely hold
  // slowly spoils. Granaries (and Deep Cellars) raise the safe amount, so
  // stockpiling for winter genuinely depends on storage. (None in Peaceful,
  // where decayMul is 0; worse in Iron Winter.)
  foodSpoilTick(dt);

  // Logistics: processors beside a road that links to the Town Center run
  // 12% faster. Recomputed on a slow timer (BFS over the road network).
  _logisticsTimer -= dt;
  if(_logisticsTimer<=0){ _logisticsTimer = 6; recomputeLogistics(); }

  // Production chains: each processor converts inputs → outputs on its own timer
  for(const b of G.buildings){
    const def = BUILD_DEFS[b.type];
    if(!def || !def.proc) continue;
    if((b.condition!==undefined) && b.condition<35) continue; // worn — halted
    if(b.procTimer===undefined) b.procTimer = def.proc.every;
    b.procTimer -= dt * (b._roadLinked ? 1.12 : 1);
    if(b.procTimer<=0){
      b.procTimer = def.proc.every;
      const canTake = Object.entries(def.proc.in).every(([k,amt])=>(G.stockpile[k]||0)>=amt);
      const outKey = Object.keys(def.proc.out)[0];
      const hasRoom = (G.stockpile[outKey]||0) < capFor(outKey);
      if(canTake && hasRoom){
        for(const [k,amt] of Object.entries(def.proc.in)) G.stockpile[k]-=amt;
        for(const [k,amt] of Object.entries(def.proc.out)) gainResource(k, amt);
        b.procFlash = 1; // brief visual pulse
      }
    }
    if(b.procFlash) b.procFlash = Math.max(0, b.procFlash - dt*1.4);
  }

  // Pastures: a passive food trickle whose herd grows on its own, but must be
  // foddered through winter or it dwindles.
  const winterNow = seasonIndex()===3;
  for(const b of G.buildings){
    if(b.type!=='pasture') continue;
    if((b.condition!==undefined) && b.condition<35) continue; // neglected — halted
    if(b.herd===undefined) b.herd = 2;
    if(b.herdTimer===undefined) b.herdTimer = 12;
    if(b.growTimer===undefined) b.growTimer = 40;
    const CAP = 6;
    b.herdTimer -= dt;
    if(b.herdTimer<=0){
      b.herdTimer = 12;
      if(winterNow){
        const fodder = Math.ceil(b.herd*0.6);
        if((G.stockpile.food||0) >= fodder){
          G.stockpile.food -= fodder;
          gainResource('food', Math.round(b.herd*0.35)); // meagre winter yield
        } else if(b.herd>0){
          b.herd -= 1;
          toast('🐑 With no fodder, a pasture loses an animal to the winter cold.', true);
        }
      } else {
        if(b.herd>0){ gainResource('food', Math.max(1, Math.round(b.herd*0.5))); b.procFlash = 1; }
      }
    }
    // Herd grows in the green seasons if it has room
    if(!winterNow && b.herd < CAP){
      b.growTimer -= dt;
      if(b.growTimer<=0){ b.growTimer = 40; b.herd = Math.min(CAP, b.herd+1); }
    }
    if(b.procFlash) b.procFlash = Math.max(0, b.procFlash - dt*1.4);
  }

  if(activeEvent && G.worldTime >= activeEvent.endsAt){
    if(activeEvent.type==='merchant') toast('🧳 The merchant packs up and moves on.');
    else if(activeEvent.type==='festival') toast('🎉 The festival winds down.');
    activeEvent = null;
  }

  // Research progress
  if(G.activeResearch){
    G.activeResearch.remaining -= dt;
    if(G.activeResearch.remaining<=0){
      const t = TECH_TREE.find(x=>x.id===G.activeResearch.id);
      G.researched[G.activeResearch.id]=true;
      G.activeResearch=null;
      toast('🔬 '+t.ic+' Research complete: '+t.name+'!');
    }
  }

  // Tier + journal upkeep (cheap; run every frame is fine but throttle to ~1s)
  journalTimer -= dt;
  if(journalTimer<=0){
    journalTimer = 1;
    checkTierUp();
    G.journal.peakPopulation = Math.max(G.journal.peakPopulation, G.villagers.length);
    G.journal.daysSurvived = Math.max(G.journal.daysSurvived, G.dayCount);
    G.journal.wolvesSurvived = G.wolfEvents;
    checkBounties();
    checkDeeds();
    recomputeGuilds(true);
    updateOnboard();
    updateStatuses();
  }

  // Forests tire as they're felled: each regrowth yields a little less, and a
  // fully-worked stand eventually goes barren — unless a Forester's Grove
  // replants it. (See foresterTick.)
  for(const t of G.forestTiles){
    if(t.resourceAmount<=0 && G.worldTime>=t.regrowAt){
      if(t.maxResource>0){ t.maxResource = Math.max(0, t.maxResource-1); }
      if(t.maxResource>0) t.resourceAmount = t.maxResource;
    }
  }
  foresterTick(dt);
  for(const t of G.stoneTiles){ if(t.resourceAmount<=0 && G.worldTime>=t.regrowAt){ t.resourceAmount = t.maxResource; } }
  for(const t of G.waterTiles){ if(t.resourceAmount<=0 && G.worldTime>=t.regrowAt){ t.resourceAmount = t.maxResource; } }
  for(const t of G.wildsTiles){ if(t.resourceAmount<=0 && G.worldTime>=t.regrowAt){ t.resourceAmount = t.maxResource; } }

  for(const v of G.villagers.slice()) updateVillager(v, dt); // copy: villagers may leave mid-update
  processStewardOrders(dt);
  updateWildlife(dt);
  updateGroundCover(dt);
  updateWind(dt);
  checkQuests();
  checkScenario();

  // population growth
  spawnTimer -= dt;
  if(spawnTimer<=0){
    spawnTimer = G.decrees.openGates ? 16 : 24; // Open Gates draws newcomers faster
    if(G.stockpile.food>=22 && G.villagers.length<popCapacity()){
      G.stockpile.food -= 22;
      const nv = spawnVillager();
      toast(nv.name+' joins the hold. ['+nv.trait.ic+' '+nv.trait.label+']');
      G.journal.settlersWelcomed++;
    }
  }
}

/* =========================================================================
   RENDER
========================================================================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
/* ── WIRING ─────────────────────────────────────────────────────────────
   Every module that draws or reports gets its dependencies here, in one place.
   This used to be scattered through main.ts, each call sited next to whatever
   const it happened to read, which is how one cut of the terrain code swept
   eleven of them up with it.

   Most renderers now take only `ctx`. Everything else — the camera, the
   viewport, the sprite tables — is an ordinary import, because those are const
   objects with mutable contents rather than bindings a module would have to
   assign to. What is left in these calls is genuinely un-importable: the
   canvas context, and a few callbacks back into main.ts's own UI state. */
initIsoKit(ctx);
initSprites({ ctx });
initFeedback({ sheetContent: ()=>sheetContent, gameModeId: ()=>gameModeId });
initUnlocks({ saveIfRunning: ()=>{ if(started) saveGame(); } });
initFX({ ctx });
initScenery({ ctx, windAt });
initLighting({ ctx, canvas });
initVillagerRender({ ctx, isSelected: (v)=>!!(selection && selection.type==='villager' && selection.ref===v) });
initBuildingRender({ ctx, windAt, drawRoad });
initTerrain({ ctx });

initCritters({ ctx });

/* Weather reports what it did rather than reaching for main.ts's toast and
   chronicle directly — the module stays pure simulation that way, and can be
   reasoned about without a DOM. */
initWeather({ toast, sfx, forceWinter: ()=>!!gameMode.forceWinter });
initSkills({ toast });
initWork({ hasActiveBuilding, reassignRole });
initBuildings({ toast, decayMul: ()=>gameMode.decayMul,
  onRemoved: (b)=>{ if(selection && selection.ref===b) deselectAll(); } });
initProgress({ toast });
initContracts({ toast, bountyCoinMul: ()=>(gameMode.bountyCoinMul||1),
  refreshRoutesSheet: ()=>renderTradeRoutesSheet() });
initRaiders({ toast, raidsEnabled: ()=>gameMode.banditsEnabled!==false,
  decreeRaidMul });
initFire({ toast, hazardsEnabled: ()=>gameMode.banditsEnabled!==false,
  decayMul: ()=>(gameMode.decayMul||1) });
initEconomy({ toast, decayMul: ()=>(gameMode && gameMode.decayMul!==undefined) ? gameMode.decayMul : 1 });
initSteward({ toast, reassignRole, startResearch, demolishBuilding });
initVillagers({ toast, decreeHungerMul, decreeWorkMul,
  eventSpeedBonus, festivalOn: ()=>!!(activeEvent && activeEvent.type==='festival') });
/* Lives needs one thing back: when a settler passes, whatever the UI was
   holding them open for has to let go. */
initLives({ toast, popCapacity, spawnVillager, buildingCenter,
  onPassed: (v)=>{ if(selection && selection.ref===v) deselectAll(); } });

let canvasDPR = 1;
let _resizePending = false;
let _resizing = false;
function resizeCanvas(){
  if(_resizing) return; // reentrancy guard — never let a reflow re-trigger this mid-execution
  const newDPR = Math.min(window.devicePixelRatio||1, 2);
  const newW = window.innerWidth, newH = window.innerHeight;
  // No-op if nothing actually changed — setting canvas.width/height (even to the
  // same value) forces a layout reflow, which in an embedded iframe can trigger
  // another 'resize' event and loop forever. Skipping identical resizes breaks that cycle.
  // The backing store must be compared against its TARGET, not merely be non-zero:
  // view.w/view.h are seeded from innerWidth/innerHeight at parse time, so on a
  // DPR-1 display every term matched on the very first call and the canvas was
  // left at its 300x150 default, stretched by CSS — a blurry, low-res world.
  const targetW = Math.floor(newW*newDPR), targetH = Math.floor(newH*newDPR);
  if(newW===view.w && newH===view.h && newDPR===canvasDPR && canvas.width===targetW && canvas.height===targetH) return;
  _resizing = true;
  try {
    canvasDPR = newDPR;
    // One setter, so every module that reads the viewport sees the new size in
    // the same frame — they import `view` rather than being handed a copy.
    setViewport(newW, newH, newDPR);
    canvas.width = Math.floor(view.w*canvasDPR); canvas.height = Math.floor(view.h*canvasDPR);
    canvas.style.width = view.w+'px'; canvas.style.height = view.h+'px';
    // Do NOT call ctx.setTransform here — render() re-applies it every frame
  } finally {
    _resizing = false;
  }
}
// Measure the right-hand HUD cluster (and the clock/minimap beneath it) and
// reserve exactly that much room for the scrolling resource row. Hard-coded
// values silently broke whenever a HUD button was added — this can't.
function updateHudReserve(){
  try{
    const right = document.getElementById('hud-right');
    if(!right) return;
    const rw = right.getBoundingClientRect().width || 0;
    const mm = document.getElementById('minimap-wrap');
    const mw = (mm && !mm.classList.contains('hidden')) ? (mm.getBoundingClientRect().width||0) : 0;
    // In landscape the minimap sits beside the buttons; in portrait it's below.
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    const reserve = Math.ceil(Math.max(rw, landscape ? Math.max(rw, mw) : rw) + 16);
    document.documentElement.style.setProperty('--hud-reserve', reserve+'px');
    // Publish where the stores actually end, so the clock and minimap can sit
    // below them — the row's height changes when it wraps or is expanded, and
    // fixed offsets used to drive the clock straight through the pills.
    const bar = document.getElementById('hud-top');
    if(bar){
      const pills = bar.querySelectorAll('.pill');
      let bottom = bar.getBoundingClientRect().bottom;
      for(const p of pills){ bottom = Math.max(bottom, p.getBoundingClientRect().bottom); }
      document.documentElement.style.setProperty('--hud-bottom', Math.ceil(bottom)+'px');
    }
  }catch(e){}
}
function requestResize(){
  // Debounce: coalesce rapid-fire resize events (common during iframe/viewport
  // settling) into a single rAF-scheduled call instead of running synchronously
  // inside the event that triggered them.
  if(_resizePending) return;
  _resizePending = true;
  requestAnimationFrame(()=>{ _resizePending=false; resizeCanvas(); updateHudReserve(); });
}
window.addEventListener('resize', requestResize);
window.addEventListener('orientationchange', requestResize);

/* ── DECOR & FX SPRITES ── Kenney farm crops + Tiny Swords bushes/rocks/particles,
   graded and embedded. All optional: every consumer has a procedural fallback. */
// Asset URLs (files, not inlined base64) — bundled locally, cached by the
// service worker, so offline play is unaffected. Procedural fallbacks still
// cover a failed or slow load.

function drawGhost(){
  if(!buildMode.active) return;
  const wp = screenToWorldPixel(view.w/2, view.h/2);
  const g = inProject(wp.x, wp.y);
  const gx = Math.round(g.gx), gy = Math.round(g.gy);
  buildMode.ghostGX = gx; buildMode.ghostGY = gy;
  const valid = isValidBuildSpot(gx,gy);
  const p = project(gx,gy);

  // Main ghost tile
  const pulse=0.6+Math.sin(G.worldTime*4)*0.25;
  ctx.fillStyle = valid
    ? `rgba(120,200,120,${pulse*0.38})`
    : `rgba(220,80,60,${pulse*0.40})`;
  tileDiamond(p.x,p.y,TILE_W,TILE_H); ctx.fill();

  // Outer stroke — double line for clarity
  ctx.lineWidth = 2.5/camera.scale;
  ctx.strokeStyle = valid? `rgba(160,240,160,${pulse*0.95})` : `rgba(240,120,100,${pulse*0.95})`;
  tileDiamond(p.x,p.y,TILE_W,TILE_H); ctx.stroke();
  ctx.lineWidth = 1/camera.scale;
  ctx.strokeStyle = valid? 'rgba(80,160,80,0.4)' : 'rgba(160,60,40,0.4)';
  tileDiamond(p.x,p.y,TILE_W+4,TILE_H+2); ctx.stroke();

  // Corner tick marks
  const tick=5/camera.scale;
  const corners=[[0,-TILE_H/2],[TILE_W/2,0],[0,TILE_H/2],[-TILE_W/2,0]];
  ctx.strokeStyle = valid? 'rgba(120,230,120,0.9)' : 'rgba(240,100,80,0.9)';
  ctx.lineWidth=2/camera.scale;
  for(const [ox,oy] of corners){
    const ang=Math.atan2(oy,ox);
    ctx.beginPath();
    ctx.moveTo(p.x+ox, p.y+oy);
    ctx.lineTo(p.x+ox-Math.cos(ang)*tick, p.y+oy-Math.sin(ang)*tick);
    ctx.stroke();
  }
}

// Resource buildings must be raised beside the terrain they work — a fishing
// hut on the riverbank, a forestry camp at the treeline, a mining post by a
// stone outcrop, a hunting cabin along the wilds. Maps a build key to a test
// run over the 8 neighboring tiles, plus the label shown when none is found.
// Returns null if the spot is valid, else a short reason for the toast.
function buildSpotReason(gx,gy){
  const t = tileAt(gx,gy);
  if(!t) return 'Off the map.';
  if(buildMode.key==='bridge'){
    return (t.type==='water' && !t.building) ? null : 'Bridges span the river — place one on water.';
  }
  if(t.type==='water') return 'Cannot build on water.';
  if(t.type!=='grass' && t.type!=='dirt') return 'Clear ground only — not on '+t.type+'.';
  if(t.building) return 'That tile is already occupied.';
  if(buildMode.movingBuilding && buildMode.movingBuilding.gx===gx && buildMode.movingBuilding.gy===gy) return 'Already here.';
  const adj = BUILD_NEEDS_ADJ[buildMode.key];
  if(adj){
    let ok=false;
    for(let dy=-1;dy<=1&&!ok;dy++) for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue;
      const nt = tileAt(gx+dx,gy+dy);
      if(nt && adj.test(nt)){ ok=true; break; }
    }
    if(!ok) return BUILD_DEFS[buildMode.key].name+' must be raised '+adj.need+'.';
  }
  return null;
}
function isValidBuildSpot(gx,gy){ return buildSpotReason(gx,gy)===null; }

/* ── THE VOID BEYOND ── the hold used to sit on flat black, which read as an
   unfinished cut-out. A cold, deep expanse (think far water under night sky)
   gives the island somewhere to be. Cached per canvas size + time of day;
   rebuilding a gradient every frame is one of this project's known cost traps. */
let _voidGrad = null, _voidKey = '';
function voidBackdrop(){
  const dark = (typeof darknessFactor==='function') ? darknessFactor() : 0;
  const band = Math.round(dark*4); // quantised so we rebuild rarely, not per frame
  const key = view.w+'x'+view.h+':'+band;
  if(_voidGrad && _voidKey===key) return _voidGrad;
  const t = band/4;
  // Day: slate-teal deep water. Night: near-black with a cold blue cast.
  const mix = (a,b)=> a.map((v,i)=> Math.round(v + (b[i]-v)*t));
  const inner = mix([34,54,64],[12,18,30]);
  const outer = mix([13,21,28],[5,8,14]);
  const g = ctx.createRadialGradient(view.w/2, view.h*0.46, Math.min(view.w,view.h)*0.12,
                                     view.w/2, view.h*0.46, Math.max(view.w,view.h)*0.78);
  g.addColorStop(0, `rgb(${inner[0]},${inner[1]},${inner[2]})`);
  g.addColorStop(1, `rgb(${outer[0]},${outer[1]},${outer[2]})`);
  _voidGrad = g; _voidKey = key;
  return g;
}
/* The sea the hold sits in. Drawn in world space, so it pans and zooms with the
   land — a backdrop pinned to the screen reads as a painted wall behind a
   floating slab, which is exactly what the black void looked like. Nested flat
   diamonds: deep water fading outward to the backdrop, and a bright rim of
   shallows hugging the shore. No gradients, nine fills. */
function drawSea(){
  const c = [ project(0,0), project(G.MAP_SIZE,0), project(G.MAP_SIZE,G.MAP_SIZE), project(0,G.MAP_SIZE) ];
  const cx = (c[0].x + c[2].x)/2, cy = (c[0].y + c[2].y)/2;
  const dia = (grow)=>{
    ctx.beginPath();
    for(let k=0;k<4;k++){
      const x = cx + (c[k].x-cx)*grow, y = cy + (c[k].y-cy)*grow;
      k ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    }
    ctx.closePath();
  };
  ctx.save();
  // Open water, densest near the shore so the far distance stays dark.
  const deep = [[3.6,0.06],[2.7,0.12],[2.1,0.20],[1.7,0.30],[1.42,0.42],[1.22,0.56],[1.09,0.70]];
  for(const [grow,a] of deep){ ctx.fillStyle = 'rgba(31,54,66,'+a+')'; dia(grow); ctx.fill(); }
  // Shallows: the giveaway that land meets water rather than simply stopping.
  // The rim breathes with the swell — one sine, no extra fills.
  const swell = 0.5 + Math.sin(windPhase*0.7)*0.5;
  ctx.fillStyle = 'rgba(58,98,112,'+(0.48 + swell*0.12).toFixed(3)+')'; dia(1.040 + swell*0.010); ctx.fill();
  ctx.fillStyle = 'rgba(92,138,150,'+(0.36 + swell*0.10).toFixed(3)+')'; dia(1.014 + swell*0.006); ctx.fill();
  ctx.restore();
}
/* A soft skirt of haze hugging the map's edge. The land ends on a hard
   geometric line, which is the thing that actually read as unfinished; fading
   the dark outward from that line settles the hold into the distance instead of
   cutting it out. Flat translucent fills, no per-frame gradient. */
function drawIslandSkirt(){
  const c = [ project(0,0), project(G.MAP_SIZE,0), project(G.MAP_SIZE,G.MAP_SIZE), project(0,G.MAP_SIZE) ];
  const cx = (c[0].x + c[2].x)/2, cy = (c[0].y + c[2].y)/2;
  ctx.save();
  for(let i=6;i>=1;i--){
    const grow = 1 + i*0.055;
    ctx.fillStyle = 'rgba(6,10,16,'+(0.10 - i*0.013).toFixed(3)+')';
    ctx.beginPath();
    for(let k=0;k<4;k++){
      const x = cx + (c[k].x-cx)*grow, y = cy + (c[k].y-cy)*grow;
      k ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function render(){
  // Always re-apply DPR scale cleanly — never rely on ctx.getTransform() across frames
  const dpr = canvasDPR;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, view.w, view.h);
  // The world beyond the hold. Flat black made the map read as an island cut out
  // of nothing; a deep, cold expanse gives it somewhere to sit. Cached and only
  // rebuilt on resize — allocating a gradient every frame is expensive.
  ctx.fillStyle = voidBackdrop();
  ctx.fillRect(0, 0, view.w, view.h);
  setKitTime(G.worldTime);   // one clock push per frame, not one per sprite

  if(!G.grid.length) return; // map not yet generated

  ctx.save();
  ctx.translate(view.w/2+camera.panX, view.h/2+camera.panY);
  ctx.scale(camera.scale, camera.scale);

  try { drawSea(); } catch(e){ /* guard */ }
  try { drawIslandSkirt(); } catch(e){ /* guard */ }

  const range = visibleTileRange();
  try { drawTerrain(range); } catch(e){ /* guard */ }

  // selected tile / building highlights
  if(selection.type==='tile' && selection.ref){
    const p = project(selection.ref.gx, selection.ref.gy);
    ctx.strokeStyle='rgba(231,162,61,0.9)'; ctx.lineWidth=2.4/camera.scale;
    tileDiamond(p.x,p.y,TILE_W,TILE_H); ctx.stroke();
  }
  if(selection.type==='building' && selection.ref){
    const c = buildingCenter(selection.ref);
    const p = project(c.gx,c.gy);
    ctx.strokeStyle='rgba(231,162,61,0.85)'; ctx.lineWidth=2.4/camera.scale;
    tileDiamond(p.x,p.y+TILE_H*0.5, TILE_W*(selection.ref.w*0.95), TILE_H*(selection.ref.h*0.95)); ctx.stroke();
  }

  // depth-sorted entity list
  const list = [];
  for(let gy=range.y0; gy<=range.y1; gy++){
    for(let gx=range.x0; gx<=range.x1; gx++){
      const t = G.grid[gy] && G.grid[gy][gx];
      if(!t) continue;
      if(t.type==='forest' && t.resourceAmount>0){ list.push({depth:gx+gy+0.1, draw:()=>{ try{drawTree(gx,gy);}catch(e){} }}); }
      else if(t.type==='stone' && t.resourceAmount>0){ list.push({depth:gx+gy+0.1, draw:()=>{ try{drawRock(gx,gy);}catch(e){} }}); }
      else if(t.type==='water' && !t.building && !riverFrozen() && t.resourceAmount>0 && hash2(gx*5.1,gy*4.2)>0.62){ list.push({depth:gx+gy+0.1, draw:()=>{ try{drawFishSpot(gx,gy);}catch(e){} }}); }   // thinned: on 60% of tiles the open water read as wallpaper
      else if(t.wilds && t.resourceAmount>0 && hash2(gx*4.4,gy*5.6)>0.45){ list.push({depth:gx+gy+0.1, draw:()=>{ try{drawAnimal(gx,gy);}catch(e){} }}); }
    }
  }
  for(const b of G.buildings){
    const c = buildingCenter(b);
    // Roads render just above terrain but below everything else
    const depth = b.type==='road' ? c.gx+c.gy-0.1 : c.gx+c.gy+0.2;
    list.push({depth, draw:()=>{ try{ drawBuilding(b); if(b.type!=='road') drawWorkerBadge(b); if(b._fire) drawBuildingFire(b); }catch(e){} }});
  }
  for(const v of G.villagers){
    list.push({depth:v.gx+v.gy+0.3, draw:()=>{ try{ drawVillager(v); }catch(e){} }});
  }
  for(const r of G.raiders){
    list.push({depth:r.gx+r.gy+0.35, draw:()=>{ try{ drawRaider(r); }catch(e){} }});
  }
  for(const cr of G.critters){
    const drawer = { deer:drawDeer, boar:drawBoar, rabbit:drawRabbit, fish:drawFish, fox:drawFox, duck:drawDuck }[cr.kind];
    if(drawer) list.push({depth:cr.gx+cr.gy+0.28, draw:()=>{ try{ drawer(cr); }catch(e){} }});
  }
  for(const m of G.memorials){
    list.push({depth:m.gx+m.gy+0.05, draw:()=>{ try{ drawMemorial(m); }catch(e){} }});
  }
  // Visiting merchant: their cart stands by the Town Center while the event runs
  if(activeEvent && activeEvent.type==='merchant'){
    const mgx = G.TC_X-1.6, mgy = G.TC_Y+2.6;
    list.push({depth:mgx+mgy+0.2, draw:()=>{ try{ drawMerchantCart(mgx,mgy); }catch(e){} }});
  }
  list.sort((a,b)=>a.depth-b.depth);
  for(const item of list) item.draw();

  // Birds fly above the whole scene.
  // Birds and butterflies fly above the scene rather than sorting into it.
  for(const cr of G.critters){
    if(cr.kind==='bird'){ try{ drawBird(cr); }catch(e){} }
    else if(cr.kind==='flit'){ try{ drawFlit(cr); }catch(e){} }
  }

  try { renderDustFX(1/60); } catch(e){}
  try { renderBoomFX(1/60); } catch(e){}
  try { drawGhost(); } catch(e){}

  ctx.restore();
  try { drawDistrictLabels(); } catch(e){}
  try { renderLighting(); } catch(e){}
  try { renderWeather(); } catch(e){}
  if(ADMIN.debug){ try { drawDebugOverlay(); } catch(e){} }
  try { renderClouds(); } catch(e){}
  try { renderFlyFX(1/60); } catch(e){}
  try { renderVignette(); } catch(e){}
}
/* ── DEBUG OVERLAY ── admin-only stats panel (top-left, screen space). */
let _dbgLast = 0, _dbgFps = 0;
function drawDebugOverlay(){
  const now = performance.now();
  if(_dbgLast){ const inst = 1000/Math.max(1, now-_dbgLast); _dbgFps += (inst-_dbgFps)*0.1; }
  _dbgLast = now;
  ctx.save();
  ctx.setTransform(canvasDPR,0,0,canvasDPR,0,0);
  const idle = G.villagers.filter(v=>v.role==='idle').length;
  const phase = (G.worldTime % CYCLE_LEN) < DAY_LEN ? 'Day' : 'Night';
  const lines = [
    'FPS '+_dbgFps.toFixed(0)+'  speed '+speedMode+'x',
    'Day '+G.dayCount+'  '+seasonName()+'  '+phase,
    'Weather '+getWeather().label+(G.climate?'  Climate '+(G.climate.name||G.climate.ic):''),
    'Settlers '+G.villagers.length+' ('+idle+' idle)  Buildings '+G.buildings.filter(b=>b.type!=='road').length,
    'Raiders '+G.raiders.length+'  Fires '+G.buildings.filter(b=>b._fire>0).length,
    'Coins '+Math.floor(G.coins)+'  Tier '+HOLD_TIERS[getTier()].name,
    'Toggles: '+(ADMIN.freezeNeeds?'FreezeNeeds ':'')+(ADMIN.noRaids?'NoRaids ':'')||'Toggles: none',
  ];
  ctx.font = '11px monospace'; ctx.textAlign='left'; ctx.textBaseline='top';
  const w = 210, h = lines.length*15 + 10, x = 8, y = 54;
  ctx.fillStyle='rgba(10,12,18,0.78)'; roundRect(x,y,w,h,6); ctx.fill();
  ctx.strokeStyle='rgba(120,200,120,0.5)'; ctx.lineWidth=1; roundRect(x,y,w,h,6); ctx.stroke();
  ctx.fillStyle='#9fe08a';
  lines.forEach((l,i)=> ctx.fillText(l, x+8, y+6+i*15));
  ctx.restore();
}
const daytintEl = document.getElementById('daytint');
const phaseLabelEl = document.getElementById('phase-label');
const clockDayEl = document.querySelector('#clock');
function updateDayTint(){
  const f = dayPhaseFrac();
  let color, label;
  if(f < DAY_LEN/CYCLE_LEN){
    const df = f/(DAY_LEN/CYCLE_LEN);
    if(df<0.12){ color='rgba(120,90,150,0.30)'; label='Dawn'; }
    else if(df<0.8){ color='rgba(255,255,255,0)'; label='Day'; }
    else { color='rgba(200,110,60,0.18)'; label='Dusk'; }
  } else {
    color='rgba(10,16,40,0.18)'; label='Night';
  }
  daytintEl.style.backgroundColor = color;
  phaseLabelEl.textContent = label;
  clockDayEl.childNodes[0].nodeValue = (G.holdName && G.holdName!=='Oakenfall' ? G.holdName+' · ' : '')+(gameModeId!=='settler' ? GAME_MODES[gameModeId].name+' · ' : '')+HOLD_TIERS[getTier()].ic+' '+HOLD_TIERS[getTier()].name+' · Day '+G.dayCount+' · '+seasonName()+' '+getWeather().ic+(G.climate?' '+G.climate.ic:'')+' · ';
  const qd = questsDoneCount();
  document.getElementById('quest-dot').classList.toggle('hidden', qd>=lastSeenQuestCount);
}

let lastSeenQuestCount = 0;

function renderQuestSheet(){
  lastSeenQuestCount = questsDoneCount();
  document.getElementById('quest-dot').classList.add('hidden');
  sheetContent.innerHTML = `
    <div class="sheet-sub">${questsDoneCount()}/${QUESTS.length} complete</div>
    <div class="row" style="margin:6px 0 4px;flex-wrap:wrap;gap:6px;">
      <div class="pill" style="pointer-events:none;">${HOLD_TIERS[getTier()].ic} ${HOLD_TIERS[getTier()].name}</div>
      ${getTier() < HOLD_TIERS.length-1 ? `<div class="sheet-sub" style="align-self:center;">Next: ${HOLD_TIERS[getTier()+1].name} at ${HOLD_TIERS[getTier()+1].pop} settlers &amp; ${HOLD_TIERS[getTier()+1].bld} buildings</div>` : `<div class="sheet-sub" style="align-self:center;">Highest tier reached!</div>`}
    </div>
    ${G.dailyBounties.length ? `<div class="sheet-sub" style="margin:6px 0 2px;"><b>📯 Today's Bounties</b></div>`+G.dailyBounties.map(bb=>`<div class="sheet-sub">${bb.done?'✅':'▫️'} ${bb.ic} ${bb.desc} — <b>${(G.dailyProgress[bb.key]||0) >= bb.n ? bb.n : Math.min(bb.n, Math.floor(G.dailyProgress[bb.key]||0))}/${bb.n}</b> · 💰${bb.reward}</div>`).join('') : ''}
    <div class="row" style="margin:4px 0 6px;gap:6px;">
      <button class="action-btn" id="decrees-btn" style="flex:1;">⚖️ Decrees${Object.values(G.decrees).some(Boolean)?' ('+Object.values(G.decrees).filter(Boolean).length+')':''}</button>
      <button class="action-btn" data-fb="bug" style="flex:1;">🐛 Report Bug</button>
      <button class="action-btn" data-fb="idea" style="flex:1;">💡 Suggest</button>
    </div>
    <div class="row" style="flex-direction:column;gap:6px;">
      ${QUESTS.map(q=>{
        const done = !!G.questsCompleted[q.id];
        const rewardStr = Object.entries(q.reward).map(([k,v])=>`+${v} ${k}`).join(', ');
        return `<div class="action-btn" style="text-align:left;display:flex;align-items:center;gap:10px;${done?'opacity:0.6;':''}">
          <span style="font-size:20px;">${done?'✅':q.icon}</span>
          <div style="flex:1;">
            <div style="font-family:'Cinzel',serif;font-size:13.5px;color:${done?'var(--parchment-dim)':'var(--amber)'}">${q.title}</div>
            <div style="font-size:12.5px;color:var(--parchment-dim);">${q.desc} — Reward: ${rewardStr}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
  sheetContent.querySelectorAll('[data-fb]').forEach(btn=>btn.addEventListener('click', ()=>{
    const kind = btn.dataset.fb==='bug' ? 'bug' : 'idea';
    sheetNav.push({ id:'feedback', title: kind==='bug'?'🐛 Report a Bug':'💡 Suggest a Feature', render:()=>renderFeedbackSheet(kind) });
  }));
  const db = document.getElementById('decrees-btn');
  if(db) db.addEventListener('click', ()=>{ sheetNav.push({ id:'decrees', title:'⚖️ Decrees', render:()=>renderDecreesSheet() }); });
}
function renderDecreesSheet(){
  sheetContent.innerHTML = `
    <div class="sheet-sub">Lasting laws for the hold. Each is a trade-off — enact what suits your reign, and change your mind whenever you like.</div>
    <div class="roster-list" style="margin-top:8px;">
      ${DECREE_DEFS.map(d=>{
        const on = !!G.decrees[d.id];
        return `<button class="action-btn list-row${on?'':' dim'}" data-decree="${d.id}" style="align-items:flex-start;">
          <span style="font-size:20px;">${d.ic}</span>
          <span style="flex:1;"><b>${d.name}</b> <span style="color:${on?'#8fc46a':'var(--parchment-dim)'};font-size:11.5px;">${on?'● Enacted':'○ Off'}</span><br>
          <span style="font-size:11.5px;opacity:.85;">${d.on}</span><br>
          <span style="font-size:11px;color:#8fc46a;">▲ ${d.good}</span> &nbsp; <span style="font-size:11px;color:#e8b2a4;">▼ ${d.bad}</span></span>
        </button>`;
      }).join('')}
    </div>`;
  sheetContent.querySelectorAll('[data-decree]').forEach(btn=>btn.addEventListener('click', ()=>{
    const id = btn.dataset.decree;
    G.decrees[id] = !G.decrees[id];
    const d = DECREE_DEFS.find(x=>x.id===id);
    toast(d.ic+' '+d.name+(G.decrees[id]?' enacted.':' repealed.'));
    if(typeof sfx==='function') sfx('tap');
    renderDecreesSheet();
  }));
}
document.getElementById('quest-btn').addEventListener('click', ()=>{
  exitBuildModeIfActive(); selection={type:null,ref:null};
  renderHubSheet('goals');
});
// Resource row expand/collapse. Collapsed it is a compact scrolling row; expanded
// it wraps so every store is visible at once — a scroll alone is too easy to miss
// on a phone. The choice is remembered.
(function(){
  const bar = document.getElementById('hud-top');
  const btn = document.getElementById('hud-more');
  if(!bar || !btn) return;
  const apply = (on)=>{
    bar.classList.toggle('expanded', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Collapse stores' : 'Show all stores');
    if(typeof updateHudReserve==='function') updateHudReserve();
  };
  let saved = false;
  try{ saved = localStorage.getItem('oak-hud-expanded')==='1'; }catch(e){}
  apply(saved);
  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const on = !bar.classList.contains('expanded');
    apply(on);
    try{ localStorage.setItem('oak-hud-expanded', on?'1':'0'); }catch(e){}
  });
})();

document.getElementById('steward-btn').addEventListener('click', ()=>{
  exitBuildModeIfActive(); selection={type:null,ref:null};
  sheetNav.replace({ id:'steward', title:'🗣️ Give an Order', render:renderStewardSheet });
});
function renderStewardSheet(){
  const examples = ['build 3 houses','we need more wood','put 2 to mining',
    'build a farm and a well','mend the hold','how much stone','help'];
  sheetContent.innerHTML = `
    <div class="sheet-sub">Speak your will to the hold. Type a plain order — several in one breath if you like ("build 2 farms and put 3 to farming") — and your folk will see it done, gathering what they lack first.</div>
    <input id="steward-input" class="redeem-input" type="text" autocomplete="off" spellcheck="false" placeholder="e.g. build 3 houses" aria-label="Command">
    <button class="action-btn primary" id="steward-go" style="margin-top:6px;">🗣️ Give the order</button>
    <div id="steward-msg" class="sheet-sub" style="margin-top:6px;min-height:1.2em;"></div>
    <div class="sheet-sub" style="margin-top:8px;"><b>Try saying</b></div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px;">
      ${examples.map(e=>`<button class="action-btn" data-ex="${e}" style="flex:0 0 auto;font-size:12px;padding:6px 9px;">${e}</button>`).join('')}
    </div>
    <div class="sheet-sub" style="margin-top:10px;"><b>Standing orders</b></div>
    <div class="roster-list" id="steward-orders">
      ${stewardOrders.length ? stewardOrders.map((o,i)=>`<div class="inbox-row"><span class="ib-msg">${stewardOrderLine(o)}${o.stall>4?' <span style="opacity:.6">· waiting</span>':''}</span><button class="action-btn" data-cancel="${i}" style="flex:0 0 auto;font-size:12px;padding:4px 9px;min-height:32px;" aria-label="Cancel this order">✕</button></div>`).join('') : '<div class="sheet-sub" style="opacity:.7;">None — the hold awaits your word.</div>'}
    </div>
    ${stewardOrders.length>1 ? `<button class="action-btn" id="steward-clear" style="margin-top:6px;">⛔ Cancel all orders</button>` : ''}`;
  const input = document.getElementById('steward-input');
  const msg = document.getElementById('steward-msg');
  const say = (r)=>{
    // Re-rendering wipes the message box, so write it back after the redraw.
    const m = document.getElementById('steward-msg');
    if(!m) return;
    m.style.color = r.ok ? '#8fc46a' : '#e8b2a4';
    m.textContent = r.msg;
  };
  const submit = ()=>{
    const r = stewardCommand(input.value);
    say(r);
    if(r.ok){
      input.value='';
      if(typeof sfx==='function') sfx('tap');
      if(!r.answered){ renderStewardSheet(); say(r); }
    }
  };
  document.getElementById('steward-go').addEventListener('click', submit);
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submit(); });
  sheetContent.querySelectorAll('[data-ex]').forEach(b=>b.addEventListener('click', ()=>{ input.value=b.dataset.ex; submit(); }));
  sheetContent.querySelectorAll('[data-cancel]').forEach(b=>b.addEventListener('click', ()=>{
    stewardOrders.splice(parseInt(b.dataset.cancel,10), 1);
    renderStewardSheet();
  }));
  const clr = document.getElementById('steward-clear');
  if(clr) clr.addEventListener('click', ()=>{ clearStewardOrders(); renderStewardSheet(); });
  setTimeout(()=>{ try{ input.focus(); }catch(e){} }, 30);
}
document.getElementById('save-btn').addEventListener('click', ()=>{ saveGame(); });

// Screen wake lock: a sim you watch shouldn't dim mid-session. Progressive —
// silently does nothing where unsupported (or in low-power mode).
let _wakeLock = null;
async function requestWakeLock(){
  try{
    if('wakeLock' in navigator && document.visibilityState==='visible'){
      _wakeLock = await navigator.wakeLock.request('screen');
    }
  }catch(e){ /* denied (low power mode etc.) — fine */ }
}
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible') requestWakeLock();
});
document.addEventListener('pointerdown', function once(){
  document.removeEventListener('pointerdown', once);
  requestWakeLock();
});

// ⚙ overflow menu: save/sound/fullscreen live in a dropdown to free HUD width
const moreBtn = document.getElementById('more-btn');
const moreMenu = document.getElementById('more-menu');
moreBtn.addEventListener('click', ()=>{ moreMenu.classList.toggle('hidden'); });
document.addEventListener('pointerdown', (e)=>{
  if(!moreMenu.classList.contains('hidden') && !document.getElementById('hud-right').contains(e.target)){
    moreMenu.classList.add('hidden');
  }
});

// Universal "tap outside closes the open menu" — any pointerdown that isn't on
// the sheet itself, the game canvas (which has its own tap/drag handling), or
// the minimap closes whatever sheet is open. HUD buttons that open a menu run
// their own handler right after, so tapping one cleanly swaps menus instead of
// stacking. This means you never have to hunt for a close button.
document.addEventListener('pointerdown', (e)=>{
  if(!sheetWrap.classList.contains('open')) return;
  if(sheetWrap.contains(e.target)) return;              // interacting with the sheet
  if(e.target.closest && e.target.closest('#game')) return;      // canvas taps → handleTap
  if(e.target.closest && e.target.closest('#minimap-wrap')) return;
  if(buildMode.active) return;                          // placing a building — leave it
  deselectAll();
}, true);

// Photo mode: hide the UI for a frame, capture the canvas, share/save it
document.getElementById('photo-btn').addEventListener('click', async ()=>{
  moreMenu.classList.add('hidden');
  document.body.classList.add('photo-hide');
  await new Promise(r=>setTimeout(r, 150)); // let a clean frame render
  try{
    const url = canvas.toDataURL('image/png');
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'oakenfall.png', { type:'image/png' });
    if(navigator.canShare && navigator.canShare({ files:[file] })){
      await navigator.share({ files:[file] });
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = 'oakenfall.png'; a.click();
    }
    toast('📷 A portrait of the hold.');
  }catch(e){ if(e && e.name!=='AbortError') toast('📷 Could not capture — try again.', true); }
  document.body.classList.remove('photo-hide');
});

// ── Shareable hold card — a chronicle card PNG to share (1200×630, OG-sized) ──
async function exportHoldCard(){
  try{
    const W=1200, H=630, cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const x=cv.getContext('2d');
    // background
    const g=x.createLinearGradient(0,0,0,H); g.addColorStop(0,'#241d12'); g.addColorStop(0.5,'#1a140c'); g.addColorStop(1,'#120d07');
    x.fillStyle=g; x.fillRect(0,0,W,H);
    // vignette + border
    x.strokeStyle='#5a4a2c'; x.lineWidth=3; x.strokeRect(24,24,W-48,H-48);
    x.strokeStyle='rgba(232,161,60,0.25)'; x.lineWidth=1; x.strokeRect(32,32,W-64,H-64);
    const crest = bannerColor();
    // crest diamond
    const ccx=W/2, ccy=150;
    x.fillStyle=crest; x.beginPath(); x.moveTo(ccx,ccy-46); x.lineTo(ccx+40,ccy); x.lineTo(ccx,ccy+46); x.lineTo(ccx-40,ccy); x.closePath(); x.fill();
    x.strokeStyle='#0c0803'; x.lineWidth=3; x.stroke();
    x.fillStyle='rgba(255,240,210,0.9)'; x.font="700 34px 'Cinzel', Georgia, serif"; x.textAlign='center';
    x.fillText((G.holdName||'O').charAt(0).toUpperCase(), ccx, ccy+12);
    // kicker + title
    x.fillStyle='#b3a681'; x.font="600 22px 'Cinzel', Georgia, serif"; x.fillText('⚜  THE CHRONICLE OF  ⚜', ccx, 250);
    x.fillStyle='#f0e2c0'; x.font="700 72px 'Cinzel', Georgia, serif";
    x.fillText((G.holdName||'Oakenfall').slice(0,22), ccx, 330);
    const tier=(HOLD_TIERS[getTier()]||{ic:'🏕️',name:'Hold'});
    x.fillStyle='#e8a13c'; x.font="500 30px 'Cinzel', Georgia, serif"; x.fillText(tier.ic+' '+tier.name, ccx, 378);
    // stats row
    const stats=[['Day', G.dayCount], ['Settlers', G.villagers.length], ['Winters', G.journal.wintersEndured||0], ['Deeds', Object.keys(G.deeds).length+'/'+DEED_DEFS.length]];
    const bw=W/stats.length;
    stats.forEach((s,i)=>{ const sx=bw*i+bw/2;
      x.fillStyle='#f0e2c0'; x.font="700 46px 'Cinzel', Georgia, serif"; x.fillText(String(s[1]), sx, 480);
      x.fillStyle='#b3a681'; x.font="500 20px 'Cinzel', Georgia, serif"; x.fillText(String(s[0]).toUpperCase(), sx, 512);
    });
    // footer line
    x.fillStyle='#8a7c5c'; x.font="italic 22px Georgia, serif";
    x.fillText('A settlement raised in a single file · oakenfall.netlify.app', ccx, 578);
    // share / save
    const url=cv.toDataURL('image/png');
    const blob=await (await fetch(url)).blob();
    const file=new File([blob], 'oakenfall-'+(G.holdName||'hold').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.png', {type:'image/png'});
    if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], title:G.holdName||'Oakenfall'}); }
    else { const a=document.createElement('a'); a.href=url; a.download=file.name; a.click(); }
    toast('🪪 Your hold card, ready to share.');
  }catch(e){ if(e && e.name!=='AbortError') toast('🪪 Could not make the card — try again.', true); }
}

// Minimap enlarge toggle
document.getElementById('mm-zoom').addEventListener('click', (e)=>{
  e.stopPropagation();
  document.getElementById('minimap-wrap').classList.toggle('mm-big');
});

/* =========================================================================
   HUD UPDATE
========================================================================= */
const elWood=document.getElementById('res-wood'), elStone=document.getElementById('res-stone'),
      elFood=document.getElementById('res-food'), elPop=document.getElementById('res-pop'),
      elCap=document.getElementById('res-cap');
function updateHud(){
  elWood.textContent = fmt(G.stockpile.wood);
  elStone.textContent = fmt(G.stockpile.stone);
  elFood.textContent = fmt(G.stockpile.food);
  document.getElementById('cap-wood').textContent = '/'+capFor('wood');
  document.getElementById('cap-stone').textContent = '/'+capFor('stone');
  document.getElementById('cap-food').textContent = '/'+capFor('food');
  if(!window._hudRefs){
    window._hudRefs = {
      planks: document.getElementById('res-planks'), capPlanks: document.getElementById('cap-planks'),
      bread: document.getElementById('res-bread'),  capBread: document.getElementById('cap-bread'),
      flour: document.getElementById('res-flour'),  capFlour: document.getElementById('cap-flour'),
      coins: document.getElementById('res-coins'),  badge: document.getElementById('idle-badge'),
    };
  }
  const R = window._hudRefs;
  R.planks.textContent = fmt(G.stockpile.planks||0);
  R.capPlanks.textContent = '/'+capFor('planks');
  if(R.flour){ R.flour.textContent = fmt(G.stockpile.flour||0); R.capFlour.textContent = '/'+capFor('flour'); }
  R.bread.textContent = fmt(G.stockpile.bread||0);
  R.capBread.textContent = '/'+capFor('bread');
  R.coins.textContent = fmt(G.coins);
  elPop.textContent = G.villagers.length;
  elCap.textContent = '/'+popCapacity();
  // Attention badge: idle villagers who could be working
  const idleCount = G.villagers.filter(v=>v.role==='idle' && v.state!=='spawning').length;
  const badge = R.badge;
  if(badge){
    if(idleCount>0){ badge.style.display='block'; badge.textContent = idleCount; }
    else badge.style.display='none';
  }
  updateDayTint();
}

/* =========================================================================
   TOASTS
========================================================================= */
const toastContainer = document.getElementById('toast-container');
const eventLog = []; // recent toasts, re-readable from the Journal → Events inbox
// Sort a toast into an inbox category from its content (keeps toast() callers
// unchanged — no need to tag ~100 call sites by hand).
function eventCategory(msg){
  if(/🏴|🐺|bandit|raid|wolves|wolf/i.test(msg)) return 'raid';
  if(/🔥|🪣|💧|fire|ablaze|blaze|burned|burns/i.test(msg)) return 'build';
  if(/🔨|🏗|raise|disrepair|repair|building|bridge|granary|tower|palisade|manor|house|tavern|bakery/i.test(msg)) return 'build';
  if(/joins|left|lost heart|has fallen ill|wed|married|born|of age|passed|grieic|💔|💞|👶|🕯|settler|villager|elder/i.test(msg)) return 'folk';
  return 'general';
}
function toast(msg, warn){
  eventLog.push({ msg, warn:!!warn, day:G.dayCount, cat:eventCategory(msg) });
  if(eventLog.length>40) eventLog.shift();
  if(warn && typeof sfx==="function") sfx("warn");
  const el = document.createElement('div');
  el.className = 'toast'+(warn?' warn':'');
  el.textContent = msg;
  toastContainer.appendChild(el);
  // Keep the stack short and compact — drop the oldest beyond 3.
  while(toastContainer.children.length > 3) toastContainer.removeChild(toastContainer.firstChild);
  requestAnimationFrame(()=>el.classList.add('show'));
  let dismissed = false;
  const dismiss = ()=>{ if(dismissed) return; dismissed = true; el.classList.remove('show'); setTimeout(()=>el.remove(),300); };
  // Tap/click to dismiss immediately; otherwise auto-clear well within 3s.
  el.style.cursor = 'pointer';
  el.addEventListener('click', dismiss);
  setTimeout(dismiss, 2200);
}

/* =========================================================================
   SELECTION / SHEET UI
========================================================================= */
const sheetWrap = document.getElementById('sheet-wrap');
const sheetContent = document.getElementById('sheet-content');
const buildFab = document.getElementById('build-fab');
const crosshair = document.getElementById('crosshair');

function openSheet(){ sheetWrap.classList.add('open'); sfx('open'); }
function closeSheet(){
  sheetWrap.classList.remove('open');
  document.body.classList.remove('sheet-open');
  document.getElementById('bottom-sheet').classList.remove('expanded');
  sheetNav.reset();
  sfx('close');
}

/* ── Sheet navigation: a tiny stack over the existing renderers ──
   A view = {id, title?, render}. Views with a title get a header row with a
   back chevron (shown at depth ≥ 2). Map-selection views pass no title.
   Rule: the stack owns sheet visibility; selection owns map state;
   deselectAll clears both. Renderers never call openSheet themselves. */
const sheetNav = {
  stack: [],
  push(view){ this.stack.push(view); this._show(view); },
  replace(view){ this.stack = [view]; this._show(view); },
  back(){
    this.stack.pop();
    const v = this.stack[this.stack.length-1];
    if(v) this._show(v); else deselectAll();
  },
  reset(){ this.stack = []; },
  rerender(){ const v = this.stack[this.stack.length-1]; if(v) this._show(v); },
  _show(view){
    const wasOpen = sheetWrap.classList.contains('open');
    view.render();
    if(view.title) renderSheetHeader(view);
    if(!wasOpen) sfx('open');
    sheetWrap.classList.add('open');
    document.body.classList.add('sheet-open');
  }
};
function renderSheetHeader(view){
  const h = document.createElement('div');
  h.className = 'sheet-header';
  h.innerHTML = `<button class="sheet-back${sheetNav.stack.length<2?' hidden':''}" aria-label="Back">‹</button><div class="sheet-title">${view.title}</div>`;
  sheetContent.prepend(h);
  h.querySelector('.sheet-back').addEventListener('click', ()=>sheetNav.back());
}

// Real drag-to-expand: two detents (46vh / 85vh) toggled from the grabber
// zone only — the sheet body scrolls, so body-drag disambiguation is avoided.
(function(){
  const zone = document.getElementById('grabber-zone');
  const sheet = document.getElementById('bottom-sheet');
  let startY = null;
  zone.addEventListener('touchstart', (e)=>{ startY = e.touches[0].clientY; }, {passive:true});
  zone.addEventListener('touchmove', (e)=>{
    if(startY===null) return;
    const dy = e.touches[0].clientY - startY;
    if(dy < -24){ sheet.classList.add('expanded'); startY = null; }
    else if(dy > 24){
      if(sheet.classList.contains('expanded')) sheet.classList.remove('expanded');
      else deselectAll();
      startY = null;
    }
    e.preventDefault();
  }, {passive:false});
  zone.addEventListener('touchend', (e)=>{
    if(startY!==null && Math.abs(e.changedTouches[0].clientY - startY) < 8){
      sheet.classList.toggle('expanded'); // tap the grabber = toggle
    }
    startY = null;
  });
  zone.addEventListener('click', ()=>{ if(!('ontouchstart' in window)) sheet.classList.toggle('expanded'); });
})();

// Inline gauge helper — replaces hand-rolled inline-styled span pairs
function miniBar(pct, color){
  return `<span class="mini-bar"><i style="width:${pct}%;background:${color};"></i></span>`;
}

/* ── Research panel: extracted from the Town Center sheet so the hub's
   Research tab and the building sheet share one implementation ── */
function researchPanelHtml(){
  const done = TECH_TREE.filter(t=>G.researched[t.id]);
  const avail = TECH_TREE.filter(t=>techAvailable(t));
  let html = '';
  if(G.activeResearch){
    const t = TECH_TREE.find(x=>x.id===G.activeResearch.id);
    const pct = Math.round(100*(1 - G.activeResearch.remaining/G.activeResearch.total));
    html += `<div class="sheet-sub">${t.ic} ${t.name} — ${pct}% ${miniBar(pct,'#7a9a4a')}</div>`;
  }
  html += avail.map(t=>{
    const costStr = Object.entries(t.cost).map(([k,a])=>a+' '+k).join(', ');
    const afford = Object.entries(t.cost).every(([k,a])=>(G.stockpile[k]||0)>=a);
    return `<button class="action-btn list-row${(!afford||G.activeResearch)?' dim':''}" data-tech="${t.id}">
      <div>${t.ic} <span class="rt">${t.name}</span> — ${t.desc}<br><span class="rd">Cost: ${costStr} · ${t.time}s</span></div></button>`;
  }).join('');
  if(done.length) html += `<div class="sheet-sub" style="margin-top:6px;">Completed: ${done.map(t=>t.ic+' '+t.name).join(' · ')}</div>`;
  if(!avail.length && !G.activeResearch && done.length===TECH_TREE.length) html += '<div class="sheet-sub">All knowledge of the age has been mastered.</div>';
  return html;
}
function bindResearchButtons(rerender){
  sheetContent.querySelectorAll('[data-tech]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ startResearch(btn.dataset.tech); rerender(); });
  });
}

/* ── Hold Menu hub: Goals · Research · Shop · Journal ── */
const HUB_TABS = {
  goals:    { ic:'📜', label:'Goals',    title:'📜 Goals of the Hold', body:()=>renderQuestSheet() },
  research: { ic:'🔬', label:'Research', title:'🔬 Research',          body:()=>renderResearchTab() },
  shop:     { ic:'💰', label:'Shop',     title:'💰 Hold Shop',         body:()=>renderShopSheet() },
  folk:     { ic:'👥', label:'Folk',     title:'👥 The Folk',          body:()=>renderRosterSheet() },
  journal:  { ic:'📖', label:'Journal',  title:'📖 Journal',           body:()=>renderJournalSheet() },
};
let rosterSort = 'role';
function renderRosterSheet(){
  const sorters = {
    role:  (a,b)=> (a.role||'').localeCompare(b.role||'') || (a.name||'').localeCompare(b.name||''),
    name:  (a,b)=> (a.name||'').localeCompare(b.name||''),
    morale:(a,b)=> (a.morale||0)-(b.morale||0),
  };
  const list = G.villagers.slice().sort(sorters[rosterSort]||sorters.role);
  const idle = G.villagers.filter(v=>v.role==='idle'&&v.state!=='spawning').length;
  const stageIc = v=> v.stage==='child'?'🧒':v.stage==='elder'?'🧓':'🧑';
  sheetContent.innerHTML = `
    <div class="sheet-sub">${G.villagers.length} settler${G.villagers.length!==1?'s':''}${idle?` · <span style="color:var(--amber)">${idle} idle</span>`:''}. Tap one to open their sheet.</div>
    <div class="roster-sort">Sort:
      ${['role','morale','name'].map(s=>`<button class="chip${s===rosterSort?' sel':''}" data-sort="${s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}
    </div>
    <div class="roster-list">
      ${list.map((v,i)=>{
        const col = v.morale>70?'#6a9a4a':(v.morale<30?'#a4402c':'#c8a850');
        return `<button class="roster-row" data-i="${i}">
          <span class="rr-ic">${(ROLE_DEFS[v.role]&&ROLE_DEFS[v.role].ic)||'🧑'}</span>
          <span class="rr-main"><b>${v.name}</b>${v.sick?' 🤧':''}<br><span class="rr-sub">${stageIc(v)} ${(()=>{const t=skillTier(v,v.role);return t.ic?t.ic+' ':'';})()}${roleLabel(v.role)}${v.trait?' · '+v.trait.ic+' '+v.trait.label:''}</span></span>
          <span class="rr-morale"><span class="mini-bar"><span style="display:block;height:100%;width:${Math.round(v.morale||65)}%;background:${col};"></span></span></span>
        </button>`;
      }).join('')}
    </div>`;
  sheetContent.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click', ()=>{ rosterSort=b.dataset.sort; renderHubSheet('folk'); }));
  sheetContent.querySelectorAll('.roster-row').forEach(b=>b.addEventListener('click', ()=>{
    const v = list[+b.dataset.i]; if(!v) return;
    selection = { type:'villager', ref:v };
    sheetNav.push({ id:'sel-villager', render:()=>renderVillagerSheet(v) });
    const p = project(v.gx, v.gy); panCameraTo(p.x, p.y);
  }));
}
function renderHubSheet(tab){
  sheetNav.replace({ id:'hub:'+tab, title:HUB_TABS[tab].title, render(){
    HUB_TABS[tab].body();
    const row = document.createElement('div');
    row.className = 'tab-row';
    row.innerHTML = Object.keys(HUB_TABS).map(k=>
      `<button class="tab-btn${k===tab?' sel':''}" data-tab="${k}">${HUB_TABS[k].ic} ${HUB_TABS[k].label}</button>`).join('');
    sheetContent.prepend(row);
    row.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click', ()=>renderHubSheet(b.dataset.tab)));
  }});
}
function renderResearchTab(){
  sheetContent.innerHTML = `
    <div class="sheet-sub">Knowledge grows at the Town Center along the ancient oak's many branches.</div>
    ${researchPanelHtml()}`;
  bindResearchButtons(()=>renderHubSheet('research'));
}
function renderJournalSheet(){
  sheetContent.innerHTML = `
    <div class="sheet-sub">📖 <b>Hold Journal</b> — Peak settlers: ${G.journal.peakPopulation} · Days: ${G.journal.daysSurvived} · Winters: ${G.journal.wintersEndured} · Buildings raised: ${G.journal.buildingsRaised} · Settlers welcomed: ${G.journal.settlersWelcomed} · Wolf raids survived: ${G.journal.wolvesSurvived}${G.journal.passed?' · Passed on: '+G.journal.passed:''}</div>
    ${(()=>{ const g=Object.keys(GUILD_DEFS).filter(r=>G.guilds[r]); return g.length?`<div class="sheet-sub" style="margin-top:6px;"><b>⚜️ Guilds</b> — ${g.map(r=>GUILD_DEFS[r].ic+' '+GUILD_DEFS[r].name).join(' · ')} <span style="opacity:.7">(+${Math.round(guildBonusVal()*100)}% each)</span></div>`:''; })()}
    <div class="sheet-sub" style="margin:8px 0 2px;"><b>🏅 Deeds</b> — ${Object.keys(G.deeds).length} of ${DEED_DEFS.length} earned</div>
    <div class="deed-G.grid">
      ${DEED_DEFS.map(d=>{
        const got = !!G.deeds[d.id];
        const rt = rewardText(d.reward);
        return `<div class="deed${got?' got':''}" title="${d.desc}${rt?' · Reward '+rt:''}">
          <span class="deed-ic">${got?d.ic:'🔒'}</span>
          <span class="deed-name">${d.name}</span>
          <span class="deed-desc">${got?('Day '+G.deeds[d.id]):d.desc}${rt?`<br><span style="color:var(--amber)">${rt}</span>`:''}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="sheet-sub" style="margin:10px 0 2px;"><b>📜 The Chronicle of the Hold</b></div>
    ${G.chronicle.length ? G.chronicle.slice(0,6).map(e=>`<div class="sheet-sub" style="opacity:.92;">Day ${e.day}${e.season?', '+e.season:''} — ${e.text}</div>`).join('') : '<div class="sheet-sub" style="opacity:.7;">The chronicle awaits its first tale.</div>'}
    <div class="row" style="margin-top:8px;gap:6px;">
      ${G.chronicle.length ? `<button class="action-btn" id="chron-btn" style="flex:1;">📜 Read the full Chronicle</button>` : ''}
      <button class="action-btn" id="inbox-btn" style="flex:1;">📨 Events</button>
      <button class="action-btn" id="holdcard-btn" style="flex:1;">🪪 Share Card</button>
      <button class="action-btn" id="stats-btn" style="flex:1;">📊 Statistics</button>
      <button class="action-btn" id="whatsnew-btn" style="flex:1;">📰 v${GAME_VERSION}</button>
    </div>`;
  const sb = document.getElementById('stats-btn');
  if(sb) sb.addEventListener('click', ()=>{
    sheetNav.push({ id:'stats', title:'📊 Statistics', render: renderStatsSheet });
  });
  const ib = document.getElementById('inbox-btn');
  if(ib) ib.addEventListener('click', ()=>{
    sheetNav.push({ id:'inbox', title:'📨 Events', render:()=>renderInboxSheet() });
  });
  const hc = document.getElementById('holdcard-btn');
  if(hc) hc.addEventListener('click', ()=>exportHoldCard());
  const cb = document.getElementById('chron-btn');
  if(cb) cb.addEventListener('click', ()=>{
    sheetNav.push({ id:'chronicle', title:'📜 The Chronicle', render: renderChronicleSheet });
  });
  document.getElementById('whatsnew-btn').addEventListener('click', ()=>{
    sheetNav.push({ id:'whatsnew', title:'📰 What\'s New', render(){
      sheetContent.innerHTML = CHANGELOG.map(([v,txt])=>'<div class="sheet-sub" style="margin-top:6px;"><b>v'+v+'</b> — '+txt+'</div>').join('');
    }});
  });
}
function renderChronicleSheet(){
  const tier = (typeof HOLD_TIERS!=='undefined' && HOLD_TIERS[getTier()]) || {ic:'🏕️', name:'Hold'};
  // Group consecutive entries by (day, season); chronicle is newest-first.
  const groups=[]; let cur=null;
  for(const e of G.chronicle){
    if(!cur || cur.day!==e.day || cur.season!==e.season){ cur={day:e.day, season:e.season, items:[]}; groups.push(cur); }
    cur.items.push(e.text);
  }
  const body = groups.map(g=>
    `<div class="cx-day">Day ${g.day}${g.season?' · '+g.season:''}</div>`+
    g.items.map(t=>`<div class="cx-line">${t}</div>`).join('')
  ).join('');
  sheetContent.innerHTML = `
    <div class="chronicle-page">
      <div class="cx-title">The Chronicle of ${G.holdName}</div>
      <div class="cx-sub">${tier.ic} ${tier.name} · Day ${G.dayCount} · ${seasonName()}</div>
      ${G.chronicle.length ? body : '<div class="cx-line" style="text-align:center;">The chronicle awaits its first tale.</div>'}
    </div>`;
}
function renderStatsSheet(){
  const H = G.statHistory.slice();
  // include a live "today" point so the graph reaches the present
  H.push({ day:G.dayCount, pop:G.villagers.length, food:Math.round(G.stockpile.food||0), wood:Math.round(G.stockpile.wood||0), stone:Math.round(G.stockpile.stone||0) });
  const W=300, HT=110, pad=6;
  const line = (key, col)=>{
    if(H.length<2) return '';
    const max = Math.max(1, ...H.map(s=>s[key]));
    const n = H.length;
    const pts = H.map((s,i)=>{
      const x = pad + (i/(n-1))*(W-2*pad);
      const y = HT-pad - (s[key]/max)*(HT-2*pad);
      return x.toFixed(1)+','+y.toFixed(1);
    }).join(' ');
    return `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" points="${pts}"/>`;
  };
  const legend = (col,label,val)=>`<span class="stat-leg"><i style="background:${col}"></i>${label} <b>${val}</b></span>`;
  const last = H[H.length-1];
  const graph = H.length<2
    ? `<div class="sheet-sub" style="opacity:.7;">A day or two must pass before the record takes shape.</div>`
    : `<svg viewBox="0 0 ${W} ${HT}" class="stat-graph" preserveAspectRatio="none" aria-label="Population and stores over time">
        <rect x="0" y="0" width="${W}" height="${HT}" fill="#15100a" rx="6"/>
        ${line('food','#c8a850')}${line('wood','#8a6a3a')}${line('pop','#6a9a4a')}
      </svg>`;
  sheetContent.innerHTML = `
    <div class="sheet-sub">The hold's fortunes over the last ${Math.min(60,H.length)} day${H.length!==1?'s':''}.</div>
    ${graph}
    <div class="stat-legend">
      ${legend('#6a9a4a','Settlers',last.pop)}
      ${legend('#c8a850','Provisions',last.food)}
      ${legend('#8a6a3a','Timber',last.wood)}
    </div>
    ${G.festivalBoon?(()=>{const b=FESTIVAL_BOONS.find(x=>x.id===G.festivalBoon);return b?`<div class="sheet-sub" style="margin-top:8px;">${b.ic} <b>${b.name}</b> — this year's festival blessing. ${b.desc}</div>`:'';})():''}
    <div class="sheet-sub" style="margin-top:8px;">Peak settlers <b>${G.journal.peakPopulation}</b> · Days survived <b>${G.journal.daysSurvived}</b> · Winters endured <b>${G.journal.wintersEndured}</b></div>
    <div class="sheet-sub">Buildings raised <b>${G.journal.buildingsRaised}</b> · Settlers welcomed <b>${G.journal.settlersWelcomed}</b> · Raids survived <b>${G.wolfEvents}</b>${G.journal.weddings?` · Weddings <b>${G.journal.weddings}</b>`:''}${G.journal.childrenBorn?` · Children born <b>${G.journal.childrenBorn}</b>`:''}${G.journal.passed?` · Passed on <b>${G.journal.passed}</b>`:''}</div>`;
}

let inboxFilter = 'all';
function renderInboxSheet(){
  const CATS = { all:'All', raid:'⚔ Raids', folk:'👥 Folk', build:'🏗 Building', general:'✦ Other' };
  const shown = eventLog.slice().reverse().filter(e=> inboxFilter==='all' || e.cat===inboxFilter);
  sheetContent.innerHTML = `
    <div class="sheet-sub">The hold's recent tidings — newest first.</div>
    <div class="roster-sort">
      ${Object.keys(CATS).map(c=>`<button class="chip${c===inboxFilter?' sel':''}" data-cat="${c}">${CATS[c]}</button>`).join('')}
    </div>
    <div class="roster-list">
      ${shown.length ? shown.map(e=>`<div class="inbox-row${e.warn?' warn':''}">
          <span class="ib-day">Day ${e.day}</span>
          <span class="ib-msg">${e.msg}</span>
        </div>`).join('') : '<div class="sheet-sub" style="opacity:.7;">No tidings of this kind yet.</div>'}
    </div>`;
  sheetContent.querySelectorAll('[data-cat]').forEach(b=>b.addEventListener('click', ()=>{ inboxFilter=b.dataset.cat; renderInboxSheet(); }));
}
function openFestivalChoice(){
  try{ sfx('open'); }catch(e){}
  toast('🎊 A new year dawns — the hold gathers for its festival!');
  sheetNav.push({ id:'festival', title:'🎊 The Year\'s Festival', render(){
    sheetContent.innerHTML = `
      <div class="sheet-sub">A new year turns over the valley. The folk gather — choose the blessing that will guide the hold until next spring.</div>
      ${G.festivalBoon?`<div class="sheet-sub" style="opacity:.75;">Last year's blessing: ${(FESTIVAL_BOONS.find(b=>b.id===G.festivalBoon)||{}).name||'—'}.</div>`:''}
      <div class="roster-list" style="margin-top:8px;">
        ${FESTIVAL_BOONS.map(b=>`<button class="action-btn list-row" data-boon="${b.id}">
          <span style="font-size:22px;">${b.ic}</span>
          <span><b>${b.name}</b><br><span style="font-size:11.5px;opacity:.8;">${b.desc}</span></span>
        </button>`).join('')}
      </div>`;
    sheetContent.querySelectorAll('[data-boon]').forEach(btn=>btn.addEventListener('click', ()=>{
      const b = FESTIVAL_BOONS.find(x=>x.id===btn.dataset.boon); if(!b) return;
      G.festivalBoon = b.id;
      activeEvent = { type:'festival', endsAt: G.worldTime + 55 }; // a real feast to mark it
      toast(b.ic+' '+b.name+' — the hold rejoices!'); if(typeof sfx==='function') sfx('festival');
      if(typeof chron==='function') chron('festival', b.name);
      try{ sfx('tap'); }catch(e){}
      deselectAll();
    }));
  }});
}

// If the freshly-opened sheet (or the HUD) covers the selection, pan the
// camera just enough to bring it back into the uncovered part of the screen.
function ensureSelectionVisible(){
  if(!selection.type || !selection.ref) return;
  const g = selection.type==='building' ? buildingCenter(selection.ref)
          : { gx:selection.ref.gx, gy:selection.ref.gy };
  if(g.gx===undefined || g.gy===undefined) return;
  const p = project(g.gx, g.gy);
  const s = worldToScreen(p.x, p.y);
  const sideDock = matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
  const top = 130, left = 40;
  // Measure the real sheet (offsetHeight ignores the slide-in transform)
  const sheetEl = document.getElementById('bottom-sheet');
  const sheetH = sheetEl ? Math.min(sheetEl.offsetHeight, view.h*0.5) : view.h*0.5;
  const bottom = sideDock ? view.h - 50 : view.h - sheetH - 30;
  const right = sideDock ? view.w - Math.min(view.w*0.46, 380) - 40 : view.w - 40;
  let dx = 0, dy = 0;
  if(s.x < left) dx = left - s.x; else if(s.x > right) dx = right - s.x;
  if(s.y < top) dy = top - s.y; else if(s.y > bottom) dy = bottom - s.y;
  if(dx || dy){ camera.panX += dx; camera.panY += dy; clampCamera(); }
}
document.getElementById('sheet-close').addEventListener('click', ()=>{
  deselectAll();
});

function deselectAll(){
  selection = {type:null, ref:null};
  if(buildMode.active) exitBuildMode();
  closeSheet();
  buildFab.classList.remove('active');
}

function selectVillager(v){
  sfx('tap');
  exitBuildModeIfActive();
  selection = { type:'villager', ref:v };
  sheetNav.replace({ id:'sel-villager', render:()=>renderVillagerSheet(v) });
  ensureSelectionVisible();
}
function selectBuilding(b){
  sfx('tap');
  exitBuildModeIfActive();
  selection = { type:'building', ref:b };
  sheetNav.replace({ id:'sel-building', render:()=>renderBuildingSheet(b) });
  ensureSelectionVisible();
}
function selectTile(t){
  exitBuildModeIfActive();
  selection = { type:'tile', ref:t };
  sheetNav.replace({ id:'sel-tile', render:()=>renderTileSheet(t) });
  ensureSelectionVisible();
}
function exitBuildModeIfActive(){ if(buildMode.active) exitBuildMode(); }

function statBar(label, val, color){
  return `<div class="stat-bar-label"><span>${label}</span><span>${Math.round(val)}%</span></div>
  <div class="stat-bar"><div class="stat-bar-fill" style="width:${val}%;background:${color}"></div></div>`;
}

function renderVillagerSheet(v){
  const roles = Object.keys(ROLE_DEFS).map(key=>{
    const r = ROLE_DEFS[key];
    // Deadfall and foraging need no building — the trade is just slower by hand.
    const byHand = (key==='lumberjack' || key==='hunter');
    const hasPlace = !r.needsBuilding || hasBuildingType(r.needsBuilding);
    return { key, label:r.label, ic:r.ic, enabled: hasPlace || byHand,
             needs: r.needsBuilding, byHand: !hasPlace && byHand };
  });
  const pKey = ({ lumberjack:'lumberjack', miner:'miner', farmer:'farmer', fisher:'fisher', guard:'guard' })[v.role] || 'peasant';
  const pUri = (typeof SPRITE_URLS!=='undefined') && SPRITE_URLS['portrait_'+pKey];
  sheetContent.innerHTML = `
    ${pUri ? `<img src="${pUri}" alt="" style="float:right;width:76px;height:76px;object-fit:cover;object-position:top center;border-radius:8px;border:1px solid var(--panel-edge);margin:0 0 6px 8px;background:#1a140c;">` : ''}
    <div class="sheet-title">${v.name} <span class="villager-role-tag">${roleLabel(v.role)}</span>${v.sick?'<span class="villager-role-tag" style="color:#e8b2a4;border-color:#a44030">🤧 Ill</span>':''}</div>
    <div class="sheet-sub">${v.stage==='child'?'🧒 Child':v.stage==='elder'?'🧓 Elder':'🧑 Adult'} · ${Math.floor((v.age||2)*4)} seasons old</div>
    <div class="sheet-sub">${stateLabel(v)}${v.trait ? ` · <span style="color:var(--amber)">${v.trait.ic} ${v.trait.label}</span> — ${v.trait.desc}` : ''}</div>
    ${(()=>{ const t=skillTier(v,v.role); return (v.role!=='idle'&&t.label) ? `<div class="sheet-sub"><span style="color:var(--amber)">${t.ic} ${t.label} ${roleLabel(v.role)}</span> — +${Math.round((t.mul-1)*100)}% at their craft</div>` : ''; })()}
    <div class="sheet-sub" style="font-style:italic;opacity:0.75;margin-top:4px;">${v.parents ? v.name+' was born in Oakenfall to '+v.parents[0]+' and '+v.parents[1]+'.' : backstoryFor(v)}</div>
    ${v.partner ? `<div class="sheet-sub">💞 Wed to <b>${v.partner}</b>${G.villagers.some(o=>o.name===v.partner)?'':' <span style="opacity:0.7">(departed)</span>'}</div>` : ''}
    ${(()=>{
      const fr=(v.relations||[]).filter(r=>r.type==='friend'&&r.s>40).map(r=>r.name);
      const rv=(v.relations||[]).filter(r=>r.type==='rival'&&r.s<-25).map(r=>r.name);
      let h='';
      if(fr.length) h+=`<div class="sheet-sub">🤝 Friends with <b>${fr.join('</b>, <b>')}</b></div>`;
      if(rv.length) h+=`<div class="sheet-sub">⚔️ Rivals with <b>${rv.join('</b>, <b>')}</b></div>`;
      return h;
    })()}
    ${v.memories&&v.memories.length?`<div class="sheet-sub" style="opacity:.75;">Remembers: <b>${v.memories[0]}</b></div>`:''}
    <div style="margin-top:6px;"></div>
    ${statBar(`Morale ${v.morale>70?'😊':(v.morale<30?'😞':'😐')}`, v.morale||65, v.morale>70?'#6a9a4a':(v.morale<30?'#a4402c':'#c8a850'))}
    ${statBar('Hunger', v.hunger, v.hunger>70?'#a4402c':'#8a7332')}
    ${statBar('Fatigue', v.fatigue, v.fatigue>70?'#a4402c':'#3a5a78')}
    <button class="action-btn" id="find-villager-btn" style="margin:6px 0 2px;">🔍 Find on map</button>
    <div class="row">
      ${roles.map(r=>`<button class="role-btn ${v.role===r.key?'active':''}" ${r.enabled?'':'disabled'} data-role="${r.key}">
        <span class="ic">${r.ic}</span>${r.label}${r.enabled?(r.byHand?'<br><small style=\'opacity:.7\'>By hand — half yield</small>':''):'<br><small style=\'opacity:.7\'>Needs '+BUILD_DEFS[r.needs].name+'</small>'}
      </button>`).join('')}
    </div>
  `;
  const findBtn = document.getElementById('find-villager-btn');
  if(findBtn) findBtn.addEventListener('click', ()=>{
    const p = project(v.gx, v.gy);
    panCameraTo(p.x, p.y);
  });
  sheetContent.querySelectorAll('.role-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.disabled) return;
      reassignRole(v, btn.dataset.role);
      renderVillagerSheet(v);
    });
  });
}
function stateLabel(v){
  const map = {
    spawning:'Newly arrived, still finding their feet.',
    idle:'Standing by, awaiting orders.', walkingToResource:'Heading out to gather.',
    working:'Hard at work.', walkingToDropoff:'Hauling supplies home.',
    walkingToFarm:'Walking to the fields.', farming:'Tending the crops.',
    seekingFood:'Heading home, famished.', eating:'Taking a meal.',
    seekingSleep:'Heading home, exhausted.', sleeping:'Resting by the hearth.'
  };
  return map[v.state] || '';
}

const TRADE_RATES = [
  {give:'wood',  giveAmt:20, get:'stone', getAmt:10, label:'Timber → Stone'},
  {give:'stone', giveAmt:15, get:'wood',  getAmt:25, label:'Stone → Timber'},
  {give:'food',  giveAmt:15, get:'wood',  getAmt:10, label:'Provisions → Timber'},
  {give:'wood',  giveAmt:15, get:'food',  getAmt:10, label:'Timber → Provisions'},
  {give:'stone', giveAmt:20, get:'food',  getAmt:15, label:'Stone → Provisions'},
  {give:'food',  giveAmt:20, get:'stone', getAmt:14, label:'Provisions → Stone'},
];
function renderBuildingSheet(b){
  const def = BUILD_DEFS[b.type];
  let extra = '';
  if(b.type==='townCenter'){
    extra = `<div class="sheet-sub" style="margin-top:6px;">Population ${G.villagers.length} / ${popCapacity()}. Villagers eat and sleep here.</div>`;
  } else if(b.type==='house'){
    extra = `<div class="sheet-sub" style="margin-top:6px;">Provides shelter for +3 settlers.</div>`;
  } else if(b.type==='manor'){
    extra = `<div class="sheet-sub" style="margin-top:6px;">A grand timber-framed hall — shelters +6 settlers in comfort.</div>`;
  } else if(b.type==='road'){
    extra = `<div class="sheet-sub" style="margin-top:6px;">Cobblestone — settlers move 30% faster on roads. Build networks to connect your buildings.</div>`;
  } else if(b.type==='granary'){
    extra = `<div class="sheet-sub" style="margin-top:6px;">${def.desc} Current limits — Wood ${capFor('wood')}, Stone ${capFor('stone')}, Food ${capFor('food')}.<br>Food kept safe from spoilage: up to <b>${foodSafeCap()}</b>.</div>`;
  } else if(b.type==='forester'){
    extra = `<div class="sheet-sub" style="margin-top:6px;">${def.desc}<br>Tending the forest within ~4½ tiles — reviving barren ground toward full growth.</div>`;
  } else if(b.type==='pasture'){
    const w = seasonIndex()===3;
    extra = `<div class="sheet-sub" style="margin-top:6px;">${def.desc}<br>Herd: <b>🐑 ${b.herd||0} / 6</b>. ${w?'<span style="color:#e8b2a4">Winter — the herd is drawing on your food stores for fodder.</span>':'Grazing and growing; producing food.'}</div>`;
  } else if(def && def.proc){
    const inStr = Object.entries(def.proc.in).map(([k,a])=>a+' '+k).join(' + ');
    const outStr = Object.entries(def.proc.out).map(([k,a])=>a+' '+k).join(' + ');
    extra = `<div class="sheet-sub" style="margin-top:6px;">${def.desc}<br>Converts <b>${inStr}</b> → <b>${outStr}</b> every ${def.proc.every}s automatically.<br>Stores — Planks: ${G.stockpile.planks||0}, Flour: ${G.stockpile.flour||0}, Bread: ${G.stockpile.bread||0}.</div>`;
  } else if(b.type==='watchtower' || b.type==='tavern' || b.type==='palisade' || b.type==='guardPost'){
    extra = `<div class="sheet-sub" style="margin-top:6px;">${def.desc}</div>`;
  } else if(b.type==='tradingPost'){
    extra = `<div class="sheet-sub" style="margin-top:6px;">${def.desc}</div>
      <div class="row" style="flex-direction:column;gap:6px;margin-top:6px;">
        ${TRADE_RATES.map((t,i)=>`<button class="action-btn" data-trade="${i}" style="text-align:left;">${t.label}: ${t.giveAmt} ${RES_ICON[t.give]} → ${t.getAmt} ${RES_ICON[t.get]}</button>`).join('')}
      </div>`;
  } else if(def && def.role){
    const roleDef = ROLE_DEFS[def.role];
    extra = `<div class="sheet-sub" style="margin-top:6px;">${def.desc}<br>Workers stationed: ${b.workers}/3. Assign a ${roleDef.label} from a villager's panel.</div>`;
  }
  if(b.type!=='townCenter' && b.type!=='road' && b.condition!==undefined){
    const cond = Math.round(b.condition);
    const col = cond>=70?'#6a9a4a':(cond>=35?'#c8a850':'#a4402c');
    extra += `<div style="margin-top:6px;"></div>${statBar(`Condition ${cond<35?'⚠️':''}`, cond, col)}`;
    if(cond<35) extra += `<div class="sheet-sub" style="margin-top:-4px;color:#e8b2a4;"><b>Worn: bonuses halted!</b></div>`;
    if(cond < 90){
      const repairCost = Math.max(2, Math.ceil((100-cond)/10));
      extra += `<button class="action-btn" id="repair-btn" style="margin-top:4px;">🔧 Repair (${repairCost} wood)</button>`;
    }
  }
  if(b.type==='townCenter'){
    extra += '<div class="sheet-sub" style="margin-top:8px;"><b>🔬 Research</b></div>' + researchPanelHtml();
  }
  const canDemolish = b.type!=='townCenter';
  const canMove = b.type!=='townCenter';
  const fireBanner = b._fire ? `
    <div class="sheet-sub" style="color:#e8b2a4;margin-top:4px;"><b>🔥 On fire!</b> (${Math.round(b._fire)}%) Rally a bucket brigade, or it spreads and burns down. Rain, winter, and nearby settlers help.</div>
    <button class="action-btn danger" id="douse-btn" style="margin-top:4px;">🪣 Fling water (bucket brigade)</button>` : '';
  sheetContent.innerHTML = `
    <div class="sheet-title">${def?def.icon+' '+def.name:'Town Center'}</div>
    ${fireBanner}
    ${extra}
    <div class="row" style="margin-top:10px;">
      ${canMove ? `<button class="action-btn" id="move-btn">✥ Move</button>` : ''}
      ${canDemolish ? `<button class="action-btn danger" id="demolish-btn">🗑️ Demolish (refund half wood)</button>` : ''}
    </div>
  `;
  const douseBtn = document.getElementById('douse-btn');
  if(douseBtn) douseBtn.addEventListener('click', ()=>{
    b._bucket = Math.min(24, (b._bucket||0) + 8); // each fling adds suppression
    if(typeof sfx==='function') sfx('tap');
    if(navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
    renderBuildingSheet(b);
  });
  const dbtn = document.getElementById('demolish-btn');
  if(dbtn) dbtn.addEventListener('click', ()=>demolishBuilding(b));
  const mbtn = document.getElementById('move-btn');
  if(mbtn) mbtn.addEventListener('click', ()=>enterMoveMode(b));
  sheetContent.querySelectorAll('[data-trade]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const t = TRADE_RATES[parseInt(btn.dataset.trade,10)];
      if(G.stockpile[t.give] < t.giveAmt){ toast('Not enough '+t.give+'.', true); return; }
      G.stockpile[t.give] -= t.giveAmt;
      const bonus = eventTradeBonus();
      const got = Math.floor(t.getAmt * bonus);
      gainResource(t.get, got);
      toast('Traded '+t.giveAmt+' '+t.give+' for '+got+' '+t.get+(bonus>1?' (merchant bonus!)':'')+'.');
      renderBuildingSheet(b);
    });
  });
  const repairBtn = document.getElementById('repair-btn');
  if(repairBtn) repairBtn.addEventListener('click', ()=>{
    const cost = Math.max(2, Math.ceil((100-(b.condition||100))/10));
    if(G.stockpile.wood < cost){ toast('Not enough wood to repair.', true); return; }
    G.stockpile.wood -= cost; b.condition = 100;
    toast('🔧 Repaired for '+cost+' wood.');
    sfx('repair');
    renderBuildingSheet(b);
  });
  bindResearchButtons(()=>renderBuildingSheet(b));
}
const RES_ICON = {wood:'🪵', stone:'🪨', food:'🌾'};

const TILE_INFO = {
  forest:{name:'Pine Stand', icon:'🌲', role:'lumberjack', resKind:'wood', verb:'🪓'},
  stone: {name:'Stone Outcrop', icon:'🪨', role:'miner', resKind:'stone', verb:'⛏️'},
  water: {name:'River Shallows', icon:'🐟', role:'fisher', resKind:'fish', verb:'🎣'},
  wilds: {name:'Game Trail', icon:'🦌', role:'hunter', resKind:'meat', verb:'🏹'},
};
function renderTileSheet(t){
  const kind = t.wilds ? 'wilds' : t.type;
  const info = TILE_INFO[kind];
  if(!info) return;
  const anyIdleRole = G.villagers.find(v=>v.role==='idle');
  sheetContent.innerHTML = `
    <div class="sheet-title">${info.icon} ${info.name}</div>
    <div class="sheet-sub">${t.resourceAmount>0 ? `Yield remaining: ${t.resourceAmount}/${t.maxResource}` : (t.type==='forest' && t.maxResource<=0 ? '🪵 Barren — this stand is felled out. A Forester\'s Grove nearby can replant it.' : 'Depleted — recovering.')}${t.type==='forest' && t.maxResource>0 && t.baseMax && t.maxResource<t.baseMax ? ' <span style="opacity:.7">(tiring — '+t.maxResource+'/'+t.baseMax+')</span>' : ''}</div>
    <div class="row" style="margin-top:8px;">
      ${anyIdleRole && t.resourceAmount>0 ? `<button class="action-btn primary" id="send-idle-btn">${info.verb} Send an idle villager here</button>` : `<div class="sheet-sub">No idle villagers available.</div>`}
    </div>
  `;
  const sbtn = document.getElementById('send-idle-btn');
  if(sbtn) sbtn.addEventListener('click', ()=>{
    const v = G.villagers.find(vv=>vv.role==='idle');
    if(!v) return;
    releaseClaims(v);
    v.role = info.role; v.resKind = info.resKind;
    t.workers++; v.targetTile=t; v.state='walkingToResource';
    toast(v.name+' sets out to work.');
    deselectAll();
  });
}

function demolishBuilding(b){
  for(const v of G.villagers){
    if(v.targetBuilding===b){ releaseClaims(v); v.state='idle'; }
  }
  gainResource('wood', Math.floor((BUILD_DEFS[b.type]?BUILD_DEFS[b.type].cost.wood:0) * 0.5));
  for(let yy=b.gy; yy<b.gy+b.h; yy++) for(let xx=b.gx; xx<b.gx+b.w; xx++){ if(G.grid[yy] && G.grid[yy][xx]) G.grid[yy][xx].building=null; }
  G.buildings = G.buildings.filter(x=>x!==b);
  toast('Building demolished.');
  deselectAll();
}

/* ---------- BUILD MODE / PALETTE ---------- */

/* Assign every idle villager to the most-needed unlocked role.
   Priority: food if low, then wood, then stone — cycling so a batch spreads out. */
function bulkAssignIdle(){
  const idle = G.villagers.filter(v=>v.role==='idle' && v.state!=='spawning');
  if(!idle.length){ toast('No idle settlers.'); return; }
  const unlocked = [];
  if(hasBuildingType('farm')) unlocked.push('farmer');
  if(hasBuildingType('fishingHut')) unlocked.push('fisher');
  if(hasBuildingType('huntingCabin')) unlocked.push('hunter');
  if(hasBuildingType('forestCamp')) unlocked.push('lumberjack');
  if(hasBuildingType('miningPost')) unlocked.push('miner');
  if(!unlocked.length){ toast('Build a work building first (Forestry Camp, Farm, etc).', true); return; }
  // Order roles by need: food-producing roles first when food is under half cap
  const foodRoles = unlocked.filter(r=>['farmer','fisher','hunter'].includes(r));
  const matRoles  = unlocked.filter(r=>['lumberjack','miner'].includes(r));
  const ordered = (G.stockpile.food < capFor('food')*0.5 && foodRoles.length)
    ? [...foodRoles, ...matRoles] : [...matRoles, ...foodRoles];
  let i=0;
  for(const v of idle){ reassignRole(v, ordered[i % ordered.length]); i++; }
  toast('⚒️ '+idle.length+' settler'+(idle.length>1?'s':'')+' put to work.');
}
function renderBuildPalette(){
  const keys = Object.keys(BUILD_DEFS).filter(k=>{
    const d = BUILD_DEFS[k];
    return !d.needsTech || G.researched[d.needsTech];
  });
  sheetContent.innerHTML = `
    <div class="sheet-title">🔨 Raise a Building</div>
    <div class="sheet-sub">Choose a structure, then position it and confirm.</div>
    ${G.villagers.some(v=>v.role==='idle'&&v.state!=='spawning') ? `<button class="action-btn primary" id="bulk-assign-btn" style="margin:4px 0 8px;">⚒️ Put all idle settlers to work</button>` : ''}
    ${(()=>{
      const CAT = { home:'🏠 Homes', food:'🌾 Food & Provisions', industry:'🪓 Industry', trade:'⚖️ Trade & Hall', defense:'🛡️ Defense', road:'🛤️ Roadworks' };
      const CATOF = {
        house:'home', manor:'home',
        farm:'food', fishingHut:'food', huntingCabin:'food', bakery:'food', windmill:'food', granary:'food', pasture:'food',
        forestCamp:'industry', miningPost:'industry', sawmill:'industry', forester:'industry',
        tradingPost:'trade', tavern:'trade',
        watchtower:'defense', guardPost:'defense', palisade:'defense', well:'defense',
        road:'road', bridge:'road', lampPost:'road',
      };
      const card = (k)=>{
        const d = BUILD_DEFS[k];
        const afford = Object.entries(d.cost).every(([kk,amt])=>!amt || (G.stockpile[kk]||0)>=amt);
        return `<button class="build-card ${afford?'':'disabled'}" data-key="${k}" ${afford?'':'disabled'}>
          <span class="ic">${d.icon}</span>
          <span class="name">${d.name}</span>
          <div class="cost">${d.cost.wood?('🪵 '+d.cost.wood+' '):''}${d.cost.stone?('🪨 '+d.cost.stone+' '):''}${d.cost.planks?('🪚 '+d.cost.planks):''}</div>
        </button>`;
      };
      return ['home','food','industry','trade','defense','road'].map(cat=>{
        const inCat = keys.filter(k=>(CATOF[k]||'trade')===cat);
        return inCat.length ? `<div class="build-cat">${CAT[cat]}</div><div class="build-G.grid">${inCat.map(card).join('')}</div>` : '';
      }).join('');
    })()}
  `;
  const bulkBtn = document.getElementById('bulk-assign-btn');
  if(bulkBtn) bulkBtn.addEventListener('click', ()=>{ bulkAssignIdle(); deselectAll(); });
  sheetContent.querySelectorAll('.build-card').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.disabled) return;
      enterBuildMode(btn.dataset.key);
    });
  });
}

function enterBuildMode(key){
  buildMode.active = true;
  buildMode.key = key;
  buildMode.movingBuilding = null;
  buildFab.classList.add('active');
  crosshair.classList.add('show');
  renderPlacementSheet();
  openSheet();
}
function enterMoveMode(b){
  buildMode.active = true;
  buildMode.key = b.type;
  buildMode.movingBuilding = b;
  buildFab.classList.add('active');
  crosshair.classList.add('show');
  renderPlacementSheet();
  openSheet();
}
function exitBuildMode(){
  buildMode.active = false;
  buildMode.key = null;
  buildMode.movingBuilding = null;
  buildFab.classList.remove('active');
  crosshair.classList.remove('show');
}
function renderPlacementSheet(){
  const d = BUILD_DEFS[buildMode.key];
  const moving = !!buildMode.movingBuilding;
  sheetContent.innerHTML = `
    <div class="sheet-title">${d.icon} ${moving?'Moving':'Placing'}: ${d.name}</div>
    <div class="sheet-sub">${moving?'Pan the map to its new home, then confirm. No cost to relocate.':d.desc+' Pan the map to position the mark, then confirm.'}</div>
    <div class="row placement-bar">
      <button class="action-btn" id="cancel-place-btn">✕ Cancel</button>
      <button class="action-btn primary" id="confirm-place-btn">✓ ${moving?'Set Down Here':'Place Here'}</button>
    </div>
  `;
  document.getElementById('cancel-place-btn').addEventListener('click', deselectAll);
  document.getElementById('confirm-place-btn').addEventListener('click', confirmPlacement);
}
function confirmPlacement(){
  const gx = buildMode.ghostGX, gy = buildMode.ghostGY;
  const reason = buildSpotReason(gx,gy);
  if(reason){ toast(reason, true); return; }
  if(buildMode.movingBuilding){
    const b = buildMode.movingBuilding;
    for(let yy=b.gy; yy<b.gy+b.h; yy++) for(let xx=b.gx; xx<b.gx+b.w; xx++){ if(G.grid[yy] && G.grid[yy][xx]) G.grid[yy][xx].building=null; }
    b.gx = gx; b.gy = gy;
    G.grid[gy][gx].building = b;
    toast(BUILD_DEFS[b.type].name+' relocated.');
    exitBuildMode();
    deselectAll();
    return;
  }
  const d = BUILD_DEFS[buildMode.key];
  const costOf = (k,amt)=> (k==='stone' && G.researched.masonry) ? Math.ceil(amt*0.85) : amt;
  for(const [k,amt] of Object.entries(d.cost)){ if(amt>0 && (G.stockpile[k]||0)<costOf(k,amt)){ toast('Not enough '+k+'.', true); return; } }
  for(const [k,amt] of Object.entries(d.cost)){ if(amt>0) G.stockpile[k]-=costOf(k,amt); }
  addBuilding(buildMode.key, gx, gy);
  spawnDust(gx+0.5, gy+0.5);
  G.journal.buildingsRaised++;
  if(G.dailyProgress.built!==undefined) G.dailyProgress.built++;
  sfx('build'); buzz(18);
  toast(d.name+' constructed!');
  if(buildMode.key==='palisade' && !window._palisadeWarned){
    window._palisadeWarned = true;
    toast('⚠️ Settlers cannot cross palisades — mind you leave a gate gap.', true);
  }
  exitBuildMode();
  deselectAll();
}

document.getElementById('shop-pill').addEventListener('click', ()=>{ exitBuildModeIfActive(); selection={type:null,ref:null}; renderHubSheet('shop'); });
buildFab.addEventListener('click', ()=>{
  if(buildMode.active){ deselectAll(); return; }
  exitBuildModeIfActive();
  selection = {type:null, ref:null};
  sheetNav.replace({ id:'build', render:renderBuildPalette });
});

/* =========================================================================
   INPUT: pan / pinch / tap
========================================================================= */
let touchState = { mode:null, startX:0, startY:0, startPanX:0, startPanY:0, startDist:0, startScale:1, lastMidX:0, lastMidY:0, moved:false, startTime:0 };

/* Paint from a screen point. In the editor one finger paints; two fingers still
   pinch/pan, so the map stays navigable while you work. */
function paintScreen(sx, sy){
  const wp = screenToWorldPixel(sx, sy);
  const g = inProject(wp.x, wp.y);
  paintAt(g.gx, g.gy);
  if(editBrush==='tc') editorTitle();
}

function getTouchDist(t0,t1){ return Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY); }
function getTouchMid(t0,t1){ return {x:(t0.clientX+t1.clientX)/2, y:(t0.clientY+t1.clientY)/2}; }

canvas.addEventListener('touchstart', (e)=>{
  e.preventDefault();
  if(e.touches.length===1){
    panVel.active = false; panVel.x=0; panVel.y=0; camGlide.active = false;
    const t = e.touches[0];
    touchState.mode='pan';
    touchState.startX=t.clientX; touchState.startY=t.clientY;
    touchState.startPanX=camera.panX; touchState.startPanY=camera.panY;
    touchState.moved=false; touchState.startTime=performance.now();
    if(editorOn){ touchState.mode='paint'; pushUndo(); paintScreen(t.clientX, t.clientY); }
  } else if(e.touches.length>=2){
    const mid = getTouchMid(e.touches[0], e.touches[1]);
    touchState.mode='pinch';
    touchState.startDist = getTouchDist(e.touches[0], e.touches[1]);
    touchState.startScale = camera.scale;
    touchState.lastMidX = mid.x; touchState.lastMidY = mid.y;
    touchState.panStartX = camera.panX; touchState.panStartY = camera.panY;
    touchState.midStartX = mid.x; touchState.midStartY = mid.y;
    // Capture the world point under the fingers ONCE. Recomputing it each move
    // (against a camera we just mutated) fed back on itself and sent the view
    // flying — this is the anchor the pinch pivots around.
    touchState.pinchWorld = screenToWorldPixel(mid.x, mid.y);
    touchState.moved=true;
  }
}, {passive:false});

canvas.addEventListener('touchmove', (e)=>{
  e.preventDefault();
  if(touchState.mode==='paint' && e.touches.length===1){
    paintScreen(e.touches[0].clientX, e.touches[0].clientY);
    return;
  }
  if(touchState.mode==='pan' && e.touches.length===1){
    const t = e.touches[0];
    const dx = t.clientX-touchState.startX, dy = t.clientY-touchState.startY;
    if(Math.hypot(dx,dy) > 6) touchState.moved = true;
    const now = performance.now();
    const prevX = camera.panX, prevY = camera.panY;
    camera.panX = touchState.startPanX + dx;
    camera.panY = touchState.startPanY + dy;
    clampCamera();
    // Track velocity (px/ms) for release inertia — gives the pan a natural glide
    const dtMs = Math.max(1, now - (touchState.lastMoveT||now));
    panVel.x = (camera.panX - prevX)/dtMs; panVel.y = (camera.panY - prevY)/dtMs;
    touchState.lastMoveT = now;
  } else if(touchState.mode==='pinch' && e.touches.length>=2){
    const dist = getTouchDist(e.touches[0], e.touches[1]);
    const mid = getTouchMid(e.touches[0], e.touches[1]);
    let newScale = clamp(touchState.startScale * (dist/touchState.startDist), ZOOM_MIN, ZOOM_MAX);
    // Pin the world point captured at pinch start under the current midpoint, so
    // the map zooms about your fingers and can be dragged with two down.
    const anchor = touchState.pinchWorld || screenToWorldPixel(touchState.midStartX, touchState.midStartY);
    camera.scale = newScale;
    camera.panX = mid.x - view.w/2 - anchor.x*newScale;
    camera.panY = mid.y - view.h/2 - anchor.y*newScale;
    clampCamera();
  }
}, {passive:false});

let _lastTapT = 0, _lastTapX = 0, _lastTapY = 0;
canvas.addEventListener('touchend', (e)=>{
  e.preventDefault();
  if(e.touches.length===0){
    // Double-tap: zoom toward tap point (or back out if already zoomed in)
    if(touchState.mode==='pan' && !touchState.moved){
      const now2 = performance.now();
      const tx = touchState.startX, ty = touchState.startY;
      if(now2 - _lastTapT < 300 && Math.hypot(tx-_lastTapX, ty-_lastTapY) < 40){
        const target = camera.scale < 1.5 ? 1.9 : 1.0;
        const wu = screenToWorldPixel(tx, ty);
        camera.scale = target;
        camera.panX = tx - view.w/2 - wu.x*target;
        camera.panY = ty - view.h/2 - wu.y*target;
        clampCamera();
        _lastTapT = 0;
        return;
      }
      _lastTapT = now2; _lastTapX = tx; _lastTapY = ty;
    }
    // Launch glide if the finger was moving fast enough on release
    if(touchState.mode==='pan' && Math.hypot(panVel.x, panVel.y) > 0.15) panVel.active = true;
    const dt = performance.now()-touchState.startTime;
    if(touchState.mode==='pan' && !touchState.moved && dt<400){
      handleTap(touchState.startX, touchState.startY);
    }
    touchState.mode=null;
  } else if(e.touches.length===1){
    // transitioned from pinch to single touch - restart pan baseline
    const t = e.touches[0];
    touchState.mode='pan';
    touchState.startX=t.clientX; touchState.startY=t.clientY;
    touchState.startPanX=camera.panX; touchState.startPanY=camera.panY;
    touchState.moved=true;
  }
}, {passive:false});
canvas.addEventListener('touchend', ()=>{ if(editorOn) drawMinimap(); }, {passive:true});
canvas.addEventListener('touchcancel', ()=>{ touchState.mode=null; }, {passive:false});

// Mouse fallback (desktop testing convenience)
let mouseDown=false, mouseMoved=false, mouseStart={x:0,y:0}, mouseStartPan={x:0,y:0}, mouseStartTime=0;
canvas.addEventListener('mousedown', (e)=>{
  if(editorOn && e.button===0){ mouseDown=false; editPaintDrag=true; pushUndo(); paintScreen(e.clientX, e.clientY); return; }
  mouseDown=true; mouseMoved=false; mouseStart={x:e.clientX,y:e.clientY};
  mouseStartPan={x:camera.panX,y:camera.panY}; mouseStartTime=performance.now(); camGlide.active=false;
});
let editPaintDrag = false;
window.addEventListener('mousemove', (e)=>{
  if(editPaintDrag){ paintScreen(e.clientX, e.clientY); return; }
  if(!mouseDown) return;
  const dx=e.clientX-mouseStart.x, dy=e.clientY-mouseStart.y;
  if(Math.hypot(dx,dy)>6) mouseMoved=true;
  camera.panX = mouseStartPan.x+dx; camera.panY = mouseStartPan.y+dy;
  clampCamera();
});
window.addEventListener('mouseup', (e)=>{
  if(editPaintDrag){ editPaintDrag = false; drawMinimap(); return; }
  if(!mouseDown) return;
  mouseDown=false;
  if(!mouseMoved && performance.now()-mouseStartTime<400){ handleTap(e.clientX, e.clientY); }
});
canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  camGlide.active=false;
  const newScale = clamp(camera.scale * (e.deltaY<0?1.08:0.93), ZOOM_MIN, ZOOM_MAX);
  const worldUnderMouse = screenToWorldPixel(e.clientX, e.clientY);
  camera.scale = newScale;
  camera.panX = e.clientX - view.w/2 - worldUnderMouse.x*newScale;
  camera.panY = e.clientY - view.h/2 - worldUnderMouse.y*newScale;
  clampCamera();
}, {passive:false});

function handleTap(sx, sy){
  const wp = screenToWorldPixel(sx, sy);
  // 1) villager hit test
  let hitV = null, hitVD = 22*22;
  for(const v of G.villagers){
    const p = project(v.gx, v.gy);
    const d = dist2(wp.x, wp.y-10, p.x, p.y-12);
    if(d < hitVD){ hitVD = d; hitV = v; }
  }
  if(hitV){ selectVillager(hitV); return; }

  // 2) building hit test (bounding box around footprint)
  let hitB = null;
  for(const b of G.buildings){
    const c = buildingCenter(b);
    const p = project(c.gx, c.gy);
    const halfW = TILE_W*0.55*b.w, halfH = (TILE_H*0.55*b.h) + 50; // extend up for roof
    if(wp.x > p.x-halfW && wp.x < p.x+halfW && wp.y > p.y-halfH && wp.y < p.y+30){
      hitB = b; break;
    }
  }
  if(hitB){ selectBuilding(hitB); return; }

  // 3) tile hit test
  const g = inProject(wp.x, wp.y);
  const t = tileAt(Math.round(g.gx), Math.round(g.gy));
  if(t && (t.type==='forest' || t.type==='stone' || t.type==='water' || t.wilds)){ selectTile(t); return; }

  deselectAll();
}

/* =========================================================================
   SPEED / DAY CONTROLS
========================================================================= */
const speedBtn = document.getElementById('speed-btn');
function updateSpeedBtn(){
  speedBtn.textContent = speedMode===0 ? '⏸' : (speedMode===1 ? '▶' : '⏩');
}
const fsBtn = document.getElementById('fs-btn');
if(fsBtn) fsBtn.addEventListener('click', ()=>{
  const el = document.documentElement;
  if(!document.fullscreenElement){ (el.requestFullscreen||el.webkitRequestFullscreen||function(){}).call(el); }
  else { (document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document); }
});
const onboardX = document.getElementById('onboard-x');
if(onboardX) onboardX.addEventListener('click', ()=>{
  G.onboardDone = true;
  document.getElementById('onboard-ribbon').classList.add('hidden');
  if(typeof started!=='undefined' && started) saveGame && saveGame();
});
const redeemBtn = document.getElementById('redeem-btn');
if(redeemBtn) redeemBtn.addEventListener('click', ()=>{
  document.getElementById('more-menu').classList.add('hidden');
  selection = {type:null, ref:null};
  openSheet();
  sheetNav.reset();
  sheetNav.push({ id:'redeem', title:'🎁 Redeem a Code', render:()=>renderRedeemSheet() });
});
const sndBtn = document.getElementById('snd-btn');
if(sndBtn) sndBtn.addEventListener('click', ()=>{
  setSfxOn(!isSfxOn());
  sndBtn.textContent = isSfxOn() ? '🔊' : '🔇';
  if(isSfxOn()) sfx('tap');
});
const musicBtn = document.getElementById('music-btn');
if(musicBtn) musicBtn.addEventListener('click', ()=>{
  setMusicOn(!isMusicOn());
  musicBtn.textContent = isMusicOn() ? '🎵' : '🔇';
  sfx('tap');
});
speedBtn.addEventListener('click', ()=>{
  speedMode = speedMode===1 ? 2 : (speedMode===2 ? 0 : 1);
  updateSpeedBtn();
});

/* =========================================================================
   MAIN LOOP
========================================================================= */
let lastT = performance.now();
let started = false;
let mmTimer=0;
let _lastFrameErrorTime = 0;
let _frameErrorCount = 0;
function loop(now){
  requestAnimationFrame(loop); // schedule FIRST so an error can't break the chain
  try {
    const dt = Math.min((now-lastT)/1000, 0.1);
    lastT = now;
    if(started){
      // Camera glide inertia (mobile pan release)
      if(panVel.active){
        camera.panX += panVel.x * dt * 1000;
        camera.panY += panVel.y * dt * 1000;
        panVel.x *= Math.pow(0.0035, dt); panVel.y *= Math.pow(0.0035, dt);
        clampCamera();
        if(Math.hypot(panVel.x, panVel.y) < 0.02) panVel.active = false;
      }
      if(camGlide.active){
        const k = 1 - Math.pow(0.001, dt); // ~250ms ease toward target
        camera.panX += (camGlide.x - camera.panX) * k;
        camera.panY += (camGlide.y - camera.panY) * k;
        clampCamera();
        if(Math.hypot(camGlide.x - camera.panX, camGlide.y - camera.panY) < 0.5) camGlide.active = false;
      }
      if(!editorOn){
        update(dt);
        updateHud();
        mmTimer -= dt;
        if(mmTimer<=0){ drawMinimap(); mmTimer=2; }
      }
    }
    render();
    _frameErrorCount = 0; // reset streak on any successful frame
  } catch(e){
    _frameErrorCount++;
    // Throttle logging to once per second so a repeating error can't flood the console
    if(now - _lastFrameErrorTime > 1000){
      logError('frame', (e&&e.message||e) + (e&&e.stack ? ' | '+String(e.stack).split('\n')[1] : ''));
      console.warn('Oakenfall frame error:', e, '(x'+_frameErrorCount+' since last log)', e && e.stack ? '\nstack: '+String(e.stack).split('\n').slice(0,4).join(' | ') : '');
      _lastFrameErrorTime = now;
    }
    // If errors are firing every single frame (stack/layout thrash), skip a few
    // frames' worth of work to let any pending browser reflow settle before retrying.
    if(_frameErrorCount > 30){ lastT = now; _frameErrorCount = 0; }
  }
}

/* =========================================================================
   SAVE / LOAD
========================================================================= */
function serializeState(){
  /* The plain fields come from state.ts, which is also where they are declared
     and defaulted. Nothing is listed twice, so nothing can be forgotten here —
     see assertSaveCoverage. Only the three structures that need rebuilding on
     load, and the handful of things that are not G's, are written by hand. */
  return Object.assign(saveFields(), {
    v:2, savedAt: Date.now(), gameModeId,
    tcX: G.TC_X, tcY: G.TC_Y,
    grid: G.grid.map(row=>row.map(t=>({type:t.type,wilds:t.wilds,ford:t.ford||undefined,resourceAmount:t.resourceAmount,maxResource:t.maxResource,baseMax:t.baseMax,regrowAt:t.regrowAt}))),
    buildings: G.buildings.map(b=>({type:b.type,gx:b.gx,gy:b.gy,condition:Math.round(b.condition===undefined?100:b.condition),herd:b.herd})),
    villagers: G.villagers.map(v=>({name:v.name, role:v.role, gx:v.gx, gy:v.gy, hunger:v.hunger, fatigue:v.fatigue, trait:v.trait, sick:v.sick, morale:v.morale||65, partner:v.partner||null, parents:v.parents||null, relations:v.relations||[], memories:v.memories||[], age:v.age, stage:v.stage, lifespan:v.lifespan, skills:v.skills||{}})),
    ui: { mmBig: document.getElementById('minimap-wrap').classList.contains('mm-big') },
  });
}
/* =========================================================================
   SAVE SLOTS
   Four holds, each in its own key, with a light index so the title screen can
   list them without parsing four full maps.
========================================================================= */
const SAVE_SLOTS = 4;
let currentSlot = 1;
let slotMeta = {};                       // { "1": {name, savedAt, day, pop, holdName} }
const slotKey = (n)=>`oakenfall-save-${n}`;

async function saveSlotIndex(){
  try{ await window.storage.set('oakenfall-slots', JSON.stringify(slotMeta), false); }catch(e){}
  try{ await window.storage.set('oakenfall-slot', String(currentSlot), false); }catch(e){}
}
async function loadSlotIndex(){
  try{
    const res = await window.storage.get('oakenfall-slots', false);
    if(res && res.value) slotMeta = JSON.parse(res.value) || {};
  }catch(e){ slotMeta = {}; }
  try{
    const res = await window.storage.get('oakenfall-slot', false);
    const n = res && parseInt(res.value,10);
    if(n>=1 && n<=SAVE_SLOTS) currentSlot = n;
  }catch(e){}
}
/* One-time move of the single-save era into slot 1, so nobody loses a hold. */
async function migrateLegacySave(){
  try{
    if(slotMeta['1']) return;
    let res = await window.storage.get(slotKey(1), false);
    if(res && res.value) return;
    res = await window.storage.get('oakenfall-save', false);
    if(!res || !res.value){ res = await window.storage.get('pinehold-save', false); }
    if(!res || !res.value) return;
    await window.storage.set(slotKey(1), res.value, false);
    const d = JSON.parse(res.value);
    slotMeta['1'] = { name: d.holdName || 'Oakenfall', savedAt: d.savedAt||0,
      day: d.dayCount||1, pop: (d.villagers||[]).length, holdName: d.holdName || 'Oakenfall' };
    await saveSlotIndex();
  }catch(e){}
}
function noteSlotSaved(){
  const prev = slotMeta[String(currentSlot)] || {};
  slotMeta[String(currentSlot)] = {
    name: prev.name || G.holdName || 'Oakenfall',
    holdName: G.holdName, savedAt: Date.now(), day: G.dayCount, pop: G.villagers.length,
  };
}
async function deleteSlot(n){
  try{ await window.storage.set(slotKey(n), '', false); }catch(e){}
  delete slotMeta[String(n)];
  await saveSlotIndex();
}

async function saveGame(){
  try{
    const data = serializeState();
    const res = await window.storage.set(slotKey(currentSlot), JSON.stringify(data), false);
    if(res){ noteSlotSaved(); await saveSlotIndex(); }
    toast(res ? 'Hold saved.' : 'Save failed.', !res);
  } catch(e){ toast('Save failed.', true); }
}
// Storage: the host's KV if it provided one, Capacitor Preferences on a native
// build, localStorage on the web. See src/storage.ts for why that order.
installStorage();

/* Native shell integration. Loaded only on a real device build — the web
   bundle never imports these. */
if(isNative()){
  import('@capacitor/app').then(({ App })=>{
    // Android's back button must mean "go back", not "throw away my hold".
    App.addListener('backButton', ()=>{
      if(document.body.classList.contains('sheet-open')){ closeSheet(); return; }
      if(buildMode && buildMode.key){ exitBuildModeIfActive(); return; }
      if(started){ saveGame(); }
      App.exitApp();
    });
    // Backgrounding an app on a phone can mean it is never resumed.
    App.addListener('pause', ()=>{ if(started) saveGame(); });
  }).catch(()=>{});
  import('@capacitor/status-bar').then(({ StatusBar, Style })=>{
    StatusBar.setStyle({ style: Style.Dark }).catch(()=>{});
    StatusBar.setBackgroundColor({ color:'#14120e' }).catch(()=>{});
  }).catch(()=>{});
}

let _loadedSavedAt = 0;
async function loadGame(){
  try{
    const res = await window.storage.get(slotKey(currentSlot), false);
    if(!res || !res.value) return false;
    const data = JSON.parse(res.value);
    _loadedSavedAt = data.savedAt || 0;
    restoreState(data);
    return true;
  } catch(e){ return false; }
}

/* =========================================================================
   OFFLINE PROGRESS
   While the game was closed, the hold kept working at reduced efficiency.
   Capped so long absences give a nice bonus, not a broken economy.
========================================================================= */
function applyOfflineProgress(){
  if(!gameMode.offlineOn) return null;
  if(!_loadedSavedAt) return null;
  const elapsedRealSec = (Date.now() - _loadedSavedAt) / 1000;
  if(elapsedRealSec < 120) return null; // ignore short gaps — no popup spam
  // Cap simulated time at 8 hours; villagers work at 35% efficiency offline
  const simSec = Math.min(elapsedRealSec, 8*3600) * 0.35;
  // Count working-capable villagers per resource route
  let woodWorkers=0, stoneWorkers=0, foodWorkers=0;
  for(const v of G.villagers){
    if(v.role==='lumberjack') woodWorkers++;
    else if(v.role==='miner') stoneWorkers++;
    else if(v.role==='farmer'||v.role==='fisher'||v.role==='hunter') foodWorkers++;
  }
  // Average throughput per worker: ~1 haul (≈9 units) per 14s of active play
  const perWorkerRate = 9/14;
  const gains = {
    wood:  Math.floor(woodWorkers  * perWorkerRate * simSec),
    stone: Math.floor(stoneWorkers * perWorkerRate * simSec * 0.8),
    food:  Math.floor(foodWorkers  * perWorkerRate * simSec * 0.9),
  };
  // Villagers also ate while away: 2 food per villager per simulated "day"
  const foodEaten = Math.floor(G.villagers.length * 2 * (simSec / CYCLE_LEN));
  gains.food = Math.max(0, gains.food - foodEaten);
  const applied = {};
  for(const k of ['wood','stone','food']){
    if(gains[k] > 0) applied[k] = gainResource(k, gains[k]);
  }
  // Everyone wakes rested and fed after time away
  for(const v of G.villagers){ v.hunger = Math.min(v.hunger, 30); v.fatigue = Math.min(v.fatigue, 20); }
  const hours = elapsedRealSec/3600;
  const awayLabel = hours >= 1 ? Math.round(hours*10)/10 + ' hours' : Math.round(elapsedRealSec/60) + ' minutes';
  return { awayLabel, applied, hadWorkers: (woodWorkers+stoneWorkers+foodWorkers)>0 };
}
function showOfflineSummary(sum){
  if(!sum) return;
  const parts = [];
  if(sum.applied.wood)  parts.push('🪵 +'+sum.applied.wood);
  if(sum.applied.stone) parts.push('🪨 +'+sum.applied.stone);
  if(sum.applied.food)  parts.push('🌾 +'+sum.applied.food);
  sheetContent.innerHTML = `
    <div class="sheet-title">🌙 While You Were Away</div>
    <div class="sheet-sub">Your hold kept working through the night — you were gone ${sum.awayLabel}.</div>
    ${sum.hadWorkers
      ? `<div class="row" style="margin-top:8px;">${parts.length
          ? parts.map(p=>`<div class="pill" style="pointer-events:none;font-size:15px;">${p}</div>`).join('')
          : '<div class="sheet-sub">The stores were already full — nothing more could be kept.</div>'}</div>
        <div class="sheet-sub" style="margin-top:8px;">Everyone has eaten and rested, ready for new orders.</div>`
      : `<div class="sheet-sub" style="margin-top:8px;">No one was assigned to work, so the stores sit unchanged — but everyone is well-rested.</div>`}
    <div class="row" style="margin-top:10px;">
      <button class="action-btn primary" id="offline-ok-btn">To work!</button>
    </div>
  `;
  openSheet();
  document.getElementById('offline-ok-btn').addEventListener('click', deselectAll);
}
function restoreVillager(vd){
  const speedBonus = (vd.trait && vd.trait.id==='swift') ? 0.26 : 0;
  G.villagers.push({
    id:'v'+Math.random().toString(36).slice(2,9),
    name:vd.name, trait:vd.trait||rollTrait(), role:vd.role, state:'idle',
    sick:vd.sick||false, sickTimer:0, morale:vd.morale!==undefined?vd.morale:65, partner:vd.partner||null, parents:vd.parents||null,
    relations:vd.relations||[], memories:vd.memories||[],
    age: vd.age!==undefined?vd.age:2, stage: vd.stage||'adult', lifespan: vd.lifespan||LIFESPAN_BASE, skills: vd.skills||{},
    gx:vd.gx, gy:vd.gy, idleGX:vd.gx, idleGY:vd.gy,
    tx:0, ty:0, targetTile:null, targetBuilding:null, carrying:null,
    hunger:vd.hunger, fatigue:vd.fatigue,
    workTimer:0, eatTimer:0, sleepTimer:0, idleCooldown:0,
    bobPhase:Math.random()*10, speed:1.3+Math.random()*0.15+speedBonus, facing:1,
    path:[], pathTarget:null,
  });
}
function restoreState(data){
  /* Plain fields first, straight from the declaration in state.ts. Anything
     the save predates arrives at its declared default rather than undefined. */
  loadSavedFields(data);
  gameModeId = data.gameModeId||'settler';
  gameMode = GAME_MODES[gameModeId] || GAME_MODES.settler;
  setForceWinter(!!gameMode.forceWinter);
  applyPatronBanners();
  if(data.ui && data.ui.mmBig) document.getElementById('minimap-wrap').classList.add('mm-big');
  // Restore the map at ITS OWN saved size — the save may be from a Small (26)
  // or Large (46) map while the module default is 36. Deriving G.MAP_SIZE from
  // the saved G.grid prevents out-of-bounds reads / truncated restores.
  if(data.grid && data.grid.length){
    G.MAP_SIZE = data.grid.length;
    G.TC_X = (data.tcX !== undefined) ? data.tcX : Math.floor(G.MAP_SIZE/2)-1;
    G.TC_Y = (data.tcY !== undefined) ? data.tcY : Math.floor(G.MAP_SIZE/2)-1;
    G.TC_CX = G.TC_X+0.5; G.TC_CY = G.TC_Y+0.5;
  }
  G.grid=[]; G.forestTiles=[]; G.stoneTiles=[]; G.waterTiles=[]; G.wildsTiles=[];
  for(let y=0;y<G.MAP_SIZE;y++){
    const row=[];
    for(let x=0;x<G.MAP_SIZE;x++){
      const s = data.grid[y][x];
      const t = {gx:x,gy:y,type:s.type,resourceAmount:s.resourceAmount,maxResource:s.maxResource,baseMax:(s.baseMax!==undefined?s.baseMax:(s.type==='forest'?(s.maxResource||6):s.maxResource)),workers:0,regrowAt:s.regrowAt,building:null,wilds:s.wilds,ford:s.ford||false};
      row.push(t);
      if(t.type==='forest') G.forestTiles.push(t);
      else if(t.type==='stone') G.stoneTiles.push(t);
      else if(t.type==='water') G.waterTiles.push(t);
      if(t.wilds) G.wildsTiles.push(t);
    }
    G.grid.push(row);
  }
  G.buildings=[];
  for(const bd of data.buildings){ const nb = addBuilding(bd.type,bd.gx,bd.gy); if(nb){ nb.condition = bd.condition!==undefined ? bd.condition : 100; if(bd.herd!==undefined) nb.herd = bd.herd; } }
  G.villagers=[];
  for(const vd of data.villagers) restoreVillager(vd);
  // Seed friendship/rivalry moments so restored relationships don't re-toast on load
  seedRelMoments();
}

/* =========================================================================
   INIT / BOOT FLOW
========================================================================= */
const START_RES_PRESETS = {
  lean:{wood:35,stone:10,food:20}, standard:{wood:60,stone:25,food:40}, bountiful:{wood:100,stone:45,food:70}
};

let gameMode = GAME_MODES.settler;
let gameModeId = 'settler';
document.querySelectorAll('.diff-opts[data-group="mode"] button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const d = document.getElementById('mode-desc');
    if(d) d.textContent = GAME_MODES[btn.dataset.val].desc;
  });
});
// Land and Goal pickers describe themselves as you choose, so the trade-offs are
// visible before you commit to a hold rather than discovered ten minutes in.
for(const [group, defs, elId] of [['land', LANDS, 'land-desc'], ['goal', SCENARIOS, 'goal-desc']]){
  document.querySelectorAll(`.diff-opts[data-group="${group}"] button`).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const d = defs[btn.dataset.val];
      const el = document.getElementById(elId);
      if(d && el) el.textContent = d.desc;
    });
  });
}
function readDifficultyConfig(){
  const get = (g)=>document.querySelector(`.diff-opts[data-group="${g}"] .sel`).dataset.val;
  const mapSize = parseInt(get('mapSize'),10);
  const wolfMul = parseFloat(get('wolfMul'));
  const startRes = Object.assign({}, START_RES_PRESETS[get('startRes')]);
  const modeId = get('mode');
  const landId = get('land');
  const goalId = get('goal');
  return { mapSize, wolfMul, startRes, modeId, landId, goalId };
}
document.querySelectorAll('.diff-opts').forEach(group=>{
  group.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      group.querySelectorAll('button').forEach(b=>b.classList.remove('sel'));
      btn.classList.add('sel');
    });
  });
});


/* =========================================================================
   LAND EDITOR — paint your own ground, set where the hold begins, and play it.
   Shares a compact code rather than a server: the map is RLE'd into base64url,
   so a land travels as a string you can paste to a friend.
========================================================================= */
let editorOn = false, editBrush = 'grass', editSize = 2;

const EDIT_BRUSHES = [
  { id:'grass',  ic:'🟩', label:'Grass' },
  { id:'forest', ic:'🌲', label:'Forest' },
  { id:'stone',  ic:'🪨', label:'Stone' },
  { id:'water',  ic:'💧', label:'Water' },
  { id:'wilds',  ic:'🌿', label:'Wilds' },
  { id:'dirt',   ic:'🟫', label:'Dirt' },
  { id:'tc',     ic:'🏛️', label:'Hold' },
];

/* Give a painted tile the resource values the simulation expects, so a hand-made
   land plays exactly like a generated one. */
function paintAt(gx, gy){
  gx = Math.round(gx); gy = Math.round(gy);
  if(editBrush==='tc'){
    // The hold needs a 2x2 of clear ground, and room to breathe around it.
    const x = clamp(gx, 1, G.MAP_SIZE-3), y = clamp(gy, 1, G.MAP_SIZE-3);
    G.TC_X = x; G.TC_Y = y; G.TC_CX = x+0.5; G.TC_CY = y+0.5;
    for(let yy=y-1; yy<=y+2; yy++) for(let xx=x-1; xx<=x+2; xx++){
      const t = tileAt(xx,yy); if(t){ applyBrushTo(t, (yy>=y&&yy<y+2&&xx>=x&&xx<x+2) ? 'dirt' : 'grass'); }
    }
    return;
  }
  const r = editSize-1;
  for(let dy=-r; dy<=r; dy++) for(let dx=-r; dx<=r; dx++){
    if(Math.abs(dx)+Math.abs(dy) > r) continue;   // round-ish brush
    applyBrushTo(tileAt(gx+dx, gy+dy), editBrush);
  }
}

/* ── SHARE CODES ── RLE over tile codes, then base64url. Built with a loop, not
   String.fromCharCode(...bytes) — spreading a big array blows the stack. */
/* Rebuild the lookup lists the simulation walks every tick. */

/* ── UNDO ── A stroke's worth of ground, kept as one byte per tile. Cheap
   enough (a large map is 2.1KB) to snapshot before every stroke. */
let undoStack = [];
function landSnapshot(){
  const a = new Uint8Array(G.MAP_SIZE*G.MAP_SIZE);
  let i = 0;
  for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<G.MAP_SIZE;x++){
    const t = G.grid[y][x];
    a[i++] = t.wilds ? 5 : (TCODE[t.type] !== undefined ? TCODE[t.type] : 0);
  }
  return { size:G.MAP_SIZE, tx:G.TC_X, ty:G.TC_Y, a };
}
function pushUndo(){
  if(!editorOn) return;
  undoStack.push(landSnapshot());
  if(undoStack.length > 24) undoStack.shift();
  refreshUndoBtn();
}
function undoEdit(){
  const s = undoStack.pop();
  if(!s) return;
  if(s.size !== G.MAP_SIZE){ G.MAP_SIZE = s.size; blankLand(); }
  G.TC_X = s.tx; G.TC_Y = s.ty; G.TC_CX = s.tx+0.5; G.TC_CY = s.ty+0.5;
  let i = 0;
  for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<G.MAP_SIZE;x++){
    const c = s.a[i++];
    applyBrushTo(G.grid[y][x], c===5 ? 'wilds' : (TCODE_R[c]||'grass'));
  }
  reindexTiles(); editorTitle(); refreshUndoBtn();
}
function refreshUndoBtn(){
  const b = document.getElementById('editor-undo');
  if(b) b.disabled = undoStack.length === 0;
}

/* ── EDITOR LIFECYCLE ── */
function blankLand(){
  G.grid = [];
  for(let y=0;y<G.MAP_SIZE;y++){
    const row = [];
    for(let x=0;x<G.MAP_SIZE;x++) row.push({ gx:x, gy:y, type:'grass', resourceAmount:0, maxResource:0, workers:0, regrowAt:0, building:null, wilds:false });
    G.grid.push(row);
  }
  const c = Math.floor(G.MAP_SIZE/2)-1;
  G.TC_X = c; G.TC_Y = c; G.TC_CX = c+0.5; G.TC_CY = c+0.5;
  reindexTiles();
}
function editorTitle(){
  const el = document.getElementById('editor-title');
  if(el) el.textContent = `Land Editor · ${G.MAP_SIZE}² · hold ${G.TC_X},${G.TC_Y}`;
}
function centreOnHold(){
  const c = project(G.TC_CX, G.TC_CY);
  camera.panX = -c.x*camera.scale;
  camera.panY = -c.y*camera.scale + 40;
  clampCamera();
}
function enterEditor(){
  resizeCanvas();
  resetHoldState();      // clears state and reads G.MAP_SIZE from the size picker
  blankLand();
  undoStack = []; refreshUndoBtn();
  editorOn = true;
  document.body.classList.add('editing');
  document.getElementById('editor-ui').classList.remove('hidden');
  document.getElementById('title-overlay').classList.add('hidden');
  preloadSprites(); buildAtlas(); loadTerrainStamps(); loadDecor();
  initCameraZoom();
  camera.scale = ZOOM_MIN;   // start on an overview — you paint the whole land, not one corner
  centreOnHold();
  // The brush panel owns the bottom of the screen — lift the land into what's left.
  camera.panY -= view.h*0.14; clampCamera();
  editorTitle();
  started = true;
  requestAnimationFrame(loop);
}
function exitEditor(){
  // A hard reload is the honest reset: half-built editor state has no business
  // leaking into a real hold.
  location.reload();
}
function playLand(){
  reindexTiles();
  if(!tileAt(G.TC_X, G.TC_Y)){ toast('Place the hold somewhere on the land first.', true); return; }
  editorOn = false;
  document.body.classList.remove('editing');
  document.getElementById('editor-ui').classList.add('hidden');
  started = false;
  G.landId = 'custom';
  claimSlotName();
  // A land you drew yourself is a sandbox — a goal you set the terrain for
  // isn't a goal. Build it however you like, for as long as you like.
  G.scenarioId = 'endless'; G.scenarioWon = false;
  addBuilding('townCenter', G.TC_X, G.TC_Y);
  for(let i=0;i<3;i++) spawnVillager();
  chron('founding');
  finishBoot();
}

/* ── EDITOR UI ── */
(function bindEditor(){
  const brushWrap = document.getElementById('editor-brushes');
  if(!brushWrap) return;
  brushWrap.innerHTML = EDIT_BRUSHES.map(b=>
    `<button data-brush="${b.id}"${b.id===editBrush?' class="sel"':''}><span class="bi">${b.ic}</span>${b.label}</button>`).join('');
  brushWrap.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-brush]'); if(!btn) return;
    editBrush = btn.dataset.brush;
    brushWrap.querySelectorAll('button').forEach(b=>b.classList.remove('sel'));
    btn.classList.add('sel');
  });
  document.querySelectorAll('[data-esize]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      editSize = parseInt(btn.dataset.esize,10)||1;
      document.querySelectorAll('[data-esize]').forEach(b=>b.classList.remove('sel'));
      btn.classList.add('sel');
    });
  });
  document.getElementById('editor-btn').addEventListener('click', ()=>{
    const m = slotMeta[String(currentSlot)];
    if(m && !window.confirm(`Slot ${currentSlot} holds ${m.name || 'a hold'} (day ${m.day}). Playing a land you design will replace it. Continue?`)) return;
    enterEditor();
  });
  document.getElementById('editor-exit').addEventListener('click', exitEditor);
  document.getElementById('editor-clear').addEventListener('click', ()=>{ pushUndo(); blankLand(); editorTitle(); });
  document.getElementById('editor-undo').addEventListener('click', undoEdit);
  document.getElementById('editor-play').addEventListener('click', playLand);
  document.getElementById('editor-share').addEventListener('click', ()=>{
    const code = encodeLand();
    document.getElementById('editor-code').value = code;
    // writeText REJECTS rather than throws when the clipboard is denied, so the
    // fallback has to hang off the promise or it never runs.
    const fallback = ()=>{ const el = document.getElementById('editor-code'); el.focus(); el.select(); toast('Land code ready — copy it from the box.'); };
    try{
      const p = navigator.clipboard && navigator.clipboard.writeText(code);
      if(p && p.then) p.then(()=>toast('Land code copied.'), fallback); else fallback();
    }catch(e){ fallback(); }
  });
  document.getElementById('editor-load').addEventListener('click', ()=>{
    const code = document.getElementById('editor-code').value;
    pushUndo();
    if(decodeLand(code)){ reindexTiles(); initCameraZoom(); centreOnHold(); editorTitle(); drawMinimap(); toast('Land loaded.'); }
    else toast('That land code could not be read.', true);
  });
})();

function finishBoot(){
  preloadSprites();
  buildAtlas();
  loadTerrainStamps();
  loadVillagerAnims();
  loadDecor();
  initCameraZoom();
  try { updateHudReserve(); } catch(e){}
  try { spawnWildlife(); } catch(e){}
  const c = project(G.TC_CX, G.TC_CY);
  camera.panX = -c.x*camera.scale;
  camera.panY = -c.y*camera.scale + 40;
  clampCamera();
  updateHud();
  updateSpeedBtn();
  drawMinimap();
  computeDistricts(false); // seed silently so existing districts aren't re-announced
  recomputeGuilds(false);  // seed silently so existing guilds aren't re-announced
  document.getElementById('title-overlay').classList.add('hidden');
  started = true;
  requestAnimationFrame(loop);
}
/* Everything a fresh hold clears, minus the map generation itself — the land
   editor reuses this so a hand-painted map starts from the same clean slate. */
function resetHoldState(){
  // Read the player's hold identity from the start screen
  const nameEl = document.getElementById('hold-name-input');
  G.holdName = ((nameEl && nameEl.value) || '').trim().slice(0,22) || 'Oakenfall';
  const crestSel = document.querySelector('#crest-picker .sel');
  G.crestChoice = crestSel ? (parseInt(crestSel.dataset.crest,10)||0) : 0;
  // Full state reset
  G.grid=[]; G.forestTiles=[]; G.stoneTiles=[]; G.waterTiles=[]; G.wildsTiles=[];
  G.buildings=[]; G.villagers=[]; G.memorials=[]; G.chronicle=[]; G.deeds={}; G.statHistory=[]; G.festivalBoon=null; G.lastFestivalYear=0; G.tradeRoutes=[]; G.routeOffers=[]; G.climate=null; G.plague=null; G.raiders=[];
  G.worldTime=30; G.dayCount=1; resetRaidTimers(); G.wolfEvents=0;
  spawnTimer=18; G.idleSlotCounter=0; G.usedNames=[];
  G.questsCompleted={}; lastSeenQuestCount=0;
  G.totals={wood:0,stone:0,food:0};
  resetCapWarnings();
  G.researched={}; G.activeResearch=null; resetTier(); setWeather('clear');
  G.coins=0; G.bannerIdx=G.crestChoice; G.onboardDone=false; G.decrees={curfew:false,tithe:false,openGates:false,rationing:false}; decisionTimer=3.2; _lastDecision=''; G.ledger={in:{bounties:0,deeds:0,routes:0,quests:0,tithe:0},out:{shop:0}}; rollDailyBounties();
  applyDifficulty(readDifficultyConfig());
}
/* A fresh hold names its slot after itself. Founding over an old hold replaces
   it outright, so carrying the old name across would just be misleading. */
function claimSlotName(){
  slotMeta[String(currentSlot)] = { name: G.holdName, holdName: G.holdName, day:1, pop:0, savedAt:0 };
  saveSlotIndex();
}
function startNewGame(){
  resizeCanvas();
  resetHoldState();
  claimSlotName();
  genMap(G.landId);
  addBuilding('townCenter', G.TC_X, G.TC_Y);
  for(let i=0;i<3;i++) spawnVillager();
  chron('founding');
  finishBoot();
}
async function continueGame(){
  resizeCanvas();
  const loaded = await loadGame();
  if(!loaded){ startNewGame(); return; }
  const offSum = applyOfflineProgress();
  if(!G.dailyBounties.length) rollDailyBounties();
  finishBoot();
  if(offSum) showOfflineSummary(offSum);
  else toast('Welcome back to Oakenfall.');
}

document.getElementById('begin-btn').addEventListener('click', ()=>{
  // Founding over an occupied slot destroys that hold — ask first.
  const m = slotMeta[String(currentSlot)];
  if(m && !window.confirm(`Slot ${currentSlot} holds ${m.name || 'a hold'} (day ${m.day}). Found a new hold over it?`)) return;
  startNewGame();
});
document.getElementById('continue-btn').addEventListener('click', continueGame);

function slotAgo(ts){
  if(!ts) return '';
  const mins = Math.floor((Date.now()-ts)/60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins/60);
  if(hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs/24)}d ago`;
}
function renderSlots(){
  const wrap = document.getElementById('slot-list');
  if(!wrap) return;
  let html = '';
  for(let n=1;n<=SAVE_SLOTS;n++){
    const m = slotMeta[String(n)];
    const sel = n===currentSlot ? ' sel' : '';
    const name = (m && (m.name || m.holdName)) || `Slot ${n}`;
    const meta = m ? `Day ${m.day} · ${m.pop} settler${m.pop===1?'':'s'} · ${slotAgo(m.savedAt)}` : 'Empty';
    html += `<div class="slot${sel}${m?'':' empty'}" data-slot="${n}">
      <input class="slot-name" data-slot="${n}" value="${String(name).replace(/"/g,'&quot;')}" maxlength="18" spellcheck="false" aria-label="Name for slot ${n}">
      <div class="slot-meta">${meta}</div>
      ${m ? `<button class="slot-del" data-del="${n}" title="Erase this hold" aria-label="Erase slot ${n}">🗑</button>` : ''}
    </div>`;
  }
  wrap.innerHTML = html;
  const occupied = !!slotMeta[String(currentSlot)];
  document.getElementById('continue-btn').classList.toggle('hidden', !occupied);
  document.getElementById('begin-btn').textContent = 'Begin a New Hold';
}
document.getElementById('slot-list').addEventListener('click', async (e)=>{
  const del = e.target.closest('[data-del]');
  if(del){
    const n = parseInt(del.dataset.del,10);
    // Erasing a hold is not undoable — make them mean it.
    if(!window.confirm(`Erase the hold in slot ${n}? This cannot be undone.`)) return;
    await deleteSlot(n); renderSlots(); return;
  }
  // Tapping the name selects the slot too — the name IS the card on a phone,
  // and a card you can see but not pick is just a bug with a border.
  const card = e.target.closest('[data-slot]');
  if(!card) return;
  currentSlot = parseInt(card.dataset.slot,10);
  saveSlotIndex(); renderSlots();
});
document.getElementById('slot-list').addEventListener('change', (e)=>{
  const inp = e.target.closest('.slot-name');
  if(!inp) return;
  const n = String(parseInt(inp.dataset.slot,10));
  const nm = inp.value.trim().slice(0,18) || `Slot ${n}`;
  slotMeta[n] = Object.assign({}, slotMeta[n], { name: nm });
  saveSlotIndex();
});

(async function checkForSave(){
  try{
    await loadUnlocks(); // entitlements are account-level, load them before any game
    await loadSlotIndex();
    await migrateLegacySave();
  } catch(e){ /* no save yet */ }
  renderSlots();
})();

setInterval(()=>{ if(started) saveGame(); }, 90000);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && started) saveGame(); });

})();
