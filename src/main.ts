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
import { LANDS, BUILD_DEFS, ROLE_DEFS, TECH_TREE, HOLD_TIERS, SEASON_NAMES, WEATHER_TABLE, MM_COLORS, VILLAGER_TINTS, RAIDER_VARIANTS, NUM_WORDS, UNLOCK_SKUS, GAME_MODES } from './defs';

import { TILE_W, TILE_H, clamp, lerp, dist2, hash2, hashStr, project, inProject, fmt } from './math';
import {
  initIsoKit, setKitTime, setSunShadow,
  shade, shadeColor, tileDiamond, roundRect,
  isoBox, isoRoof, plankLines, stoneCourses,
  glowWindow, doorArch, chimneySmoke, drawShadow, tintedFrame,
} from './isokit';
import { installStorage, isNative } from './storage';
import { G, saveFields, loadSavedFields, assertSaveCoverage } from './state';
import { DAY_LEN, NIGHT_LEN, CYCLE_LEN, SEASON_LEN, setForceWinter, seasonIndex, seasonName,
  seasonYieldMul, seasonFatigueMul, riverFrozen, dayPhaseFrac, isNight, darknessFactor, sunShadow } from './time';

/** The iso kit cannot import a mutable, so the sun is pushed into it. */
function updateSunShadows(){ setSunShadow(...sunShadow()); }
import { tileAt, genMap, reindexTiles } from './mapgen';
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

const SPRITES = {};
let spritesLoaded = 0, spritesTotal = 0;
function preloadSprites(){
  const entries = Object.entries(SPRITE_URLS);
  spritesTotal = entries.length;
  for(const [key, url] of entries){
    loadSprite(key, url, 0);
  }
}
function loadSprite(key, url, attempt){
  const img = new Image();
  // IMPORTANT: do NOT set img.crossOrigin here. This game only ever calls
  // ctx.drawImage() to display sprites — it never reads pixel data back via
  // getImageData/toDataURL — so CORS is unnecessary. Requesting anonymous CORS
  // without the CDN sending Access-Control-Allow-Origin makes the browser
  // refuse the image entirely (onerror fires for every sprite), which silently
  // forces every building back to its canvas fallback art. Loading without
  // crossOrigin always succeeds for display purposes.
  img.onload  = ()=>{ SPRITES[key]=img; spritesLoaded++; };
  img.onerror = ()=>{
    if(attempt<2){
      // Transient network hiccups happen — retry once before giving up.
      setTimeout(()=>loadSprite(key,url,attempt+1), 600*(attempt+1));
    } else {
      spritesLoaded++;
      console.warn('Oakenfall: sprite failed to load after retries, using canvas fallback:', key);
    }
  };
  img.src = url;
}
// Scale factors for each building type (world-pixel width of sprite)

/* ── ANIMATED VILLAGERS ── Tiny Swords Pawn frames (graded), loaded at boot.
   Frame sheets keyed by animation; drawVillager picks by state+role. */
// Asset URLs (files, not inlined base64) — bundled locally, cached by the
// service worker, so offline play is unaffected. Procedural fallbacks still
// cover a failed or slow load.

const VANIM = {};
let vanimReady = false;
function loadVillagerAnims(){
  let pending = 0;
  for(const [key, list] of Object.entries(VANIM_B64)){
    VANIM[key] = [];
    for(let i=0;i<list.length;i++){
      const img = new Image(); pending++;
      img.onload = ()=>{ if(--pending===0) vanimReady = true; };
      img.onerror = ()=>{ if(--pending===0) vanimReady = Object.keys(VANIM).length>0; };
      img.src = list[i];
      VANIM[key].push(img);
    }
  }
}
function villagerAnimFor(v){
  if(!vanimReady) return null;
  const moving = ['walkingToResource','walkingToDropoff','walkingToFarm','seekingFood','seekingSleep'].includes(v.state);
  if(v.role==='guard'){
    // Guards are soldiers — Lancer sprites, standing vigil or marching to post
    if(moving && VANIM.guard_run) return VANIM.guard_run;
    return VANIM.guard_idle || VANIM.idle;
  }
  if(v.state==='working' || v.state==='farming'){
    if(v.role==='lumberjack') return VANIM.work_axe;
    if(v.role==='miner') return VANIM.work_pickaxe;
    return VANIM.work_knife; // farmer / fisher / hunter share the harvest anim
  }
  if(moving){
    if(v.carrying==='wood') return VANIM.run_wood;
    if(v.carrying==='food' && v.role==='hunter' && VANIM.run_meat) return VANIM.run_meat;
    return VANIM.run;
  }
  return VANIM.idle;
}

const SPRITE_SCALE = {
  townCenter:150, house:74, manor:96, guardPost:84, bakery:82, forestCamp:82, miningPost:82, fishingHut:80,
  huntingCabin:82, farm:90, granary:84, tradingPost:88, watchtower:78, tavern:86, sawmill:90, windmill:84,
  palisade:78, well:60, lampPost:26, pasture:94, forester:90, bridge:80,
  deer:34, boar:30, rabbit:18, fox:26, duck:20, sheep:26,
  villager_idle:40, villager_lumberjack:40, villager_miner:40,
  villager_farmer:40, villager_fisher:40, villager_hunter:40,
  tree_pine:72, rock_outcrop:62,
};
// Per-type vertical anchor: how far the sprite's bottom edge sits below the
// tile's front vertex (baseY). The small Tiny Swords icons were tuned to +12;
// full isometric building sprites (AI-generated) have their base at the very
// bottom of the frame and need to sit lower so the footing meets the ground.
const SPRITE_ANCHOR_Y = { house: 24, tavern: 24, sawmill: 24, windmill: 26, bakery: 24, granary: 24, tradingPost: 24, watchtower: 28,
  forestCamp: 22, miningPost: 22, palisade: 20, well: 20, lampPost: 10, pasture: 26, forester: 26, bridge: 22 };
function blitSprite(type, cx, baseY){
  const img = SPRITES[type];
  if(!img || !img.complete || img.naturalWidth===0) return false;
  try {
    const w = SPRITE_SCALE[type]||80;
    const h = w * (img.naturalHeight/img.naturalWidth);
    const anchor = SPRITE_ANCHOR_Y[type] !== undefined ? SPRITE_ANCHOR_Y[type] : 12;
    ctx.drawImage(img, cx - w/2, baseY - h + anchor, w, h);
    return true;
  } catch(e){
    delete SPRITES[type]; // prevent repeated taint errors
    return false;
  }
}

let wolfRiskMul = 1;
// GAME_MODES now arrives as a module import, so it is initialised before any of
// this file runs — the old ordering hazard (it used to be declared far below,
// making a boot-time call throw) no longer exists.
// Historic note: references GAME_MODES/gameMode declared later in the script. Safe because
// this is only ever called from user-gesture handlers (New Game / Continue), which
// run after full script evaluation. Do NOT call this at top level during boot.
function applyDifficulty(cfg){
  gameModeId = cfg.modeId || 'settler';
  gameMode = GAME_MODES[gameModeId] || GAME_MODES.settler;
  setForceWinter(!!gameMode.forceWinter);
  if(gameModeId==='merchant'){ cfg.startRes.food = (cfg.startRes.food||0)+10; }
  G.MAP_SIZE = cfg.mapSize;
  G.TC_X = Math.floor(G.MAP_SIZE/2)-1; G.TC_Y = Math.floor(G.MAP_SIZE/2)-1;
  G.TC_CX = G.TC_X+0.5; G.TC_CY = G.TC_Y+0.5;
  wolfRiskMul = cfg.wolfMul * gameMode.wolfMul;
  G.stockpile = Object.assign({}, cfg.startRes);
  G.landId = cfg.landId || 'valley';
  G.scenarioId = cfg.goalId || 'endless';
  G.scenarioWon = false;
}

const HUNGER_RATE = 100/340;   // per second — ~5.7 min to starve at 1× speed
const FATIGUE_RATE = 100/400;  // per second (base, day) — ~6.7 min to exhaust




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
function findTC(){ return G.buildings.find(b=>b.type==='townCenter') || null; }
const BASE_CAP = { wood:200, stone:160, food:180, planks:80, flour:60, bread:60 };
function capFor(type){
  let cap = BASE_CAP[type];
  for(const b of G.buildings) if(b.type==='granary' && (b.condition===undefined||b.condition>=35)) cap += 90;
  if(typeof G.researched!=='undefined' && G.researched.cellars) cap += 60; // Deep Cellars
  return cap;
}
// Safe amount of raw food that won't spoil: a small pantry baseline plus each
// Granary and the Deep Cellars research. Food above this slowly spoils.
function foodSafeCap(){
  let safe = 45;
  for(const b of G.buildings) if(b.type==='granary' && (b.condition===undefined||b.condition>=35)) safe += 70;
  if(typeof G.researched!=='undefined' && G.researched.cellars) safe += 50;
  return safe;
}
let _spoilAcc = 0, _spoilDay = 0;
function foodSpoilTick(dt){
  const mul = (gameMode && gameMode.decayMul!==undefined) ? gameMode.decayMul : 1;
  if(mul<=0) return; // Peaceful: nothing spoils
  const excess = (G.stockpile.food||0) - foodSafeCap();
  if(excess <= 0) return;
  const lost = excess * (0.14/CYCLE_LEN) * mul * dt * (G.researched.coldstore?0.5:1); // ~14%/day of the excess
  G.stockpile.food = Math.max(0, G.stockpile.food - lost);
  _spoilAcc += lost;
  // Nudge the player about once a day if spoilage is adding up.
  if(G.dayCount!==_spoilDay && _spoilAcc >= 5){
    _spoilDay = G.dayCount;
    toast('🐀 '+Math.round(_spoilAcc)+' food has spoiled for want of storage — raise a Granary.', true);
    _spoilAcc = 0;
  }
}
function gainResource(type, amount){
  const cap = capFor(type);
  const before = G.stockpile[type];
  G.stockpile[type] = clamp(G.stockpile[type]+amount, 0, cap);
  const actuallyGained = G.stockpile[type]-before;
  if(actuallyGained>0){
    G.totals[type] = (G.totals[type]||0) + actuallyGained;   // planks/flour/bread were NaN before
    if(typeof G.dailyProgress==='object' && G.dailyProgress[type]!==undefined) G.dailyProgress[type] += actuallyGained;
  }
  if(G.stockpile[type]>=cap && amount>0){
    if(!window.__capWarned[type]){ window.__capWarned[type]=true; toast((type[0].toUpperCase()+type.slice(1))+' storage is full! Build a Granary.', true); }
  } else if(window.__capWarned){
    window.__capWarned[type]=false;
  }
  return actuallyGained;
}
window.__capWarned = {wood:false,stone:false,food:false,planks:false,flour:false,bread:false};



let speedMode = 1; // 1, 2, 0(paused)
let spawnTimer = 18;
let wolfTimer = 60;
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
              done:()=>currentTierIdx>=3, progress:()=>HOLD_TIERS[currentTierIdx].name+' → Town' },
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
        <span>${HOLD_TIERS[currentTierIdx].ic} ${HOLD_TIERS[currentTierIdx].name}</span>
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
function harvestBoonMul(){ return G.festivalBoon==='harvest' ? 1.2 : 1; }
/* ── UNLOCKS / REDEEM ── cosmetic packs bought on the website redeem here via
   a signed code, verified OFFLINE against this embedded public key (the game
   never makes a network request). The private signing key lives only in the
   website's Netlify function — codes cannot be forged from this public key. */
const REDEEM_PUBKEY_SPKI = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAERa+HGQmoarIV601nzvFQOQDNa9nAJDdY8ZOSjedDrMTvfEDGKFlzBIUNc6RTQl/qMlRAXzxeW5F9mhLFTo6auQ==';

