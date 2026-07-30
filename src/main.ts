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
import { techAvailable, startResearch, computeTierIdx, checkTierUp,
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
import { roleNeedScores, seekWork, maybeSwitchTrade, reassignRole } from './work';
import { chron, chronicleAdd } from './chronicle';
import { initSheet, initSheetDrag, sheetWrap, sheetContent, sheetNav, openSheet, closeSheet,
         isSheetOpen, sheetContains, miniBar, statBar } from './sheet';
import { initInput } from './input';
import { initAdminPanel, renderRedeemSheet } from './adminpanel';
import { initDecisions, rollDecision, decisionCountdown, resetDecisionTimer, resetDecisions,
         updateOnboard, updateStatuses } from './decisions';
import { renderVillagerSheet, renderBuildingSheet, renderTileSheet, demolishBuilding,
         bulkAssignIdle } from './inspect';
import { initHoldMenu, FESTIVAL_BOONS, renderHubSheet, renderQuestSheet, renderJournalSheet,
         renderStatsSheet, renderInboxSheet, renderChronicleSheet, openFestivalChoice,
         questsSeen, resetQuestsSeen, researchPanelHtml, bindResearchButtons } from './holdmenu';
import { DECREE_DEFS, decreeRaidMul, decreeHungerMul, decreeWorkMul, decreesInForce,
         renderDecreesSheet } from './decrees';
import { initBuild, buildMode, drawGhost, isValidBuildSpot, enterMoveMode, exitBuildMode,
         exitBuildModeIfActive, renderBuildPalette, openBuildPalette, resetBuildWarnings } from './build';
import { initSelection, selection, clearSelection, deselectAll, selectVillager, selectBuilding,
         selectTile, ensureSelectionVisible, pickAt, isSelected } from './selection';
import { initShop, renderShopSheet } from './shop';
import { initEvents, rollRandomEvent, eventTick, startEvent, clearEvent, isFestivalOn,
         isMerchantHere, eventTradeBonus, eventSpeedBonus } from './events';
import { QUESTS, checkQuests, questsDoneCount, DEED_DEFS, rewardText, grantReward, checkDeeds } from './goals';
import { initHud, toast, eventLog, updateHud, updateDayTint, updateHudReserve } from './hud';
import { initBackdrop, voidBackdrop, drawSea, drawIslandSkirt } from './backdrop';
import { initUnlocks, ADMIN_PROMO, hasUnlock, isPatron, redeemCode, saveUnlocks, loadUnlocks,
         applyPatronBanners, bannerPalette, BANNER_COLORS, bannerColor } from './unlocks';
import { SKILL_TIERS, skillTier, skillMul, gainSkill, hasNearbyMentor,
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
/* Read-only snapshot of the running hold. Top-level declarations in a module do
   not land on window, so this is the only way for the automated tests (and the
   report/diagnostics tooling) to see what the simulation is actually doing.
   Deliberately a copy — nothing here can be used to mutate game state. */
/* Where a map tile lands on screen right now, read-only. The gesture suite has
   to put a finger on a real building, and it cannot do the projection itself —
   that depends on the live camera. */
window.__oakScreenAt = function(gx, gy){
  const p = project(gx, gy);
  return worldToScreen(p.x, p.y);
};
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
    routes: G.tradeRoutes.length, routeOffers: G.routeOffers.length,
    /* Where the player is looking and what they have tapped. The gesture suite
       has nothing else to assert against — a pan or a pinch leaves no trace in
       the world, only in the camera. */
    zoom: Math.round(camera.scale*1000)/1000,
    pan: { x: Math.round(camera.panX), y: Math.round(camera.panY) },
    selected: selection.type,
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
let eventTimer = 140; // world-seconds until the next random event roll

// Ring buffer of recent errors — auto-attached to bug reports
// Trader's ledger — cumulative coin flow by category, for the economy view.
/* ── AMBIENT LIFE ── idle & young citizens don't just stand there: they gather
   at the hearth after dark, seek warmth in winter, drift toward friends, and
   the children play. Only steers idle wander targets + a mood bubble — never
   overrides assigned work. */


let journalTimer = 1;

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


function update(rawDt){
  const dt = Math.min(rawDt, 0.08) * speedMode;
  if(dt<=0) return;
  const prevSeason = seasonIndex();
  const prevCycle = Math.floor(G.worldTime/CYCLE_LEN);
  G.worldTime += dt;
  const newCycle = Math.floor(G.worldTime/CYCLE_LEN);
  if(newCycle>prevCycle){ G.dayCount++; rollWeather(); rollClimate(); rollPlague(); rollDailyBounties(); captureStatSnapshot(); processTradeRoutes();
    if(G.decrees.tithe){ const t = Math.max(1, Math.round(G.villagers.length*0.8)); G.coins += t; logCoinIn('tithe', t); }
    if(decisionCountdown(1) && G.dayCount>3){ resetDecisionTimer(); rollDecision(); }
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

  eventTick();

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
initFeedback({ gameModeId: ()=>gameModeId });
initAdminPanel({ spawnVillager, saveIfRunning: ()=>{ if(started) saveGame(); } });
initDecisions({ banditsEnabled: ()=>gameMode.banditsEnabled!==false, spawnVillager });
initHoldMenu({ renderVillager: renderVillagerSheet, exportHoldCard });
initBuild({ ctx, bulkAssignIdle: ()=>bulkAssignIdle() });
initInput({ canvas, editing: ()=>editorOn, beginStroke: pushUndo,
  paintTile: (gx,gy)=>{ paintAt(gx,gy); if(editBrush==='tc') editorTitle(); } });
initSelection({ renderVillager: renderVillagerSheet, renderBuilding: renderBuildingSheet,
  renderTile: renderTileSheet, exitBuildMode: exitBuildModeIfActive });
initShop({ reopenShop: ()=>renderHubSheet('shop') });
initEvents({ merchantOften: ()=>!!gameMode.merchantOften, tradeMul: ()=>gameMode.tradeMul||1 });
initSheet({ deselectAll: ()=>deselectAll() });
initSheetDrag();
initUnlocks({ saveIfRunning: ()=>{ if(started) saveGame(); } });
initHud({ gameModeId: ()=>gameModeId,
  questProgress: ()=>({ done: questsDoneCount(), seen: questsSeen() }) });
initFX({ ctx });
initBackdrop({ ctx });
initScenery({ ctx, windAt });
initLighting({ ctx, canvas });
initVillagerRender({ ctx });
initBuildingRender({ ctx, windAt, drawRoad });
initTerrain({ ctx });

initCritters({ ctx });

initWeather({ forceWinter: ()=>!!gameMode.forceWinter });
initBuildings({ decayMul: ()=>gameMode.decayMul,
  onRemoved: (b)=>{ if(selection && selection.ref===b) deselectAll(); } });
initContracts({ bountyCoinMul: ()=>(gameMode.bountyCoinMul||1) });
initRaiders({ raidsEnabled: ()=>gameMode.banditsEnabled!==false,
  decreeRaidMul });
initFire({ hazardsEnabled: ()=>gameMode.banditsEnabled!==false,
  decayMul: ()=>(gameMode.decayMul||1) });
initEconomy({ decayMul: ()=>(gameMode && gameMode.decayMul!==undefined) ? gameMode.decayMul : 1 });
initSteward({ startResearch, demolishBuilding });
initVillagers({ decreeHungerMul, decreeWorkMul,
  eventSpeedBonus, festivalOn: isFestivalOn });
/* Lives needs one thing back: when a settler passes, whatever the UI was
   holding them open for has to let go. */
initLives({ popCapacity, spawnVillager, buildingCenter,
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
  if(isMerchantHere()){
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
document.getElementById('quest-btn').addEventListener('click', ()=>{
  exitBuildModeIfActive(); clearSelection();
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
  exitBuildModeIfActive(); clearSelection();
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
   SELECTION / SHEET UI
========================================================================= */
const buildFab = document.getElementById('build-fab');

// If the freshly-opened sheet (or the HUD) covers the selection, pan the
// camera just enough to bring it back into the uncovered part of the screen.
document.getElementById('sheet-close').addEventListener('click', ()=>{
  deselectAll();
});


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
document.getElementById('shop-pill').addEventListener('click', ()=>{ exitBuildModeIfActive(); clearSelection(); renderHubSheet('shop'); });
buildFab.addEventListener('click', ()=>{
  if(buildMode.active){ deselectAll(); return; }
  openBuildPalette();
});

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
  clearSelection();
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
  G.questsCompleted={}; resetQuestsSeen();
  G.totals={wood:0,stone:0,food:0};
  resetCapWarnings(); resetBuildWarnings(); clearEvent();
  G.researched={}; G.activeResearch=null; resetTier(); setWeather('clear');
  G.coins=0; G.bannerIdx=G.crestChoice; G.onboardDone=false; G.decrees={curfew:false,tithe:false,openGates:false,rationing:false}; resetDecisions(); G.ledger={in:{bounties:0,deeds:0,routes:0,quests:0,tithe:0},out:{shop:0}}; rollDailyBounties();
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
