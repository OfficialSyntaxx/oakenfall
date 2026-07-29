/* Every image the game draws, and the tables that say how big to draw it.
 *
 * Loading is deliberately forgiving. A sprite that fails is retried, then given
 * up on — and giving up is safe, because every consumer checks whether an image
 * decoded and falls back to drawing the thing by hand. That is the rule the
 * whole art pipeline rests on: sprites are an upgrade layer, never a
 * dependency, so the game is playable the instant it boots and simply gets
 * prettier as images arrive.
 *
 * blitSprite is the one drawing function here, because it is the shared "try
 * the sprite, tell me if it worked" that every renderer starts with.
 */
import { SPRITE_URLS, VANIM_B64, DECOR_B64 } from './assets';

type Deps = { ctx: any };
let dep: Deps = { ctx: null };
export function initSprites(deps: Deps): void { dep = deps; }

export const SPRITES: Record<string, any> = {};
let spritesLoaded = 0, spritesTotal = 0;
export function preloadSprites(){
  const entries = Object.entries(SPRITE_URLS);
  spritesTotal = entries.length;
  for(const [key, url] of entries){
    loadSprite(key, url, 0);
  }
}
export function loadSprite(key, url, attempt){
  const img = new Image();
  // IMPORTANT: do NOT set img.crossOrigin here. This game only ever calls
  // dep.ctx.drawImage() to display sprites — it never reads pixel data back via
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

export const VANIM: Record<string, any> = {};
let vanimReady = false;
export function loadVillagerAnims(){
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
export function villagerAnimFor(v){
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

export const SPRITE_SCALE: Record<string, number> = {
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
export const SPRITE_ANCHOR_Y: Record<string, number> = { house: 24, tavern: 24, sawmill: 24, windmill: 26, bakery: 24, granary: 24, tradingPost: 24, watchtower: 28,
  forestCamp: 22, miningPost: 22, palisade: 20, well: 20, lampPost: 10, pasture: 26, forester: 26, bridge: 22 };
export function blitSprite(type, cx, baseY){
  const img = SPRITES[type];
  if(!img || !img.complete || img.naturalWidth===0) return false;
  try {
    const w = SPRITE_SCALE[type]||80;
    const h = w * (img.naturalHeight/img.naturalWidth);
    const anchor = SPRITE_ANCHOR_Y[type] !== undefined ? SPRITE_ANCHOR_Y[type] : 12;
    dep.ctx.drawImage(img, cx - w/2, baseY - h + anchor, w, h);
    return true;
  } catch(e){
    delete SPRITES[type]; // prevent repeated taint errors
    return false;
  }
}

// GAME_MODES now arrives as a module import, so it is initialised before any of
// this file runs — the old ordering hazard (it used to be declared far below,
// making a boot-time call throw) no longer exists.
// Historic note: references GAME_MODES/gameMode declared later in the script. Safe because
// this is only ever called from user-gesture handlers (New Game / Continue), which
// run after full script evaluation. Do NOT call this at top level during boot.

export const DECOR: Record<string, any> = {};
let decorReady = false;
/** Have the decor sheets decoded? Scenery and cloud passes skip until they have. */
export function isDecorReady(): boolean { return decorReady; }
/** The road tile stamp, if it decoded. Roads replace the ground beneath them
 *  rather than being drawn over it, so both the terrain and the villager pass
 *  ask for it. */
export function roadTileStamp(): any {
  return (DECOR.roadTile && DECOR.roadTile[0]) || null;
}
export function loadDecor(){
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
export function decorImg(key, idx){
  const pool = DECOR[key];
  if(!pool || !pool.length) return null;
  const img = pool[Math.floor(idx) % pool.length];
  return (img.complete && img.naturalWidth>0) ? img : null;
}
/* Resource-fly-to-HUD: a little icon arcs from the drop-off point to its HUD pill */