function hasUnlock(sku){ return !!G.unlocks[sku]; }
function isPatron(){ return !!G.unlocks.supporter; }
let _redeemKeyPromise = null;
function redeemPubKey(){
  if(!_redeemKeyPromise){
    const raw = Uint8Array.from(atob(REDEEM_PUBKEY_SPKI), c=>c.charCodeAt(0));
    _redeemKeyPromise = crypto.subtle.importKey('spki', raw, {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']);
  }
  return _redeemKeyPromise;
}
function _b64uToBytes(s){
  s = String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='=';
  return Uint8Array.from(atob(s), c=>c.charCodeAt(0));
}
// Verify a "payload.signature" code offline. Returns {ok, sku, name} | {ok:false, reason}.
// Promo code that unlocks the hidden developer/admin panel from the Redeem sheet.
const ADMIN_PROMO = 'Joy904';
async function redeemCode(codeStr){
  try {
    const parts = String(codeStr||'').trim().split('.');
    if(parts.length!==2) return {ok:false, reason:'That doesn\'t look like an Oakenfall code.'};
    const payloadBytes = _b64uToBytes(parts[0]);
    const sigBytes = _b64uToBytes(parts[1]);
    const key = await redeemPubKey();
    const ok = await crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, key, sigBytes, payloadBytes);
    if(!ok) return {ok:false, reason:'This code could not be verified.'};
    const data = JSON.parse(new TextDecoder().decode(payloadBytes));
    const sku = data.s;
    if(!UNLOCK_SKUS[sku]) return {ok:false, reason:'This code is for content this version doesn\'t know.'};
    const already = !!G.unlocks[sku];
    G.unlocks[sku] = true;
    applyPatronBanners();
    if(data.n) G.unlocks._patronName = String(data.n).slice(0,24);
    saveUnlocks();
    if(typeof started!=='undefined' && started) saveGame && saveGame();
    return {ok:true, sku, name:UNLOCK_SKUS[sku].name, already};
  } catch(e){ return {ok:false, reason:'Something went wrong reading that code.'}; }
}
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
const ADMIN = { freezeNeeds:false, noRaids:false, debug:false };

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
    season: seasonName(), weather: weather.type,
    villagers: G.villagers.length, roles,
    states: (()=>{ const c={}; for(const v of G.villagers) c[v.state]=(c[v.state]||0)+1; return c; })(),
    /* Claimed work slots vs settlers actually holding one. A gap means tiles
       were claimed and never released, which slowly starves the hold of places
       to work. */
    claims: (()=>{ let n=0; for(const row of G.grid) for(const t of row) n += (t.workers||0); return n; })(),
    /* The frame loop catches exceptions so one bad frame can't kill the game.
       That is right, but it means a fault can run for months in silence — see
       findTC. Anything in here is a real error the game swallowed. */
    errors: errorLog.map(e=>e.kind+': '+e.msg.slice(0,90)),
    claimants: G.villagers.filter(v=>v.targetTile).length,
    buildings: G.buildings.filter(b=>b.type!=='road').map(b=>b.type),
    placements: G.buildings.filter(b=>b.type!=='road').map(b=>({t:b.type, gx:b.gx, gy:b.gy})),
    worn: G.buildings.filter(b=>b.condition!==undefined && b.condition<70).length,
    onFire: G.buildings.filter(b=>b._fire>0).length,
    activeResearch: G.activeResearch ? G.activeResearch.id : null,
    researchedCount: Object.keys(G.researched).filter(k=>G.researched[k]).length,
    orders: stewardOrders.map(o=>o.kind),
    stockpile: Object.assign({}, G.stockpile),
    coins: G.coins, tier: currentTierIdx,
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
window.__oakGrid = function(){
  return G.grid.map(row=>row.map(t=> t.wilds ? 'w' : t.type.charAt(0)));
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
    case 'cosmetics': Object.keys(UNLOCK_SKUS).forEach(s=>{ G.unlocks[s]=true; }); applyPatronBanners && applyPatronBanners(); saveUnlocks(); toast('🛠️ All cosmetic packs unlocked.'); break;
    // ── Population ──
    case 'settlers': for(let i=0;i<5;i++) spawnVillager(); toast('🛠️ +5 settlers summoned.'); break;
    case 'settler1': spawnVillager(); toast('🛠️ A settler joins.'); break;
    case 'morale': G.villagers.forEach(v=>{ v.morale = 100; }); toast('🛠️ Every settler is content.'); break;
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
    ${sect('👥 Population', [['settler1','🚶 Summon 1 settler'],['settlers','👥 Summon 5 settlers'],['morale','😊 All morale to 100'],['heal','❤️ Heal, feed & rest all']])}
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
function raidEntryPoint(openBridges){
  if(openBridges && openBridges.length){ const b=openBridges[Math.floor(Math.random()*openBridges.length)]; return {gx:b.gx, gy:b.gy}; }
  // else nearest map edge to a random side
  const side = Math.floor(Math.random()*4);
  const m = G.MAP_SIZE-1;
  if(side===0) return {gx:Math.random()*m, gy:0};
  if(side===1) return {gx:Math.random()*m, gy:m};
  if(side===2) return {gx:0, gy:Math.random()*m};
  return {gx:m, gy:Math.random()*m};
}

function launchRaid(n, didSteal, entry){
  for(let i=0;i<n;i++){
    G.raiders.push({ gx:clamp(entry.gx+(Math.random()-0.5)*2,0,G.MAP_SIZE-1), gy:clamp(entry.gy+(Math.random()-0.5)*2,0,G.MAP_SIZE-1),
      state:'advance', didSteal, phase:Math.random()*6, spd:1.5+Math.random()*0.6, facing:1, life:34, _flee:null,
      variant: RAIDER_VARIANTS[Math.floor(Math.random()*RAIDER_VARIANTS.length)] });
  }
}
function raiderTick(dt){
  if(!G.raiders.length) return;
  const tc = { gx:G.TC_CX, gy:G.TC_CY+1 };
  for(const r of G.raiders.slice()){
    r.phase += dt*7; r.life -= dt;
    if(r.life<=0){ G.raiders.splice(G.raiders.indexOf(r),1); continue; }
    const tgt = r.state==='advance' ? tc : r._flee;
    if(!tgt){ G.raiders.splice(G.raiders.indexOf(r),1); continue; }
    const dx=tgt.gx-r.gx, dy=tgt.gy-r.gy, d=Math.hypot(dx,dy)||0.001;
    if(r.state==='advance'){
      const guard = G.villagers.find(v=>v.role==='guard' && !v.sick && v.stage!=='child' && dist2(v.gx,v.gy,r.gx,r.gy)<4.5);
      const reach = r.didSteal ? 1.5 : 3.6; // thieves reach the stores; the rest are turned back short of it
      if(guard || d < reach){
        try{ spawnBoom(r.gx, r.gy); }catch(e){}
        r.state='flee';
        r._flee = { gx: r.gx + (r.gx<G.MAP_SIZE/2?-7:7), gy: r.gy + (r.gy<G.MAP_SIZE/2?-7:7) };
        continue;
      }
    } else if(d < 0.6){ G.raiders.splice(G.raiders.indexOf(r),1); continue; }
    r.gx += (dx/d)*r.spd*dt; r.gy += (dy/d)*r.spd*dt;
    r.facing = dx<0?-1:1;
  }
}
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
  const fimg = decorImg('fire', G.worldTime*9 + r.gx);
  if(fimg && fimg.complete && fimg.naturalWidth>0){ const w=9,h=w*(fimg.naturalHeight/fimg.naturalWidth); try{ ctx.drawImage(fimg, tx-w/2, cy-16-h, w, h); }catch(e){} }
  else { ctx.fillStyle='#e8782c'; ctx.beginPath(); ctx.ellipse(tx, cy-17, 3, 5, 0, 0, 7); ctx.fill(); }
  ctx.restore();
}
/* ── AMBIENT WILDLIFE ── deer roam the wilds and bolt from folk; birds drift
   the sky. Purely atmospheric — not saved, respawned each session. */
/* Each kind keeps its own temperament: how far it lets you approach, how hard it
   bolts, and how restless it is when left alone. Boar stand their ground far
   longer than deer; rabbits spook at almost anything. */
/* ── FORESTER'S GROVE ── replants tired and barren forest near each grove, so
   timber stays sustainable if you invest in the land. */
let _foresterTimer = 0;
function foresterTick(dt){
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
    cond:()=>currentTierIdx>=1 && (G.stockpile.food||0)>=25 && (gameMode.banditsEnabled!==false),
    choices:[
      {label:'Pay the tribute', outcome:'They take the food and melt back into the trees.', run:()=>{ G.stockpile.food-=25; changeMorale(-2); }},
      {label:'Refuse them', outcome:'You bar the gate. The folk stand a little taller — but a raid may come.', run:()=>{ changeMorale(3); banditTimer=Math.min(banditTimer,25); }},
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
/* ── WEATHER ── rolled each dawn, season-weighted */
let weather = { type:'clear', label:'Clear', ic:'☀️' };

const WEATHER_DEFS = [{type:'clear',label:'Clear',ic:'☀️'},{type:'rain',label:'Rain',ic:'🌧️'},{type:'storm',label:'Storm',ic:'⛈️'},{type:'snow',label:'Snowfall',ic:'🌨️'}];
function setWeather(type){ const d = WEATHER_DEFS.find(x=>x.type===type); if(d){ weather = { type:d.type, label:d.label, ic:d.ic }; } }
function rollWeather(){
  const w = WEATHER_TABLE[seasonIndex()];
  const r = Math.random();
  let acc=0, pick=0;
  for(let i=0;i<4;i++){ acc+=w[i]; if(r<acc){ pick=i; break; } }
  const defs=[{type:'clear',label:'Clear',ic:'☀️'},{type:'rain',label:'Rain',ic:'🌧️'},{type:'storm',label:'Storm',ic:'⛈️'},{type:'snow',label:'Snowfall',ic:'🌨️'}];
  const prev = weather.type;
  weather = defs[pick];
  if(weather.type!=='clear' && weather.type!==prev){
    const msgs={rain:'🌧️ Rain sweeps in — crops drink deep, boots drag in the mud.',storm:'⛈️ A storm batters the hold — stay near shelter!',snow:'🌨️ Snow falls softly over Oakenfall.'};
    toast(msgs[weather.type]);
  }
}
/* ── CLIMATE SPELLS ── multi-day conditions layered over daily weather, with
   real bite: droughts, cold snaps, and fair spells. Announced and temporary. */
const CLIMATE_DEFS = {
  drought:  {ic:'🏜️', name:'Drought',    farm:22.6,  fire:1.8, hunger:1.0, fatigue:1.0, morale:-4, seasons:[1,2]},
  coldsnap: {ic:'🥶', name:'Cold Snap',   farm:0.8,  fire:0.4, hunger:1.25,fatigue:1.2, morale:-4, seasons:[2,3]},
  fair:     {ic:'🌤️', name:'Fair Spell',  farm:1.2,  fire:0.8, hunger:1.0, fatigue:0.9, morale:5,  seasons:[0,1,2]},
};
function rollClimate(){
  if(G.climate){ if(G.dayCount>=G.climate.endsDay){ toast(G.climate.ic+' The '+CLIMATE_DEFS[G.climate.type].name.toLowerCase()+' has broken.'); G.climate=null; } return; }
  if(gameMode.forceWinter) return; // Iron Winter is its own climate
  if(G.dayCount<=3 || Math.random()>0.16) return; // uncommon
  const s = seasonIndex();
  const options = Object.keys(CLIMATE_DEFS).filter(k=>CLIMATE_DEFS[k].seasons.includes(s));
  if(!options.length) return;
  const type = options[Math.floor(Math.random()*options.length)];
  const d = CLIMATE_DEFS[type];
  G.climate = { type, ic:d.ic, name:d.name, endsDay: G.dayCount + 2 + Math.floor(Math.random()*2) };
  const blurb = {
    drought:'🏜️ A drought settles over the valley — fields wither and timber turns tinder-dry. Mind the fire.',
    coldsnap:'🥶 A cold snap grips the hold — folk burn through food and tire fast. Keep the stores full.',
    fair:'🌤️ A spell of fair weather blesses the valley — crops thrive and hearts lift.',
  }[type];
  toast(blurb, type!=='fair');
  if(typeof chron==='function') chron('climate', d.name);
}
/* ── DISASTER: BLIGHT ── a disease outbreak. Several settlers fall ill at once,
   and it spreads between those standing close while it lasts. Herbal Lore
   softens it; a Healer (shop/event) clears the currently sick. */
function rollPlague(){
  if(G.plague){
    if(G.dayCount>=G.plague.endsDay){ G.plague=null; toast('🌿 The sickness has run its course — the hold breathes easier.'); }
    return;
  }
  if(G.dayCount<=4 || G.villagers.length<5) return;
  if(Math.random() > 0.09) return; // rare
  G.plague = { endsDay: G.dayCount + 2 + Math.floor(Math.random()*2) };
  const frac = G.researched.herbs ? 0.18 : 0.32;
  const healthy = G.villagers.filter(v=>!v.sick && v.stage!=='child');
  const target = Math.max(1, Math.round(healthy.length*frac));
  let n=0;
  for(let i=0;i<target && healthy.length;i++){
    const v = healthy.splice(Math.floor(Math.random()*healthy.length),1)[0];
    v.sick=true; v.sickTimer=(25+Math.random()*20)*(G.researched.herbs?0.6:1); n++;
  }
  toast('🤢 A blight sweeps the hold — '+n+' settler'+(n>1?'s':'')+' have fallen ill! Seek a healer, and keep the sick from crowding.', true);
  if(typeof sfx==='function') sfx('blight');
  if(typeof chron==='function') chron('plague');
}
function plagueTick(dt){
  if(!G.plague) return;
  const sick = G.villagers.filter(v=>v.sick);
  if(!sick.length) return;
  const spread = (G.researched.herbs ? 0.02 : 0.05) * dt;
  for(const v of G.villagers){
    if(v.sick || v.stage==='child') continue;
    for(const s of sick){
      if(dist2(v.gx,v.gy,s.gx,s.gy) < 4){
        if(Math.random() < spread){ v.sick=true; v.sickTimer=(25+Math.random()*20)*(G.researched.herbs?0.6:1); }
        break;
      }
    }
  }
}
function climateFarmMul(){ return G.climate ? CLIMATE_DEFS[G.climate.type].farm : 1; }
function climateFireMul(){ return G.climate ? CLIMATE_DEFS[G.climate.type].fire : 1; }
function climateHungerMul(){ return G.climate ? CLIMATE_DEFS[G.climate.type].hunger : 1; }
function climateFatigueMul(){ return G.climate ? CLIMATE_DEFS[G.climate.type].fatigue : 1; }
function weatherMoveMul(){ return weather.type==='storm' ? 0.8 : (weather.type==='rain' ? 0.9 : 1); }
function weatherFarmMul(){ return (weather.type==='rain' ? 1.25 : 1) * climateFarmMul(); }
function weatherFatigueMul(){ return weather.type==='storm' ? 1.2 : 1; }

let eventTimer = 140; // world-seconds until the next random event roll
let fireTimer = 340 + Math.random()*260; // world-seconds until the next fire roll
let banditTimer = 200;

/* ── VERSION & FEEDBACK SYSTEM ── */
const GAME_VERSION = '1.81.0';
// Set to your GitHub repo URL (e.g. 'https://github.com/you/oakenfall') — used
// only as a fallback link if the auto-file backend is unreachable. Reports now
// POST to FEEDBACK_ENDPOINT, a Netlify function that files the GitHub issue
// server-side so players never need a GitHub account. Empty REPO_URL = plain
// copy-to-clipboard fallback.
const REPO_URL = 'https://github.com/OfficialSyntaxx/oakenfall';
const FEEDBACK_ENDPOINT = '/.netlify/functions/submit-feedback';
const CHANGELOG = [
  ['1.45.0', 'Show off your hold. A new “Share Card” button in the Journal tab makes a handsome chronicle card — your hold\'s name and crest, its tier, days survived, winters endured, settlers, and deeds — as an image you can save or share with a tap.'],
  ['1.44.0', 'You can see the raids now. When bandits come, hooded raiders march in from the treeline (or pour across an unwatched bridge) with torches held high, making for the Town Center — and your Guards ride out to meet them and turn them back. A raid is no longer a line of text; it\'s a thing you watch your walls and warriors answer.'],
  ['1.43.0', 'The woods are no longer bottomless. Forest stands slowly tire as they\'re felled, yielding a little less each time, and a fully-worked stand goes barren. The new Forester\'s Grove (🌲) replants nearby forest — reviving barren ground and keeping your timber sustainable. Tend the land, or spread your camps, so you don\'t clear-cut your own valley.'],
  ['1.42.0', 'Your word matters now. Every few days the hold brings you a decision — strangers at the gate asking to join, a bandit demanding tribute, tumbled ruins worth digging, a peddler\'s mystery crate — each with real choices and consequences for your food, coins, morale, or people. They wait politely until no other panel is open, and every ruling is set down in the Chronicle.'],
  ['1.41.0', 'Rule your hold with Decrees (⚖️ in the Goals tab). Enact lasting laws, each a real trade-off: a Curfew that quiets the nights but wears on spirits, a Tithe that fills the coffers at the cost of goodwill, Open Gates that draw newcomers but lower your guard, or Rationing that stretches the stores at the price of slower work. Change your reign whenever you like.'],
  ['1.40.0', 'The research oak grows a second tier. Four advanced techs now sit behind the ones you know — Hill Terracing (more farm yield), Aqueducts (every farm irrigated), Cold Storage (food spoils half as slow), and the Guild Charter (guild bonuses to +15%). Late-game research is no longer finished by midwinter.'],
  ['1.39.0', 'Granaries matter now. Raw food kept beyond what your stores can safely hold slowly spoils — a small pantry keeps a little, each Granary keeps a lot more, and Deep Cellars more still. Stockpiling for a hard winter finally depends on building the storage to hold it. (Bread and flour keep fine; no spoilage in Peaceful, worse in Iron Winter.)'],
  ['1.38.0', 'Make it yours. When you found a hold you can now give it a name and choose its crest colour — the name flies in the HUD, heads your Chronicle, and shows on the website deeds page. A small thing that turns any hold into your hold.'],
  ['1.37.1', 'Tidying: the Trader\'s Ledger no longer shows an always-empty “route penalties” line (missed routes cost morale, not coins). Website almanac and homepage refreshed to cover the newer systems.'],
  ['1.37.0', 'The hold speaks up. Big moments now have their own sound — a bright fanfare when you earn a deed or hold a festival, an uneasy tone when a blight or raid strikes, and a low crackle when fire breaks out — all from the built-in synth, layered over the existing effects (toggle sound with 🔊 as always).'],
  ['1.36.0', 'The Trader\'s Ledger (📒 in the Shop tab) lays your coin economy bare — a breakdown of where every coin came from (bounties, goals, deeds, trade routes) and where it went (the shop, missed-route penalties), all-time, with a running net. No more guessing whether your caravans actually pay.'],
  ['1.35.0', 'Guilds. When two or more of your settlers master the same trade, they band together into a guild — the Woodwrights, Stonecutters, Ploughmen, Fishers, or Hunters — and that craft yields +10% for the whole hold. Growing and keeping veterans, and pairing them to train the young, now pays off across your whole settlement. Active guilds are listed in the Journal.'],
  ['1.34.0', 'A new hardship: the Blight. Every so often a sickness sweeps the hold — several settlers fall ill at once, and it spreads between those standing close until it runs its course. Herbal Lore research softens the outbreak and slows its spread, and a Healer clears the currently sick. Keep your people from crowding when the fever comes.'],
  ['1.33.0', 'Your hold names itself. When buildings cluster together, the folk christen that corner — the Timber Row, the Hearth Quarter, the Mill End — with the name shown right on the map and set down in the Chronicle. The name follows whatever trade dominates the cluster, so your settlement reads like a real town taking shape.'],
  ['1.32.0', 'Livestock! The new Pasture (🐑) grazes a herd that grows on its own and gives a steady trickle of food through the green seasons — a hands-off alternative to farming. But come winter the animals need fodder from your food stores, or the herd dwindles in the cold. A food source that also has an appetite.'],
  ['1.31.0', 'Easier to pick up, easier to read. New holds get a gentle step-by-step guide (build a house, set a woodcutter, raise a farm, survive winter) that bows out once you\'re on your feet. A small status strip now shows active climate, festival blessings, trade routes, and fires at a glance. And your redeemed cosmetic unlocks now live in their own store, so they survive even if you start a fresh hold.'],
  ['1.30.1', 'Housekeeping: the memorial grove is now finite — the oldest graves are quietly reclaimed over very long games, keeping things tidy and saves small — and the website\'s building count was corrected.'],
  ['1.30.0', 'Redeem codes (⚙ → 🎁). Cosmetic packs bought on the Oakenfall website can now be unlocked in-game with a code — verified right on your device, so the game still never touches the network. The first packs are cosmetic-only (a Patron plaque and premium banner dyes); nothing that affects the balance of play. Foundation for supporting the hold.'],
  ['1.29.0', 'Three new systems. The Well (⛲, Defense) is a firebreak — timber near it rarely catches and douses fast, so you can plan against fire instead of just praying. Apprenticeship: a Master working near a novice of the same trade teaches them twice as fast (📖). And climate spells — droughts (fire risk up, crops wither), cold snaps (food & stamina drain), and fair spells (crops and spirits thrive) — sweep in for a few days at a time, shown beside the season in the clock.'],
  ['1.28.1', 'Refinements to the new systems: idle settlers now rush to a fire with buckets (and help put it out), fires start less often and only once your hold is established, and losing a Master to old age is now felt across the whole hold. Small polish to how flames read on the map.'],
  ['1.28.0', 'Fire! Timber buildings can now catch — more likely in dry summer, rare in winter or rain. A blaze damages the building and spreads to neighbours if left alone. Tap it and fling water to rally a bucket brigade; nearby settlers, rain, and winter help douse it. Let it burn and the building is lost. A new hazard that rewards spacing your timber and keeping folk close. (Disabled in Peaceful mode.)'],
  ['1.27.0', 'Settlers now grow into their trade — the longer one works a role, the better they get, rising from Skilled (+8%) to Master (+18%) at their craft. Their proficiency shows in the settler sheet and the Folk roster, a promotion is announced, and it persists across the years — so a veteran\'s passing truly costs the hold. A new “Master of the Craft” deed marks your first.'],
  ['1.26.0', 'Deeds now pay out — earning one grants a one-time reward of coins (and sometimes resources), shown on the badge and announced when earned. The badge wall in the Journal now doubles as a set of goals worth chasing.'],
  ['1.25.0', 'Trade routes — recurring caravan contracts brokered at the Trading Post (🐫 in the Shop tab). Agree to deliver a set amount of a good (planks, bread, timber, stone, or provisions) every few days, and each fulfilled run pays coins automatically. Miss a delivery twice and the route breaks, with a morale knock. Hold up to three at once — a steady coin income that rewards a well-supplied, road-linked hold.'],
  ['1.24.0', 'Events inbox (📨 in the Journal tab): the hold\'s recent tidings are now kept in a filterable list — All, ⚔ Raids, 👥 Folk, 🏗 Building, or ✦ Other — so a notice you missed while looking away is no longer lost. Holds the last 40 events, newest first.'],
  ['1.23.0', 'Seasonal festivals — once a year, as spring returns, the hold gathers and you choose one of three lasting blessings: Harvest Feast (+20% food yield), Rite of Courage (higher morale, raids sting less), or Craftsmen\'s Fair (+15% work speed). The blessing holds until the next year\'s festival and shows in the Journal. A real yearly decision point.'],
  ['1.22.0', 'Statistics view (📊 in the Journal tab): a line graph of your settlers, provisions, and timber over the last 60 days, plus lifetime tallies — peak population, winters endured, buildings raised, raids survived, weddings, births, and more. Day-by-day history is recorded in saves.'],
  ['1.21.0', 'Deeds — 14 achievements your hold can earn (First Winter, Bridge Builder, Full Granary, Grey Hairs, Held the Gate and more), shown as parchment badges in the Journal tab. Each is announced when earned and recorded in the Chronicle. Persists in saves.'],
  ['1.20.0', 'New “Folk” tab in the Hold Menu: a sortable roster of every settler — by role, morale, or name — showing their stage, trait, and mood at a glance. Tap any name to open their sheet and glide the camera to them. No more hunting the map for that one idle worker.'],
  ['1.19.5', 'Polish: focusing a settler or tapping the minimap now glides the camera smoothly instead of snapping, and villager/building gauges share one consistent bar style. The website Almanac gains a “River & Roads” chapter covering bridges, fords, the winter freeze, and road logistics.'],
  ['1.19.4', 'A settler\'s sheet now has a “Find on map” button that pans the camera straight to them — handy for tracking down that last idle worker.'],
  ['1.19.3', 'The build menu is now sorted into sections — Homes, Food & Provisions, Industry, Trade & Hall, Defense, and Roadworks — so raising a structure is quicker to scan.'],
  ['1.19.2', 'Children now look like children — settlers under the age of coming render noticeably smaller until they grow up.'],
  ['1.19.1', 'Chronicle polish: the hold\'s story now reads written, not logged — each moment has several varied phrasings — and a new “Read the full Chronicle” view presents it on an illuminated parchment, grouped by day and season, worth a screenshot.'],
  ['1.19.0', 'The Chronicle: your hold now keeps a dated story of its life — foundings, friendships, weddings, births, comings-of-age, passings, and the turning seasons — readable in the Journal tab and worth screenshotting. Completes the living-citizen update: settlers befriend, wed, raise children, grow old, and are remembered.'],
  ['1.18.0', 'Living citizens, step three: idle settlers and children no longer stand about — they gather at the hearth (or tavern) after dark, huddle for warmth in winter, drift over to close friends for a chat, and the little ones play near home. A mood bubble shows what they\'re up to. Purely ambient — it never interrupts assigned work.'],
  ['1.17.0', 'Living citizens, step two: settlers now grow up, grow old, and pass on. Children are born, come of age and join the work; elders slow but keep contributing; the aged pass peacefully and are laid to rest in a memorial grove west of the Town Center, with partners and children who mourn them. Each settler\'s sheet shows their stage and age.'],
  ['1.16.0', 'Living citizens, step one: settlers now form friendships (and the odd rivalry) as they live and work near one another — see each settler\'s bonds and memories in their sheet, and couples now tend to wed a close friend. First piece of the AI-driven citizen merge.'],
  ['1.15.0', 'Menus, reorganised: the 📜 button and 💰 coins now open one Hold Menu with tabs — Goals, Research, Shop, and Journal — so research is finally reachable without hunting for the Town Center. Menus remember where you came from with a back arrow, and you can drag the sheet taller. Mobile HUD fixes: the day/season line no longer hides under the minimap in landscape, and the Play page now runs the game truly full-screen.'],
  ['1.14.0', 'The river lives: fords (shallow crossings you can wade, slowly), winter freezes the river solid — crossable ice but no fishing and no moat. Guard posts near bridges keep crossings watched. Roads linked to the Town Center speed nearby workshops 12%. Settlers earn Brave and Steadfast traits from raids and heartbreak. The merchant now parks a cart by your Town Center. New 📷 photo mode. Saves now work on the website version (they were silently failing).'],
  ['1.13.0', 'Bridges! Build plank spans over the river (20 wood, 6 planks) to open the far bank to your settlers. The river now acts as a natural moat against bandit raids — but every bridge you build is a door raiders can use. Riverside farms yield +15%.'],
  ['1.12.1', 'iPhone polish: works fully offline (no more web-font fetch), can be saved to the home screen as a real app with its own oak icon, the screen stays awake while you play, and every top-bar button is now a full 44px touch target.'],
  ['1.12.0', 'Cleaner HUD: save/sound/fullscreen folded into a ⚙ menu, resource row fades at its edge to hint it scrolls, the camera pans so your selection is never hidden behind the sheet, and the minimap can be enlarged with its ⤢ button.'],
  ['1.11.1', 'HUD no longer overlaps: portrait gets a two-row top bar (buttons above, resources below), landscape reserves space for the buttons, and the day/season line moved clear of the minimap.'],
  ['1.11.0', 'Real audio samples for chopping, mining, tap, warning, and sheet open/close (Kenney RPG Audio / Interface / Impact packs), layered over the existing procedural sound as an upgrade, not a dependency. Added an optional ambient music toggle.'],
  ['1.10.1', 'Fixed cramped/overlapping Game Mode description on the start screen; richer, less flat start-screen background.'],
  ['1.10.0', 'Bug reports & suggestions now file to GitHub automatically — no GitHub account or manual submit needed.'],
  ['1.9.0', 'GitHub pipeline live: bug reports and suggestions file directly to the project repo as issues.'],
  ['1.8.0', 'Feedback system: report bugs & suggest features from the Goals sheet. Knight guards, meat-hauling hunters, raid explosions, fisher splashes, resource-fly effects.'],
  ['1.7.0', 'Kenney terrain & stone roads, Tiny Swords buildings & animated villagers, swaying ancient oaks, drifting clouds, farm crops & fences.'],
  ['1.6.0', 'Research tree, Manor, game modes, Hold Shop & coins, daily bounties, families, decay & repair, weather, morale, bandits & defense.'],
];
// Ring buffer of recent errors — auto-attached to bug reports
const errorLog = [];
function logError(kind, msg){
  errorLog.push({ t: Date.now(), kind, msg: String(msg).slice(0, 300) });
  if(errorLog.length > 10) errorLog.shift();
}
/* A field added to G without deciding what the save does with it goes here, not
   to a player's ruined hold. Logged rather than thrown: the suites assert this
   log is empty, so it fails the build loudly while never bricking a live game
   over a bookkeeping mistake. */
try{ assertSaveCoverage(); }catch(e){ logError('save-format', e.message); console.error(e.message); }
window.addEventListener('error', (e)=>{ logError('window', (e.message||'') + ' @' + (e.filename||'').split('/').pop() + ':' + e.lineno); });
window.addEventListener('unhandledrejection', (e)=>{ logError('promise', e.reason); });

function buildDiagnostics(){
  const lines = [];
  lines.push('## Oakenfall Report');
  lines.push('- Version: ' + GAME_VERSION + ' · Mode: ' + gameModeId + ' · Map: ' + G.MAP_SIZE);
  lines.push('- Day ' + G.dayCount + ' · ' + seasonName() + ' · ' + weather.label + ' · Tier: ' + HOLD_TIERS[currentTierIdx].name);
  lines.push('- Pop: ' + G.villagers.length + '/' + popCapacity() + ' · Buildings: ' + G.buildings.length + ' · Coins: ' + G.coins);
  lines.push('- Stock: ' + Object.entries(G.stockpile).map(([k,v])=>k+':'+Math.round(v)).join(' '));
  lines.push('- Researched: ' + (Object.keys(G.researched).join(', ') || 'none') + (G.activeResearch ? ' (researching: '+G.activeResearch.id+')' : ''));
  lines.push('- Device: ' + (navigator.userAgent||'?').slice(0,110));
  lines.push('- Screen: ' + cssW + 'x' + cssH + ' @' + canvasDPR + 'x · ' + (window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'));
  if(errorLog.length){
    lines.push('- Recent errors:');
    for(const e of errorLog) lines.push('  · ['+e.kind+'] '+e.msg);
  } else lines.push('- Recent errors: none');
  return lines.join('\n');
}
async function copyFeedback(kind, text){
  const head = kind==='bug' ? '### BUG REPORT' : '### FEATURE SUGGESTION';
  const body = head + '\n' + (text.trim() || '(no description given)') + '\n\n' + buildDiagnostics()
    + '\n\n_Paste this whole block to Claude to get it fixed/built._';
  try {
    await navigator.clipboard.writeText(body);
    return true;
  } catch(e){
    // Fallback: legacy textarea copy
    try {
      const ta = document.createElement('textarea');
      ta.value = body; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch(e2){ return false; }
  }
}
function renderFeedbackSheet(kind){
  const isBug = kind==='bug';
  sheetContent.innerHTML = `
    <div class="sheet-sub">${isBug
      ? 'Describe what went wrong and what you expected. Game state and recent errors attach automatically.'
      : 'Describe your idea — what it does and why it would make the hold better.'}</div>
    <textarea id="fb-text" placeholder="${isBug ? 'What happened? What did you expect?' : 'Your idea...'}"
      style="width:100%;min-height:90px;margin-top:8px;background:#241a10;color:var(--parchment-text);
             border:1px solid var(--panel-edge);border-radius:8px;padding:10px;font:inherit;font-size:14px;
             resize:vertical;box-sizing:border-box;"></textarea>
    <div class="row" style="margin-top:8px;gap:8px;">
      <button class="action-btn primary" id="fb-copy">📮 Submit to GitHub</button>
    </div>
    <div class="sheet-sub" id="fb-status" style="margin-top:6px;"></div>
    <div class="sheet-sub" style="margin-top:4px;opacity:0.7;">v${GAME_VERSION} · Files straight to the dev's GitHub — your hold's state is attached automatically so fixes land faster.</div>
  `;
  document.getElementById('fb-copy').addEventListener('click', async ()=>{
    const text = document.getElementById('fb-text').value;
    const statusEl = document.getElementById('fb-status');
    const btn = document.getElementById('fb-copy');
    const head = kind==='bug' ? '[Bug] ' : '[Suggestion] ';
    const title = (head + (text.trim().split('\n')[0] || 'from in-game report')).slice(0, 70);
    const bodyMd = (kind==='bug' ? '### BUG REPORT' : '### FEATURE SUGGESTION') + '\n'
      + (text.trim() || '(no description given)') + '\n\n' + buildDiagnostics();

    btn.disabled = true;
    statusEl.textContent = '⏳ Filing it now...';
    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, body: bodyMd })
      });
      const data = await res.json().catch(()=>({}));
      if(!res.ok || !data.ok) throw new Error(data.error || ('status ' + res.status));
      statusEl.innerHTML = '✅ Filed as <a href="' + data.url + '" target="_blank" rel="noopener">issue #' + data.number + '</a> — thank you!';
      document.getElementById('fb-text').value = '';
      sfx('coin');
    } catch(e){
      logError('feedback-submit', e && e.message || e);
      const ok = await copyFeedback(kind, text);
      statusEl.innerHTML = ok
        ? '⚠️ Couldn\'t auto-file (offline or server issue). Copied instead — paste it into the Claude chat or ' +
          '<a href="' + REPO_URL.replace(/\/$/,'') + '/issues/new" target="_blank" rel="noopener">open a GitHub issue</a> manually.'
        : '⚠️ Couldn\'t auto-file or reach the clipboard — long-press the text above to copy manually.';
    } finally {
      btn.disabled = false;
    }
  });
}

// Trader's ledger — cumulative coin flow by category, for the economy view.
function logCoinIn(cat, amt){ if(!G.ledger.in[cat]) G.ledger.in[cat]=0; G.ledger.in[cat]+=amt; }
function logCoinOut(cat, amt){ if(!G.ledger.out[cat]) G.ledger.out[cat]=0; G.ledger.out[cat]+=amt; }
const BOUNTY_POOL = [
  { id:'bwood',  key:'wood',  min:30, max:60, ic:'🪵', name:'Timber Drive',   d:n=>'Gather '+n+' wood today' },
  { id:'bstone', key:'stone', min:20, max:45, ic:'🪨', name:'Quarry Push',    d:n=>'Gather '+n+' stone today' },
  { id:'bfood',  key:'food',  min:25, max:50, ic:'🌾', name:'Harvest Rally',  d:n=>'Gather '+n+' food today' },
  { id:'bbread', key:'bread', min:4,  max:10, ic:'🍞', name:'Warm Ovens',     d:n=>'Bake '+n+' bread today' },
  { id:'bplank', key:'planks',min:5,  max:12, ic:'🪚', name:'Mill Work',      d:n=>'Saw '+n+' planks today' },
  { id:'bbuild', key:'built', min:1,  max:2,  ic:'🔨', name:'Raise the Hold', d:n=>'Construct '+n+' building'+(n>1?'s':'')+' today' },
];
const SHOP_ITEMS = [
  { id:'festival', ic:'🎉', name:'Feast Day',        cost:30, desc:'Begin a festival at once — the hold works 25% faster for a while.' },
  { id:'merchant', ic:'🧳', name:'Summon Merchant',  cost:25, desc:'A merchant arrives immediately with improved trade rates.' },
  { id:'healer',   ic:'🌿', name:'Healer\'s Visit',  cost:20, desc:'Cure every sick settler in the hold instantly.' },
  { id:'repairs',  ic:'🔧', name:'Mend the Hold',    cost:18, desc:'Instantly repair every building to full condition.' },
  { id:'rations',  ic:'🥖', name:'Emergency Rations',cost:15, desc:'A cart of 25 food arrives at the stores.' },
  { id:'banner',   ic:'🚩', name:'New Banner Dye',   cost:12, desc:'Re-dye the hold banner in a new colour (cycles red → blue → green → gold).' },
];
const BANNER_COLORS = ['#a4402c','#2c5a8a','#3a7a3a','#c8982c'];
// Premium banner dyes unlocked by supporter packs (cosmetic only).
const BANNER_UNLOCK_COLORS = {
  supporter: ['#6b3fa0','#b8862c'],   // royal purple, antique gold
  frost:     ['#3a8fb0','#7fb0c4'],   // glacier, frostlight
  ember:     ['#c2451f','#e08a2c'],   // ember red, forge orange
};
let bannerPalette = BANNER_COLORS.slice();
function applyPatronBanners(){
  bannerPalette = BANNER_COLORS.slice();
  for(const sku of Object.keys(BANNER_UNLOCK_COLORS)){
    if(typeof G.unlocks!=='undefined' && G.unlocks[sku]) bannerPalette = bannerPalette.concat(BANNER_UNLOCK_COLORS[sku]);
  }
  if(G.bannerIdx >= bannerPalette.length) G.bannerIdx = 0;
}

/* ── TRADE ROUTES ── recurring caravan contracts: deliver goods every few days
   for coins. Needs a Trading Post. Ties the merchant economy to logistics. */
const ROUTE_GOODS = [
  {type:'planks', ic:'🪚', label:'planks', unit:2.4},
  {type:'bread',  ic:'🍞', label:'bread',  unit:2.2},
  {type:'wood',   ic:'🪵', label:'timber', unit:0.7},
  {type:'stone',  ic:'🪨', label:'stone',  unit:0.9},
  {type:'food',   ic:'🌾', label:'provisions', unit:0.8},
];
const ROUTE_TOWNS = ['Greyford','Ashmere','Dunhollow','Pinebrook','Coldwater','Marren','Highcross','Thornwick'];
function makeRouteOffer(){
  const g = ROUTE_GOODS[Math.floor(Math.random()*ROUTE_GOODS.length)];
  const amt = [6,8,10,12,15][Math.floor(Math.random()*5)];
  const every = 2 + Math.floor(Math.random()*3); // every 2-4 days
  const coins = Math.max(3, Math.round(amt*g.unit + every*1.5));
  const town = ROUTE_TOWNS[Math.floor(Math.random()*ROUTE_TOWNS.length)];
  return { id:'r'+Math.random().toString(36).slice(2,8), name:town, ic:g.ic,
    giveType:g.type, giveAmt:amt, coins, everyDays:every };
}
function refreshRouteOffers(){
  while(G.routeOffers.length < 3) G.routeOffers.push(makeRouteOffer());
}
function acceptRoute(id){
  if(!hasActiveBuilding('tradingPost')){ toast('Build a Trading Post to broker caravan routes.', true); return; }
  if(G.tradeRoutes.length >= 3){ toast('You can hold at most three trade routes.', true); return; }
  const i = G.routeOffers.findIndex(o=>o.id===id); if(i<0) return;
  const o = G.routeOffers.splice(i,1)[0];
  o.nextDay = G.dayCount + o.everyDays; o.missed = 0;
  G.tradeRoutes.push(o);
  toast(o.ic+' Caravan route to '+o.name+' agreed — '+o.giveAmt+' '+ROUTE_GOODS.find(g=>g.type===o.giveType).label+' every '+o.everyDays+' days.');
  refreshRouteOffers();
  renderTradeRoutesSheet();
}
function cancelRoute(id){
  const i = G.tradeRoutes.findIndex(r=>r.id===id); if(i<0) return;
  const r = G.tradeRoutes.splice(i,1)[0];
  toast('🐫 The route to '+r.name+' is dissolved.');
  renderTradeRoutesSheet();
}
// Called at each dawn: fulfil or miss due caravans.
function processTradeRoutes(){
  for(const r of G.tradeRoutes.slice()){
    if(G.dayCount < r.nextDay) continue;
    const g = ROUTE_GOODS.find(x=>x.type===r.giveType);
    if((G.stockpile[r.giveType]||0) >= r.giveAmt){
      G.stockpile[r.giveType] -= r.giveAmt;
      G.coins += r.coins; logCoinIn('routes', r.coins);
      r.missed = 0;
      toast(r.ic+' Caravan to '+r.name+' paid 💰'+r.coins+' for '+r.giveAmt+' '+g.label+'.');
    } else {
      r.missed = (r.missed||0) + 1;
      if(r.missed >= 2){
        G.tradeRoutes.splice(G.tradeRoutes.indexOf(r),1);
        toast('🐫 The route to '+r.name+' was broken — the caravan left empty twice.', true);
        G.villagers.forEach(v=>{ if(v.morale!==undefined) v.morale = clamp(v.morale-4,0,100); });
        continue;
      } else {
        toast('⚠️ No '+g.label+' ready for the '+r.name+' caravan — one more miss ends the route.', true);
      }
    }
    r.nextDay = G.dayCount + r.everyDays;
  }
}
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
  const lbl = t=>ROUTE_GOODS.find(g=>g.type===t).label;
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

function rollDailyBounties(){
  G.dailyProgress = { wood:0, stone:0, food:0, bread:0, planks:0, flour:0, built:0 };
  const pool = [...BOUNTY_POOL];
  G.dailyBounties = [];
  for(let i=0;i<2 && pool.length;i++){
    const idx = Math.floor(Math.random()*pool.length);
    const bt = pool.splice(idx,1)[0];
    const n = bt.min + Math.floor(Math.random()*(bt.max-bt.min+1));
    G.dailyBounties.push({ id:bt.id, key:bt.key, n, reward: 8+Math.floor(n/4), done:false, ic:bt.ic, name:bt.name, desc:bt.d(n) });
  }
}
function checkBounties(){
  for(const b of G.dailyBounties){
    if(!b.done && (G.dailyProgress[b.key]||0) >= b.n){
      b.done = true; { const c = Math.round(b.reward * (gameMode.bountyCoinMul||1)); G.coins += c; logCoinIn('bounties', c); } sfx('coin'); buzz(12);
      toast('💰 Bounty complete: '+b.name+' — +'+Math.round(b.reward*(gameMode.bountyCoinMul||1))+' coins!');
    }
  }
}
/* ── RELATIONSHIPS ── citizens form friendships & rivalries by proximity over
   time (ported from the living-world AI, adapted to the hold's traits & names,
   which persist across save/load — ids don't). */
function hasTrait(v,id){ return v.trait && v.trait.id===id; }
function relTo(v,o){ return (v.relations||(v.relations=[])).find(r=>r.name===o.name); }
const _relMoments = new Set();
function remember(v,text){ if(!v.memories)v.memories=[]; if(v.memories[0]===text)return; v.memories.unshift(text); if(v.memories.length>4)v.memories.pop(); }
// The Chronicle — a curated, dated story of the hold's significant moments.
function chronicleAdd(text){
  G.chronicle.unshift({ day:(typeof G.dayCount!=='undefined'?G.dayCount:1), season:(typeof seasonName==='function'?seasonName():''), text });
  if(G.chronicle.length>80) G.chronicle.pop();
}
function pickOne(a){ return a[Math.floor(Math.random()*a.length)]; }
// Varied phrasings so the chronicle reads written, not logged.
function chron(type, a, b, n){
  const T = {
    founding:[
      'The first settlers raised the Town Center of '+G.holdName+' and made camp beneath the pines.',
      'Here '+G.holdName+' began — a handful of souls, a fire against the dark, and the whole wood watching.',
      'Smoke rose over the valley for the first time; the folk of '+G.holdName+' had come to stay.'],
    friends:[
      a+' and '+b+' became fast friends.',
      'A firm friendship took root between '+a+' and '+b+'.',
      a+' found a steadfast companion in '+b+'.'],
    rivals:[
      a+' and '+b+' fell to quarrelling over the pace of the work.',
      'No love was lost between '+a+' and '+b+'.'],
    wed:[
      a+' and '+b+' were wed beneath the pines.',
      a+' and '+b+' pledged themselves to one another before the hold.',
      'Hand in hand beneath the old oaks, '+a+' and '+b+' were married.'],
    born:[
      a+' was born to '+b+'.',
      'A child, '+a+', came into the world — born to '+b+'.',
      b+' welcomed a new child into the hold: '+a+'.'],
    ofage:[
      a+' came of age and took up the work of the hold.',
      a+' grew to adulthood and joined the labour.',
      'The hold gained a pair of hands as '+a+' came of age.'],
    passed:[
      a+' passed peacefully at '+n+' seasons, and rests now in the grove.',
      'After '+n+' seasons, '+a+' passed gently, laid to rest among the oaks.',
      a+' died full of years — '+n+' seasons — and joined the memorial grove.'],
    season:[
      a+' came to the hold.',
      'The season turned; '+a+' settled over the valley.',
      a+' arrived, and the light over the pines changed with it.'],
    deed:[
      'A deed worth remembering: '+a+'.',
      'The hold earned its name anew — '+a+'.',
      'Word spread of the hold\'s achievement: '+a+'.'],
    plague:[
      'A blight passed through the hold, and the sick beds filled for a time.',
      'Sickness came to Oakenfall; the folk nursed their own until it broke.',
      'A fever spread among the settlers before the herbs turned it back.'],
    decision:[
      'The steward faced a choice that day: '+a+'.',
      'Word still tells of how the hold answered — '+a+'.',
      a+' — and the steward\'s word settled it.'],
    guild:[
      'The masters of the hold banded together and founded the '+a+'.',
      'Enough of the craft had mastered their trade to raise the '+a+'.',
      'The '+a+' was established, and the whole hold prospered by it.'],
    district:[
      'The folk took to calling that corner of the hold '+a+'.',
      a+' had grown enough to earn a name of its own.',
      'A new quarter, '+a+', took shape among the rooftops.'],
    climate:[
      'A '+String(a).toLowerCase()+' settled over the valley.',
      'The season bent to a '+String(a).toLowerCase()+', and the hold felt it.'],
    fire:[
      'Fire took the '+a+'; only ash and a hard lesson remained.',
      'The '+a+' burned in the night, and the hold worked to stop the flames spreading.',
      'A blaze claimed the '+a+' — the folk still speak of the smoke.'],
    festival:[
      'The hold held its year-turn festival and chose '+a+'.',
      'At the new year the folk feasted and blessed the season with '+a+'.',
      a+' was chosen at the festival, and the valley rang with song.'],
  };
  chronicleAdd(pickOne(T[type] || [a||'']));
}
function bumpRel(v,o,amount){
  if(v===o) return;
  if(!v.relations) v.relations=[];
  let r=relTo(v,o);
  if(!r){
    if(v.relations.length>=5) return;
    const rivalry=(hasTrait(v,'diligent')&&hasTrait(o,'glutton'))||(hasTrait(v,'glutton')&&hasTrait(o,'diligent'));
    r={name:o.name, type:rivalry?'rival':'friend', s:0};
    v.relations.push(r);
  }
  const mult = r.type==='rival' ? -0.6 : (hasTrait(v,'lucky')?1.2:1);
  r.s = clamp(r.s + amount*mult, -100, 100);
  const key=[v.name,o.name].sort().join('|');
  if(r.type==='friend' && r.s>40 && !_relMoments.has('fr'+key)){
    _relMoments.add('fr'+key);
    toast('🤝 '+v.name+' and '+o.name+' became fast friends.');
    chron('friends', v.name, o.name);
    remember(v,'became friends with '+o.name); remember(o,'became friends with '+v.name);
  } else if(r.type==='rival' && r.s<-25 && !_relMoments.has('rv'+key)){
    _relMoments.add('rv'+key);
    toast('😤 '+v.name+' and '+o.name+' can\'t abide each other\'s pace of work.', true);
    chron('rivals', v.name, o.name);
  }
}
let _relAcc=0;
function relationsTick(dt){
  _relAcc+=dt; if(_relAcc<10) return; _relAcc=0;
  for(let i=0;i<G.villagers.length;i++) for(let j=i+1;j<G.villagers.length;j++){
    const a=G.villagers[i], b=G.villagers[j];
    if(a.state==='spawning'||b.state==='spawning') continue;
    if(Math.hypot(a.gx-b.gx,a.gy-b.gy)<2.4){ bumpRel(a,b,6); bumpRel(b,a,6); }
  }
}

/* ── AGING & GENERATIONS ── citizens grow up, grow old, and pass on, leaving
   a memorial grove. Paced on its own clock so lives are observable in a
   session but gentle on the workforce (births keep pace). */
const AGE_YEAR=720, ADULT_AGE=1.5, ELDER_BEFORE=1.2, LIFESPAN_BASE=5.5;
function memorialSpot(){
  // Position by the monotonic count of the departed, wrapping over the grove's
  // 40 plots so that when an old grave is reclaimed a new one takes its place
  // (rather than every grave stacking once the cap is reached).
  const n=(G.journal.passed||0)%40;
  return { gx: G.TC_X - 4 + (n%4)*0.85, gy: G.TC_Y + 3 + Math.floor(n/4)*0.85 };
}
function agingTick(dt){
  const dy = dt/AGE_YEAR;
  for(const v of [...G.villagers]){
    if(v.age===undefined){ v.age=2; v.stage='adult'; v.lifespan=LIFESPAN_BASE; }
    if(v.state==='spawning') continue;
    v.age += dy;
    if(v.stage==='child' && v.age>=ADULT_AGE){
      v.stage='adult';
      toast('🌿 '+v.name+' has come of age and joins the work.');
      chron('ofage', v.name);
      remember(v,'came of age');
    } else if(v.stage==='adult' && v.age>=v.lifespan-ELDER_BEFORE){
      v.stage='elder';
    } else if(v.stage!=='child' && v.age>=v.lifespan){
      passVillager(v);
    }
  }
}
function passVillager(v){
  G.villagers = G.villagers.filter(x=>x!==v);
  releaseClaims(v);
  G.villagers.forEach(o=>{
    if(o.relations) o.relations = o.relations.filter(r=>r.name!==v.name);
    if(o.partner===v.name){ o.partner=null; o.morale=clamp((o.morale||65)-12,0,100); remember(o,'lost '+v.name); }
    if(o.parents && o.parents.includes(v.name)){ o.morale=clamp((o.morale||65)-6,0,100); }
  });
  if(selection && selection.ref===v) deselectAll();
  const spot = memorialSpot();
  G.memorials.push({name:v.name, gx:spot.gx, gy:spot.gy});
  // The grove is finite — the oldest graves are quietly reclaimed by the forest
  // (keeps the render list and save bounded over very long games).
  if(G.memorials.length > 40) G.memorials.shift();
  G.journal.passed = (G.journal.passed||0)+1;
  const tier = skillTier(v, v.role);
  if(tier.label==='Master'){
    toast('🕊️ '+v.name+', a Master '+roleLabel(v.role)+', has passed at '+Math.floor((v.age||2)*4)+' seasons — a grievous loss to the hold.');
    G.villagers.forEach(o=>{ if(o.morale!==undefined) o.morale=clamp(o.morale-3,0,100); }); // the whole hold mourns a master
  } else {
    toast('🕊️ '+v.name+' passed peacefully at '+Math.floor((v.age||2)*4)+' seasons — laid to rest in the grove.');
  }
  chron('passed', v.name, null, Math.floor((v.age||2)*4));
}

/* ── AMBIENT LIFE ── idle & young citizens don't just stand there: they gather
   at the hearth after dark, seek warmth in winter, drift toward friends, and
   the children play. Only steers idle wander targets + a mood bubble — never
   overrides assigned work. */
/* ── WHAT THE HOLD NEEDS ── a utility score per trade, so an unemployed settler
   can work out what is worth doing instead of waiting to be told. Scarcity
   drives the score; existing workers divide it, so hands spread across trades
   rather than all piling onto whatever is scarcest. Recomputed at most once a
   second — every idle settler asks the same question. */
let _needCache = null, _needAt = -1;
function roleNeedScores(){
  if(_needCache && G.worldTime - _needAt < 1) return _needCache;
  const pop = Math.max(1, G.villagers.length);
  const count = {};
  for(const v of G.villagers) count[v.role] = (count[v.role]||0) + 1;
  const frac = (k)=> (G.stockpile[k]||0) / Math.max(1, capFor(k));
  const out = [];
  const add = (role, workplace, score)=>{
    if(!hasActiveBuilding(workplace)) return;      // nowhere to do the work
    // `score` is the hold's raw appetite for this trade; `workers` lets callers
    // reason about pressure per head. The published score is the raw need spread
    // over the hands already on it, which is what makes hiring fan out.
    out.push({ role, score: score / (1 + (count[role]||0)), raw: score, workers: count[role]||0 });
  };
  // Food is the survival pressure: weight it by how many mouths depend on it,
  // and sharply if the stores would not last long.
  const hungry = (1 - frac('food'))*1.6 + ((G.stockpile.food||0) < pop*3 ? 1.4 : 0);
  add('farmer','farm', hungry);
  add('fisher','fishingHut', riverFrozen() ? 0 : hungry*0.95);
  add('hunter','huntingCabin', hungry*0.9);
  add('lumberjack','forestCamp', (1 - frac('wood'))*1.25);
  add('miner','miningPost', (1 - frac('stone'))*1.05);
  if(currentTierIdx >= 2) add('guard','guardPost', 0.85);   // worth raiding now

  /* Last resort only. If the hold has NO workplace at all, its people gather
     deadfall and forage by hand — badly, but enough to climb back. Without this
     a hold that spends its last timber on housing can never gather wood again,
     has no way to raise the camp that would let it, and starves with every
     settler standing idle: reachable in the first five minutes by doing exactly
     what the tutorial says. It is deliberately a fallback rather than a
     competing option, so a camp you just built never sits idle while your folk
     forage instead — and it only wakes when the hold cannot even afford the
     cheapest workplace, so a fresh hold still waits for the player to build
     rather than wandering off to forage on turn one. */
  const cheapestWorkplace = (BUILD_DEFS.forestCamp && BUILD_DEFS.forestCamp.cost.wood) || 40;
  if(!out.length && (G.stockpile.wood||0) < cheapestWorkplace){
    const byHand = (role, score)=> out.push({ role, score: score / (1 + (count[role]||0)), raw: score, workers: count[role]||0, byHand:true });
    byHand('lumberjack', (1 - frac('wood'))*0.55);
    byHand('hunter', hungry*0.5);
  }
  out.sort((a,b)=>b.score - a.score);
  _needCache = out; _needAt = G.worldTime;
  return out;
}
/* An unemployed adult takes up the most-needed trade — unless the hold is on
   fire, when free hands are worth more than another woodcutter (idle adults are
   the bucket brigade). Returns true if they took work. */
function seekWork(v){
  if(G.buildings.some(b=>b._fire>0)) return false;
  const best = roleNeedScores()[0];
  if(!best || best.score < 0.35) return false;
  reassignRole(v, best.role);
  v.ambientEmote = '💡';
  return true;
}
/* An employed settler reconsiders their trade now and then: a hold that has run
   its granary dry while six people fell timber should see some of them pick up
   a scythe. The margin and the staggered cooldown exist to stop folk churning
   between jobs every time a score wobbles — switching costs a walk, so it has to
   be clearly worth it. Player-assigned roles are not sacred, but they are sticky:
   nothing moves unless the need is substantially greater elsewhere. */
function maybeSwitchTrade(v){
  if(v.stage==='child' || v.role==='idle') return false;
  if(v._tradeCheck === undefined) v._tradeCheck = G.worldTime + 20 + Math.random()*30;
  if(G.worldTime < v._tradeCheck) return false;
  v._tradeCheck = G.worldTime + 30 + Math.random()*30;
  if(G.buildings.some(b=>b._fire>0)) return false;
  const scores = roleNeedScores();
  if(!scores.length) return false;
  // Compare pressure per head, not the published score. A fixed margin against
  // scores already divided by worker count is effectively unreachable once a few
  // people hold a trade — the first version of this never fired once. What
  // matters is how hard each trade is pulling per person: my trade's need shared
  // among those doing it, against the candidate's need if I joined them.
  const mine = scores.find(s=>s.role===v.role);
  const minePressure = mine ? mine.raw / Math.max(1, mine.workers) : 0;
  let pick = null, pickPressure = 0;
  for(const cand of scores){
    if(cand.role === v.role) continue;
    const p = cand.raw / (cand.workers + 1);
    if(p > pickPressure){ pick = cand; pickPressure = p; }
  }
  // Floor only exists to stop churn when nothing much is needed; the ratio test
  // below is what decides "clearly stronger". Set too high (0.4) it vetoed real
  // imbalances — a trade pulling 2.25x harder than the one being left.
  if(!pick || pickPressure < 0.2) return false;
  // A trade in surplus frees you outright; otherwise the pull has to be clearly
  // stronger, since switching costs a walk across the hold.
  const worthIt = minePressure <= 0.05 ? true : pickPressure > minePressure * 1.8;
  if(!worthIt) return false;
  reassignRole(v, pick.role);
  v.ambientEmote = '🔁';
  remember(v, 'took up '+(ROLE_DEFS[pick.role]?ROLE_DEFS[pick.role].label:pick.role));
  return true;
}
function ambientIdle(v){
  // Bucket brigade: idle adults rush to the nearest fire to help fight it.
  if(v.stage!=='child'){
    let fb=null, fbD=Infinity;
    for(const b of G.buildings){ if(!b._fire) continue; const c=buildingCenter(b); const d=dist2(v.gx,v.gy,c.gx,c.gy); if(d<fbD){fbD=d;fb=c;} }
    if(fb && fbD < 100){ // within ~10 tiles — run over
      v.idleGX = clamp(fb.gx + (Math.random()-0.5)*2.2, 1, G.MAP_SIZE-2);
      v.idleGY = clamp(fb.gy + 1.0 + (Math.random()-0.5)*1.4, 1, G.MAP_SIZE-2);
      v.ambientEmote = '🪣';
      return;
    }
  }
  const night = (typeof isNight==='function') && isNight();
  const winter = (typeof seasonIndex==='function') && seasonIndex()===3;
  const tav = G.buildings.find(b=>b.type==='tavern');
  const hearth = tav ? {gx:tav.gx+0.5, gy:tav.gy+1.1} : {gx:G.TC_CX, gy:G.TC_CY+1.4};
  // Foul weather drives folk to shelter — a storm clears the yards fastest.
  const storm = weather.type==='storm', rain = weather.type==='rain' || weather.type==='snow';
  if(storm || night || (winter && (hasTrait(v,'frail') || Math.random()<0.4)) || (rain && Math.random()<0.5)){
    v.idleGX = clamp(hearth.gx + (Math.random()-0.5)*1.8, 1, G.MAP_SIZE-2);
    v.idleGY = clamp(hearth.gy + (Math.random()-0.5)*1.0, 1, G.MAP_SIZE-2);
    v.ambientEmote = storm ? '⛈️' : (rain && !night) ? '☔' : (winter && !night) ? '🥶' : '🔥';
    return;
  }
  const fr = (v.relations||[]).filter(r=>r.type==='friend' && r.s>50);
  if(fr.length && Math.random()<0.5){
    const o = G.villagers.find(x=>x.name===fr[Math.floor(Math.random()*fr.length)].name);
    if(o){ v.idleGX=clamp(o.gx+(Math.random()-0.5)*1.2,1,G.MAP_SIZE-2); v.idleGY=clamp(o.gy+(Math.random()-0.5)*1.2,1,G.MAP_SIZE-2); v.ambientEmote='💬'; return; }
  }
  if(v.stage==='child'){
    // Children keep near a parent when there is one to keep near — they trail
    // whoever is working rather than milling about the square on their own.
    const kin = (v.parents||[]).map(n=>G.villagers.find(x=>x.name===n)).filter(Boolean);
    if(kin.length && Math.random()<0.65){
      const p = kin[Math.floor(Math.random()*kin.length)];
      v.idleGX = clamp(p.gx + (Math.random()-0.5)*2.0, 1, G.MAP_SIZE-2);
      v.idleGY = clamp(p.gy + 0.8 + (Math.random()-0.5)*1.4, 1, G.MAP_SIZE-2);
      v.ambientEmote = Math.random()<0.5 ? '🙂' : '🎈';
      return;
    }
    v.idleGX = clamp(G.TC_CX + (Math.random()-0.5)*4, 1, G.MAP_SIZE-2);
    v.idleGY = clamp(G.TC_CY + 1.5 + (Math.random()-0.5)*3, 1, G.MAP_SIZE-2);
    v.ambientEmote = Math.random()<0.5 ? '🙂' : '🎈';
    return;
  }
  // Married folk seek each other out when the day's work is done.
  if(v.partner && Math.random()<0.45){
    const spouse = G.villagers.find(x=>x.name===v.partner);
    if(spouse){
      v.idleGX = clamp(spouse.gx + (Math.random()-0.5)*1.4, 1, G.MAP_SIZE-2);
      v.idleGY = clamp(spouse.gy + (Math.random()-0.5)*1.2, 1, G.MAP_SIZE-2);
      v.ambientEmote = '💞';
      return;
    }
  }
  v.idleGX = clamp(v.idleGX + (Math.random()-0.5)*2.2, 1, G.MAP_SIZE-2);
  v.idleGY = clamp(v.idleGY + (Math.random()-0.5)*2.2, 1, G.MAP_SIZE-2);
  v.ambientEmote = night ? '✨' : (Math.random()<0.3 ? '🎵' : null);
}

function familyTick(dt){
  G.courtshipTimer -= dt;
  if(G.courtshipTimer<=0){
    G.courtshipTimer = 80 + Math.random()*60;
    const single = G.villagers.filter(v=>!v.partner && v.morale>50 && v.state!=='spawning');
    if(single.length>=2){
      const a = single[Math.floor(Math.random()*single.length)];
      // Prefer to wed a close friend, if one is also single; else a random match.
      const friendMatch = (a.relations||[]).filter(r=>r.type==='friend'&&r.s>50)
        .map(r=>single.find(o=>o.name===r.name)).filter(Boolean)[0];
      let b2 = friendMatch || single[Math.floor(Math.random()*single.length)];
      if(a!==b2){
        a.partner=b2.name; b2.partner=a.name;
        remember(a,'wed '+b2.name); remember(b2,'wed '+a.name);
        a.morale=clamp(a.morale+15,0,100); b2.morale=clamp(b2.morale+15,0,100);
        toast('💞 '+a.name+' and '+b2.name+' have wed beneath the pines!');
        chron('wed', a.name, b2.name);
        G.journal.weddings=(G.journal.weddings||0)+1;
      }
    }
  }
  G.birthTimer -= dt;
  if(G.birthTimer<=0){
    G.birthTimer = 120 + Math.random()*80;
    if(G.villagers.length < popCapacity() && G.stockpile.food > 30){
      const couples = G.villagers.filter(v=>v.partner && v.morale>55 && G.villagers.some(o=>o.name===v.partner));
      if(couples.length){
        const parent = couples[Math.floor(Math.random()*couples.length)];
        const other = G.villagers.find(o=>o.name===parent.partner);
        const inheritedTrait = Math.random()<0.5 ? parent.trait : (other?other.trait:parent.trait);
        const child = spawnVillager(null, inheritedTrait);
        child.gx = parent.gx; child.gy = parent.gy;
        child.parents = [parent.name, parent.partner];
        child.age = 0; child.stage = 'child';
        toast('👶 A child is born to '+parent.name+' and '+parent.partner+' — welcome, '+child.name+'!');
        chron('born', child.name, parent.name+' and '+parent.partner);
        G.journal.childrenBorn=(G.journal.childrenBorn||0)+1;
      }
    }
  }
}
const DECAY_RATE = 100/(10*245); // full decay over ~10 day cycles

/* ── RESEARCH & POLICIES ── one active project at a time, run from the Town Center */

function techAvailable(t){ return !G.researched[t.id] && (!t.req || G.researched[t.req]); }
function startResearch(id){
  if(G.activeResearch) { toast('Research is already underway.', true); return; }
  const t = TECH_TREE.find(x=>x.id===id);
  if(!t || G.researched[id]) return;
  for(const [k,amt] of Object.entries(t.cost)){ if((G.stockpile[k]||0)<amt){ toast('Not enough '+k+' for '+t.name+'.', true); return; } }
  for(const [k,amt] of Object.entries(t.cost)) G.stockpile[k]-=amt;
  G.activeResearch = { id, remaining:t.time, total:t.time };
  toast('🔬 Research begun: '+t.name);
}
let journalTimer = 1;
let activeEvent = null; // {type, endsAt, data}

/* ── HOLD TIERS ─────────────────────────────────────────────────────── */

let currentTierIdx = 0;
function computeTierIdx(){
  const pop = G.villagers.length;
  const bld = G.buildings.filter(b=>b.type!=='road' && b.type!=='townCenter').length;
  let idx = 0;
  for(let i=HOLD_TIERS.length-1; i>=0; i--){
    if(pop>=HOLD_TIERS[i].pop && bld>=HOLD_TIERS[i].bld){ idx=i; break; }
  }
  return idx;
}
function checkTierUp(){
  const idx = computeTierIdx();
  if(idx > currentTierIdx){
    currentTierIdx = idx;
    const t = HOLD_TIERS[idx];
    toast(t.ic+' Your hold has grown into a '+t.name+'!');
    sfx('tier'); buzz([20,40,20]);
  } else if(idx < currentTierIdx){
    currentTierIdx = idx; // shrunk (villager loss) — no toast, just track
  }
}

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
const DISTRICT_DESC = {
  house:"Hearth", manor:"Hearth", farm:"Harvest", pasture:"Meadow", granary:"Harvest",
  windmill:"Mill", bakery:"Mill", forestCamp:"Timber", sawmill:"Timber", miningPost:"Stone",
  fishingHut:"Wharf", huntingCabin:"Hunters'", guardPost:"Warden", watchtower:"Warden",
  palisade:"Warden", well:"Warden", tavern:"Market", tradingPost:"Market",
};
const DISTRICT_SUFFIX = ['Quarter','Row','End','Green','Rise','Reach','Cross','Gate','Hollow','Bank'];
function _hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
function computeDistricts(announce){
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
    if(!prev && announce && typeof chron==='function') chron('district', name);
  }
  G.districts = next;
}
function drawDistrictLabels(){
  if(!G.districts.length || camera.scale < 0.62) return; // hide when zoomed far out
  ctx.save();
  ctx.font = "600 12px 'Cinzel', serif";
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const d of G.districts){
    const p = project(d.gx, d.gy);
    const s = worldToScreen(p.x, p.y);
    if(s.x<-80||s.x>cssW+80||s.y<-40||s.y>cssH+40) continue;
    const y = s.y - 6;
    ctx.lineWidth=3; ctx.strokeStyle='rgba(10,8,4,0.6)'; ctx.strokeText(d.name, s.x, y);
    ctx.fillStyle='rgba(226,205,160,0.82)'; ctx.fillText(d.name, s.x, y);
  }
  ctx.restore();
}

/* ── DISASTERS: FIRE ── timber buildings can catch and spread; a bucket brigade
   (tapping the blaze) and nearby settlers, rain, or winter put it out. */
const FLAMMABLE = new Set(['house','manor','tavern','bakery','sawmill','forestCamp',
  'farm','granary','windmill','huntingCabin','fishingHut','tradingPost','guardPost']);
function removeBuilding(b){
  for(let yy=b.gy; yy<b.gy+b.h; yy++) for(let xx=b.gx; xx<b.gx+b.w; xx++){
    if(G.grid[yy] && G.grid[yy][xx] && G.grid[yy][xx].building===b) G.grid[yy][xx].building = null;
  }
  G.villagers.forEach(v=>{
    if(v.targetBuilding===b){ v.targetBuilding=null; v.path=[]; v.pathTarget=null;
      if(/^walking/.test(v.state) || v.state==='working' || v.state==='farming') v.state='idle'; }
  });
  const i = G.buildings.indexOf(b); if(i>=0) G.buildings.splice(i,1);
  if(selection && selection.ref===b && typeof deselectAll==='function') deselectAll();
}
function fireDrynessMul(){
  let m = 1; const s = seasonIndex();
  if(s===1) m *= 1.7;          // summer — dry
  else if(s===3) m *= 0.12;    // winter — snow-damped
  else if(s===2) m *= 1.15;    // autumn — dry leaves
  if(weather.type==='rain') m *= 0.3;
  else if(weather.type==='storm') m *= 0.5;
  else if(weather.type==='snow') m *= 0.2;
  else if(weather.type==='clear') m *= 1.2;
  m *= climateFireMul();   // drought dries the timber; a cold snap damps it
  return m;
}
function nearWell(gx, gy){
  return G.buildings.some(w=>w.type==='well' && (w.condition===undefined||w.condition>=35) && dist2(gx,gy,w.gx,w.gy) < 12.25); // within ~3.5 tiles
}
function igniteBuilding(b, announce){
  if(!b || b._fire || !FLAMMABLE.has(b.type)) return;
  if(b.condition!==undefined && b.condition<=0) return;
  b._fire = 20 + Math.random()*14;
  if(announce){
    toast('🔥 Fire! Your '+(BUILD_DEFS[b.type]?BUILD_DEFS[b.type].name:b.type)+' is ablaze — tap it and send a bucket brigade!', true);
    if(typeof sfx==='function') sfx('fire');
  }
}
function fireTick(dt){
  fireTimer -= dt;
  if(fireTimer<=0){
    fireTimer = 320 + Math.random()*300;
    const cand = G.buildings.filter(b=>FLAMMABLE.has(b.type) && (b.condition===undefined||b.condition>0));
    // Only once the hold is established, and never while one is already ablaze.
    if(gameMode.banditsEnabled!==false && G.dayCount>2 && cand.length>=4 && !G.buildings.some(b=>b._fire)){
      const chance = Math.min(0.6, 0.28 * fireDrynessMul() * (gameMode.decayMul||1));
      if(Math.random() < chance){
        const pick = cand[Math.floor(Math.random()*cand.length)];
        const c = buildingCenter(pick);
        // A well nearby usually smothers a spark before it takes hold.
        if(!(nearWell(c.gx,c.gy) && Math.random()<0.7)) igniteBuilding(pick, true);
      }
    }
  }
  const burning = G.buildings.filter(b=>b._fire);
  if(!burning.length) return;
  const ambientDouse = weather.type==='storm'?11:weather.type==='rain'?8:weather.type==='snow'?6:0;
  for(const b of burning){
    const c = buildingCenter(b);
    const near = G.villagers.filter(v=>v.stage!=='child' && dist2(v.gx,v.gy,c.gx,c.gy) < 9).length;
    const wellDouse = nearWell(c.gx,c.gy) ? 4.5 : 0;   // a well close by keeps water flowing
    const douse = ambientDouse + wellDouse + near*2.2 + (b._bucket||0);
    b._bucket = Math.max(0, (b._bucket||0) - dt*7);
    b._fire = clamp(b._fire + (3.6 - douse)*dt, 0, 100);
    if(b.condition===undefined) b.condition = 100;
    b.condition = Math.max(0, b.condition - b._fire*0.05*dt);
    if(b._fire <= 0.5){
      delete b._fire; delete b._bucket;
      toast('💧 The fire at your '+(BUILD_DEFS[b.type]?BUILD_DEFS[b.type].name:b.type)+' is out.');
      G.villagers.forEach(v=>{ if(dist2(v.gx,v.gy,c.gx,c.gy)<9 && v.morale!==undefined) v.morale=clamp(v.morale+3,0,100); });
      continue;
    }
    if(b.condition <= 0){
      const nm = BUILD_DEFS[b.type]?BUILD_DEFS[b.type].name:b.type;
      removeBuilding(b);
      toast('🔥 Your '+nm+' has burned to the ground!', true);
      if(typeof chron==='function') chron('fire', nm);
      G.villagers.forEach(v=>{ if(v.morale!==undefined) v.morale=clamp(v.morale-6,0,100); });
      continue;
    }
    // spread to a nearby timber building when the blaze is strong
    if(b._fire > 45){
      for(const o of G.buildings){
        if(o===b || o._fire || !FLAMMABLE.has(o.type)) continue;
        const oc = buildingCenter(o);
        if(dist2(c.gx,c.gy,oc.gx,oc.gy) < 5.8 && Math.random() < 0.13*dt){
          igniteBuilding(o);
          toast('🔥 The fire spreads to your '+(BUILD_DEFS[o.type]?BUILD_DEFS[o.type].name:o.type)+'!', true);
        }
      }
    }
  }
}
function drawBuildingFire(b){
  if(!b._fire) return;
  const c = buildingCenter(b);
  const p = project(c.gx, c.gy);
  const baseY = p.y + TILE_H * (b.h > 1 ? b.h * 0.5 : 0.5);
  const n = b._fire>60 ? 3 : (b._fire>30 ? 2 : 1);
  for(let i=0;i<n;i++){
    const ox = (i-(n-1)/2) * 12;
    const img = decorImg('fire', G.worldTime*9 + b.gx*3.1 + i*7);
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

const camera = { panX:0, panY:0, scale:1.05 };
const panVel = { x:0, y:0, active:false };
// Eased camera glide to a target pan (used when focusing a selection). Any
// direct drag/pinch clears it (see input handlers). Lerped in loop().
const camGlide = { x:0, y:0, active:false };
function panCameraTo(wx, wy){
  panVel.active = false;
  camGlide.x = -wx*camera.scale;
  camGlide.y = -wy*camera.scale + cssH*0.35;
  camGlide.active = true;
}

// Keep the map always at least 40% visible on each axis.
const ZOOM_MIN = 0.4, ZOOM_MAX = 2.4;
// Pick a starting zoom that fits a comfortable slice of the hold on whatever
// screen you're on — small phones and un-maximized windows were far too zoomed
// in (only a few tiles visible). Aims for ~10 tiles across the smaller side.
function initCameraZoom(){
  const minDim = Math.min(cssW, cssH);
  camera.scale = Math.max(0.6, Math.min(1.25, minDim / (10 * TILE_W)));
}
function clampCamera(){
  // The isometric diamond spans world X in [-half, +half] (centered on 0)
  // and world Y in [0, G.MAP_SIZE*TILE_H]. The screen-center look-at point in
  // world coords is (-panX/scale, -panY/scale); clamp THAT to the map bounds
  // so the camera can never wander into the void.
  camera.scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camera.scale));
  const s = camera.scale;
  const halfW = G.MAP_SIZE * (TILE_W/2);
  const minWX = -halfW, maxWX = halfW;
  const minWY = 0, maxWY = G.MAP_SIZE * TILE_H;
  // pan = -lookAt*scale  →  lookAt = -pan/scale
  camera.panX = Math.max(-maxWX*s, Math.min(-minWX*s, camera.panX));
  camera.panY = Math.max(-maxWY*s, Math.min(-minWY*s, camera.panY));
}
let cssW=window.innerWidth, cssH=window.innerHeight;

/* =========================================================================
   MAP GENERATION
========================================================================= */
/* Smooth value noise in [0,1). Two octaves is plenty at 36 tiles across —
   more only adds cost the eye can't resolve at this scale. */

/* =========================================================================
   BUILDINGS
========================================================================= */
function addBuilding(type, gx, gy){
  // (processing buildings get a procTimer below)
  const b = { id:'b'+Math.random().toString(36).slice(2,9), type, gx, gy, w:1, h:1, workers:0, condition:100 };
  if(type==='townCenter'){ b.w=2; b.h=2; }
  if(BUILD_DEFS[type] && BUILD_DEFS[type].proc) b.procTimer = BUILD_DEFS[type].proc.every;
  G.buildings.push(b);
  if(b.w===1){ if(G.grid[gy] && G.grid[gy][gx]) G.grid[gy][gx].building = b; }
  else {
    for(let yy=gy; yy<gy+b.h; yy++) for(let xx=gx; xx<gx+b.w; xx++) if(G.grid[yy] && G.grid[yy][xx]) G.grid[yy][xx].building = b;
  }
  return b;
}
function buildingCenter(b){
  return { gx:b.gx + b.w/2 - 0.5, gy:b.gy + b.h/2 - 0.5 };
}

// BFS the road/bridge network out from the Town Center; processors with a
// connected road in their 8-neighborhood get the logistics bonus.
let _logisticsTimer = 0;
function recomputeLogistics(){
  const tc = findTC();
  if(!tc){ G.buildings.forEach(b=>{ b._roadLinked=false; }); return; }
  const isRoadTile = (x,y)=>{ const t=tileAt(x,y); return t && t.building && (t.building.type==='road'||t.building.type==='bridge'); };
  const seen = new Set(), queue = [];
  // seed: road tiles touching the TC footprint (incl. diagonals)
  for(let y=tc.gy-1; y<=tc.gy+tc.h; y++) for(let x=tc.gx-1; x<=tc.gx+tc.w; x++){
    if(isRoadTile(x,y) && !seen.has(x+','+y)){ seen.add(x+','+y); queue.push([x,y]); }
  }
  while(queue.length){
    const [x,y] = queue.pop();
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue;
      const k=(x+dx)+','+(y+dy);
      if(!seen.has(k) && isRoadTile(x+dx,y+dy)){ seen.add(k); queue.push([x+dx,y+dy]); }
    }
  }
  for(const b of G.buildings){
    if(!BUILD_DEFS[b.type] || !BUILD_DEFS[b.type].proc){ b._roadLinked=false; continue; }
    let linked=false;
    for(let dy=-1;dy<=b.h&&!linked;dy++) for(let dx=-1;dx<=b.w;dx++){
      if(seen.has((b.gx+dx)+','+(b.gy+dy))){ linked=true; break; }
    }
    b._roadLinked = linked;
  }
}
function popCapacity(){
  let cap = 4;
  for(const b of G.buildings) if(b.type==='house') cap += 3;
  for(const b of G.buildings) if(b.type==='manor') cap += 6;
  return cap;
}
function hasBuildingType(type){ return G.buildings.some(b=>b.type===type); }
function hasActiveBuilding(type){ return G.buildings.some(b=>b.type===type && (b.condition===undefined||b.condition>=35)); }
function nearestBuildingOfTypes(types, fromGX, fromGY, requireSlot){
  let best=null, bestD=Infinity;
  for(const b of G.buildings){
    if(!types.includes(b.type)) continue;
    if(requireSlot && b.workers>=3) continue;
    const c = buildingCenter(b);
    const d = dist2(fromGX,fromGY,c.gx,c.gy);
    if(d<bestD){ bestD=d; best=b; }
  }
  return best;
}

/* =========================================================================
   VILLAGERS
========================================================================= */
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
const LEGACY_TRAITS = {
  brave:     {id:'brave',     label:'Brave',     ic:'🦁', desc:'Stood through a raid — loses only half morale to attacks.'},
  steadfast: {id:'steadfast', label:'Steadfast', ic:'🕯️', desc:'Carries a loved one\'s memory — steadier morale.'},
};

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

function releaseClaims(v){
  if(v.targetTile){ v.targetTile.workers = Math.max(0,v.targetTile.workers-1); v.targetTile=null; }
  if(v.targetBuilding){ v.targetBuilding.workers = Math.max(0,v.targetBuilding.workers-1); v.targetBuilding=null; }
  v.path=[]; v.pathTarget=null; v.carrying=null;
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

/* ═══════════════════════════════════════════════════════════════════════
   STEWARD'S WORD — a natural-ish command console. You type an order in
   plain words ("build 3 houses", "we need more wood", "put 2 to mining")
   and a local parser turns it into a queue of orders the settlers carry
   out: gather any shortfall, then place and raise what you asked for.
   Fully offline — no network, no LLM — a forgiving keyword grammar.
   ═══════════════════════════════════════════════════════════════════════ */
let stewardOrders = [];
/* Condition decays every day, so almost every building sits a shade under 100.
   This is the line where a roof is actually worth mending — mending to "100 or
   nothing" would spend wood forever and never finish. */
const WORN_ENOUGH = 70;
// word/synonym → BUILD_DEFS key. Multi-word and specific keys are matched
// before generic ones (the lookup order is sorted longest-first).
const STEWARD_BUILD = {
  'house':'house','home':'house','cottage':'house','hut':'house',
  'manor':'manor','hall':'manor',
  'farm':'farm','field':'farm','crops':'farm','crop':'farm',
  'tavern':'tavern','inn':'tavern','pub':'tavern',
  'windmill':'windmill',
  'sawmill':'sawmill','saw mill':'sawmill',
  'bakery':'bakery','bakehouse':'bakery',
  'granary':'granary','storehouse':'granary','storage':'granary',
  'trading post':'tradingPost','tradingpost':'tradingPost','market':'tradingPost','trading':'tradingPost',
  'watchtower':'watchtower','watch tower':'watchtower','tower':'watchtower',
  'well':'well',
  'lamp post':'lampPost','lamppost':'lampPost','lamp':'lampPost','lantern':'lampPost','lamps':'lampPost',
  'mining post':'miningPost','mine':'miningPost','quarry':'miningPost','mining':'miningPost',
  'forestry camp':'forestCamp','forestry':'forestCamp','lumber camp':'forestCamp','logging camp':'forestCamp','woodcutter':'forestCamp','lumberjack':'forestCamp',
  'fishing hut':'fishingHut','fishery':'fishingHut','fishing':'fishingHut',
  'hunting cabin':'huntingCabin','hunting lodge':'huntingCabin','hunting':'huntingCabin',
  'pasture':'pasture','ranch':'pasture','pen':'pasture',
  'guard post':'guardPost','guardpost':'guardPost','barracks':'guardPost',
  'palisade':'palisade','wall':'palisade','fence':'palisade',
  'foresters grove':'forester','grove':'forester',
};
const STEWARD_BUILD_KEYS = Object.keys(STEWARD_BUILD).sort((a,b)=>b.length-a.length);
const STEWARD_RES = { 'wood':'wood','timber':'wood','logs':'wood','log':'wood','stone':'stone','rock':'stone','rocks':'stone','food':'food','grain':'food','planks':'planks','plank':'planks','flour':'flour','bread':'bread' };
const STEWARD_ROLE = { 'guard':'guard','guards':'guard','lumberjack':'lumberjack','woodcutter':'lumberjack','logging':'lumberjack','miner':'miner','mining':'miner','farmer':'farmer','farming':'farmer','fisher':'fisher','fishing':'fisher','hunter':'hunter','hunting':'hunter' };

/* Look a word up in one of the steward's dictionaries, tolerating the plural
   and the "-ing" form. "Put two to guarding" read as nothing at all before,
   which is exactly the phrasing you reach for when nobody is idle. */
function stewardLookup(s, dict){
  const keys = Object.keys(dict).sort((a,b)=>b.length-a.length);
  for(const key of keys){
    const stem = key.replace(/e$/,'');
    if(s.includes(' '+key+' ') || s.includes(' '+key+'s ') ||
       s.includes(' '+key+'ing ') || s.includes(' '+stem+'ing ')) return dict[key];
  }
  return null;
}
function stewardNum(s){
  const m = s.match(/\b(\d{1,3})\b/); if(m) return Math.min(50, parseInt(m[1],10));
  for(const w of Object.keys(NUM_WORDS)){ if(new RegExp('\\b'+w+'\\b').test(s)) return NUM_WORDS[w]; }
  return null;
}
function stewardPlural(label, n){ return n>1 && !/s$/.test(label) ? (label+'s') : label; }
// Can this building type stand on this tile? (Standalone — no buildMode.)
function spotOkFor(bkey, gx, gy){
  const t = tileAt(gx,gy);
  if(!t) return false;
  if(bkey==='bridge') return t.type==='water' && !t.building;
  if(t.type!=='grass' && t.type!=='dirt') return false;
  if(t.building) return false;
  const adj = BUILD_NEEDS_ADJ[bkey];
  if(adj){ let ok=false; for(let dy=-1;dy<=1&&!ok;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const nt=tileAt(gx+dx,gy+dy); if(nt&&adj.test(nt)){ ok=true; break; } } if(!ok) return false; }
  return true;
}
/* Where a building WANTS to be. A steward who drops everything in the first
   free ring makes a blob; one who thinks about what the building is for lays
   out a hold. Scored, not first-fit. */
const BUILD_WANTS_NEAR = {
  forestCamp:   (t)=>t.type==='forest',
  forester:     (t)=>t.type==='forest',
  miningPost:   (t)=>t.type==='stone',
  fishingHut:   (t)=>t.type==='water',
  huntingCabin: (t)=>!!t.wilds,
  farm:         (t)=>t.type==='water',    // irrigation bonus
  pasture:      (t)=>t.type==='grass',
};
function stewardFindSpot(bkey){
  const cx = Math.round(G.TC_CX), cy = Math.round(G.TC_CY);
  const want = BUILD_WANTS_NEAR[bkey];
  const R = Math.floor(G.MAP_SIZE/2);
  let best = null, bestScore = -Infinity;
  for(let dy=-R; dy<=R; dy++) for(let dx=-R; dx<=R; dx++){
    const ring = Math.max(Math.abs(dx), Math.abs(dy));
    if(ring < 2) continue;                       // leave the town centre room
    const gx = cx+dx, gy = cy+dy;
    if(!spotOkFor(bkey, gx, gy)) continue;
    let score = -ring * 1.6;                     // near the hold, all else equal
    if(want){
      let n = 0;
      for(let yy=-2; yy<=2; yy++) for(let xx=-2; xx<=2; xx++){
        const t = tileAt(gx+xx, gy+yy);
        if(t && want(t)) n++;
      }
      score += n * 2.4;
    }
    let crowd = 0;
    for(let yy=-1; yy<=1; yy++) for(let xx=-1; xx<=1; xx++){
      const t = tileAt(gx+xx, gy+yy);
      if(t && t.building) crowd++;
    }
    score -= crowd * 1.2;                        // room to breathe between roofs
    if(score > bestScore){ bestScore = score; best = { gx, gy }; }
  }
  return best;
}
// Put idle settlers to work gathering a resource (needs the matching workplace).
function stewardAssignGatherers(res){
  const roleFor = { wood:'lumberjack', stone:'miner', food:'farmer' };
  const bFor    = { lumberjack:'forestCamp', miner:'miningPost', farmer:'farm' };
  const role = roleFor[res]; if(!role) return 'unprocessable'; // planks/flour/bread come from processors
  if(!hasActiveBuilding(bFor[role])) return 'noplace';
  // Already have workers on it? Then gathering is under way — no need to pull more.
  if(G.villagers.some(v=>v.role===role)) return 'ok';
  return stewardStaff(role, 6) > 0 ? 'ok' : 'noidle';
}
/* Staff a trade: idle hands first, then the most over-staffed other trade.
   "Put two to mining" used to do nothing at all once everyone had a job, which
   is precisely when you most want to say it. Never strips a trade to nobody. */
function stewardStaff(role, count){
  let moved = 0;
  const free = G.villagers.filter(v=>v.role==='idle' && v.stage!=='child' && v.state!=='spawning');
  for(const v of free){ if(moved>=count) break; reassignRole(v, role); moved++; }
  if(moved >= count) return moved;
  const counts = {};
  for(const v of G.villagers){ if(v.stage!=='child' && v.state!=='spawning') counts[v.role] = (counts[v.role]||0)+1; }
  while(moved < count){
    let from = null, most = 1;                   // must leave at least one behind
    for(const r of Object.keys(counts)){
      if(r===role || r==='idle') continue;
      if(counts[r] > most){ most = counts[r]; from = r; }
    }
    if(!from) break;
    const v = G.villagers.find(x=>x.role===from && x.stage!=='child' && x.state!=='spawning');
    if(!v){ counts[from] = 0; continue; }
    reassignRole(v, role);
    counts[from]--; counts[role] = (counts[role]||0)+1; moved++;
  }
  return moved;
}
const STEWARD_WORKPLACE = { wood:'Forestry Camp', stone:'Mining Post', food:'Farm' };
function stewardBlockMsg(res, why){
  if(why==='noplace') return '📜 To gather '+res+' we first need a '+(STEWARD_WORKPLACE[res]||'workplace')+'.';
  if(why==='unprocessable') return '📜 '+res+' must be crafted at a workshop — I cannot gather it directly.';
  if(why==='noidle') return '📜 No hands free to gather '+res+' — free some or wait for settlers.';
  return '';
}
function stewardAfford(bkey){ const d=BUILD_DEFS[bkey]; return !!d && Object.entries(d.cost).every(([k,amt])=>!amt || (G.stockpile[k]||0)>=amt); }
function stewardOrderLine(o){
  if(o.kind==='build')    return '🔨 Raise '+o.count+' '+o.label+' — '+o.placed+'/'+o.count;
  if(o.kind==='gather')   return '🌾 Gather '+o.res+' — '+Math.floor(G.stockpile[o.res]||0)+'/'+o.target;
  if(o.kind==='assign')   return '⚒️ '+o.count+' to '+(ROLE_DEFS[o.role]?ROLE_DEFS[o.role].label:o.role);
  if(o.kind==='demolish') return '⛏️ Tear down '+o.count+' '+o.label+' — '+o.done+'/'+o.count;
  if(o.kind==='repair')   return '🔧 Mend the hold — '+o.done+' mended';
  if(o.kind==='research') return '🔬 Study '+o.name;
  return '';
}
function updateStewardStatus(){
  const el = document.getElementById('steward-status');
  if(!el) return;
  const o = stewardOrders[0];
  if(!o){ el.classList.add('hidden'); return; }
  let txt = '🗣️ ' + stewardOrderLine(o);
  if(o.stall > 4) txt += ' · waiting';
  if(stewardOrders.length>1) txt += '  (+'+(stewardOrders.length-1)+')';
  el.textContent = txt;
  el.classList.remove('hidden');
}
/* An order that cannot proceed goes to the back of the queue rather than
   blocking it. A hold waiting on stone shouldn't stop building with wood. */
function stewardStall(o){
  o.stall = (o.stall||0) + 1;
  if(o.stall >= 6 && stewardOrders.length > 1){
    o.stall = 0; o._warned = false;
    stewardOrders.push(stewardOrders.shift());
  }
}
let _stewardT = 0;
function processStewardOrders(dt){
  updateStewardStatus();
  if(!stewardOrders.length) return;
  _stewardT -= dt; if(_stewardT>0) return; _stewardT = 1.0;   // act about once a second
  const o = stewardOrders[0];
  if(o.kind==='build'){
    if(o.placed>=o.count){ toast('📜 The '+o.count+' '+o.label+' '+(o.count>1?'stand':'stands')+' raised, as you ordered.'); stewardOrders.shift(); return; }
    if(stewardAfford(o.bkey)){
      const spot = stewardFindSpot(o.bkey);
      if(!spot){ toast('📜 There is no room to raise the '+o.label+' near the hold.', true); stewardOrders.shift(); return; }
      const d = BUILD_DEFS[o.bkey];
      for(const [k,amt] of Object.entries(d.cost)){ if(amt>0) G.stockpile[k]-=amt; }
      addBuilding(o.bkey, spot.gx, spot.gy); if(typeof spawnDust==='function') spawnDust(spot.gx+0.5, spot.gy+0.5); if(typeof sfx==='function') sfx('build');
      o.placed++; o.stall = 0;
      if(o.placed>=o.count){ toast('📜 The '+o.count+' '+o.label+' '+(o.count>1?'stand':'stands')+' raised, as you ordered.'); stewardOrders.shift(); }
    } else {
      const d = BUILD_DEFS[o.bkey]; let blocked=null;
      for(const [k,amt] of Object.entries(d.cost)){ if(amt>0 && (G.stockpile[k]||0) < amt){ const st=stewardAssignGatherers(k); if(st!=='ok') blocked={res:k,why:st}; } }
      if(blocked && !o._warned){ o._warned=true; toast(stewardBlockMsg(blocked.res, blocked.why), true); }
      stewardStall(o);
    }
  } else if(o.kind==='gather'){
    if((G.stockpile[o.res]||0) >= o.target){ toast('📜 We have gathered the '+o.res+' you asked for.'); stewardOrders.shift(); return; }
    const st = stewardAssignGatherers(o.res);
    if(st!=='ok'){ if(!o._warned){ o._warned=true; toast(stewardBlockMsg(o.res, st), true); } stewardOrders.shift(); }
    else stewardStall(o);   // gathering takes time; rotate so other orders run too
  } else if(o.kind==='assign'){
    const n = stewardStaff(o.role, o.count);
    toast(n ? ('📜 '+n+' settler'+(n!==1?'s':'')+' set to '+ROLE_DEFS[o.role].label+'.') : '📜 No one can be spared for that.', !n);
    stewardOrders.shift();
  } else if(o.kind==='demolish'){
    const match = G.buildings.filter(b=>b.type===o.bkey);
    if(!match.length || o.done>=o.count){
      toast(o.done ? ('📜 '+o.done+' '+o.label+' torn down.') : ('📜 There is no '+o.label+' to tear down.'), !o.done);
      stewardOrders.shift(); return;
    }
    // Farthest from the hold first — you rarely mean the one at your gate.
    match.sort((a,b)=> dist2(b.gx,b.gy,G.TC_CX,G.TC_CY) - dist2(a.gx,a.gy,G.TC_CX,G.TC_CY));
    demolishBuilding(match[0]); o.done++;
    if(o.done>=o.count){ toast('📜 '+o.done+' '+o.label+' torn down.'); stewardOrders.shift(); }
  } else if(o.kind==='repair'){
    const worn = G.buildings.filter(b=>b.condition!==undefined && b.condition<WORN_ENOUGH);
    if(!worn.length){ toast(o.done ? ('🔧 '+o.done+' building'+(o.done!==1?'s':'')+' mended.') : '🔧 Nothing is in need of mending.'); stewardOrders.shift(); return; }
    worn.sort((a,b)=>a.condition-b.condition);
    const b = worn[0];
    const cost = Math.max(2, Math.ceil((100-b.condition)/10));
    if((G.stockpile.wood||0) < cost){
      if(!o._warned){ o._warned=true; toast('🔧 Not enough wood to mend the hold — '+cost+' needed.', true); }
      stewardStall(o); return;
    }
    G.stockpile.wood -= cost; b.condition = 100; o.done++; o.stall = 0;
    if(typeof sfx==='function') sfx('repair');
  } else if(o.kind==='research'){
    if(G.researched[o.id]){ toast('🔬 '+o.name+' is already known.'); stewardOrders.shift(); return; }
    if(G.activeResearch){ stewardStall(o); return; }
    const t = TECH_TREE.find(x=>x.id===o.id);
    const short = t && Object.entries(t.cost).find(([k,amt])=>(G.stockpile[k]||0) < amt);
    if(short){
      if(!o._warned){ o._warned=true; toast('🔬 We lack the '+short[0]+' to study '+o.name+'.', true); }
      stewardStall(o); return;
    }
    startResearch(o.id); stewardOrders.shift();
  }
}

/* ── PARSER ──
   A forgiving keyword grammar, no network and no model. Orders are split on
   "and"/"then"/commas first, so one sentence can carry several instructions —
   "build 2 farms and put 3 to farming" is two orders, not one misread. */
function stewardAnswer(s){
  if(/\b(help|what can you|what can i say|commands)\b/.test(s)){
    return '📜 Try: "build 3 houses", "we need more wood", "put 2 to mining", "tear down a palisade", "mend the hold", "study irrigation", or "how much stone".';
  }
  if(/\b(how much|how many|do we have|what do we have)\b/.test(s)){
    const res = stewardLookup(s, STEWARD_RES);
    if(res) return '📜 We hold '+Math.floor(G.stockpile[res]||0)+' '+res+'.';
    if(/\b(settlers|people|folk|G.villagers|souls|population)\b/.test(s)){
      const idle = G.villagers.filter(v=>v.role==='idle').length;
      return '📜 '+G.villagers.length+' souls in the hold'+(idle?', '+idle+' of them idle.':', all at work.');
    }
  }
  if(/\b(what are you doing|status|report|progress)\b/.test(s)){
    if(!stewardOrders.length) return '📜 Nothing stands ordered — the hold awaits your word.';
    return '📜 '+stewardOrders.map(stewardOrderLine).join(' · ');
  }
  return null;
}
function stewardClause(s, out){
  const num = stewardNum(s);
  let bkey=null, blabel=null;
  for(const key of STEWARD_BUILD_KEYS){ if(s.includes(' '+key+' ') || s.includes(' '+key+'s ')){ bkey=STEWARD_BUILD[key]; blabel=key; break; } }
  const res  = stewardLookup(s, STEWARD_RES);
  const role = stewardLookup(s, STEWARD_ROLE);

  const wantsDemolish = /\b(demolish|tear down|tear|remove|destroy|raze|knock down|pull down|scrap)\b/.test(s);
  const wantsRepair   = /\b(repair|mend|fix|restore)\b/.test(s);
  const wantsResearch = /\b(research|study|learn|discover)\b/.test(s);
  const wantsBuild    = /\b(build|raise|construct|make|erect|put up|need|want|more)\b/.test(s);
  const wantsGather   = /\b(gather|get|collect|bring|fetch|need|want|more|stock|mine|chop|cut)\b/.test(s);
  const wantsAssign   = /\b(assign|put|send|set|move|make|switch)\b/.test(s);

  // Tearing down and mending are checked before building: "tear down the farm"
  // names a building too, and used to raise a second one.
  if(wantsDemolish && bkey){
    const count = Math.max(1, num||1);
    out.push({ kind:'demolish', bkey, label:stewardPlural(blabel,count), count, done:0 });
    return 'we will tear down '+count+' '+stewardPlural(blabel,count);
  }
  if(wantsRepair){
    out.push({ kind:'repair', done:0 });
    return 'the worn buildings will be mended';
  }
  if(wantsResearch){
    const t = TECH_TREE.find(x=> s.includes(' '+x.name.toLowerCase()+' ') || s.includes(' '+x.id.toLowerCase()+' '));
    if(t){ out.push({ kind:'research', id:t.id, name:t.name }); return 'we will study '+t.name; }
    // The verb landed but the subject didn't. Naming what CAN be studied beats
    // a shrug — the player knows what they meant, they just used our word for it
    // rather than theirs.
    const open = TECH_TREE.filter(x=>!G.researched[x.id] && (!x.req || G.researched[x.req])).slice(0,4).map(x=>x.name);
    if(open.length) out.push({ kind:'answer', msg:'🔬 I do not know that study. We could begin: '+open.join(', ')+'.' });
    else out.push({ kind:'answer', msg:'🔬 There is nothing left to study.' });
    return null;
  }
  if(bkey && wantsBuild){
    const count = Math.max(1, num||1);
    out.push({ kind:'build', bkey, label:stewardPlural(blabel,count), count, placed:0 });
    return 'we will raise '+count+' '+stewardPlural(blabel,count);
  }
  if(role && wantsAssign){
    const count = Math.max(1, num||1);
    out.push({ kind:'assign', role, count });
    return count+' will take up '+ROLE_DEFS[role].label;
  }
  if(res && wantsGather){
    const cur = Math.floor(G.stockpile[res]||0);
    const tgt = /\bmore\b/.test(s) ? cur + (num||50) : Math.max(num||50, cur+1);
    out.push({ kind:'gather', res, target:tgt });
    return 'the folk will gather '+res+' to about '+tgt;
  }
  if(bkey){ // named a building without a clear verb — assume build
    const count = Math.max(1, num||1);
    out.push({ kind:'build', bkey, label:stewardPlural(blabel,count), count, placed:0 });
    return 'we will raise '+count+' '+stewardPlural(blabel,count);
  }
  return null;
}
function stewardCommand(text){
  const clean = (t)=>' '+String(t||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim()+' ';
  const s = clean(text);
  if(!s.trim()) return { ok:false, msg:'🤔 Say the word and it is done.' };
  if(/\b(stop|cancel|halt|nevermind|never mind|abort|clear orders|disregard|belay)\b/.test(s)){
    const n = stewardOrders.length; stewardOrders = [];
    return { ok:true, msg: n ? ('⛔ '+n+' standing order'+(n!==1?'s':'')+' cleared.') : '⛔ Nothing was ordered.' };
  }
  const answer = stewardAnswer(s);
  if(answer) return { ok:true, msg:answer, answered:true };

  // One sentence, several orders.
  const parts = s.split(/\s(?:and then|then|and also|also|and|plus)\s/).map(clean).filter(x=>x.trim());
  const queued = [];
  const said = [];
  for(const part of parts){
    const r = stewardClause(part, queued);
    if(r) said.push(r);
  }
  const spoken = queued.filter(o=>o.kind==='answer');
  if(spoken.length){
    for(let i=queued.length-1;i>=0;i--) if(queued[i].kind==='answer') queued.splice(i,1);
    if(!queued.length) return { ok:true, msg:spoken[0].msg, answered:true };
  }
  if(!queued.length){
    return { ok:false, msg:'🤔 I did not catch that. Try "build 3 houses", "we need more wood", or "put 2 to mining" — or say "help".' };
  }
  for(const o of queued) stewardOrders.push(o);
  const head = queued.length>1 ? '📜 Understood — ' : (queued[0].kind==='build' ? '🔨 Understood — ' : queued[0].kind==='gather' ? '🌾 Understood — ' : queued[0].kind==='demolish' ? '⛏️ Understood — ' : queued[0].kind==='repair' ? '🔧 Understood — ' : queued[0].kind==='research' ? '🔬 Understood — ' : '⚒️ Understood — ');
  return { ok:true, msg: head + said.join(', then ') + '.' };
}


// A tile a settler may stand on / walk through. Water is impassable unless
// bridged, forded, or frozen over; occupied tiles are blocked except for the
// walk-through structures (farm plots, roads, bridges).
function tileWalkable(gx,gy){
  if(gx<0||gy<0||gx>=G.MAP_SIZE||gy>=G.MAP_SIZE) return false;
  const t = G.grid[gy] && G.grid[gy][gx];
  if(!t) return false;
  if(t.type==='water'){
    const crossable = (t.building && t.building.type==='bridge') || t.ford || riverFrozen();
    if(!crossable) return false;
  }
  if(t.building && t.building.type!=='farm' && t.building.type!=='road' && t.building.type!=='bridge') return false;
  return true;
}
// Nearest walkable tile to (gx,gy), searched in expanding rings. Used to keep
// wander/work targets off the water — a fisher ends up on the shore, never
// standing in the river.
function nearestWalkable(gx,gy,maxR){
  gx=Math.round(gx); gy=Math.round(gy); maxR=maxR||5;
  if(tileWalkable(gx,gy)) return {gx,gy};
  for(let r=1;r<=maxR;r++){
    for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
      if(tileWalkable(gx+dx,gy+dy)) return {gx:gx+dx, gy:gy+dy};
    }
  }
  return null;
}

function pathFind(fromGX, fromGY, toGX, toGY){
  const startGX=Math.round(fromGX), startGY=Math.round(fromGY);
  const goalGX=Math.round(toGX), goalGY=Math.round(toGY);
  if(startGX===goalGX && startGY===goalGY) return [];
  const inBounds=(x,y)=>x>=0&&y>=0&&x<G.MAP_SIZE&&y<G.MAP_SIZE;
  if(!inBounds(startGX,startGY)||!inBounds(goalGX,goalGY)) return [];
  const key=(x,y)=>x*1000+y;
  const open=[{x:startGX,y:startGY,g:0,h:Math.abs(startGX-goalGX)+Math.abs(startGY-goalGY),parent:null}];
  open[0].f=open[0].h;
  const closed=new Set(); const bestG={};
  bestG[key(startGX,startGY)]=0;
  const DIRS=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  let iters=0;
  // Cap scales a little with map size so long, obstructed routes resolve instead
  // of the settler giving up and standing still on bigger holds.
  const ITER_CAP = Math.min(600, Math.max(240, G.MAP_SIZE*G.MAP_SIZE/2));
  while(open.length>0 && iters++<ITER_CAP){
    // find min-f node (small array, no heap needed)
    let bi=0;
    for(let i=1;i<open.length;i++) if(open[i].f<open[bi].f) bi=i;
    const cur=open.splice(bi,1)[0];
    if(cur.x===goalGX && cur.y===goalGY){
      const path=[]; let n=cur;
      while(n.parent){ path.unshift({gx:n.x,gy:n.y}); n=n.parent; }
      return path;
    }
    const k=key(cur.x,cur.y);
    if(closed.has(k)) continue;
    closed.add(k);
    for(const [dx,dy] of DIRS){
      const nx=cur.x+dx, ny=cur.y+dy;
      if(!inBounds(nx,ny)) continue;
      const nk=key(nx,ny);
      if(closed.has(nk)) continue;
      const t=G.grid[ny]&&G.grid[ny][nx];
      if(!t) continue;
      // Water is impassable — except over a bridge, wading a ford (slow),
      // or across winter ice when the river freezes.
      const waterCrossable = (t.building && t.building.type==='bridge') || t.ford || riverFrozen();
      if(t.type==='water' && !waterCrossable) continue;
      const isGoal=nx===goalGX&&ny===goalGY;
      const walkable=isGoal||!(t.building&&t.building.type!=='farm'&&t.building.type!=='road'&&t.building.type!=='bridge');
      if(!walkable) continue;
      const wadePenalty = (t.type==='water' && !(t.building&&t.building.type==='bridge')) ? 1.4 : 0;
      const g=cur.g+(dx!==0&&dy!==0?1.41:1)+wadePenalty;
      if(bestG[nk]!==undefined&&bestG[nk]<=g) continue;
      bestG[nk]=g;
      const h=Math.abs(nx-goalGX)+Math.abs(ny-goalGY);
      open.push({x:nx,y:ny,g,h,f:g+h,parent:cur});
    }
  }
  return []; // direct fallback
}

function moveToward(v, tgx, tgy, dt, speedMul){
  const gtx=Math.round(tgx), gty=Math.round(tgy);
  if(!v.pathTarget || v.pathTarget.gx!==gtx || v.pathTarget.gy!==gty){
    v.pathTarget={gx:gtx,gy:gty};
    // Never route onto water or blocked tiles — snap the destination to the
    // nearest walkable tile first (this is what keeps settlers off the river).
    let dgx=gtx, dgy=gty;
    if(!tileWalkable(gtx,gty)){ const w=nearestWalkable(gtx,gty); if(w){ dgx=w.gx; dgy=w.gy; } }
    v.path = pathFind(v.gx, v.gy, dgx, dgy);
    // If still no path, hold position rather than beeline across impassable
    // terrain (the old behavior let villagers walk over water).
    if(!v.path.length) v.path=[{gx:Math.round(v.gx), gy:Math.round(v.gy)}];
  }
  if(!v.path.length) return true;
  const wp=v.path[0];
  const dx=wp.gx-v.gx, dy=wp.gy-v.gy;
  const d=Math.sqrt(dx*dx+dy*dy);
  if(d<0.12){ v.gx=wp.gx; v.gy=wp.gy; v.path.shift(); return v.path.length===0; }
  const curTile=G.grid[Math.round(v.gy)]&&G.grid[Math.round(v.gy)][Math.round(v.gx)];
  const onRoad=curTile&&curTile.building&&curTile.building.type==='road';
  const speed=v.speed*speedMul*effMultiplier(v)*(onRoad?1.3:1)*weatherMoveMul();
  const step=speed*dt;
  v.gx+=dx/d*Math.min(step,d); v.gy+=dy/d*Math.min(step,d);
  v.facing=dx>=0?1:-1;
  return false;
}

function effMultiplier(v){
  let m = 1;
  if(v.hunger>70) m -= 0.35;
  if(v.fatigue>70) m -= 0.35;
  if(v.sick) m -= 0.40;      // additive, not compound — avoids death-spiral
  if(v.trait && v.trait.id==='diligent') m += 0.2;
  if(v.morale!==undefined){ if(v.morale>70) m += 0.10; else if(v.morale<30) m -= 0.20; }
  if(v.stage==='elder') m *= 0.6;   // elders slow, but still contribute
  if(G.festivalBoon==='craft') m += 0.15; // Craftsmen's Fair boon
  m *= skillMul(v);                 // proficiency from time spent in the role
  m *= decreeWorkMul();             // Rationing slows work a touch
  m *= eventSpeedBonus(); // festival boost
  return Math.max(0.12, m);  // floor at 12% so villager never becomes truly catatonic
}
/* ── SKILL GROWTH ── settlers get better at a role the longer they work it */
const SKILL_TIERS = [
  {min:0,   label:'',        ic:'',  mul:1},
  {min:150, label:'Skilled', ic:'✦', mul:1.08},
  {min:420, label:'Master',  ic:'★', mul:1.18},
];
function skillTier(v, role){
  const xp = (v.skills && v.skills[role]) || 0;
  let t = SKILL_TIERS[0];
  for(const s of SKILL_TIERS){ if(xp >= s.min) t = s; }
  return t;
}
function skillMul(v){ return v.role && v.role!=='idle' ? skillTier(v, v.role).mul : 1; }
/* ── GUILDS ── two or more Masters of a trade form a guild, granting a small
   hold-wide bonus to that craft's output. Builds on skill mastery. */
const GUILD_BONUS = 0.10;
function guildBonusVal(){ return (typeof G.researched!=='undefined' && G.researched.charter) ? 0.15 : GUILD_BONUS; }
const GUILD_DEFS = {
  lumberjack:{res:'wood',  ic:'🪓', name:"Woodwrights' Guild",  blurb:'timber comes in faster hold-wide'},
  miner:     {res:'stone', ic:'⛏️', name:"Stonecutters' Guild", blurb:'stone comes in faster hold-wide'},
  farmer:    {res:'farm',  ic:'🌾', name:"Ploughmen's Guild",   blurb:'the fields yield more hold-wide'},
  fisher:    {res:'fish',  ic:'🎣', name:"Fishers' Guild",      blurb:'the nets come back fuller'},
  hunter:    {res:'meat',  ic:'🏹', name:"Hunters' Lodge",      blurb:'the hunt is more bountiful'},
};
function recomputeGuilds(announce){
  const count={};
  for(const v of G.villagers){ if(v.role && skillTier(v,v.role).label==='Master') count[v.role]=(count[v.role]||0)+1; }
  for(const role in GUILD_DEFS){
    const active = (count[role]||0) >= 2;
    if(active && !G.guilds[role] && announce){
      const g=GUILD_DEFS[role];
      toast(g.ic+' The '+g.name+' has formed — '+g.blurb+' (+'+Math.round(guildBonusVal()*100)+'%).');
      if(typeof chron==='function') chron('guild', g.name);
    }
    G.guilds[role] = active;
  }
}
function guildMulRes(resKind){
  const map={wood:'lumberjack', stone:'miner', fish:'fisher', meat:'hunter'};
  const role=map[resKind]; return (role && G.guilds[role]) ? 1+guildBonusVal() : 1;
}
function guildFarmMul(){ return G.guilds.farmer ? 1+guildBonusVal() : 1; }
function hasNearbyMentor(v){
  // A Master of the same role working within ~4 tiles mentors the learner.
  for(const o of G.villagers){
    if(o===v || o.role!==v.role) continue;
    if(skillTier(o, o.role).label!=='Master') continue;
    if(dist2(o.gx,o.gy,v.gx,v.gy) < 16) return true;
  }
  return false;
}
function gainSkill(v, dt){
  if(!v.role || v.role==='idle' || v.stage==='child') return;
  if(!v.skills) v.skills = {};
  const before = skillTier(v, v.role);
  // Apprenticeship: a nearby Master of the same trade doubles learning speed
  // (but only helps those not yet Masters themselves).
  const mentored = before.label!=='Master' && hasNearbyMentor(v);
  if(mentored) v._mentored = 0.6; // brief flag for the mood bubble
  else if(v._mentored) v._mentored = Math.max(0, v._mentored - dt);
  v.skills[v.role] = (v.skills[v.role] || 0) + dt*(mentored?2:1);
  const after = skillTier(v, v.role);
  if(after.label && after.label !== before.label){
    toast(after.ic+' '+v.name+' is now a '+after.label+' '+roleLabel(v.role)+(mentored?' (well taught)':'')+'.');
  }
}

function findResourceTarget(v, list){
  let best=null, bestD=Infinity;
  for(const t of list){
    if(t.resourceAmount<=0) continue;
    if(t.workers>=2) continue;
    // Water can only be fished from an adjacent shore — skip open water with no
    // reachable bank so fishers don't end up "fishing" out on the grass.
    if(t.type==='water'){
      let shore=false;
      for(let dy=-1;dy<=1&&!shore;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; if(tileWalkable(t.gx+dx,t.gy+dy)){ shore=true; break; } }
      if(!shore) continue;
    }
    const d = dist2(v.gx,v.gy,t.gx,t.gy);
    if(d<bestD){ bestD=d; best=t; }
  }
  return best;
}

const SKILL_STATES = ['working','farming','walkingToResource','walkingToFarm','walkingToDropoff'];
function updateVillager(v, dt){
  if(SKILL_STATES.includes(v.state)) gainSkill(v, dt);
  // needs
  const hungerMul = ((v.trait && v.trait.id==='glutton') ? 1.3 : 1) * climateHungerMul() * decreeHungerMul();
  if(!ADMIN.freezeNeeds) v.hunger = clamp(v.hunger + HUNGER_RATE*hungerMul*dt, 0, 100);

  let fr = isNight() ? FATIGUE_RATE*1.8 : FATIGUE_RATE;
  fr *= seasonFatigueMul();
  if(hasActiveBuilding('tavern')) fr *= (G.researched.ale ? 0.7 : 0.8);
  if(v.trait && v.trait.id==='hardy')  fr *= 0.8;
  if(v.trait && v.trait.id==='frail')  fr *= 1.25;
  if(v.sick) fr *= 1.4;
  fr *= weatherFatigueMul();
  fr *= climateFatigueMul();
  if(v.state!=='sleeping' && !ADMIN.freezeNeeds) v.fatigue = clamp(v.fatigue + fr*dt, 0, 100);

  // ── MORALE ── drifts toward a target set by living conditions
  if(v.morale===undefined) v.morale = 65;
  let mTarget = 60;
  if((G.stockpile.bread||0) > 0) mTarget += 12;          // bread in the stores
  if(hasBuildingType('tavern')) mTarget += 10;          // somewhere warm to drink
  if(G.villagers.length <= popCapacity()) mTarget += 8;   // a roof for everyone
  else mTarget -= 15;                                   // overcrowded
  if(v.hunger>75) mTarget -= 20;
  if(v.sick) mTarget -= 18;
  if(seasonIndex()===3) mTarget -= 8;                   // winter gloom
  if(weather.type==='storm') mTarget -= 10;
  if(G.researched.hearth) mTarget += 8;
  if(activeEvent && activeEvent.type==='festival') mTarget += 20;
  if(G.festivalBoon==='courage') mTarget += 8;            // Rite of Courage boon
  if(G.climate) mTarget += CLIMATE_DEFS[G.climate.type].morale; // fair lifts, drought/snap weigh
  if(G.plague) mTarget -= 6;                               // a sickness in the hold weighs on all
  if(G.decrees.curfew) mTarget -= 5;                       // decree discontent
  if(G.decrees.tithe) mTarget -= 6;
  if(v.trait && v.trait.id==='steadfast') mTarget += 6;
  mTarget = clamp(mTarget, 5, 100);
  v.morale = clamp(v.morale + (mTarget - v.morale) * 0.03 * dt, 0, 100);
  // Sustained despair → the settler leaves the hold
  if(v.morale < 15 && G.villagers.length > 3){
    v.moraleLowT = (v.moraleLowT||0) + dt;
    if(v.moraleLowT > 60){
      releaseClaims(v);
      G.villagers.splice(G.villagers.indexOf(v), 1);
      toast('💔 '+v.name+' has lost heart and left the hold...', true);
      // A left-behind partner carries their memory — and steadier resolve
      if(v.partner){
        const p = G.villagers.find(o=>o.name===v.partner);
        if(p){ p.trait = LEGACY_TRAITS.steadfast; toast('🕯️ '+p.name+' keeps '+v.name+'\'s memory close — Steadfast.'); }
      }
      return;
    }
  } else v.moraleLowT = 0;

  // illness: triggered by prolonged hunger (>85) or winter + frail
  if(!v.sick){
    const illnessRisk = (v.hunger>85 ? 0.004 : 0) + ((seasonIndex()===3 && v.trait && v.trait.id==='frail') ? 0.003 : 0);
    if(Math.random() < illnessRisk * (G.researched.herbs?0.6:1) * dt){ v.sick=true; v.sickTimer = (25+Math.random()*20)*(G.researched.herbs?0.6:1); toast(v.name+' has fallen ill!', true); }
  } else {
    v.sickTimer -= dt;
    if(v.sickTimer<=0){ v.sick=false; toast(v.name+' has recovered.'); }
  }

  // famine: if food is out AND hungry, villager's speed drops sharply (already via effMultiplier),
  // but if hunger hits 100 for >20s, trigger a critical crisis toast once
  if(v.hunger>=99.9){
    if(!v._famineWarned){ v._famineWarned=true; toast(v.name+' is starving!', true); }
  } else { v._famineWarned=false; }


  const lockedStates = ['eating','sleeping','seekingFood','seekingSleep'];
  if(!lockedStates.includes(v.state)){
    // Utility needs: eat sooner when there's food to spare (settlers no longer
    // work themselves to the brink of starvation), but hold out through a
    // famine so a lean hold doesn't drain its last stores. Rest a touch earlier.
    const foodToSpare = (G.stockpile.food||0) > G.villagers.length;
    const hungerSeek = foodToSpare ? 86 : 96;
    if(v.fatigue>=92){ releaseClaims(v); v.state='seekingSleep'; }
    else if(v.hunger>=hungerSeek){ releaseClaims(v); v.state='seekingFood'; }
  }

  // Reactive survival: a fire right beside you is dangerous. Children and busy
  // workers scramble away from it; idle adults instead answer the bucket
  // brigade (handled in ambientIdle), so we don't pull them off the fire.
  if(!['eating','sleeping','seekingFood','seekingSleep'].includes(v.state)){
    const adultHelper = v.stage!=='child' && v.role==='idle';
    if(!adultHelper){
      let nd=9, near=null;
      for(const b of G.buildings){ if(!(b._fire>0)) continue; const c=buildingCenter(b); const d=dist2(v.gx,v.gy,c.gx,c.gy); if(d<nd){ nd=d; near=c; } }
      if(near && nd < 6.25){ // within ~2.5 tiles
        releaseClaims(v);
        const ang = Math.atan2(v.gy-near.gy, v.gx-near.gx) || 0;
        v.idleGX = clamp(v.gx + Math.cos(ang)*3.2, 1, G.MAP_SIZE-2);
        v.idleGY = clamp(v.gy + Math.sin(ang)*3.2, 1, G.MAP_SIZE-2);
        v.state = 'idle'; v.idleCooldown = Math.max(v.idleCooldown||0, 1.0); v.ambientEmote = '😱';
      }
    }
  }

  const mul = effMultiplier(v);

  switch(v.state){
    case 'spawning': {
      v.spawnTimer -= dt;
      if(v.spawnTimer<=0) v.state='idle';
      break;
    }
    case 'idle': {
      v.idleCooldown -= dt;
      moveToward(v, v.idleGX, v.idleGY, dt, 1);
      if(v.idleCooldown<=0){
        v.idleCooldown = 0.8 + Math.random()*0.5;
        if(maybeSwitchTrade(v)) break;   // moved trades — pick it up next tick
        if(v.stage==='child'){
          ambientIdle(v); // too young to work — children play near home
        } else if(v.role==='guard'){
          // Guards walk a beat around their post rather than standing on it —
          // a visible patrol, and it puts them between the hold and the treeline.
          const posts = G.buildings.filter(b=>b.type==='guardPost');
          if(posts.length){
            const post = posts[hashStr(v.id) % posts.length];
            v._beat = ((v._beat||0) + 1) % 4;
            const ang = (v._beat/4)*Math.PI*2 + (hashStr(v.name)%100)/100;
            const spot = nearestWalkable(Math.round(post.gx + Math.cos(ang)*2.2),
                                         Math.round(post.gy + 1 + Math.sin(ang)*1.6));
            if(spot){ v.idleGX = spot.gx; v.idleGY = spot.gy; }
            v.ambientEmote = isNight() ? '🔦' : null;
          }
        } else if(v.role==='lumberjack'){
          const t = findResourceTarget(v, G.forestTiles);
          if(t){ t.workers++; v.targetTile=t; v.state='walkingToResource'; v.resKind='wood'; }
        } else if(v.role==='miner'){
          const t = findResourceTarget(v, G.stoneTiles);
          if(t){ t.workers++; v.targetTile=t; v.state='walkingToResource'; v.resKind='stone'; }
        } else if(v.role==='fisher'){
          if(riverFrozen()){
            if(!window._frozenFisherToast){ window._frozenFisherToast=true; toast('❄️ The river is frozen over — the fishers wait for thaw.', true); }
          } else {
            const t = findResourceTarget(v, G.waterTiles);
            if(t){ t.workers++; v.targetTile=t; v.state='walkingToResource'; v.resKind='fish'; }
          }
        } else if(v.role==='hunter'){
          const t = findResourceTarget(v, G.wildsTiles);
          if(t){ t.workers++; v.targetTile=t; v.state='walkingToResource'; v.resKind='meat'; }
        } else if(v.role==='farmer'){
          const b = nearestBuildingOfTypes(['farm'], v.gx, v.gy, true);
          if(b){ b.workers++; v.targetBuilding=b; v.state='walkingToFarm'; }
        } else if(!seekWork(v)){
          ambientIdle(v); // nothing worth doing — live a little
        }
      }
      break;
    }
    case 'walkingToResource': {
      if(!v.targetTile || v.targetTile.resourceAmount<=0){ releaseClaims(v); v.state='idle'; break; }
      const arrived = moveToward(v, v.targetTile.gx, v.targetTile.gy, dt, 1);
      if(arrived){
        const baseTimes = {wood:3.0, stone:4.0, fish:3.2, meat:4.2};
        const boostBuilding = {wood:'forestCamp', stone:'miningPost', fish:'fishingHut', meat:'huntingCabin'};
        const bonus = hasBuildingType(boostBuilding[v.resKind]) ? 0.75 : 1;
        v.workTimer = baseTimes[v.resKind] * bonus / mul;
        v.state='working';
      }
      break;
    }
    case 'working': {
      if(!v.targetTile){ v.state='idle'; break; }
      v.workTimer -= dt;
      if(v.workTimer<=0){
        const t = v.targetTile;
        const yields = {
          wood:[8,12], stone:[6,9], fish:[5,8], meat:[6,10]
        };
        const yr = yields[v.resKind];
        const toolsMul = (G.researched.tools && (v.resKind==='wood'||v.resKind==='stone')) ? 1.15 : 1;
        // Working without the trade's building is gathering by hand — it keeps a
        // hold alive, it does not run one.
        const WORKPLACE_FOR = { wood:'forestCamp', stone:'miningPost', fish:'fishingHut', meat:'huntingCabin' };
        const byHand = !hasActiveBuilding(WORKPLACE_FOR[v.resKind]) ? 0.5 : 1;
        const stockKey = (v.resKind==='fish' || v.resKind==='meat') ? 'food' : v.resKind;
        const foodBoon = stockKey==='food' ? harvestBoonMul() : 1;
        const yieldAmt = Math.max(1, Math.round((yr[0] + Math.floor(Math.random()*(yr[1]-yr[0]+1))) * seasonYieldMul() * toolsMul * byHand * foodBoon * guildMulRes(v.resKind)));
        t.resourceAmount -= 1;
        v.carrying = { type:stockKey, amount:yieldAmt };
        if(v.resKind==='wood') sfx('chop');
        else if(v.resKind==='stone') sfx('mine');
        if(t.resourceAmount<=0){
          const regrowTimes = {wood:[70,110], stone:[140,200], fish:[40,70], meat:[55,95]};
          const rt = regrowTimes[v.resKind];
          t.regrowAt = G.worldTime + rt[0] + Math.random()*(rt[1]-rt[0]);
        }
        t.workers = Math.max(0,t.workers-1);
        v.targetTile = null;
        const dropTypes = {wood:['forestCamp'], stone:['miningPost'], fish:['fishingHut'], meat:['huntingCabin']}[v.resKind];
        let drop = nearestBuildingOfTypes(dropTypes, v.gx, v.gy, false);
        if(!drop) drop = findTC();
        v.targetBuilding = drop;
        v.state='walkingToDropoff';
      }
      break;
    }
    case 'walkingToDropoff': {
      const tb = v.targetBuilding || findTC();
      if(!tb){ v.state='idle'; break; }
      const c = buildingCenter(tb);
      // Spread haulers around the drop building instead of stacking them all on
      // one tile — a stable per-settler slot on the approach ring.
      const RING = [[0,1.6],[1.4,1.2],[-1.4,1.2],[1.8,0.2],[-1.8,0.2],[0.6,2.1],[-0.6,2.1]];
      const o = RING[hashStr(v.id) % RING.length];
      const arrived = moveToward(v, c.gx+o[0], c.gy+o[1], dt, 1);
      if(arrived){
        if(v.carrying){ gainResource(v.carrying.type, v.carrying.amount); spawnFly(v.gx, v.gy, v.carrying.type); v.carrying=null; }
        v.targetBuilding = null;
        v.state='idle';
      }
      break;
    }
    case 'walkingToFarm': {
      if(!v.targetBuilding || v.targetBuilding.type!=='farm'){ v.state='idle'; break; }
      const c = buildingCenter(v.targetBuilding);
      const arrived = moveToward(v, c.gx, c.gy-0.05, dt, 1);
      if(arrived){ v.workTimer = 5.5/mul; v.state='farming'; }
      break;
    }
    case 'farming': {
      if(!v.targetBuilding || v.targetBuilding.type!=='farm'){ v.state='idle'; break; }
      if(!G.buildings.includes(v.targetBuilding)){ v.targetBuilding=null; v.state='idle'; break; }
      v.workTimer -= dt;
      if(v.workTimer<=0){
        // Irrigation: farms touching the river yield +15%
        const fb = v.targetBuilding;
        let irr = G.researched.aqueduct ? 1.15 : 1; // Aqueducts irrigate every farm
        for(let dy=-1;dy<=1&&irr<1.15;dy++) for(let dx=-1;dx<=1;dx++){
          const nt = tileAt(fb.gx+dx, fb.gy+dy);
          if(nt && nt.type==='water'){ irr = 1.15; break; }
        }
        const terrace = G.researched.terracing ? 1.15 : 1;
        gainResource('food', Math.max(1, Math.round((6+Math.floor(Math.random()*4)) * seasonYieldMul() * weatherFarmMul() * (G.researched.crops?1.2:1) * irr * terrace * harvestBoonMul() * guildFarmMul())));
        v.workTimer = 5.5/effMultiplier(v);
      }
      break;
    }
    case 'seekingFood': {
      const tc = findTC();
      if(!tc){ v.hunger=clamp(v.hunger-5,0,100); v.state='idle'; break; }
      const c = buildingCenter(tc);
      const arrived = moveToward(v, c.gx+0.3, c.gy+0.3, dt, 1.15);
      if(arrived){
        if((G.stockpile.bread||0)>=1){
          G.stockpile.bread-=1; v.hunger=0; v.fatigue=clamp(v.fatigue-10,0,100); v.morale=clamp((v.morale||65)+8,0,100); v.eatTimer=2.0; v.state='eating';
        } else if(G.stockpile.food>=2){ G.stockpile.food-=2; v.hunger=0; v.eatTimer=2.2; v.state='eating'; }
        else { v.state='idle'; }
      }
      break;
    }
    case 'eating': {
      v.eatTimer -= dt;
      if(v.eatTimer<=0) v.state='idle';
      break;
    }
    case 'seekingSleep': {
      const tc = findTC();
      if(!tc){ v.fatigue=clamp(v.fatigue-10,0,100); v.state='idle'; break; }
      const c = buildingCenter(tc);
      const arrived = moveToward(v, c.gx-0.3, c.gy-0.3, dt, 1.15);
      if(arrived){ v.sleepTimer = 6 + Math.random()*2; v.state='sleeping'; }
      break;
    }
    case 'sleeping': {
      v.fatigue = clamp(v.fatigue - 28*dt, 0, 100);
      v.sleepTimer -= dt;
      if(v.sleepTimer<=0 || v.fatigue<=8) v.state='idle';
      break;
    }
  }
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
    if(prevSeason===3){ window._frozenFisherToast=false; toast('💧 The thaw — the river runs (and guards it) again.'); }
    if(newSeason===3) G.journal.wintersEndured++;
    // New-year festival: at the turn into spring, the hold chooses a boon.
    if(newSeason===0 && G.dayCount>2){
      const yr = Math.floor(G.worldTime/(SEASON_LEN*4));
      if(yr>G.lastFestivalYear){ G.lastFestivalYear=yr; openFestivalChoice(); }
    }
  }

  // wolf threat events
  wolfTimer -= dt;
  if(wolfTimer<=0){
    wolfTimer = 100 + Math.random()*70;
    const riskMul = (hasBuildingType('watchtower') ? 0.3 : 1) * wolfRiskMul * decreeRaidMul();
    if(Math.random() < 0.55*riskMul){
      const exposed = G.villagers.filter(v=>(v.state==='walkingToResource'||v.state==='working') && v.targetTile && (v.targetTile.type==='forest'||v.targetTile.wilds));
      if(exposed.length>0){
        const v = exposed[Math.floor(Math.random()*exposed.length)];
        releaseClaims(v); v.carrying=null; v.state='idle'; v.fatigue=clamp(v.fatigue+15,0,100);
        toast('Wolves prowl the treeline — '+v.name+' flees home!', true);
        G.wolfEvents++;
      } else {
        const loss = Math.min(G.stockpile.food, 4+Math.floor(Math.random()*8));
        if(loss>0){
          G.stockpile.food -= loss;
          toast('A wolf pack raids the stores — '+loss+' food stolen!', true); sfx('raid');
          G.wolfEvents++;
        }
      }
    }
  }

  updateSunShadows();

  // Bandit raids — only once the hold is big enough to be worth robbing
  banditTimer -= dt;
  if(banditTimer<=0){
    banditTimer = 160 + Math.random()*120;
    if(!ADMIN.noRaids && gameMode.banditsEnabled && currentTierIdx>=2 && Math.random()<0.5*decreeRaidMul()){
      const guards = G.villagers.filter(v=>v.role==='guard' && !v.sick).length;
      const palisades = G.buildings.filter(b=>b.type==='palisade').length;
      const towers = G.buildings.filter(b=>b.type==='watchtower' && (b.condition===undefined||b.condition>=35)).length;
      // The river is a natural moat — worth real defense while it stands
      // uncrossed. Every bridge is a door: each one erodes the bonus, UNLESS
      // a guard post stands within 3 tiles of it (a watched crossing).
      const allBridges = G.buildings.filter(b=>b.type==='bridge');
      const guardPosts = G.buildings.filter(b=>b.type==='guardPost' && (b.condition===undefined||b.condition>=35));
      const openBridges = allBridges.filter(br=> !guardPosts.some(gp=> Math.max(Math.abs(gp.gx-br.gx), Math.abs(gp.gy-br.gy)) <= 3));
      const riverMoat = (G.waterTiles.length && !riverFrozen()) ? Math.max(0, 5 - openBridges.length*1.5) : 0;
      const defense = guards*(G.researched.militia?8:4) + palisades*0.8 + towers*2 + riverMoat;
      const strength = 10 + currentTierIdx*6 + Math.random()*8;
      const mitigation = Math.min(0.95, defense / (defense + strength));
      const raidN = 2 + Math.floor(Math.random()*2) + (currentTierIdx>=3?1:0);
      launchRaid(raidN, mitigation <= 0.72, raidEntryPoint(openBridges));
      if(mitigation > 0.72){
        G.journal.raidsRepelled = (G.journal.raidsRepelled||0) + 1;
        toast('🛡️ Bandits probed the walls — your guards drove them off!'); sfx('raid');
      } else {
        const stealFrac = (1 - mitigation) * 0.35;
        const stolen = [];
        for(const k of ['food','wood','planks','bread']){
          const amt = Math.floor((G.stockpile[k]||0) * stealFrac * (0.5+Math.random()*0.5));
          if(amt>0){ G.stockpile[k]-=amt; stolen.push(amt+' '+k); }
        }
        if(stolen.length){
          const tcB = findTC();
          if(tcB){ const c0 = buildingCenter(tcB); spawnBoom(c0.gx-0.6, c0.gy); spawnBoom(c0.gx+0.7, c0.gy+0.4); }
          // Narrate the crossing: raiders come over an unwatched bridge if one exists
          if(openBridges.length){
            const br = openBridges[Math.floor(Math.random()*openBridges.length)];
            spawnBoom(br.gx, br.gy);
            toast('🌉 Raiders poured across the unwatched bridge!', true);
          }
          toast('🏴 Bandits raid the hold — lost '+stolen.join(', ')+'!', true); sfx('raid');
          G.villagers.forEach(v=>{ if(v.morale!==undefined){ let hit=(v.trait&&v.trait.id==='brave')?4:8; if(G.festivalBoon==='courage') hit*=0.5; v.morale=clamp(v.morale-hit,0,100); } });
          // Surviving a raid can steel a settler for life
          if(Math.random()<0.3 && G.villagers.length){
            const cand = G.villagers.filter(v=>!v.trait || (v.trait.id!=='brave' && v.trait.id!=='steadfast'));
            if(cand.length){
              const vv = cand[Math.floor(Math.random()*cand.length)];
              vv.trait = LEGACY_TRAITS.brave;
              toast('🦁 '+vv.name+' stood firm through the raid — they are Brave now.');
            }
          }
        } else {
          toast('🏴 Bandits found nothing worth taking.');
        }
      }
    }
  }

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
  // Building decay — timber weathers; worn buildings (<35) stop giving their bonus
  for(const b of G.buildings){
    if(b.type==='road'||b.type==='townCenter') continue;
    if(b.condition===undefined) b.condition=100;
    if(b.condition>0) b.condition = Math.max(0, b.condition - DECAY_RATE*gameMode.decayMul*dt);
    if(b.condition<35 && !b._wornWarned){ b._wornWarned=true; toast('⚠️ Your '+(BUILD_DEFS[b.type]?BUILD_DEFS[b.type].name:b.type)+' is falling into disrepair! (Tap it to repair — or 🔧 Mend the Hold in the coin shop.)', true); }
    if(b.condition>=35) b._wornWarned=false;
  }

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
initIsoKit(ctx);   // the iso drawing kit shares this one context

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
  // cssW/cssH are seeded from innerWidth/innerHeight at parse time, so on a
  // DPR-1 display every term matched on the very first call and the canvas was
  // left at its 300x150 default, stretched by CSS — a blurry, low-res world.
  const targetW = Math.floor(newW*newDPR), targetH = Math.floor(newH*newDPR);
  if(newW===cssW && newH===cssH && newDPR===canvasDPR && canvas.width===targetW && canvas.height===targetH) return;
  _resizing = true;
  try {
    canvasDPR = newDPR;
    cssW = newW; cssH = newH;
    canvas.width = Math.floor(cssW*canvasDPR); canvas.height = Math.floor(cssH*canvasDPR);
    canvas.style.width = cssW+'px'; canvas.style.height = cssH+'px';
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

function screenToWorldPixel(sx,sy){
  return { x:(sx - cssW/2 - camera.panX)/camera.scale, y:(sy - cssH/2 - camera.panY)/camera.scale };
}
function worldToScreen(wx,wy){
  return { x: wx*camera.scale + cssW/2 + camera.panX, y: wy*camera.scale + cssH/2 + camera.panY };
}

function visibleTileRange(){
  // Margin scales with zoom: zoomed out = more tiles visible = larger buffer needed
  const margin = Math.ceil(4 / camera.scale) + 2;
  const corners = [
    screenToWorldPixel(0,0), screenToWorldPixel(cssW,0),
    screenToWorldPixel(0,cssH), screenToWorldPixel(cssW,cssH)
  ];
  let minGX=Infinity,maxGX=-Infinity,minGY=Infinity,maxGY=-Infinity;
  for(const c of corners){
    const g = inProject(c.x,c.y);
    minGX=Math.min(minGX,g.gx); maxGX=Math.max(maxGX,g.gx);
    minGY=Math.min(minGY,g.gy); maxGY=Math.max(maxGY,g.gy);
  }
  return {
    x0: clamp(Math.floor(minGX-margin),0,G.MAP_SIZE-1),
    x1: clamp(Math.ceil(maxGX+margin),0,G.MAP_SIZE-1),
    y0: clamp(Math.floor(minGY-margin),0,G.MAP_SIZE-1),
    y1: clamp(Math.ceil(maxGY+margin),0,G.MAP_SIZE-1),
  };
}




/* ── DECOR & FX SPRITES ── Kenney farm crops + Tiny Swords bushes/rocks/particles,
   graded and embedded. All optional: every consumer has a procedural fallback. */
// Asset URLs (files, not inlined base64) — bundled locally, cached by the
// service worker, so offline play is unaffected. Procedural fallbacks still
// cover a failed or slow load.

const DECOR = {};
let decorReady = false;
function loadDecor(){
  let pending = 0;
  for(const [key,val] of Object.entries(DECOR_B64)){
    const list = Array.isArray(val) ? val : [val];
    DECOR[key] = [];
    for(const b of list){
      const img = new Image(); pending++;
      img.onload = ()=>{ if(--pending===0) decorReady = true; };
      img.onerror = ()=>{ if(--pending===0) decorReady = true; };
      img.src = b;
      DECOR[key].push(img);
    }
  }
}
/* What stands where. Cattails want a waterside tile, so grass keeps them only
   when the tile actually touches water — checked at draw time below. */
const SCENERY_FOR = {
  grass:  ['wildflowers','boulders','berryBush','stump'],
  forest: ['mushrooms','fallenLog','stump','berryBush'],
  stone:  ['boulders','standingStones'],
  wilds:  ['wildflowers','mushrooms','berryBush'],
  dirt:   ['boulders'],
};
const SCENERY_W = {
  wildflowers:26, boulders:30, berryBush:28, stump:26,
  mushrooms:22, fallenLog:34, standingStones:34, cattails:28,
};
function decorImg(key, idx){
  const pool = DECOR[key];
  if(!pool || !pool.length) return null;
  const img = pool[Math.floor(idx) % pool.length];
  return (img.complete && img.naturalWidth>0) ? img : null;
}
/* Resource-fly-to-HUD: a little icon arcs from the drop-off point to its HUD pill */
const flyFX = [];
const FLY_ICON = { wood:'🪵', stone:'🪨', food:'🌾', planks:'🪚', bread:'🍞', flour:'🌾' };
function spawnFly(gx, gy, resType){
  if(flyFX.length > 14) return; // cap
  const el = document.getElementById('res-'+(resType==='flour'?'food':resType)) || document.getElementById('res-wood');
  if(!el) return;
  const r = el.getBoundingClientRect();
  const p = project(gx, gy);
  flyFX.push({
    sx: cssW/2 + camera.panX + p.x*camera.scale,
    sy: cssH/2 + camera.panY + p.y*camera.scale,
    tx: r.left + r.width/2, ty: r.top + r.height/2,
    ic: FLY_ICON[resType]||'✨', t: 0,
  });
}
function renderFlyFX(dt){
  if(!flyFX.length) return;
  ctx.save();
  ctx.setTransform(canvasDPR,0,0,canvasDPR,0,0);
  ctx.font='16px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  for(let i=flyFX.length-1;i>=0;i--){
    const f = flyFX[i];
    f.t += dt*1.7;
    if(f.t >= 1){ flyFX.splice(i,1); continue; }
    const e = f.t*f.t*(3-2*f.t); // smoothstep
    const mx = (f.sx+f.tx)/2, my = Math.min(f.sy,f.ty) - 70; // arc peak
    const x = (1-e)*(1-e)*f.sx + 2*(1-e)*e*mx + e*e*f.tx;
    const y = (1-e)*(1-e)*f.sy + 2*(1-e)*e*my + e*e*f.ty;
    ctx.globalAlpha = 1 - e*0.3;
    ctx.fillText(f.ic, x, y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* Construction dust bursts + raid explosions (shared world-FX list) */
const dustFX = [];
const boomFX = [];
function spawnBoom(gx, gy){ boomFX.push({gx, gy, t:0}); }
function renderBoomFX(dt){
  for(let i=boomFX.length-1;i>=0;i--){
    const f = boomFX[i];
    f.t += dt;
    if(f.t > 0.6){ boomFX.splice(i,1); continue; }
    const img = decorImg('explosion', f.t/0.6*4);
    if(img){
      const p = project(f.gx, f.gy);
      const s = 54 + f.t*40;
      ctx.globalAlpha = 1 - (f.t/0.6)*0.5;
      try { ctx.drawImage(img, p.x - s/2, p.y - s + 6, s, s*(img.naturalHeight/img.naturalWidth)); } catch(e){}
      ctx.globalAlpha = 1;
    }
  }
}
function spawnDust(gx, gy){
  dustFX.push({gx, gy, t:0});
}
function renderDustFX(dt){
  for(let i=dustFX.length-1;i>=0;i--){
    const f = dustFX[i];
    f.t += dt;
    if(f.t > 0.55){ dustFX.splice(i,1); continue; }
    const img = decorImg('dust', f.t/0.55*6);
    if(img){
      const p = project(f.gx, f.gy);
      const s = 44 + f.t*30;
      ctx.globalAlpha = 1 - f.t/0.55;
      ctx.drawImage(img, p.x - s/2, p.y - s/2 - 8, s, s*(img.naturalHeight/img.naturalWidth));
      ctx.globalAlpha = 1;
    }
  }
}

/* ── TERRAIN TILE STAMPS ── Kenney Isometric Landscape (CC0), color-graded to
   Oakenfall's palette at bake time and embedded as base64. Stamped tiles have
   built-in depth skirts, replacing the procedural diamond fill + bank faces. */
// Asset URLs (files, not inlined base64) — bundled locally, cached by the
// service worker, so offline play is unaffected. Procedural fallbacks still
// cover a failed or slow load.

const TERRAIN_IMGS = { grass:[], water:[], dirt:[], stone:[] };
let terrainReady = false;
function loadTerrainStamps(){
  let pending = 0;
  for(const [key,data] of Object.entries(TERRAIN_B64)){
    const typ = key.split('_')[0];
    const img = new Image();
    pending++;
    img.onload = ()=>{ TERRAIN_IMGS[typ].push(img); if(--pending===0) terrainReady = true; };
    img.onerror = ()=>{ if(--pending===0) terrainReady = TERRAIN_IMGS.grass.length>0; };
    img.src = data;
  }
}
function terrainStampFor(t, gx, gy){
  if(!terrainReady) return null;
  let pool;
  if(t.building && t.building.type==='road'){
    const r = DECOR.roadTile;
    if(r && r[0] && r[0].complete && r[0].naturalWidth>0) return r[0];
  }
  if(t.type==='water') pool = TERRAIN_IMGS.water;
  else if(t.type==='dirt') pool = TERRAIN_IMGS.dirt;
  else if(t.type==='stone') pool = TERRAIN_IMGS.stone;
  else pool = TERRAIN_IMGS.grass; // grass, forest, wilds share the grass base
  if(!pool || !pool.length) return null;
  return pool[Math.floor(hash2(gx*1.37, gy*2.11)*pool.length)];
}

const WATER_DROP = 6;  // water surface recessed below land
const EDGE_DROP = 14;  // map-edge cliff height

/* The wilds get the canvas and the tables they draw from, the same way the iso
   kit does. Sited here rather than beside initIsoKit because WATER_DROP is a
   const declared below that point — calling earlier would hit its temporal
   dead zone, which is a runtime throw the frame loop would then swallow. */
initCritters({ ctx, sprites: SPRITES, spriteScale: SPRITE_SCALE, waterDrop: WATER_DROP, tileWalkable });

const TILE_COLORS = {
  grass: ['#2f4528','#33492c','#2a3f25','#304826'],
  dirt:  ['#4a3a26','#473722','#4d3d29','#453821'],
  forest:['#243c20','#2a4224','#22381e','#283e22'],
  stone: ['#3a3c34','#3d3f37','#373931','#404239'],
  water: ['#182c3e','#1c3244','#163040','#1a3446'],
};
/* ── GROUND COVER ── how wet and how snowed-under the land currently is. Eased
   rather than switched, so puddles gather while it rains and dry off slowly
   afterwards, and snow builds up over a fall instead of appearing all at once.
   Two numbers for the whole map: the per-tile look is derived from them plus the
   tile's own hash, which keeps this free of per-tile state or allocation. */
/* ── WIND ──
   One field the whole surface leans with, so a storm looks like weather rather
   than a particle effect over a still world. Strength follows the sky; the
   phase advances faster when it blows harder. */
let windPhase = 0, windGust = 0.22;
function updateWind(dt){
  const base = weather.type==='storm' ? 1.0
             : weather.type==='rain'  ? 0.55
             : weather.type==='snow'  ? 0.40 : 0.22;
  const target = base * (0.75 + 0.25*Math.sin(G.worldTime*0.37));
  windGust += (target - windGust) * Math.min(1, dt*0.5);
  windPhase += dt * (0.6 + windGust*0.9);
}
/* Lean at this tile, roughly -1..1. Neighbouring tiles share a phase, so gusts
   travel across the map instead of every blade twitching on its own. */
function windAt(gx, gy){ return Math.sin(windPhase*1.6 + (gx+gy)*0.55) * windGust; }

let groundWet = 0, groundSnow = 0;
function updateGroundCover(dt){
  const raining = weather.type==='rain' || weather.type==='storm';
  const snowing = weather.type==='snow';
  const winter = seasonIndex()===3;
  const wetTarget  = raining ? 1 : 0;
  const snowTarget = snowing ? 1 : (winter ? 0.5 : 0);
  groundWet  += (wetTarget  - groundWet ) * Math.min(1, dt*0.30);  // dries slowly
  groundSnow += (snowTarget - groundSnow) * Math.min(1, dt*0.10);  // settles slower still
}
function drawTerrain(range){
  for(let gy=range.y0; gy<=range.y1; gy++){
    for(let gx=range.x0; gx<=range.x1; gx++){
      const t = G.grid[gy] && G.grid[gy][gx];
      if(!t) continue;
      const p = project(gx,gy);
      const h2 = hash2(gx,gy);
      const variant = Math.floor(h2*4);
      let colors = TILE_COLORS[t.type] || TILE_COLORS.grass;
      const isWater = t.type==='water';
      const yTop = isWater ? p.y + WATER_DROP : p.y;
      const stamp = terrainStampFor(t, gx, gy);
      if(stamp){
        // Pre-rendered block tile: 128x80 source → 64x40 on screen; the top
        // diamond spans 64x32 anchored at yTop, skirt hangs 8px below.
        try { ctx.drawImage(stamp, p.x - TILE_W/2, yTop - TILE_H/2, TILE_W, 40); } catch(e){}
      } else {
        // Procedural fallback until stamps decode (or if they fail)
        const cA = colors[variant%colors.length];
        const cB = colors[(variant+1)%colors.length];
        ctx.fillStyle = shadeColor(cA, (hash2(gx*1.31, gy*2.17)-0.5)*0.10);
        tileDiamond(p.x, yTop, TILE_W, TILE_H);
        ctx.fill();
        if(!isWater && h2 > 0.45){
          ctx.fillStyle = shadeColor(cB, -0.04);
          ctx.globalAlpha = 0.35;
          tileDiamond(p.x + (h2-0.7)*14, yTop + (hash2(gx*3,gy*1.4)-0.5)*5, TILE_W*0.55, TILE_H*0.55);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      /* ── LIVING SURFACE ── shimmer, wet ground and settled snow, layered over
         whichever tile art was drawn above. Flat fills only: a gradient per tile
         per frame is the classic way to wreck this game's framerate. */
      if(isWater){
        if(riverFrozen()){
          // Frozen over: a pale sheen and a hint of cracking, no movement.
          ctx.fillStyle = 'rgba(206,224,236,0.34)';
          tileDiamond(p.x, yTop, TILE_W*0.96, TILE_H*0.96); ctx.fill();
          if(h2 > 0.7){
            ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(p.x-8, yTop-1); ctx.lineTo(p.x+3, yTop+3); ctx.stroke();
          }
        } else {
          // Open water: a highlight sliding across the tile, each on its own
          // phase so the river glitters rather than pulsing in unison.
          const ph = G.worldTime*1.3 + h2*6.283;
          const a = 0.09 + Math.sin(ph)*0.06;
          if(a > 0.03){
            ctx.fillStyle = 'rgba(188,224,244,'+a.toFixed(3)+')';
            tileDiamond(p.x + Math.sin(ph)*6, yTop - 1, TILE_W*0.40, TILE_H*0.40); ctx.fill();
          }
        }
      } else {
        // Rain gathers in the hollows — only some tiles hold a puddle, and they
        // spread as the downpour goes on.
        if(groundWet > 0.04 && h2 > 0.58 && (t.type==='grass' || t.type==='dirt')){
          const g = groundWet * (0.55 + h2*0.45);
          ctx.fillStyle = 'rgba(38,58,70,'+(g*0.40).toFixed(3)+')';
          tileDiamond(p.x + (h2-0.7)*12, yTop + 3, TILE_W*0.42*g, TILE_H*0.42*g); ctx.fill();
          ctx.fillStyle = 'rgba(180,210,230,'+(g*0.10).toFixed(3)+')';   // sky caught in it
          tileDiamond(p.x + (h2-0.7)*12, yTop + 2, TILE_W*0.26*g, TILE_H*0.26*g); ctx.fill();
        }
        // Tall grass leans with the wind. Only the wilds get blades — they are
        // a few percent of the map, so this is three strokes on a handful of
        // visible tiles, not a per-tile cost.
        if(t.wilds && groundSnow < 0.5){
          const w = windAt(gx, gy);
          ctx.strokeStyle = 'rgba(158,186,102,0.55)';
          ctx.lineWidth = 1;
          for(let i=0;i<3;i++){
            const bx = p.x + (hash2(gx*2.1+i, gy*3.3)-0.5)*22;
            const by = yTop + (hash2(gx*1.7, gy*2.9+i)-0.5)*9 + 3;
            const bh = 5 + hash2(gx+i, gy)*4;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.quadraticCurveTo(bx + w*2.4, by - bh*0.6, bx + w*5, by - bh);
            ctx.stroke();
          }
        }
        // Snow lies unevenly — the tile's own hash decides how deeply it drifts.
        if(groundSnow > 0.02){
          const s = groundSnow * (0.45 + h2*0.55);
          ctx.fillStyle = 'rgba(234,242,250,'+(s*0.62).toFixed(3)+')';
          tileDiamond(p.x, yTop - 1, TILE_W*0.94, TILE_H*0.94); ctx.fill();
        }
      }

      // Earthen bank faces: where land meets water (or the map edge), draw the
      // tile's south-west / south-east side walls dropping to the lower level.
      if(!isWater && !stamp){
        const nS = G.grid[gy+1] && G.grid[gy+1][gx];   // screen lower-left neighbour
        const nE = G.grid[gy] && G.grid[gy][gx+1];     // screen lower-right neighbour
        const edgeS = !nS || nS.type==='water';
        const edgeE = !nE || nE.type==='water';
        const drop = (!nS || !nE) ? EDGE_DROP : WATER_DROP;
        // Grassy overhang lip catches the light along the bank crest
        if((edgeS || edgeE) && (t.type==='grass'||t.type==='forest')){
          ctx.strokeStyle='rgba(126,168,86,0.55)'; ctx.lineWidth=1.6;
          if(edgeS){ ctx.beginPath(); ctx.moveTo(p.x - TILE_W/2, p.y); ctx.lineTo(p.x, p.y + TILE_H/2); ctx.stroke(); }
          if(edgeE){ ctx.beginPath(); ctx.moveTo(p.x + TILE_W/2, p.y); ctx.lineTo(p.x, p.y + TILE_H/2); ctx.stroke(); }
        }
        if(edgeS){
          ctx.fillStyle = '#2a2114';
          ctx.beginPath();
          ctx.moveTo(p.x - TILE_W/2, p.y);
          ctx.lineTo(p.x, p.y + TILE_H/2);
          ctx.lineTo(p.x, p.y + TILE_H/2 + drop);
          ctx.lineTo(p.x - TILE_W/2, p.y + drop);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=0.6;
          ctx.beginPath(); ctx.moveTo(p.x - TILE_W/2, p.y+drop*0.5); ctx.lineTo(p.x, p.y+TILE_H/2+drop*0.5); ctx.stroke();
        }
        if(edgeE){
          ctx.fillStyle = '#1e180e';
          ctx.beginPath();
          ctx.moveTo(p.x + TILE_W/2, p.y);
          ctx.lineTo(p.x, p.y + TILE_H/2);
          ctx.lineTo(p.x, p.y + TILE_H/2 + drop);
          ctx.lineTo(p.x + TILE_W/2, p.y + drop);
          ctx.closePath(); ctx.fill();
        }
      }
      if(t.type==='water'){
        // Water sits RECESSED — the tile top is drawn lower, and land neighbours
        // draw bank faces down to it (see below), selling true isometric depth.
        const wy = yTop;
        const frozen = riverFrozen();
        if(frozen){
          // winter ice sheet: pale slab, crack lines, no ripples/foam
          ctx.fillStyle='rgba(196,214,224,0.55)';
          tileDiamond(p.x,wy,TILE_W,TILE_H); ctx.fill();
          ctx.save(); tileDiamond(p.x,wy,TILE_W,TILE_H); ctx.clip();
          ctx.strokeStyle='rgba(120,150,170,0.5)'; ctx.lineWidth=0.8;
          if(h2>0.45){
            ctx.beginPath();
            ctx.moveTo(p.x-(h2*14), wy-3+(h2*4));
            ctx.lineTo(p.x+(6-h2*4), wy+1);
            ctx.lineTo(p.x+(h2*16), wy+5-(h2*6));
            ctx.stroke();
          }
          ctx.restore();
        }
        // flat depth tint (a per-tile gradient here cost ~1 gradient alloc per water tile per frame)
        if(!frozen){
        ctx.fillStyle='rgba(10,20,35,0.18)';
        tileDiamond(p.x,wy,TILE_W,TILE_H); ctx.fill();
        ctx.save(); tileDiamond(p.x,wy,TILE_W,TILE_H); ctx.clip();
        ctx.strokeStyle='rgba(150,200,220,0.18)'; ctx.lineWidth=1.2;
        for(let i=0;i<3;i++){
          const off=((G.worldTime*12+gx*19+gy*13+i*18)%36)-18;
          ctx.beginPath(); ctx.moveTo(p.x-TILE_W/2,wy+off*0.45);
          ctx.quadraticCurveTo(p.x,wy+off*0.45-5,p.x+TILE_W/2,wy+off*0.45); ctx.stroke();
        }
        if(h2>0.7){ ctx.fillStyle='rgba(200,230,240,0.12)'; ctx.beginPath(); ctx.arc(p.x+(h2-0.85)*18,wy+(hash2(gx*2,gy)-0.5)*6,3,0,Math.PI*2); ctx.fill(); }
        // Foam lapping against adjacent land (animated)
        const nN = G.grid[gy-1] && G.grid[gy-1][gx];
        const nW = G.grid[gy] && G.grid[gy][gx-1];
        const foamA = 0.28 + Math.sin(G.worldTime*2.4 + gx + gy)*0.12;
        ctx.strokeStyle = 'rgba(210,230,238,'+foamA+')'; ctx.lineWidth = 1.6;
        if(nN && nN.type!=='water'){ ctx.beginPath(); ctx.moveTo(p.x, wy - TILE_H/2 + 1.5); ctx.lineTo(p.x + TILE_W/2 - 3, wy - 0.5); ctx.stroke(); }
        if(nW && nW.type!=='water'){ ctx.beginPath(); ctx.moveTo(p.x, wy - TILE_H/2 + 1.5); ctx.lineTo(p.x - TILE_W/2 + 3, wy - 0.5); ctx.stroke(); }
        ctx.restore();
        }
        // ford: stepping stones breaking the surface (year-round marker)
        if(t.ford && !t.building){
          ctx.fillStyle='#6a6359';
          for(const [ox,oy,r] of [[-8,1,3.2],[0,-2,3.8],[8,2,3.0]]){
            ctx.beginPath(); ctx.ellipse(p.x+ox, wy+oy, r, r*0.6, 0, 0, 7); ctx.fill();
          }
          ctx.fillStyle='rgba(255,255,255,0.12)';
          for(const [ox,oy,r] of [[-8,0,2.2],[0,-3,2.6],[8,1,2.0]]){
            ctx.beginPath(); ctx.ellipse(p.x+ox, wy+oy, r, r*0.5, 0, 0, 7); ctx.fill();
          }
        }
        if(h2 > 0.88){
          const wrImg = decorImg('waterRocks', hash2(gx*3.3,gy*1.9)*4);
          if(wrImg){
            const ww = 26, wh = ww*(wrImg.naturalHeight/wrImg.naturalWidth);
            const bobW = Math.sin(G.worldTime*1.6+gx+gy)*1.2;
            try { ctx.drawImage(wrImg, p.x - ww/2, wy - wh + 6 + bobW, ww, wh); } catch(e){}
          }
        }
      } else if(t.wilds){
        ctx.fillStyle='rgba(80,110,30,0.20)'; tileDiamond(p.x,p.y,TILE_W,TILE_H); ctx.fill();
        ctx.strokeStyle='rgba(130,160,60,0.40)'; ctx.lineWidth=1.1;
        for(let i=0;i<5;i++){
          const ox=(hash2(gx*1.3+i,gy*2.1)-0.5)*28,oy=(hash2(gx*2.7+i,gy*1.1)-0.5)*9;
          const h=4+hash2(gx+i,gy*3)*5;
          ctx.beginPath(); ctx.moveTo(p.x+ox,p.y+oy+3); ctx.lineTo(p.x+ox+1.5,p.y+oy-h); ctx.stroke();
        }
        if(h2>0.6){ ctx.fillStyle='rgba(90,80,55,0.35)'; ctx.beginPath(); ctx.arc(p.x+(h2-0.8)*20,p.y+hash2(gx,gy*4)*4-2,1.5,0,7); ctx.fill(); }
      } else if(t.type==='stone'){
        ctx.strokeStyle='rgba(0,0,0,0.28)'; ctx.lineWidth=0.9;
        ctx.beginPath(); ctx.moveTo(p.x-12,p.y-2); ctx.lineTo(p.x+2,p.y+3); ctx.lineTo(p.x+10,p.y-1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x+6,p.y-3); ctx.lineTo(p.x+14,p.y+2); ctx.stroke();
        if(h2>0.72){ ctx.fillStyle='rgba(160,130,50,0.40)'; ctx.fillRect(p.x-3+h2*10,p.y-1,2,2); }
      } else if(t.type==='dirt'){
        if(h2>0.55){ ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(p.x+(h2-0.5)*20,p.y+(hash2(gx*2,gy*3)-0.5)*7,2,0,7); ctx.fill(); }
      }
      /* ── SCENERY ── a scatter of standing props keyed to what the ground is:
         mushrooms and fallen logs under the trees, cattails where the grass
         meets water, standing stones on bare rock. Its own hash, so it doesn't
         land on the same tiles as the bushes below. */
      if(decorReady && !t.building){
        const sh = hash2(gx*7.7, gy*3.3);
        if(sh > 0.955){
          // Reeds only where the ground actually meets the water.
          let pool = SCENERY_FOR[t.wilds ? 'wilds' : t.type];
          if((t.type==='grass' || t.type==='dirt')){
            const n1 = G.grid[gy+1] && G.grid[gy+1][gx], n2 = G.grid[gy-1] && G.grid[gy-1][gx];
            const n3 = G.grid[gy] && G.grid[gy][gx+1], n4 = G.grid[gy] && G.grid[gy][gx-1];
            if([n1,n2,n3,n4].some(n=>n && n.type==='water')) pool = ['cattails'];
          }
          if(pool && pool.length){
            const key = pool[Math.floor(hash2(gx*2.3, gy*5.1) * pool.length) % pool.length];
            const simg = decorImg(key, 0);
            if(simg){
              const sw = SCENERY_W[key] || 30;
              const shh = sw * (simg.naturalHeight/simg.naturalWidth);
              const ox = (hash2(gx*3.7, gy*1.3)-0.5)*18, oy = (hash2(gx*1.1, gy*6.9)-0.5)*8;
              try{ ctx.drawImage(simg, p.x - sw/2 + ox, yTop - shh + 8 + oy, sw, shh); }catch(e){}
            }
          }
        }
      }
      if(t.type==='grass' && h2 > 0.93 && decorReady){
        const pool = hash2(gx*5,gy*7) > 0.5 ? 'bush1' : 'bush3';
        const bimg = decorImg(pool, G.worldTime*3 + gx + gy);
        if(bimg){
          const bw = 34, bh = bw*(bimg.naturalHeight/bimg.naturalWidth);
          ctx.drawImage(bimg, p.x - bw/2 + (hash2(gx*2,gy*9)-0.5)*16, yTop - bh + 6, bw, bh);
        }
      } else if(t.type==='grass' && h2 > 0.82){
        // Rare wildflower clusters
        for(let i=0;i<2;i++){
          const fx = p.x+(hash2(gx*4+i,gy*6)-0.5)*26, fy = yTop+(hash2(gx*6,gy*4+i)-0.5)*9;
          ctx.fillStyle = i%2 ? '#c8b04a' : '#b06a8a';
          ctx.beginPath(); ctx.arc(fx, fy, 1.3, 0, 7); ctx.fill();
        }
        ctx.strokeStyle='rgba(120,160,75,0.20)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(p.x-4, yTop+3); ctx.lineTo(p.x-3, yTop-3); ctx.stroke();
      } else if(t.type==='grass'||t.type==='forest'){
        ctx.strokeStyle=t.type==='forest'?'rgba(80,130,60,0.22)':'rgba(120,160,75,0.20)'; ctx.lineWidth=1;
        for(let i=0;i<3;i++){
          const ox=(hash2(gx*3.1+i,gy*5.3)-0.5)*20,oy=(hash2(gx*1.9+i,gy*4.7)-0.5)*7;
          const lean=(hash2(gx+i,gy+i)-0.5)*3;
          ctx.beginPath(); ctx.moveTo(p.x+ox,p.y+oy+4); ctx.lineTo(p.x+ox+lean,p.y+oy-4); ctx.stroke();
        }
      }
      if(!stamp){
        ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=0.8/camera.scale;
        tileDiamond(p.x,yTop,TILE_W,TILE_H); ctx.stroke();
      }
    }
  }
}

/* ── SPRITE ATLAS ── trees/rocks are the hottest draw path (100+ per frame).
   Pre-render variants once to offscreen canvases at 2x and blit — huge mobile win. */
const ATLAS = { trees:[], treesWinter:[], rocks:[] };
function buildAtlas(){
  const mk = (w,hgt,fn)=>{
    const c=document.createElement('canvas'); c.width=w*2; c.height=hgt*2;
    const a=c.getContext('2d'); a.scale(2,2); fn(a); return c;
  };
  ATLAS.trees=[]; ATLAS.treesWinter=[]; ATLAS.rocks=[];
  for(let v=0; v<4; v++){
    for(const winter of [false,true]){
      const cnv = mk(80, 96, (a)=>{
        const cx=40, baseY=86, s=0.82+v*0.13;
        // trunk with bark shading + root flare
        a.fillStyle='#2c2010';
        a.beginPath(); a.moveTo(cx-3.4*s, baseY); a.lineTo(cx-2*s, baseY-12*s); a.lineTo(cx+2*s, baseY-12*s); a.lineTo(cx+3.4*s, baseY); a.closePath(); a.fill();
        a.fillStyle='rgba(90,66,38,0.5)';
        a.beginPath(); a.moveTo(cx-2.6*s, baseY); a.lineTo(cx-1.4*s, baseY-11*s); a.lineTo(cx-0.2*s, baseY-11*s); a.lineTo(cx-0.6*s, baseY); a.closePath(); a.fill();
        // 5 frond tiers, each a jagged multi-point silhouette (not a plain triangle)
        const nTiers = 5;
        for(let ti=0; ti<nTiers; ti++){
          const frac = ti/(nTiers-1);
          const w = (36 - frac*26) * s;
          const hh = (13 - frac*3) * s;
          const ty = baseY - 10*s - ti*11*s;
          const base = winter ? [46,66,52] : [26,44,28];
          const lit  = winter ? [66,88,72] : [42,66,40];
          const mix=(c1,c2,f)=>'rgb('+c1.map((c,i)=>Math.round(c+(c2[i]-c)*f)).join(',')+')';
          a.fillStyle = mix(base, lit, frac*0.5);
          a.beginPath();
          a.moveTo(cx, ty-hh);
          // jagged right edge
          a.lineTo(cx+w*0.28, ty-hh*0.45);
          a.lineTo(cx+w*0.20, ty-hh*0.40);
          a.lineTo(cx+w*0.5, ty);
          a.lineTo(cx+w*0.34, ty+1.5);
          a.lineTo(cx, ty+0.5);
          a.lineTo(cx-w*0.34, ty+1.5);
          a.lineTo(cx-w*0.5, ty);
          a.lineTo(cx-w*0.20, ty-hh*0.40);
          a.lineTo(cx-w*0.28, ty-hh*0.45);
          a.closePath(); a.fill();
          // left-face light wash (sun side)
          a.fillStyle='rgba(120,170,100,0.16)';
          a.beginPath(); a.moveTo(cx, ty-hh); a.lineTo(cx-w*0.5, ty); a.lineTo(cx-w*0.18, ty); a.closePath(); a.fill();
          // right-face shade
          a.fillStyle='rgba(0,0,0,0.18)';
          a.beginPath(); a.moveTo(cx, ty-hh); a.lineTo(cx+w*0.5, ty); a.lineTo(cx+w*0.18, ty); a.closePath(); a.fill();
          if(winter){
            a.fillStyle='rgba(226,238,246,0.85)';
            a.beginPath(); a.moveTo(cx, ty-hh); a.lineTo(cx+w*0.22, ty-hh*0.5); a.lineTo(cx-w*0.22, ty-hh*0.5); a.closePath(); a.fill();
          }
        }
        // rim highlight on crown
        a.strokeStyle = winter ? 'rgba(240,248,255,0.5)' : 'rgba(150,200,120,0.35)';
        a.lineWidth=1;
        a.beginPath(); a.moveTo(cx-3, baseY-10*s-4*11*s-8*s); a.lineTo(cx, baseY-10*s-4*11*s-12*s); a.lineTo(cx+3, baseY-10*s-4*11*s-8*s); a.stroke();
      });
      (winter?ATLAS.treesWinter:ATLAS.trees).push(cnv);
    }
  }
  for(let v=0; v<3; v++){
    ATLAS.rocks.push(mk(70, 60, (a)=>{
      const cx=35, cy=44, s=0.8+v*0.18;
      a.fillStyle='#4e4c44';
      a.beginPath(); a.moveTo(cx-13*s,cy+4*s); a.lineTo(cx-7*s,cy-11*s); a.lineTo(cx+3*s,cy-14*s); a.lineTo(cx+12*s,cy-3*s); a.lineTo(cx+9*s,cy+5*s); a.closePath(); a.fill();
      a.fillStyle='#6a6860';
      a.beginPath(); a.moveTo(cx-7*s,cy-11*s); a.lineTo(cx+3*s,cy-14*s); a.lineTo(cx+2*s,cy-5*s); a.lineTo(cx-4*s,cy-4*s); a.closePath(); a.fill();
      a.fillStyle='#2e2c28';
      a.beginPath(); a.moveTo(cx+3*s,cy-14*s); a.lineTo(cx+12*s,cy-3*s); a.lineTo(cx+9*s,cy+5*s); a.lineTo(cx+2*s,cy-5*s); a.closePath(); a.fill();
      if(v!==1){ a.strokeStyle='rgba(160,130,60,0.55)'; a.lineWidth=1.2; a.beginPath(); a.moveTo(cx-4*s,cy-2*s); a.lineTo(cx+3*s,cy-8*s); a.lineTo(cx+7*s,cy-4*s); a.stroke(); }
    }));
  }
}
function drawTree(gx,gy){
  const p = project(gx,gy);
  const s = 0.78 + hash2(gx,gy)*0.44;
  const ox = (hash2(gx*1.7,gy*2.3)-0.5)*14;
  const cx = p.x+ox, baseY = p.y+5;
  const isWinter = seasonIndex()===3;
  // Shadow ellipse always drawn
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, baseY+2, 16*s, 7*s, 0, 0, Math.PI*2); ctx.fill();
  // Try AI sprite
  const img = SPRITES['tree_pine'];
  if(img && img.complete && img.naturalWidth>0){
    try {
      const w = SPRITE_SCALE.tree_pine * s;
      const h = w * (img.naturalHeight/img.naturalWidth);
      ctx.drawImage(img, cx-w/2, baseY-h+6, w, h);
      if(isWinter){ ctx.fillStyle='rgba(220,235,245,0.22)'; ctx.beginPath(); ctx.ellipse(cx,baseY-h*0.6,w*0.3,h*0.15,0,0,Math.PI*2); ctx.fill(); }
      return;
    } catch(e){ delete SPRITES['tree_pine']; }
  }
  // Dense pines are the forest's soul; a rare ancient oak stands among them
  // (~1 in 8 tiles, summer only). Sway is a smooth skew transform — frame-free.
  if(!isWinter && hash2(gx*3.7, gy*5.1) > 0.875){
    const oakImg = decorImg('oak', 0);
    if(oakImg){
      const hh = 82*s, w = hh*(oakImg.naturalWidth/oakImg.naturalHeight);
      const sway = Math.sin(G.worldTime*1.1 + gx*0.8 + gy*0.5) * 0.022;
      ctx.save();
      ctx.translate(cx, baseY+8);
      ctx.transform(1, 0, sway, 1, 0, 0);
      try { ctx.drawImage(oakImg, -w/2, -hh, w, hh); } catch(e){}
      ctx.restore();
      return;
    }
  }
  const pool = isWinter ? ATLAS.treesWinter : ATLAS.trees;
  if(pool.length){
    const img = pool[Math.floor(hash2(gx*2.3,gy*3.7)*pool.length)];
    const w = 80*s*0.9, hh = 96*s*0.9;
    ctx.drawImage(img, cx-w/2, baseY-hh+10, w, hh);
  }
}

function drawRock(gx,gy){
  const p = project(gx,gy);
  const ox = (hash2(gx*2.1,gy*1.3)-0.5)*14;
  const cx = p.x+ox, cy=p.y+3;
  const s = 0.75+hash2(gx,gy*3)*0.5;
  // shadow
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy+6*s, 14*s, 6*s, 0, 0, Math.PI*2); ctx.fill();
  // Try AI sprite
  const img = SPRITES['rock_outcrop'];
  if(img && img.complete && img.naturalWidth>0){
    try {
      const w = SPRITE_SCALE.rock_outcrop * s;
      const h = w * (img.naturalHeight/img.naturalWidth);
      ctx.drawImage(img, cx-w/2, cy-h+8, w, h);
      return;
    } catch(e){ delete SPRITES['rock_outcrop']; }
  }
  // Baked rock sprites take priority; procedural atlas as fallback
  const rockImg = decorImg('rocks', hash2(gx*1.7,gy*2.9)*4);
  if(rockImg){
    const w = 46*s, hh = w*(rockImg.naturalHeight/rockImg.naturalWidth);
    ctx.drawImage(rockImg, cx-w/2, cy-hh+10, w, hh);
  } else if(ATLAS.rocks.length){
    const img = ATLAS.rocks[Math.floor(hash2(gx*1.7,gy*2.9)*ATLAS.rocks.length)];
    const w = 70*s*0.85, hh = 60*s*0.85;
    ctx.drawImage(img, cx-w/2, cy-hh+12, w, hh);
  }
}

/* A live fishing spot, seen from above the water rather than on it.
   The old version drew a whole fish lying on the surface, at land height —
   which is the same mistake the ducks had. What tells you fish are HERE is what
   you'd actually see from a bank: a dark shape gliding under the surface,
   bubbles rising and popping, and the rings they leave. */
function drawFishSpot(gx, gy){
  const p = project(gx, gy);
  const ox = (hash2(gx*1.4, gy*2.6)-0.5)*12;
  const cx = p.x + ox, surf = p.y + WATER_DROP;      // water sits recessed
  const t = G.worldTime;

  // Lily pad, floating flat on the surface.
  ctx.fillStyle = '#2a4e28';
  ctx.beginPath(); ctx.ellipse(cx-7, surf+2, 5, 2.4, -0.3, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(120,160,110,0.25)';
  ctx.beginPath(); ctx.ellipse(cx-8, surf+1.4, 2.4, 1.1, -0.3, 0, 7); ctx.fill();

  // The fish itself: a shadow under the water, never a body on top of it.
  // It circles slowly, rising close enough to the surface to catch the light.
  const a = t*0.7 + gx*1.3 + gy*0.7;
  const fx = cx + Math.cos(a)*7, fy = surf + 1.5 + Math.sin(a*1.3)*1.8;
  const depth = 0.5 + Math.sin(a*1.3)*0.5;           // 0 deep … 1 just under
  ctx.save();
  ctx.globalAlpha = 0.18 + depth*0.26;
  ctx.fillStyle = '#0d2029';
  ctx.translate(fx, fy);
  ctx.rotate(Math.sin(a)*0.35);
  ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 1.9, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4.5, 0); ctx.lineTo(-8, -2.2); ctx.lineTo(-8, 2.2); ctx.closePath(); ctx.fill();
  ctx.restore();

  // Bubbles: rise, shrink, and leave a ring where they break the surface.
  for(let i=0;i<3;i++){
    const ph = ((t*0.45 + hash2(gx*7+i, gy*3.1)) % 1);
    const bx = cx + (hash2(gx*2+i, gy*5.3)-0.5)*11;
    const by = surf + 4.5 - ph*5.5;
    if(ph < 0.82){
      ctx.globalAlpha = 0.30 * (1 - ph*0.6);
      ctx.fillStyle = '#cfe6f2';
      ctx.beginPath(); ctx.arc(bx, by, 1.5 - ph*0.7, 0, 7); ctx.fill();
    } else {
      const pop = (ph - 0.82) / 0.18;                 // the burst at the top
      ctx.globalAlpha = 0.30 * (1 - pop);
      ctx.strokeStyle = '#cfe6f2'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(bx, surf - 0.5, 1.5 + pop*4, 0.6 + pop*1.6, 0, 0, 7); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Slow rings spreading from the spot.
  ctx.strokeStyle = 'rgba(180,210,220,0.24)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx, surf, 8 + Math.sin(t*1.8+gx)*1.5, 3.2, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = 'rgba(180,210,220,0.12)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.ellipse(cx, surf, 14 + Math.sin(t*1.4+gy)*2, 4.8, 0, 0, 7); ctx.stroke();

  // Once in a while a tail breaks the surface where the shape is shallowest.
  if(depth > 0.94){
    ctx.fillStyle = 'rgba(150,180,196,0.65)';
    ctx.beginPath();
    ctx.moveTo(fx-4, surf); ctx.lineTo(fx-7, surf-4); ctx.lineTo(fx-2.5, surf-1.2);
    ctx.closePath(); ctx.fill();
  }
}
function drawAnimal(gx,gy){
  const p = project(gx,gy);
  const ox = (hash2(gx*2.2,gy*1.6)-0.5)*14, oy=(hash2(gx*1.1,gy*3.3)-0.5)*5;
  const cx = p.x+ox, baseY = p.y+oy+3;
  const sway = Math.sin(G.worldTime*1.2 + gx+gy)*1.2;
  const legBob = Math.abs(Math.sin(G.worldTime*1.8+gx))*2;
  // shadow
  ctx.fillStyle='rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(cx+sway, baseY+5, 10, 4, 0, 0, Math.PI*2); ctx.fill();
  // body
  ctx.fillStyle='#7a5e3a';
  ctx.beginPath(); ctx.ellipse(cx+sway, baseY-3, 10, 6, 0, 0, Math.PI*2); ctx.fill();
  // lighter belly
  ctx.fillStyle='#9a7e58';
  ctx.beginPath(); ctx.ellipse(cx+sway, baseY-1.5, 6, 3.5, 0, 0, Math.PI*2); ctx.fill();
  // neck + head
  ctx.fillStyle='#7a5e3a';
  ctx.beginPath(); ctx.moveTo(cx+sway+6,baseY-5); ctx.lineTo(cx+sway+10,baseY-12); ctx.lineTo(cx+sway+14,baseY-9); ctx.lineTo(cx+sway+10,baseY-4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+sway+13, baseY-12, 4, 3.2, 0.3, 0, Math.PI*2); ctx.fill();
  // eye
  ctx.fillStyle='#1a1208'; ctx.beginPath(); ctx.arc(cx+sway+15, baseY-13, 1, 0, Math.PI*2); ctx.fill();
  // antlers (male)
  if(hash2(gx,gy)>0.4){
    ctx.strokeStyle='#5a4228'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(cx+sway+13,baseY-15); ctx.lineTo(cx+sway+11,baseY-22); ctx.lineTo(cx+sway+8,baseY-19); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+sway+13,baseY-15); ctx.lineTo(cx+sway+17,baseY-21); ctx.lineTo(cx+sway+19,baseY-18); ctx.stroke();
  }
  // legs with walk cycle
  ctx.strokeStyle='#5a3e22'; ctx.lineWidth=2.2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx+sway-5,baseY); ctx.lineTo(cx+sway-6,baseY+5+legBob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+sway-1,baseY); ctx.lineTo(cx+sway-1,baseY+5-legBob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+sway+4,baseY); ctx.lineTo(cx+sway+5,baseY+5+legBob*0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+sway+8,baseY); ctx.lineTo(cx+sway+7,baseY+5-legBob*0.6); ctx.stroke();
}

/* ── ISO ART KIT ── shared helpers giving every building consistent
   three-face prism shading, wood/stone texture, and warm window glow. */

function drawMemorial(m){
  const p = project(m.gx, m.gy);
  const x = p.x, y = p.y;
  try{ drawShadow(x, y+2, 9); }catch(e){}
  // headstone (rounded top)
  ctx.fillStyle='#8d8a80';
  ctx.beginPath(); ctx.moveTo(x-5,y); ctx.lineTo(x-5,y-8); ctx.arc(x,y-8,5,Math.PI,0); ctx.lineTo(x+5,y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=0.8; ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(x-2,y-9); ctx.lineTo(x+2,y-9); ctx.stroke();
  // a young oak taking root beside it — the grove remembers
  ctx.strokeStyle='#4c331e'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x+8,y); ctx.lineTo(x+8,y-7); ctx.stroke();
  ctx.fillStyle='#3a5a2e'; ctx.beginPath(); ctx.arc(x+8,y-10,4.5,0,7); ctx.fill();
  ctx.fillStyle='#456b38'; ctx.beginPath(); ctx.arc(x+6.5,y-11,2.6,0,7); ctx.fill();
}
function drawMerchantCart(gx,gy){
  const p = project(gx,gy);
  const x = p.x, y = p.y + TILE_H*0.4;
  drawShadow(x, y+4, 20);
  // wheels
  ctx.strokeStyle='#2c2012'; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.arc(x-10, y, 5.5, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(x+9, y+2, 5.5, 0, 7); ctx.stroke();
  // bed
  ctx.fillStyle='#54422a';
  ctx.beginPath();
  ctx.moveTo(x-18, y-6); ctx.lineTo(x+16, y-3); ctx.lineTo(x+16, y-12); ctx.lineTo(x-18, y-15);
  ctx.closePath(); ctx.fill();
  // canopy hoop
  ctx.fillStyle='#8a7658';
  ctx.beginPath();
  ctx.moveTo(x-16, y-14); ctx.quadraticCurveTo(x-1, y-30, x+14, y-11);
  ctx.lineTo(x+14, y-5); ctx.lineTo(x-16, y-8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(40,28,14,0.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x-9, y-24); ctx.lineTo(x-9, y-9); ctx.moveTo(x+2, y-25); ctx.lineTo(x+2, y-8); ctx.stroke();
  // lantern glow at dusk/night
  ctx.fillStyle='rgba(231,162,61,0.85)';
  ctx.beginPath(); ctx.arc(x+16, y-14, 2.2, 0, 7); ctx.fill();
}

/* The pasture's flock, drawn straight from its herd count rather than
   simulated separately — the animals you see ARE the animals winter can take.
   Positions come from a hash so they don't shuffle every frame. */
function drawHerd(b, cx, baseY){
  const n = Math.min(4, Math.max(0, Math.round(b.herd || 0)));
  const img = SPRITES.sheep;
  for(let i=0;i<n;i++){
    const ox = (hash2(b.gx*3.1+i, b.gy*2.7)-0.5) * 44;
    const oy = (hash2(b.gx*1.9, b.gy*4.3+i)-0.5) * 16;
    const bob = Math.sin(G.worldTime*1.2 + i*1.7) * 0.8;
    const x = cx + ox, y = baseY + oy - 6 + bob;
    try{ drawShadow(x, y+2, 5); }catch(e){}
    if(img && img.complete && img.naturalWidth>0){
      const w = SPRITE_SCALE.sheep || 26, h = w * (img.naturalHeight/img.naturalWidth);
      try{ ctx.drawImage(img, x - w/2, y - h + 3, w, h); continue; }catch(e){}
    }
    // Hand-drawn floor: a sprite that fails to load must still leave a flock.
    ctx.fillStyle='#e4e0d6';
    ctx.beginPath(); ctx.ellipse(x, y-4, 4.6, 3.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle='#3a332b';
    ctx.beginPath(); ctx.ellipse(x+4.2, y-5.6, 1.7, 1.5, 0, 0, 7); ctx.fill();
    ctx.fillRect(x-2.6, y-1.6, 1, 2.2); ctx.fillRect(x+1.6, y-1.6, 1, 2.2);
  }
}
function drawBuilding(b){
  if(b.type==='road'){ drawRoad(b.gx, b.gy); return; }
  const c = buildingCenter(b);
  const p = project(c.gx, c.gy);
  const baseY = p.y + TILE_H * (b.h > 1 ? b.h * 0.5 : 0.5);
  const shadowR = b.type==='townCenter' ? 52 : (b.w>1||b.h>1 ? 30 : 22);
  drawShadow(p.x, baseY + (b.type==='townCenter' ? 12 : 8), shadowR);
  const cx = p.x;
  if(blitSprite(b.type, cx, baseY)){
    // Living details layered over sprite buildings
    if(b.type==='tavern' || b.type==='bakery' || b.type==='house' || b.type==='manor') chimneySmoke(cx + 10, baseY - (SPRITE_SCALE[b.type]||80)*0.72);
    if(b.type==='pasture') drawHerd(b, cx, baseY);
    if(b.procFlash){ ctx.fillStyle=`rgba(255,220,140,${b.procFlash*0.4})`; ctx.beginPath(); ctx.arc(cx, baseY-18, 16, 0, 7); ctx.fill(); }
    return;
  }

  /* ── CANVAS ART (primary visuals until base64 sprites are added) ── */
  if(b.type==='townCenter'){
    // stone plinth
    ctx.fillStyle='#33291b';
    tileDiamond(cx, baseY+4, TILE_W*1.95, TILE_H*1.95); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1;
    tileDiamond(cx, baseY+2, TILE_W*1.8, TILE_H*1.8); ctx.stroke();
    // great hall body
    const topY = isoBox(cx, baseY-2, 46, 46, 44, '#5a4930');
    stoneCourses(cx, baseY-2, -46, 44, -1);
    plankLines(cx, baseY-2, 46, 44, 1);
    // roof
    const peak = isoRoof(cx, topY, 46, 46, 34, '#3a2417');
    // windows both faces
    glowWindow(cx-30, baseY-34, 8, 10, 0);
    glowWindow(cx-15, baseY-40, 8, 10, 1.4);
    glowWindow(cx+12, baseY-38, 7, 9, 2.6);
    // grand door
    doorArch(cx-4, baseY-1, 14, 20);
    ctx.strokeStyle='#0c0803'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(cx-4, baseY-1); ctx.lineTo(cx-4, baseY-15); ctx.stroke();
    // banner pole + waving pennant
    ctx.strokeStyle='#1a1108'; ctx.lineWidth=2.6;
    ctx.beginPath(); ctx.moveTo(cx, peak-2); ctx.lineTo(cx, peak-26); ctx.stroke();
    const wave=Math.sin(G.worldTime*2)*3;
    ctx.fillStyle=bannerPalette[G.bannerIdx]||BANNER_COLORS[0];
    ctx.beginPath();
    ctx.moveTo(cx, peak-26); ctx.lineTo(cx+19+wave, peak-21); ctx.lineTo(cx+16+wave*0.5, peak-17); ctx.lineTo(cx, peak-15);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.moveTo(cx, peak-20); ctx.lineTo(cx+16+wave*0.5, peak-17); ctx.lineTo(cx, peak-15); ctx.closePath(); ctx.fill();
    drawTorch(cx-50, baseY-20);
    drawTorch(cx+50, baseY-20);
  }
  else if(b.type==='house'){
    const topY = isoBox(cx, baseY, 20, 20, 18, '#6a5638');
    plankLines(cx, baseY, -20, 18, -1);
    plankLines(cx, baseY, 20, 18, 1);
    isoRoof(cx, topY, 20, 20, 15, '#4a3220');
    glowWindow(cx-13, baseY-13, 6, 7, b.gx);
    doorArch(cx+8, baseY, 8, 12);
    // chimney + smoke
    ctx.fillStyle='#4e463c'; ctx.fillRect(cx+8, topY-20, 5, 12);
    chimneySmoke(cx+10, topY-20);
  }
  else if(b.type==='forestCamp'){
    // lean-to: half-height box + single slope
    const topY = isoBox(cx-4, baseY, 18, 14, 12, '#54422a');
    ctx.fillStyle='#3a2c1a';
    ctx.beginPath();
    ctx.moveTo(cx-24, topY-8); ctx.lineTo(cx+12, topY-16); ctx.lineTo(cx+16, topY+2); ctx.lineTo(cx-20, topY+8);
    ctx.closePath(); ctx.fill();
    // log pile — stacked circles with ring detail
    for(let i=0;i<3;i++) for(let j=0;j<(3-i);j++){
      const lx = cx+16+j*8+i*4, ly = baseY-3-i*6;
      ctx.fillStyle='#5e4426'; ctx.beginPath(); ctx.arc(lx, ly, 4, 0, 7); ctx.fill();
      ctx.strokeStyle='#3c2a14'; ctx.lineWidth=0.8; ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, 7); ctx.stroke();
    }
    // stump + axe
    ctx.fillStyle='#4c3820'; ctx.fillRect(cx-26, baseY-8, 8, 8);
    ctx.strokeStyle='#888078'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx-22, baseY-8); ctx.lineTo(cx-17, baseY-18); ctx.stroke();
    ctx.fillStyle='#9a938a';
    ctx.beginPath(); ctx.moveTo(cx-19, baseY-19); ctx.lineTo(cx-13, baseY-17); ctx.lineTo(cx-16, baseY-13); ctx.closePath(); ctx.fill();
  }
  else if(b.type==='miningPost'){
    // rock mound
    ctx.fillStyle='#4a4840';
    ctx.beginPath();
    ctx.moveTo(cx-24, baseY+2); ctx.lineTo(cx-14, baseY-22); ctx.lineTo(cx+4, baseY-28); ctx.lineTo(cx+22, baseY-12); ctx.lineTo(cx+24, baseY+2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='#5e5c54';
    ctx.beginPath(); ctx.moveTo(cx-14, baseY-22); ctx.lineTo(cx+4, baseY-28); ctx.lineTo(cx+2, baseY-14); ctx.lineTo(cx-8, baseY-10); ctx.closePath(); ctx.fill();
    // tunnel mouth with timber frame
    ctx.fillStyle='#0c0a06';
    ctx.beginPath(); ctx.ellipse(cx, baseY-8, 10, 12, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx-10, baseY-8, 20, 9);
    ctx.strokeStyle='#4c3820'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(cx-11, baseY+1); ctx.lineTo(cx-11, baseY-14); ctx.lineTo(cx+11, baseY-14); ctx.lineTo(cx+11, baseY+1); ctx.stroke();
    // ore cart
    ctx.fillStyle='#3a3630'; ctx.fillRect(cx+14, baseY-7, 12, 7);
    ctx.fillStyle='#7a6a3a'; ctx.fillRect(cx+15, baseY-9, 10, 3);
    ctx.fillStyle='#1c1a16';
    ctx.beginPath(); ctx.arc(cx+17, baseY+1, 2.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+23, baseY+1, 2.4, 0, 7); ctx.fill();
    drawTorch(cx-18, baseY-16);
  }
  else if(b.type==='fishingHut'){
    // stilts
    ctx.strokeStyle='#3c2e1c'; ctx.lineWidth=2.5;
    for(const sx of [-12,-2,8]){ ctx.beginPath(); ctx.moveTo(cx+sx, baseY+2); ctx.lineTo(cx+sx+2, baseY-10); ctx.stroke(); }
    const topY = isoBox(cx, baseY-10, 16, 16, 13, '#5c4a30');
    plankLines(cx, baseY-10, -16, 13, -1);
    isoRoof(cx, topY, 16, 16, 11, '#42301e');
    // drying net
    ctx.strokeStyle='rgba(180,190,180,0.5)'; ctx.lineWidth=0.7;
    for(let i=0;i<4;i++){ ctx.beginPath(); ctx.moveTo(cx+18, baseY-24+i*3); ctx.lineTo(cx+30, baseY-18+i*3); ctx.stroke(); }
    for(let i=0;i<4;i++){ ctx.beginPath(); ctx.moveTo(cx+18+i*4, baseY-24+i*1); ctx.lineTo(cx+18+i*4, baseY-12); ctx.stroke(); }
    // hanging fish
    ctx.fillStyle='#7a9aab';
    ctx.beginPath(); ctx.ellipse(cx+24, baseY-14, 3.5, 1.6, 0.9, 0, 7); ctx.fill();
    glowWindow(cx-10, baseY-20, 5, 6, b.gy);
  }
  else if(b.type==='huntingCabin'){
    const topY = isoBox(cx, baseY, 19, 17, 15, '#4e3c26');
    // log ends — round dots along the corner
    ctx.fillStyle='#68522f';
    for(let i=0;i<4;i++){ ctx.beginPath(); ctx.arc(cx, baseY-2-i*4, 2, 0, 7); ctx.fill(); }
    plankLines(cx, baseY, -19, 15, -1);
    plankLines(cx, baseY, 17, 15, 1);
    isoRoof(cx, topY, 19, 17, 12, '#38281a');
    // antler rack above door
    doorArch(cx-8, baseY, 8, 11);
    ctx.strokeStyle='#d8cdb8'; ctx.lineWidth=1.4;
    ctx.beginPath();
    ctx.moveTo(cx-11, baseY-14); ctx.lineTo(cx-8, baseY-18); ctx.lineTo(cx-6, baseY-15);
    ctx.moveTo(cx-8, baseY-18); ctx.lineTo(cx-8, baseY-14);
    ctx.moveTo(cx-5, baseY-14); ctx.lineTo(cx-8, baseY-18);
    ctx.stroke();
    // pelt drying frame
    ctx.strokeStyle='#3c2e1c'; ctx.lineWidth=1.6;
    ctx.strokeRect(cx+14, baseY-18, 12, 14);
    ctx.fillStyle='#8a6a42';
    ctx.beginPath();
    ctx.moveTo(cx+16, baseY-16); ctx.lineTo(cx+24, baseY-16); ctx.lineTo(cx+23, baseY-6); ctx.lineTo(cx+17, baseY-6);
    ctx.closePath(); ctx.fill();
  }
  else if(b.type==='farm' && decorImg('farmland',0)){
    const fl = decorImg('farmland',0);
    const fw = TILE_W, fh = fw*(fl.naturalHeight/fl.naturalWidth);
    ctx.drawImage(fl, p.x - fw/2, p.y - TILE_H/2, fw, fh);
    const si = seasonIndex();
    const cropKey = si===3 ? null : (si===0 ? 'cornYoung' : 'corn');
    if(cropKey){
      const c1 = decorImg(cropKey, 0);
      if(c1){
        const cw = 30, chh = cw*(c1.naturalHeight/c1.naturalWidth);
        ctx.drawImage(c1, p.x - cw - 2, p.y - chh + 4, cw, chh);
        ctx.drawImage(c1, p.x + 2, p.y - chh + 8, cw, chh);
      }
    }
    const fenceImg = decorImg('fence',0);
    if(fenceImg){
      const fw2 = 34, fh2 = fw2*(fenceImg.naturalHeight/fenceImg.naturalWidth);
      try {
        ctx.drawImage(fenceImg, p.x - TILE_W/2 + 2, p.y - fh2 - 2, fw2, fh2);
        ctx.drawImage(fenceImg, p.x + TILE_W/2 - fw2 - 2, p.y - fh2 + 6, fw2, fh2);
      } catch(e){}
    }
    const hayImg = decorImg('hayStack',0) || decorImg('hay',0);
    if(hayImg && hash2(b.gx,b.gy) > 0.5){
      const hw = 20, hh2 = hw*(hayImg.naturalHeight/hayImg.naturalWidth);
      ctx.drawImage(hayImg, p.x + 12, p.y - hh2 + 2, hw, hh2);
    }
  }
  else if(b.type==='farm'){
    // tilled soil bed
    ctx.fillStyle='#3c2c1a';
    tileDiamond(cx, p.y, TILE_W*0.95, TILE_H*0.95); ctx.fill();
    // furrow rows following iso direction
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.4;
    for(let i=-2;i<=2;i++){
      ctx.beginPath();
      ctx.moveTo(cx-22+i*6, p.y+ (i*3) - 6);
      ctx.lineTo(cx+10+i*6, p.y+ (i*3) + 10 - 6);
      ctx.stroke();
    }
    // wheat shoots — grow with season (fuller in summer/autumn)
    const growth = seasonIndex()===3 ? 0.3 : (seasonIndex()===0 ? 0.6 : 1);
    ctx.strokeStyle='#b89a3a'; ctx.lineWidth=1.1;
    for(let i=0;i<10;i++){
      const ox=(hash2(b.gx*3+i, b.gy*5)-0.5)*38, oy=(hash2(b.gx*7, b.gy*2+i)-0.5)*14;
      const hgt = (4 + hash2(b.gx+i,b.gy)*5) * growth;
      ctx.beginPath(); ctx.moveTo(cx+ox, p.y+oy+3); ctx.lineTo(cx+ox+1, p.y+oy+3-hgt); ctx.stroke();
      if(growth>0.7){ ctx.fillStyle='#d0b050'; ctx.fillRect(cx+ox, p.y+oy+2-hgt, 2.4, 3); }
    }
    // corner fence posts
    ctx.strokeStyle='#3c2e1c'; ctx.lineWidth=1.8;
    for(const [fx,fy] of [[-26,0],[26,0],[0,-12],[0,12]]){
      ctx.beginPath(); ctx.moveTo(cx+fx, p.y+fy+2); ctx.lineTo(cx+fx, p.y+fy-7); ctx.stroke();
    }
  }
  else if(b.type==='granary'){
    // round tower: stacked ellipses illusion via vertical cylinder
    ctx.fillStyle='#5c5648';
    ctx.beginPath();
    ctx.ellipse(cx, baseY-2, 16, 8, 0, 0, Math.PI); ctx.fill();
    ctx.fillRect(cx-16, baseY-26, 32, 24);
    ctx.beginPath(); ctx.ellipse(cx, baseY-2, 16, 8, 0, Math.PI, 0, true); ctx.fill();
    // cylinder shading
    const grd = ctx.createLinearGradient(cx-16, 0, cx+16, 0);
    grd.addColorStop(0,'rgba(255,240,210,0.10)'); grd.addColorStop(0.5,'rgba(0,0,0,0)'); grd.addColorStop(1,'rgba(0,0,0,0.30)');
    ctx.fillStyle=grd; ctx.fillRect(cx-16, baseY-26, 32, 24);
    stoneCourses(cx-16, baseY-2, 32, 24, 1);
    // conical thatch roof
    ctx.fillStyle='#7a622e';
    ctx.beginPath();
    ctx.moveTo(cx-19, baseY-25); ctx.lineTo(cx, baseY-44); ctx.lineTo(cx+19, baseY-25);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.moveTo(cx, baseY-44); ctx.lineTo(cx+19, baseY-25); ctx.lineTo(cx+8, baseY-25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.22)'; ctx.lineWidth=0.8;
    for(let i=1;i<4;i++){ const y=baseY-25-(19*i/4); const w=19*(1-i/4); ctx.beginPath(); ctx.moveTo(cx-w,y+ (19-19*(1-i/4))*0 ); ctx.lineTo(cx+w, y); ctx.stroke(); }
    const sackImg = decorImg('sack',0);
    if(sackImg){
      const sw2 = 16, sh2 = sw2*(sackImg.naturalHeight/sackImg.naturalWidth);
      try { ctx.drawImage(sackImg, cx+14, baseY-sh2+2, sw2, sh2); } catch(e){}
    }
    // loading door + pulley
    ctx.fillStyle='#241a10'; ctx.fillRect(cx-5, baseY-18, 10, 12);
    ctx.strokeStyle='#241a10'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(cx, baseY-44); ctx.lineTo(cx+9, baseY-50); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+9, baseY-49, 2, 0, 7); ctx.stroke();
  }
  else if(b.type==='tradingPost'){
    // counter base
    const topY = isoBox(cx, baseY, 22, 18, 10, '#5a4326');
    // corner posts + striped awning
    ctx.strokeStyle='#3c2e1c'; ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.moveTo(cx-22, topY-11); ctx.lineTo(cx-22, topY-30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+18, topY-9); ctx.lineTo(cx+18, topY-28); ctx.stroke();
    // awning canopy with stripes
    ctx.fillStyle='#8a3428';
    ctx.beginPath();
    ctx.moveTo(cx-27, topY-28); ctx.lineTo(cx+23, topY-26); ctx.lineTo(cx+18, topY-16); ctx.lineTo(cx-22, topY-18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='#d8cdb8';
    for(let i=0;i<3;i++){
      ctx.beginPath();
      ctx.moveTo(cx-27+ (i*2+1)*50/6, topY-28+ (i*2+1)*2/6);
      ctx.lineTo(cx-22+ (i*2+1)*40/6, topY-18+ (i*2+1)*2/6);
      ctx.lineTo(cx-22+ (i*2+2)*40/6, topY-18+ (i*2+2)*2/6);
      ctx.lineTo(cx-27+ (i*2+2)*50/6, topY-28+ (i*2+2)*2/6);
      ctx.closePath(); ctx.fill();
    }
    const crateImg = decorImg('sacksCrate',0);
    if(crateImg){
      const cw2 = 24, ch2 = cw2*(crateImg.naturalHeight/crateImg.naturalWidth);
      try { ctx.drawImage(crateImg, cx-30, baseY-ch2+2, cw2, ch2); } catch(e){}
    }
    // goods on counter: crate, sack, scales
    ctx.fillStyle='#6a5232'; ctx.fillRect(cx-14, topY-9, 9, 8);
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=0.7; ctx.strokeRect(cx-14, topY-9, 9, 8);
    ctx.fillStyle='#a89468';
    ctx.beginPath(); ctx.arc(cx+2, topY-5, 4.5, Math.PI, 0); ctx.fill();
    ctx.fillStyle='#8a7a4e'; ctx.fillRect(cx+1, topY-9, 2, 3);
    // hanging lantern glow
    const lg = 0.5+Math.sin(G.worldTime*3)*0.12;
    ctx.fillStyle=`rgba(255,200,110,${lg})`;
    ctx.beginPath(); ctx.arc(cx+13, topY-20, 3, 0, 7); ctx.fill();
  }
  else if(b.type==='watchtower'){
    // tall narrow shaft with taper
    ctx.fillStyle='#565044';
    ctx.beginPath();
    ctx.moveTo(cx-11, baseY); ctx.lineTo(cx-8, baseY-42); ctx.lineTo(cx+8, baseY-42); ctx.lineTo(cx+11, baseY);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.lineTo(cx, baseY-42); ctx.lineTo(cx+8, baseY-42); ctx.lineTo(cx+11, baseY); ctx.closePath(); ctx.fill();
    stoneCourses(cx-10, baseY, 20, 42, 1);
    // arrow slits
    ctx.fillStyle='#0c0a06';
    ctx.fillRect(cx-1.5, baseY-20, 3, 8);
    ctx.fillRect(cx-1.5, baseY-34, 3, 8);
    // crenellated platform
    ctx.fillStyle='#4a463c';
    ctx.fillRect(cx-14, baseY-50, 28, 8);
    for(let i=0;i<4;i++) ctx.fillRect(cx-14+i*8, baseY-55, 5, 5);
    // beacon torch — big flicker glow at top
    const flick = Math.max(0.5, 0.75+Math.sin(G.worldTime*8+1)*0.25);
    const g2 = ctx.createRadialGradient(cx, baseY-58, 0, cx, baseY-58, 16*flick);
    g2.addColorStop(0,'rgba(255,196,110,0.85)'); g2.addColorStop(1,'rgba(255,140,40,0)');
    ctx.fillStyle=g2;
    ctx.beginPath(); ctx.arc(cx, baseY-58, 16*flick, 0, 7); ctx.fill();
    ctx.fillStyle='#f0a23d';
    ctx.beginPath(); ctx.ellipse(cx, baseY-57, 3, Math.max(0.6, 5*flick), 0, 0, 7); ctx.fill();
  }
  else if(b.type==='tavern'){
    // ground floor
    const topY = isoBox(cx, baseY, 24, 22, 16, '#5a462c');
    plankLines(cx, baseY, -24, 16, -1);
    // overhanging upper floor (jettied)
    const topY2 = isoBox(cx, topY+2, 27, 25, 14, '#6a5436');
    plankLines(cx, topY+2, 27, 14, 1);
    // timber frame X-brace on upper floor
    ctx.strokeStyle='#2c2012'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(cx-24, topY-4); ctx.lineTo(cx-6, topY-16); ctx.moveTo(cx-24, topY-16); ctx.lineTo(cx-6, topY-4); ctx.stroke();
    isoRoof(cx, topY2, 27, 25, 16, '#3a2818');
    // glowing windows both floors
    glowWindow(cx-18, baseY-11, 6, 7, 0.5);
    glowWindow(cx+10, baseY-12, 6, 7, 1.9);
    glowWindow(cx-14, topY-12, 6, 7, 3.1);
    doorArch(cx+2, baseY, 9, 13);
    // hanging sign + tankard glyph
    ctx.strokeStyle='#1a1108'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx-29, topY-8); ctx.lineTo(cx-29, topY+6); ctx.stroke();
    ctx.fillStyle='#8a5a2c'; ctx.fillRect(cx-36, topY+2, 13, 10);
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.strokeRect(cx-36, topY+2, 13, 10);
    ctx.fillStyle='#d8cdb8'; ctx.fillRect(cx-33, topY+4, 5, 6);
    ctx.fillRect(cx-27.5, topY+5.5, 2, 3);
    // barrel by the door
    ctx.fillStyle='#5e4426';
    ctx.beginPath(); ctx.ellipse(cx+16, baseY-4, 4.5, 6, 0, 0, 7); ctx.fill();
    ctx.strokeStyle='#2c2012'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.ellipse(cx+16, baseY-4, 4.5, 6, 0, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+11.5, baseY-6); ctx.lineTo(cx+20.5, baseY-6); ctx.stroke();
    // chimney smoke
    ctx.fillStyle='#4e463c'; ctx.fillRect(cx+12, topY2-26, 5, 12);
    chimneySmoke(cx+14, topY2-26);
    drawTorch(cx+27, baseY-14);
  }
  else if(b.type==='sawmill'){
    const topY = isoBox(cx, baseY, 22, 18, 14, '#5c4628');
    plankLines(cx, baseY, -22, 14, -1);
    isoRoof(cx, topY, 22, 18, 12, '#3c2a18');
    // big circular saw blade
    const spin = G.worldTime*3;
    ctx.save(); ctx.translate(cx+16, baseY-8);
    ctx.fillStyle='#8a8478';
    ctx.beginPath(); ctx.arc(0,0,7,0,7); ctx.fill();
    ctx.strokeStyle='#4a463c'; ctx.lineWidth=1.4;
    for(let i=0;i<8;i++){ const a=spin+i*Math.PI/4; ctx.beginPath(); ctx.moveTo(Math.cos(a)*5,Math.sin(a)*5); ctx.lineTo(Math.cos(a)*8.5,Math.sin(a)*8.5); ctx.stroke(); }
    ctx.restore();
    // plank stack (sprite with drawn fallback)
    const psImg = decorImg('plankStack',0);
    if(psImg){
      const pw = 26, ph2 = pw*(psImg.naturalHeight/psImg.naturalWidth);
      try { ctx.drawImage(psImg, cx-34, baseY-ph2+2, pw, ph2); } catch(e){}
    } else {
      ctx.fillStyle='#a8895a';
      for(let i=0;i<3;i++) ctx.fillRect(cx-28, baseY-4-i*3.2, 16, 2.6);
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=0.6;
      for(let i=0;i<3;i++) ctx.strokeRect(cx-28, baseY-4-i*3.2, 16, 2.6);
    }
    if(b.procFlash){ ctx.fillStyle=`rgba(255,220,140,${b.procFlash*0.5})`; ctx.beginPath(); ctx.arc(cx+16, baseY-8, 12, 0, 7); ctx.fill(); }
  }
  else if(b.type==='windmill'){
    // stone tower
    ctx.fillStyle='#5c5648';
    ctx.beginPath(); ctx.moveTo(cx-12, baseY); ctx.lineTo(cx-8, baseY-34); ctx.lineTo(cx+8, baseY-34); ctx.lineTo(cx+12, baseY); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.lineTo(cx, baseY-34); ctx.lineTo(cx+8, baseY-34); ctx.lineTo(cx+12, baseY); ctx.closePath(); ctx.fill();
    stoneCourses(cx-10, baseY, 20, 34, 1);
    // cap
    ctx.fillStyle='#3a2818';
    ctx.beginPath(); ctx.moveTo(cx-11, baseY-33); ctx.lineTo(cx, baseY-44); ctx.lineTo(cx+11, baseY-33); ctx.closePath(); ctx.fill();
    doorArch(cx, baseY, 8, 11);
    // rotating sails
    const rot = G.worldTime*0.9;
    ctx.save(); ctx.translate(cx, baseY-40);
    for(let i=0;i<4;i++){
      const a = rot + i*Math.PI/2;
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle='#c8bda4';
      ctx.fillRect(-1.5, -26, 3, 24);
      ctx.fillStyle='rgba(60,46,28,0.85)';
      ctx.fillRect(1.5, -26, 5, 20);
      ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=0.6;
      ctx.strokeRect(1.5, -26, 5, 20);
      ctx.restore();
    }
    ctx.fillStyle='#241a10'; ctx.beginPath(); ctx.arc(0,0,3,0,7); ctx.fill();
    ctx.restore();
    if(b.procFlash){ ctx.fillStyle=`rgba(255,240,180,${b.procFlash*0.4})`; ctx.beginPath(); ctx.arc(cx, baseY-40, 26, 0, 7); ctx.fill(); }
  }
  else if(b.type==='bakery'){
    const topY = isoBox(cx, baseY, 20, 18, 16, '#6a5232');
    plankLines(cx, baseY, 20, 16, 1);
    isoRoof(cx, topY, 20, 18, 13, '#42301c');
    glowWindow(cx-13, baseY-12, 6, 7, 2.2);
    doorArch(cx+7, baseY, 8, 12);
    // stone oven chimney with hearty smoke
    ctx.fillStyle='#565044'; ctx.fillRect(cx-16, topY-16, 7, 14);
    stoneCourses(cx-16, topY-2, 7, 14, 1);
    chimneySmoke(cx-12, topY-16);
    // bread sign
    ctx.strokeStyle='#1a1108'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.moveTo(cx+22, baseY-18); ctx.lineTo(cx+22, baseY-8); ctx.stroke();
    ctx.fillStyle='#8a5a2c'; ctx.fillRect(cx+17, baseY-10, 11, 8);
    ctx.fillStyle='#d8a850';
    ctx.beginPath(); ctx.ellipse(cx+22.5, baseY-6, 3.5, 2, 0, 0, 7); ctx.fill();
    if(b.procFlash){ ctx.fillStyle=`rgba(255,200,120,${b.procFlash*0.5})`; ctx.beginPath(); ctx.arc(cx-12, topY-10, 12, 0, 7); ctx.fill(); }
  }
  else if(b.type==='guardPost'){
    // raised timber platform
    ctx.strokeStyle='#3c2e1c'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(cx-10, baseY); ctx.lineTo(cx-8, baseY-20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+10, baseY); ctx.lineTo(cx+8, baseY-20); ctx.stroke();
    const topY = isoBox(cx, baseY-20, 15, 13, 10, '#5a462c');
    plankLines(cx, baseY-20, 15, 10, 1);
    isoRoof(cx, topY, 15, 13, 9, '#38281a');
    // ladder
    ctx.strokeStyle='#4c3820'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(cx-4, baseY); ctx.lineTo(cx-2, baseY-18); ctx.moveTo(cx+2, baseY); ctx.lineTo(cx+4, baseY-18); ctx.stroke();
    for(let i=1;i<5;i++){ const y=baseY-i*3.6; ctx.beginPath(); ctx.moveTo(cx-3.4+i*0.35, y); ctx.lineTo(cx+3.4-i*0.1, y); ctx.stroke(); }
    // shield emblem + banner
    ctx.fillStyle='#8a3428';
    ctx.beginPath(); ctx.moveTo(cx, baseY-24); ctx.lineTo(cx+5, baseY-28); ctx.lineTo(cx+5, baseY-34); ctx.lineTo(cx-5, baseY-34); ctx.lineTo(cx-5, baseY-28); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#d8cdb8'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(cx-3, baseY-31); ctx.lineTo(cx+3, baseY-31); ctx.moveTo(cx, baseY-33.5); ctx.lineTo(cx, baseY-26); ctx.stroke();
    drawTorch(cx+16, baseY-24);
  }
  else if(b.type==='bridge'){
    // plank span across the recessed water surface. Deck sits at bank level;
    // posts drop to the water below (WATER_DROP).
    const wy = baseY + WATER_DROP;
    // support posts
    ctx.strokeStyle='#3a2c1a'; ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(cx-14, baseY-2); ctx.lineTo(cx-14, wy+3);
    ctx.moveTo(cx+14, baseY-2); ctx.lineTo(cx+14, wy+3);
    ctx.stroke();
    // deck: iso diamond of planks at bank level
    ctx.fillStyle='#5a4429';
    tileDiamond(cx, baseY-3, TILE_W*0.98, TILE_H*0.98); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.14)';
    tileDiamond(cx, baseY-3, TILE_W*0.7, TILE_H*0.7); ctx.fill();
    // plank seams along the crossing direction
    ctx.strokeStyle='rgba(30,20,10,0.55)'; ctx.lineWidth=1;
    for(let i=-2;i<=2;i++){
      ctx.beginPath();
      ctx.moveTo(cx - TILE_W*0.42 + i*3, baseY-3 + i*TILE_H*0.16);
      ctx.lineTo(cx + TILE_W*0.42 + i*3, baseY-3 + i*TILE_H*0.16 - TILE_H*0.0);
      ctx.stroke();
    }
    // rail posts + rope rail on both edges
    ctx.strokeStyle='#46351e'; ctx.lineWidth=2;
    for(const side of [-1,1]){
      const rx1=cx - TILE_W*0.36, rx2=cx + TILE_W*0.36;
      const ry = baseY-3 + side*TILE_H*0.34;
      ctx.beginPath(); ctx.moveTo(rx1, ry); ctx.lineTo(rx1, ry-8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx2, ry); ctx.lineTo(rx2, ry-8); ctx.stroke();
      ctx.strokeStyle='rgba(90,70,40,0.9)'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(rx1, ry-7); ctx.quadraticCurveTo(cx, ry-4, rx2, ry-7); ctx.stroke();
      ctx.strokeStyle='#46351e'; ctx.lineWidth=2;
    }
  }
  else if(b.type==='well'){
    // stone-ringed well with a little timber roof and bucket
    ctx.fillStyle='#2a2418'; tileDiamond(cx, baseY+3, TILE_W*0.7, TILE_H*0.7); ctx.fill();
    // stone ring
    ctx.fillStyle='#6b6455';
    ctx.beginPath(); ctx.ellipse(cx, baseY-3, 13, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle='#141210';
    ctx.beginPath(); ctx.ellipse(cx, baseY-4, 8.5, 4.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(cx, baseY-3, 13, 7, 0, 0, 7); ctx.stroke();
    // two posts + roof
    ctx.strokeStyle='#4a3a24'; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(cx-10, baseY-6); ctx.lineTo(cx-10, baseY-24); ctx.moveTo(cx+10, baseY-6); ctx.lineTo(cx+10, baseY-24); ctx.stroke();
    ctx.fillStyle='#4a2f1c';
    ctx.beginPath(); ctx.moveTo(cx-14, baseY-22); ctx.lineTo(cx, baseY-31); ctx.lineTo(cx+14, baseY-22); ctx.closePath(); ctx.fill();
    // bucket rope + bucket
    ctx.strokeStyle='#2c2214'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cx, baseY-22); ctx.lineTo(cx, baseY-11); ctx.stroke();
    ctx.fillStyle='#5a4025'; ctx.fillRect(cx-3, baseY-12, 6, 5);
  }
  else if(b.type==='lampPost'){
    // small stone footing
    ctx.fillStyle='#2a2418'; tileDiamond(cx, baseY+2, TILE_W*0.34, TILE_H*0.34); ctx.fill();
    ctx.fillStyle='#6b6455';
    ctx.beginPath(); ctx.ellipse(cx, baseY-1, 5.5, 3, 0, 0, 7); ctx.fill();
    // timber post
    ctx.strokeStyle='#3a2c1a'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(cx, baseY-2); ctx.lineTo(cx, baseY-30); ctx.stroke();
    // cross-arm the lantern hangs from
    ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.moveTo(cx, baseY-28); ctx.lineTo(cx+7, baseY-30); ctx.stroke();
    const lx = cx+7, ly = baseY-22;
    // hanging chain
    ctx.strokeStyle='#241505'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(lx, baseY-30); ctx.lineTo(lx, ly-6); ctx.stroke();
    // iron lantern housing
    ctx.fillStyle='#1c1710';
    ctx.beginPath(); ctx.moveTo(lx-4, ly-6); ctx.lineTo(lx+4, ly-6); ctx.lineTo(lx+5, ly+4); ctx.lineTo(lx-5, ly+4); ctx.closePath(); ctx.fill();
    // roof cap
    ctx.fillStyle='#2a2018';
    ctx.beginPath(); ctx.moveTo(lx-5, ly-6); ctx.lineTo(lx, ly-11); ctx.lineTo(lx+5, ly-6); ctx.closePath(); ctx.fill();
    // flame glow — brighter after dark, gently flickering
    const dk = darknessFactor();
    const flick = 0.65 + Math.sin(G.worldTime*8 + cx)*0.2;
    const glow = 0.25 + dk*0.55;
    ctx.fillStyle='#f2c86a';
    ctx.beginPath(); ctx.ellipse(lx, ly-1, 2.4, Math.max(1, 3.4*flick), 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(lx, ly-1, 0, lx, ly-1, 16*flick);
    g.addColorStop(0, 'rgba(255,196,110,'+(glow*flick).toFixed(3)+')');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(lx, ly-1, 16*flick, 0, 7); ctx.fill();
  }
  else if(b.type==='forester'){
    // a tended nursery of saplings in rows
    ctx.fillStyle='#2f2a18'; tileDiamond(cx, baseY+2, TILE_W*0.8, TILE_H*0.8); ctx.fill();
    ctx.strokeStyle='#241c12'; ctx.lineWidth=1.2; tileDiamond(cx, baseY+2, TILE_W*0.8, TILE_H*0.8); ctx.stroke();
    for(let i=0;i<7;i++){
      const a=i*2.39996, r=3+Math.sqrt(i)*5;
      const sx=cx+Math.cos(a)*r, sy=baseY+2+Math.sin(a)*r*0.5;
      ctx.strokeStyle='#5a4025'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy-7); ctx.stroke();
      ctx.fillStyle=(i%2)?'#4a5d33':'#6d854c'; ctx.beginPath(); ctx.moveTo(sx, sy-13); ctx.lineTo(sx-4, sy-6); ctx.lineTo(sx+4, sy-6); ctx.closePath(); ctx.fill();
    }
  }
  else if(b.type==='pasture'){
    // fenced grazing field with a few animals
    ctx.fillStyle = seasonIndex()===3 ? '#6a7360' : '#4a5d33';
    tileDiamond(cx, baseY+2, TILE_W*0.82, TILE_H*0.82); ctx.fill();
    ctx.strokeStyle='#2a2014'; ctx.lineWidth=1.4;
    tileDiamond(cx, baseY+2, TILE_W*0.82, TILE_H*0.82); ctx.stroke();
    // fence posts around the rim
    ctx.strokeStyle='#5a4025'; ctx.lineWidth=1.8;
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2 + Math.PI/4;
      const px=cx+Math.cos(a)*TILE_W*0.38, py=baseY+2+Math.sin(a)*TILE_H*0.38;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py-6); ctx.stroke();
    }
    // animals — small woolly dots, count reflects the herd
    const herd = Math.max(1, Math.min(6, b.herd||2));
    for(let i=0;i<herd;i++){
      const a = i*2.39996, r = 3+Math.sqrt(i)*4.2;
      const ax = cx + Math.cos(a)*r, ay = baseY + Math.sin(a)*r*0.5;
      ctx.fillStyle='#e8e2d2'; ctx.beginPath(); ctx.ellipse(ax, ay-3, 3.4, 2.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle='#3a3026'; ctx.fillRect(ax-1, ay-2, 2, 2); // head
    }
  }
  else if(b.type==='palisade'){
    // row of sharpened stakes across the tile
    const stakes = 5;
    for(let i=0;i<stakes;i++){
      const fx = cx - 18 + i*9 + (hash2(b.gx+i, b.gy)*3-1.5);
      const fy = baseY - 2 + (i%2)*2.5;
      const hgt = 17 + hash2(b.gx*2+i, b.gy*3)*5;
      ctx.fillStyle = i%2 ? '#54422a' : '#5e4a30';
      ctx.beginPath();
      ctx.moveTo(fx-2.6, fy); ctx.lineTo(fx-2.2, fy-hgt+4); ctx.lineTo(fx, fy-hgt); ctx.lineTo(fx+2.2, fy-hgt+4); ctx.lineTo(fx+2.6, fy);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=0.6;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy-hgt+2); ctx.stroke();
    }
    // horizontal binding beam
    ctx.strokeStyle='#3c2e1c'; ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.moveTo(cx-20, baseY-9); ctx.lineTo(cx+20, baseY-7); ctx.stroke();
  }
  else if(b.type==='manor'){
    // grand two-storey timber-framed hall
    const topY = isoBox(cx, baseY, 25, 22, 15, '#6a5a3c');
    stoneCourses(cx, baseY, -25, 15, -1);
    const topY2 = isoBox(cx, topY+2, 27, 24, 14, '#7a664a');
    // timber X-framing on the upper storey
    ctx.strokeStyle='#2c2012'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(cx-24, topY-4); ctx.lineTo(cx-8, topY-15); ctx.moveTo(cx-24, topY-15); ctx.lineTo(cx-8, topY-4);
    ctx.moveTo(cx+6, topY-5); ctx.lineTo(cx+20, topY-14); ctx.moveTo(cx+6, topY-14); ctx.lineTo(cx+20, topY-5);
    ctx.stroke();
    isoRoof(cx, topY2, 27, 24, 18, '#3c2c1c');
    // windows on both storeys — a wealthy glow
    glowWindow(cx-18, baseY-11, 6, 7, 0.7);
    glowWindow(cx+11, baseY-12, 6, 7, 1.6);
    glowWindow(cx-15, topY-12, 6, 7, 2.8);
    glowWindow(cx+8, topY-13, 6, 7, 3.9);
    doorArch(cx-2, baseY, 10, 14);
    // twin chimneys with smoke
    ctx.fillStyle='#565044';
    ctx.fillRect(cx-14, topY2-26, 5, 12);
    ctx.fillRect(cx+11, topY2-24, 5, 10);
    chimneySmoke(cx-12, topY2-26);
    chimneySmoke(cx+13, topY2-24);
  }
}

function drawTorch(x,y){
  const fireImg = decorImg('fire', G.worldTime*9 + x*0.13);
  if(fireImg){
    ctx.strokeStyle='#241505'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x, y+10); ctx.lineTo(x, y-2); ctx.stroke();
    const w = 15, hgt = w*(fireImg.naturalHeight/fireImg.naturalWidth);
    ctx.drawImage(fireImg, x-w/2, y-hgt-1, w, hgt);
    const flick = 0.55+Math.sin(G.worldTime*8+x)*0.15;
    const g = ctx.createRadialGradient(x, y-6, 0, x, y-6, 15);
    g.addColorStop(0, 'rgba(255,180,80,'+(0.35*flick)+')');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x, y-6, 15, 0, Math.PI*2); ctx.fill();
    return;
  }
  ctx.fillStyle='#2a1d12'; ctx.fillRect(x-2,y-6,4,16);
  const flick = Math.max(0.4, 0.7+Math.sin(G.worldTime*9 + x)*0.3);
  const grd = ctx.createRadialGradient(x,y-10,0,x,y-10,14*flick);
  grd.addColorStop(0,'rgba(255,196,110,0.9)');
  grd.addColorStop(1,'rgba(255,140,40,0)');
  ctx.fillStyle=grd;
  ctx.beginPath(); ctx.arc(x,y-10,14*flick,0,7); ctx.fill();
  ctx.fillStyle='#f0a23d';
  ctx.beginPath(); ctx.ellipse(x,y-9,3,Math.max(0.5,5*flick),0,0,7); ctx.fill();
}

const ROLE_COLORS = {
  idle:   {body:'#6e5a3f', hood:'#3f3324'},
  lumberjack:{body:'#5c6e3f', hood:'#33401f'},
  miner:  {body:'#5a5650', hood:'#33312c'},
  farmer: {body:'#8a7332', hood:'#4a3d18'},
  fisher: {body:'#3f6a78', hood:'#234048'},
  hunter: {body:'#6e4a2e', hood:'#3a2716'},
};
const ROLE_TOOL_ICON = { lumberjack:'🪓', miner:'⛏️', farmer:'🌾', fisher:'🎣', hunter:'🏹' };
const STATE_ICON = {
  idle:'…', walkingToResource:'…', working_wood:'🪓', working_stone:'⛏️',
  walkingToDropoff:null, walkingToFarm:'…', farming:'🌾',
  seekingFood:'🍖', eating:'🍖', seekingSleep:'😴', sleeping:'💤'
};
function bubbleFor(v){
  if(v.state==='spawning') return null; // the arrival glow speaks for itself
  if(v.sick) return {ic:'🤧', tone:'warn'};
  if(v.state==='eating') return {ic:'🍖', tone:'good'};
  if(v.state==='sleeping') return {ic:'💤', tone:'cool'};
  if(v.state==='seekingFood') return {ic:'🍖', tone:'warn'};
  if(v.state==='seekingSleep') return {ic:'😴', tone:'cool'};
  if(v._mentored>0 && (v.state==='working'||v.state==='farming') && Math.sin(G.worldTime*1.5+v.gx*2)>0) return {ic:'📖', tone:'good'};
  if(v.state==='working') return {ic: ({wood:'🪓', stone:'⛏️', fish:'🎣', meat:'🏹'})[v.resKind] || '🪓', tone:'normal'};
  if(v.state==='farming') return {ic:'🌾', tone:'normal'};
  if(v.state==='walkingToDropoff' && v.carrying) {
    const ic = {wood:'🪵', stone:'🪨', food:(v.resKind==='fish'?'🐟':(v.resKind==='meat'?'🍖':'🌾'))}[v.carrying.type] || '🎒';
    return {ic, tone:'normal'};
  }
  if(v.state==='walkingToResource'||v.state==='walkingToFarm') return {ic:'🚶', tone:'faint'};
  if(v.hunger>70) return {ic:'🍖', tone:'warn'};
  if(v.fatigue>70) return {ic:'😴', tone:'warn'};
  if(v.role==='idle' || v.stage==='child') return {ic: v.ambientEmote || '💤', tone:'faint'};
  return null;
}

// Per-settler variety on the shared sprite frames: a small palette of clothing
// tints keyed to each villager's id, so a crowd no longer looks like one person
// copied a dozen times. Tint = multiply a hue over the frame, then re-apply the
// frame's own alpha mask so transparency and shading survive. Cached per
// (frame,tint) — never allocated per draw.

function villagerTint(v){
  if(v._tint !== undefined) return v._tint;
  return (v._tint = VILLAGER_TINTS[hashStr((v.id||'')+'t') % VILLAGER_TINTS.length]);
}
function villagerBuild(v){
  if(v._build !== undefined) return v._build;
  return (v._build = v.stage==='child' ? 1 : 0.9 + (hashStr((v.id||'')+'b') % 21)/100); // 0.90–1.10
}
function drawVillager(v){
  const p = project(v.gx, v.gy);
  const moving = ['walkingToResource','walkingToDropoff','walkingToFarm','seekingFood','seekingSleep'].includes(v.state) ||
                 (v.state==='idle' && (Math.abs(v.gx-v.idleGX)>0.05 || Math.abs(v.gy-v.idleGY)>0.05));
  const bob = moving ? Math.abs(Math.sin(v.bobPhase))*1.8 : 0;
  if(v.state!=='sleeping') v.bobPhase += moving ? 0.22 : 0.05;
  const cx = p.x, cy = p.y - bob;
  const csc = (v.stage==='child' ? 0.68 : 1) * villagerBuild(v);  // children smaller; adults vary in build
  drawShadow(cx, p.y+6, 9.5*csc);

  // Track facing from horizontal motion (persists while standing still)
  if(v._lastGX===undefined) v._lastGX = v.gx;
  const dxm = v.gx - v._lastGX;
  if(Math.abs(dxm) > 0.002) v._faceLeft = dxm < 0;
  v._lastGX = v.gx;

  // Animated sprite path (Tiny Swords Pawn) — falls through to canvas art if not loaded
  if(v.state!=='spawning'){
    const anim = villagerAnimFor(v);
    if(anim && anim.length && anim[0].complete && anim[0].naturalWidth>0){
      const fi = Math.floor(G.worldTime*5 + (hashStr(v.id)%7)) % anim.length;
      const frame = anim[fi];
      const img = tintedFrame(frame, villagerTint(v));
      // Frames are trim-cropped at bake time: character fills the image.
      // Draw at a fixed CHARACTER height with feet planted on the tile.
      // Aspect from the original frame (tinted result is a canvas, no naturalWidth).
      const hgt = 30*csc, w = hgt * (frame.naturalWidth/frame.naturalHeight);
      ctx.save();
      if(v._faceLeft){ ctx.translate(cx,0); ctx.scale(-1,1); ctx.translate(-cx,0); }
      try { ctx.drawImage(img, cx - w/2, cy - hgt + 7, w, hgt); } catch(e){}
      ctx.restore();
      if(v.role==='fisher' && v.state==='working'){
        const spImg = decorImg('splash', G.worldTime*7 + hashStr(v.id)%5);
        if(spImg){
          const sw = 22, sh = sw*(spImg.naturalHeight/spImg.naturalWidth);
          try { ctx.drawImage(spImg, cx + 8, cy - sh + 12, sw, sh); } catch(e){}
        }
      }
      if(v.sick){ ctx.fillStyle='rgba(120,160,60,0.18)'; ctx.beginPath(); ctx.ellipse(cx, cy-14, 10, 14, 0, 0, Math.PI*2); ctx.fill(); }
      drawStatusBubble(v, cx, cy - 34*csc);
      return;
    }
  }

  // Arrival materialize effect — a brief warm glow that rises and fades as a
  // new settler steps out of the Town Center door.
  if(v.state==='spawning'){
    const t = clamp(1 - (v.spawnTimer/1.1), 0, 1); // 0 -> 1 over the spawn duration
    const riseY = cy - t*14;
    const glowR = 14 + Math.sin(t*Math.PI)*10;
    const alpha = Math.sin(t*Math.PI); // fades in then out
    const grd = ctx.createRadialGradient(cx, riseY, 0, cx, riseY, glowR);
    grd.addColorStop(0, `rgba(255,215,140,${0.55*alpha})`);
    grd.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, riseY, glowR, 0, Math.PI*2); ctx.fill();
    // rising sparkle motes
    for(let i=0;i<3;i++){
      const sp = (t + i*0.33) % 1;
      const sx = cx + Math.sin(sp*8+i*2)*6;
      const sy = cy - sp*22;
      ctx.fillStyle = `rgba(255,225,170,${(1-sp)*0.8})`;
      ctx.beginPath(); ctx.arc(sx, sy, 1.4, 0, Math.PI*2); ctx.fill();
    }
  }

  // Try AI villager sprite
  const spriteKey = 'villager_'+(v.role==='idle'?'idle':v.role);
  const img = SPRITES[spriteKey];
  const spawnAlpha = v.state==='spawning' ? clamp(1-(v.spawnTimer/1.1), 0.15, 1) : 1;
  ctx.save();
  ctx.globalAlpha = spawnAlpha;
  if(img && img.complete && img.naturalWidth>0){
    try {
      const w = (SPRITE_SCALE[spriteKey]||40)*csc;
      const h = w*(img.naturalHeight/img.naturalWidth);
      // Mirror if facing left
      ctx.save();
      if(v.facing===-1){ ctx.translate(cx*2,0); ctx.scale(-1,1); }
      ctx.drawImage(img, cx-w/2, cy-h+6, w, h);
      ctx.restore();
    } catch(e){ delete SPRITES[spriteKey]; }
  } else {
    // Canvas fallback character
    const seed = v.__seed || (v.__seed = hashStr(v.id));
    const tintShift = ((seed%100)/100-0.5)*0.18;
    const col = ROLE_COLORS[v.role]||ROLE_COLORS.idle;
    const skin = ['#d8b893','#c9a47a','#b8855e'][seed%3];
    ctx.save(); ctx.translate(cx,cy); ctx.scale(csc,csc);
    const legSwing = moving ? Math.sin(v.bobPhase*2)*3.2 : 0;
    ctx.strokeStyle='#241a10'; ctx.lineWidth=2.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-2.5,4); ctx.lineTo(-2.5+legSwing,10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2.5,4); ctx.lineTo(2.5-legSwing,10); ctx.stroke();
    ctx.fillStyle=shadeColor(col.body,tintShift);
    ctx.beginPath(); ctx.moveTo(-6,6); ctx.quadraticCurveTo(-7,-10,0,-13); ctx.quadraticCurveTo(7,-10,6,6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=1; ctx.stroke();
    const armSwing=moving?Math.sin(v.bobPhase*2+Math.PI)*2.4:0;
    ctx.strokeStyle=shadeColor(col.body,-0.15); ctx.lineWidth=2.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-5,-5); ctx.lineTo(-7+armSwing*0.4,2+Math.abs(armSwing)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5,-5); ctx.lineTo(7-armSwing*0.4,2+Math.abs(armSwing)); ctx.stroke();
    ctx.fillStyle=skin; ctx.beginPath(); ctx.arc(0,-16,4.4,0,7); ctx.fill();
    ctx.fillStyle=shadeColor(col.hood,tintShift); ctx.beginPath(); ctx.arc(0,-18,5,Math.PI,0); ctx.fill();
    const tool=ROLE_TOOL_ICON[v.role];
    if(tool&&(v.state==='working'||v.state==='walkingToResource'||v.state==='farming')){
      ctx.font='10px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(tool,8,-8+(v.state==='working'?Math.sin(v.bobPhase*4)*3:0));
    }
    ctx.restore();
  }
  ctx.restore(); // pop globalAlpha

  // Selection ring
  if(selection.type==='villager' && selection.ref===v){
    ctx.strokeStyle='rgba(231,162,61,0.9)'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.ellipse(cx,p.y+6,11,5,0,0,7); ctx.stroke();
  }
  drawStatusBubble(v, cx, cy-30*csc);
}
// Shared floating status bubble (used by both sprite and canvas villager paths)
function drawStatusBubble(v, bx, by){
  const bub=bubbleFor(v);
  if(!bub) return;
  let bg='rgba(40,30,18,0.88)', bd='rgba(0,0,0,0.5)';
  if(bub.tone==='warn'){ bg='rgba(70,28,20,0.9)'; bd='#a4402c'; }
  else if(bub.tone==='cool'){ bg='rgba(22,32,46,0.9)'; bd='#3a5a78'; }
  else if(bub.tone==='good'){ bg='rgba(28,42,24,0.9)'; bd='#4a7a3a'; }
  ctx.fillStyle=bg; ctx.strokeStyle=bd; ctx.lineWidth=1.2;
  roundRect(bx-11,by-11,22,18,5); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx-3,by+7); ctx.lineTo(bx,by+12); ctx.lineTo(bx+3,by+7); ctx.closePath();
  ctx.fillStyle=bg; ctx.fill();
  ctx.font='12px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(bub.ic,bx,by-1);
}

function drawWorkerBadge(b){
  if(b.condition!==undefined && b.condition<35 && b.type!=='road'){
    const c0 = buildingCenter(b); const p0 = project(c0.gx, c0.gy);
    ctx.font='13px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const bob0 = Math.sin(G.worldTime*3)*2;
    ctx.fillText('⚠️', p0.x, p0.y - 48 + bob0);
  }
  if(!b.workers || b.workers<=0 || b.type==='townCenter' || b.type==='house' || b.type==='granary' || b.type==='road') return;
  const c = buildingCenter(b);
  const p = project(c.gx, c.gy);
  const bx = p.x + 20, by = p.y - 30;
  ctx.fillStyle='rgba(30,22,14,0.88)';
  ctx.strokeStyle='rgba(231,162,61,0.75)'; ctx.lineWidth=1;
  roundRect(bx-11, by-8, 22, 14, 4); ctx.fill(); ctx.stroke();
  ctx.font='10px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('👷'.slice(0,2), bx, by);
  ctx.fillStyle='#e7d7ad'; ctx.font='bold 9px sans-serif';
  ctx.fillText(b.workers, bx+7, by);
}

function drawRoad(gx,gy){
  // The terrain layer already stamps the Kenney stone path under road tiles.
  if(DECOR.roadTile && DECOR.roadTile[0] && DECOR.roadTile[0].complete && DECOR.roadTile[0].naturalWidth>0) return;
  const p = project(gx,gy);
  ctx.fillStyle='#3a3226';
  tileDiamond(p.x, p.y, TILE_W*0.82, TILE_H*0.82); ctx.fill();
  // cobble texture lines
  ctx.strokeStyle='#2c261c'; ctx.lineWidth=0.8;
  ctx.beginPath();
  ctx.moveTo(p.x-20,p.y); ctx.lineTo(p.x+20,p.y);
  ctx.moveTo(p.x,p.y-10); ctx.lineTo(p.x,p.y+10);
  ctx.stroke();
  // centre dashed lane
  ctx.strokeStyle='rgba(90,78,55,0.45)'; ctx.lineWidth=1.5;
  ctx.setLineDash([4,5]);
  ctx.beginPath(); ctx.moveTo(p.x-17,p.y); ctx.lineTo(p.x+17,p.y); ctx.stroke();
  ctx.setLineDash([]); // always reset
  // edge border
  ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=1;
  tileDiamond(p.x,p.y,TILE_W*0.82,TILE_H*0.82); ctx.stroke();
}

/* =========================================================================
   MINIMAP
========================================================================= */
const minimapCanvas = document.getElementById('minimap');
const mmCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
// minimap tile size is computed dynamically in drawMinimap() based on G.MAP_SIZE

// Projection the minimap last drew with, so pointer input can invert it.
let mmLayout = { S:128, scale:1, offY:0 };
function drawMinimap(){
  if(!mmCtx || !G.grid.length) return;
  const S = 128;                       // backing resolution; CSS scales it to fit
  minimapCanvas.width = S; minimapCanvas.height = S;
  minimapCanvas.style.width = '100%'; minimapCanvas.style.height = '100%';

  // Draw in the SAME isometric projection as the world. The old minimap laid the
  // G.grid out as a square while the game shows a diamond, so nothing on it lined
  // up with what you were looking at — which is what made it feel pointless.
  // Matching the projection means north here is north there, and the visible
  // region becomes a plain rectangle instead of a skewed quad.
  const scale = S / (G.MAP_SIZE * TILE_W);
  const offY  = (S - G.MAP_SIZE * TILE_H * scale) / 2;
  const mmX = (wx)=> wx*scale + S/2;
  const mmY = (wy)=> wy*scale + offY;
  const tw = TILE_W*scale, th = TILE_H*scale;
  mmLayout = { S, scale, offY };       // shared with the pan handler

  mmCtx.clearRect(0,0,S,S);
  mmCtx.fillStyle = '#0a0d12';         // the deep beyond the island
  mmCtx.fillRect(0,0,S,S);

  // Terrain, batched one path per colour — ~6 fills instead of 1300.
  const byColour = new Map();
  for(let y=0;y<G.MAP_SIZE;y++) for(let x=0;x<G.MAP_SIZE;x++){
    const t = G.grid[y] && G.grid[y][x];
    if(!t) continue;
    const col = t.wilds ? '#3a4e22' : (MM_COLORS[t.type]||'#2a3a22');
    let path = byColour.get(col);
    if(!path){ path = new Path2D(); byColour.set(col, path); }
    const p = project(x,y), cx = mmX(p.x), cy = mmY(p.y);
    path.moveTo(cx, cy-th/2); path.lineTo(cx+tw/2, cy);
    path.lineTo(cx, cy+th/2); path.lineTo(cx-tw/2, cy); path.closePath();
  }
  for(const [col,path] of byColour){ mmCtx.fillStyle = col; mmCtx.fill(path); }

  // Roads, then structures on top.
  mmCtx.fillStyle = '#5a4e36';
  for(const b of G.buildings){
    if(b.type!=='road') continue;
    const p = project(b.gx,b.gy);
    mmCtx.fillRect(mmX(p.x)-tw/4, mmY(p.y)-th/4, Math.max(1.5,tw/2), Math.max(1.5,th/2));
  }
  for(const b of G.buildings){
    if(b.type==='road') continue;
    const p = project(b.gx,b.gy);
    const lit = b._fire>0;
    mmCtx.fillStyle = lit ? '#ff7a2a' : (b.type==='townCenter' ? '#e7a23d' : '#c8a870');
    const r = b.type==='townCenter' ? 3.4 : 2.2;
    mmCtx.beginPath(); mmCtx.arc(mmX(p.x), mmY(p.y), lit ? r+1 : r, 0, 7); mmCtx.fill();
  }

  // Your folk, and anything threatening them.
  for(const v of G.villagers){
    const p = project(v.gx,v.gy);
    mmCtx.fillStyle = v.sick ? '#d04030' : '#8ade68';
    mmCtx.beginPath(); mmCtx.arc(mmX(p.x), mmY(p.y), 1.5, 0, 7); mmCtx.fill();
  }
  for(const r of G.raiders){
    const p = project(r.gx,r.gy);
    mmCtx.fillStyle = '#ff4433';
    mmCtx.beginPath(); mmCtx.arc(mmX(p.x), mmY(p.y), 2.4, 0, 7); mmCtx.fill();
    mmCtx.strokeStyle = 'rgba(255,68,51,0.5)'; mmCtx.lineWidth = 1;
    mmCtx.beginPath(); mmCtx.arc(mmX(p.x), mmY(p.y), 4.5 + Math.sin(G.worldTime*6)*1.5, 0, 7); mmCtx.stroke();
  }

  if(isNight()){ mmCtx.fillStyle='rgba(10,16,40,0.35)'; mmCtx.fillRect(0,0,S,S); }

  // What you can currently see. Sharing the world's projection makes this an
  // axis-aligned rectangle; it is only drawn when zoomed in far enough to mark a
  // genuine subsection, since zoomed out it would just outline everything.
  const tl = screenToWorldPixel(0,0), br = screenToWorldPixel(cssW,cssH);
  const vx = mmX(tl.x), vy = mmY(tl.y), vw = (br.x-tl.x)*scale, vh = (br.y-tl.y)*scale;
  if(vw*vh < S*S*0.62){
    mmCtx.save();
    mmCtx.beginPath(); mmCtx.rect(0,0,S,S); mmCtx.clip();
    mmCtx.fillStyle='rgba(231,162,61,0.10)'; mmCtx.fillRect(vx,vy,vw,vh);
    mmCtx.strokeStyle='rgba(231,162,61,0.9)'; mmCtx.lineWidth=1.5; mmCtx.strokeRect(vx,vy,vw,vh);
    mmCtx.restore();
  }
}
// Tap the minimap to look there — or hold and drag to sweep the camera across
// the hold, which is far quicker than repeatedly dragging the world itself.
// Inverts whatever projection drawMinimap last used.
if(minimapCanvas){
  const lookAt = (clientX, clientY)=>{
    const rect = minimapCanvas.getBoundingClientRect();
    const { S, scale, offY } = mmLayout;
    const mx = (clientX-rect.left)/rect.width  * S;
    const my = (clientY-rect.top )/rect.height * S;
    panCameraTo((mx - S/2)/scale, (my - offY)/scale);
  };
  let dragging = false;
  minimapCanvas.addEventListener('pointerdown', (e)=>{
    dragging = true;
    try{ minimapCanvas.setPointerCapture(e.pointerId); }catch(err){}
    lookAt(e.clientX, e.clientY);
    e.preventDefault(); e.stopPropagation();
  });
  minimapCanvas.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    lookAt(e.clientX, e.clientY);
    e.preventDefault(); e.stopPropagation();
  });
  const end = (e)=>{ dragging = false; try{ minimapCanvas.releasePointerCapture(e.pointerId); }catch(err){} };
  minimapCanvas.addEventListener('pointerup', end);
  minimapCanvas.addEventListener('pointercancel', end);
}

function drawGhost(){
  if(!buildMode.active) return;
  const wp = screenToWorldPixel(cssW/2, cssH/2);
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
const BUILD_NEEDS_ADJ = {
  fishingHut:   { test:(t)=>t.type==='water',  need:'beside water' },
  forestCamp:   { test:(t)=>t.type==='forest', need:'at the treeline' },
  miningPost:   { test:(t)=>t.type==='stone',  need:'by a stone outcrop' },
  huntingCabin: { test:(t)=>!!t.wilds,          need:'along the wilds' },
};
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
  const key = cssW+'x'+cssH+':'+band;
  if(_voidGrad && _voidKey===key) return _voidGrad;
  const t = band/4;
  // Day: slate-teal deep water. Night: near-black with a cold blue cast.
  const mix = (a,b)=> a.map((v,i)=> Math.round(v + (b[i]-v)*t));
  const inner = mix([34,54,64],[12,18,30]);
  const outer = mix([13,21,28],[5,8,14]);
  const g = ctx.createRadialGradient(cssW/2, cssH*0.46, Math.min(cssW,cssH)*0.12,
                                     cssW/2, cssH*0.46, Math.max(cssW,cssH)*0.78);
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
  ctx.clearRect(0, 0, cssW, cssH);
  // The world beyond the hold. Flat black made the map read as an island cut out
  // of nothing; a deep, cold expanse gives it somewhere to sit. Cached and only
  // rebuilt on resize — allocating a gradient every frame is expensive.
  ctx.fillStyle = voidBackdrop();
  ctx.fillRect(0, 0, cssW, cssH);
  setKitTime(G.worldTime);   // one clock push per frame, not one per sprite

  if(!G.grid.length) return; // map not yet generated

  ctx.save();
  ctx.translate(cssW/2+camera.panX, cssH/2+camera.panY);
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
/* Soft clouds drifting over the hold — pure atmosphere, parallax with pan */
let cloudState = null;
function renderClouds(){
  if(weather.type==='storm') return; // storm layer owns the sky
  if(!decorImg('clouds',0)) return;
  if(!cloudState){
    cloudState = [];
    for(let i=0;i<7;i++){
      cloudState.push({ wx:(Math.random()*2-1)*G.MAP_SIZE*TILE_W/2, wy:Math.random()*G.MAP_SIZE*TILE_H,
                        v:5+Math.random()*6, sc:1.1+Math.random()*1.6, ci:i%3 });
    }
  }
  ctx.save();
  ctx.setTransform(canvasDPR,0,0,canvasDPR,0,0);
  const halfW = G.MAP_SIZE*TILE_W/2;
  for(const c of cloudState){
    c.wx += c.v * (1/60);
    if(c.wx > halfW + 200){ c.wx = -halfW - 200; c.wy = Math.random()*G.MAP_SIZE*TILE_H; }
    const img = decorImg('clouds', c.ci);
    if(!img) continue;
    // world → screen with a slight parallax lift (clouds pan a bit slower)
    const sx = cssW/2 + camera.panX*0.85 + c.wx*camera.scale;
    const sy = cssH/2 + camera.panY*0.85 + c.wy*camera.scale*0.8 - 60;
    const w = 240*c.sc*camera.scale*0.8, hh = w*(img.naturalHeight/img.naturalWidth);
    if(sx < -w || sx > cssW+w) continue;
    ctx.globalAlpha = 0.30;
    try { ctx.drawImage(img, sx-w/2, sy-hh/2, w, hh); } catch(e){}
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
let _vignetteCache=null;
function renderVignette(){
  if(!_vignetteCache || _vignetteCache.w!==canvas.width || _vignetteCache.h!==canvas.height){
    const c=document.createElement('canvas'); c.width=canvas.width; c.height=canvas.height;
    const vc=c.getContext('2d');
    const g=vc.createRadialGradient(c.width/2,c.height/2,Math.min(c.width,c.height)*0.42, c.width/2,c.height/2,Math.max(c.width,c.height)*0.72);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(1,'rgba(8,10,6,0.34)');
    vc.fillStyle=g; vc.fillRect(0,0,c.width,c.height);
    // faint warm grade at centre
    const g2=vc.createRadialGradient(c.width/2,c.height*0.42,0, c.width/2,c.height*0.42,Math.max(c.width,c.height)*0.5);
    g2.addColorStop(0,'rgba(255,220,160,0.045)'); g2.addColorStop(1,'rgba(0,0,0,0)');
    vc.fillStyle=g2; vc.fillRect(0,0,c.width,c.height);
    _vignetteCache={cnv:c,w:canvas.width,h:canvas.height};
  }
  ctx.save(); ctx.setTransform(1,0,0,1,0,0);
  ctx.drawImage(_vignetteCache.cnv,0,0);
  ctx.restore();
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
    'Weather '+weather.label+(G.climate?'  Climate '+(G.climate.name||G.climate.ic):''),
    'Settlers '+G.villagers.length+' ('+idle+' idle)  Buildings '+G.buildings.filter(b=>b.type!=='road').length,
    'Raiders '+G.raiders.length+'  Fires '+G.buildings.filter(b=>b._fire>0).length,
    'Coins '+Math.floor(G.coins)+'  Tier '+HOLD_TIERS[currentTierIdx].name,
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
/* ── WEATHER PARTICLES ── screen-space rain streaks / snowflakes / lightning */
let _lightningT = 0;
function renderWeather(){
  if(weather.type==='clear') return;
  ctx.save();
  ctx.setTransform(canvasDPR,0,0,canvasDPR,0,0);
  const t = G.worldTime;
  if(weather.type==='rain' || weather.type==='storm'){
    const n = weather.type==='storm' ? 90 : 55;
    ctx.strokeStyle='rgba(170,200,220,0.30)'; ctx.lineWidth=1;
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const x = ((i*97.3 + t*260 + i*i*13)% (cssW+40)) - 20;
      const y = ((i*61.7 + t*540)% (cssH+30)) - 15;
      ctx.moveTo(x, y); ctx.lineTo(x-3, y+11);
    }
    ctx.stroke();
    if(weather.type==='storm'){
      _lightningT -= 1/60;
      if(_lightningT<=0 && Math.random()<0.004){ _lightningT = 0.14; }
      if(_lightningT>0){
        ctx.fillStyle='rgba(220,230,255,'+(_lightningT*1.6)+')';
        ctx.fillRect(0,0,cssW,cssH);
      }
    }
  } else if(weather.type==='snow'){
    ctx.fillStyle='rgba(230,240,248,0.55)';
    for(let i=0;i<60;i++){
      const x = ((i*83.1 + Math.sin(t*0.8+i)*30 + t*18)% (cssW+20)) - 10;
      const y = ((i*47.9 + t*46)% (cssH+20)) - 10;
      ctx.beginPath(); ctx.arc(x, y, 1.1+(i%3)*0.5, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

/* ── DYNAMIC LIGHTING ── darkness overlay with warm light pools punched out
   at every lit structure via destination-out radial gradients. */
let lightCanvas=null, lctx=null;
const LIGHT_RADII = { manor:130, townCenter:200, tavern:22, watchtower:28, house:95, bakery:22, tradingPost:20, miningPost:100, sawmill:20, windmill:26, fishingHut:24, huntingCabin:24, forestCamp:90, lampPost:105 };
function renderLighting(){
  const dark = darknessFactor();
  if(dark <= 0.02) return;
  if(!lightCanvas || lightCanvas.width!==canvas.width || lightCanvas.height!==canvas.height){
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = canvas.width; lightCanvas.height = canvas.height;
    lctx = lightCanvas.getContext('2d');
  }
  const dpr = canvasDPR;
  lctx.setTransform(1,0,0,1,0,0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0,0,lightCanvas.width,lightCanvas.height);
  lctx.fillStyle = 'rgba(8,10,26,'+dark+')';
  lctx.fillRect(0,0,lightCanvas.width,lightCanvas.height);
  // Punch warm pools of light around lit buildings
  lctx.globalCompositeOperation = 'destination-out';
  const flick = 1 + Math.sin(G.worldTime*7)*0.04;
  for(const b of G.buildings){
    const r0 = LIGHT_RADII[b.type];
    if(!r0) continue;
    const c = buildingCenter(b);
    const p = project(c.gx, c.gy);
    const sx = (cssW/2 + camera.panX + p.x*camera.scale) * dpr;
    const sy = (cssH/2 + camera.panY + p.y*camera.scale) * dpr;
    const r = r0 * camera.scale * dpr * flick;
    if(sx < -r || sy < -r || sx > lightCanvas.width+r || sy > lightCanvas.height+r) continue;
    const g = lctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath(); lctx.arc(sx, sy, r, 0, Math.PI*2); lctx.fill();
  }
  // Composite onto the main canvas in raw pixel space
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.drawImage(lightCanvas, 0, 0);
  ctx.restore();
}

/* =========================================================================
   DAY/NIGHT TINT
========================================================================= */
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
  clockDayEl.childNodes[0].nodeValue = (G.holdName && G.holdName!=='Oakenfall' ? G.holdName+' · ' : '')+(gameModeId!=='settler' ? GAME_MODES[gameModeId].name+' · ' : '')+HOLD_TIERS[currentTierIdx].ic+' '+HOLD_TIERS[currentTierIdx].name+' · Day '+G.dayCount+' · '+seasonName()+' '+weather.ic+(G.climate?' '+G.climate.ic:'')+' · ';
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
      <div class="pill" style="pointer-events:none;">${HOLD_TIERS[currentTierIdx].ic} ${HOLD_TIERS[currentTierIdx].name}</div>
      ${currentTierIdx < HOLD_TIERS.length-1 ? `<div class="sheet-sub" style="align-self:center;">Next: ${HOLD_TIERS[currentTierIdx+1].name} at ${HOLD_TIERS[currentTierIdx+1].pop} settlers &amp; ${HOLD_TIERS[currentTierIdx+1].bld} buildings</div>` : `<div class="sheet-sub" style="align-self:center;">Highest tier reached!</div>`}
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
  if(clr) clr.addEventListener('click', ()=>{ stewardOrders=[]; renderStewardSheet(); });
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
    const crest = bannerPalette[G.bannerIdx] || BANNER_COLORS[G.crestChoice] || '#a4402c';
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
    const tier=(HOLD_TIERS[currentTierIdx]||{ic:'🏕️',name:'Hold'});
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
  const tier = (typeof HOLD_TIERS!=='undefined' && HOLD_TIERS[currentTierIdx]) || {ic:'🏕️', name:'Hold'};
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
  const sheetH = sheetEl ? Math.min(sheetEl.offsetHeight, cssH*0.5) : cssH*0.5;
  const bottom = sideDock ? cssH - 50 : cssH - sheetH - 30;
  const right = sideDock ? cssW - Math.min(cssW*0.46, 380) - 40 : cssW - 40;
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
function roleLabel(r){ return (ROLE_DEFS[r]&&ROLE_DEFS[r].label) || r; }
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
    camera.panX = mid.x - cssW/2 - anchor.x*newScale;
    camera.panY = mid.y - cssH/2 - anchor.y*newScale;
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
        camera.panX = tx - cssW/2 - wu.x*target;
        camera.panY = ty - cssH/2 - wu.y*target;
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
  camera.panX = e.clientX - cssW/2 - worldUnderMouse.x*newScale;
  camera.panY = e.clientY - cssH/2 - worldUnderMouse.y*newScale;
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
// Unlocks (cosmetic entitlements) live in their OWN storage key as well as the
// save, so redeemed packs survive a save wipe or a fresh hold.
async function saveUnlocks(){
  try{ await window.storage.set('oakenfall-unlocks', JSON.stringify(G.unlocks||{}), false); }catch(e){}
}
async function loadUnlocks(){
  try{
    const res = await window.storage.get('oakenfall-unlocks', false);
    if(res && res.value){
      const u = JSON.parse(res.value);
      G.unlocks = Object.assign({}, u, G.unlocks); // in-memory (e.g. just-redeemed) wins
      applyPatronBanners();
    }
  }catch(e){}
}
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
  _relMoments.clear();
  G.villagers.forEach(v=>(v.relations||[]).forEach(r=>{
    const key=[v.name,r.name].sort().join('|');
    if(r.type==='friend'&&r.s>40)_relMoments.add('fr'+key);
    if(r.type==='rival'&&r.s<-25)_relMoments.add('rv'+key);
  }));
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
  camera.panY -= cssH*0.14; clampCamera();
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
  G.worldTime=30; G.dayCount=1; wolfTimer=60; G.wolfEvents=0;
  spawnTimer=18; G.idleSlotCounter=0; G.usedNames=[];
  G.questsCompleted={}; lastSeenQuestCount=0;
  G.totals={wood:0,stone:0,food:0};
  window.__capWarned={wood:false,stone:false,food:false,planks:false,flour:false,bread:false};
  G.researched={}; G.activeResearch=null; currentTierIdx=0; weather={type:'clear',label:'Clear',ic:'☀️'};
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
