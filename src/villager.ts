/* The settler state machine.
 *
 * One function decides what every settler in the hold is doing this frame:
 * needs first (hunger, sleep, illness), then work, then whatever they do with
 * themselves in between. Everything else about villagers — their friendships,
 * their skills, what trade the hold needs — moved out to its own module first,
 * so what is left here is the loop that calls them in the right order.
 *
 * The order inside updateVillager is the whole design, and is easy to break by
 * rearranging: survival outranks work, work outranks idling, and a settler
 * carrying a load finishes the delivery before anything else. A hauler who
 * drops what they are carrying to go and eat loses the load.
 */
import { G } from './state';
import { ADMIN } from './admin';
import { clamp, dist2, hashStr } from './math';
import { BUILD_DEFS, ROLE_DEFS, HUNGER_RATE, FATIGUE_RATE, LEGACY_TRAITS } from './defs';
import { seasonIndex, seasonYieldMul, seasonFatigueMul, riverFrozen, isNight } from './time';
import { getWeather, weatherMoveMul, weatherFarmMul, weatherFatigueMul,
  climateHungerMul, climateFatigueMul, CLIMATE_DEFS } from './weather';
import { skillMul, gainSkill, guildMulRes, guildFarmMul } from './skills';
import { ambientIdle, releaseClaims } from './lives';
import { seekWork, maybeSwitchTrade } from './work';
import { tileWalkable, nearestWalkable, pathFind } from './pathfind';
import { tileAt } from './mapgen';
import { findTC, buildingCenter, hasActiveBuilding, hasBuildingType,
  nearestBuildingOfTypes, popCapacity } from './buildings';
import { sfx } from './audio';
import { gainResource, harvestBoonMul } from './economy';

type Deps = {
  toast: (msg: string, urgent?: boolean) => void;
  /** The flying resource icon from the world to the HUD. */
  spawnFly: (gx: number, gy: number, type: string) => void;
  /** Multipliers owned by systems that have not moved out of main.ts yet. */
  decreeHungerMul: () => number;
  decreeWorkMul: () => number;
  eventSpeedBonus: () => number;
  /** Is a feast day underway — settlers are cheerier while it lasts. */
  festivalOn: () => boolean;
};
let dep: Deps = {
  toast: () => {}, spawnFly: () => {},
  decreeHungerMul: () => 1, decreeWorkMul: () => 1, eventSpeedBonus: () => 1, festivalOn: () => false,
};
export function initVillagers(deps: Deps): void { dep = deps; }

export function moveToward(v, tgx, tgy, dt, speedMul){
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

export function effMultiplier(v){
  let m = 1;
  if(v.hunger>70) m -= 0.35;
  if(v.fatigue>70) m -= 0.35;
  if(v.sick) m -= 0.40;      // additive, not compound — avoids death-spiral
  if(v.trait && v.trait.id==='diligent') m += 0.2;
  if(v.morale!==undefined){ if(v.morale>70) m += 0.10; else if(v.morale<30) m -= 0.20; }
  if(v.stage==='elder') m *= 0.6;   // elders slow, but still contribute
  if(G.festivalBoon==='craft') m += 0.15; // Craftsmen's Fair boon
  m *= skillMul(v);                 // proficiency from time spent in the role
  m *= dep.decreeWorkMul();             // Rationing slows work a touch
  m *= dep.eventSpeedBonus(); // festival boost
  return Math.max(0.12, m);  // floor at 12% so villager never becomes truly catatonic
}

export function findResourceTarget(v, list){
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

/* Said once per session, not once per fisher per frame. It hung off `window`
   before, which is a global for something only this file has ever read. */
let _frozenFisherToldOnce = false;
/** Called on the thaw, so next winter's freeze is announced again. */
export function resetFrozenFisherNotice(): void { _frozenFisherToldOnce = false; }
export function updateVillager(v, dt){
  if(SKILL_STATES.includes(v.state)) gainSkill(v, dt);
  // needs
  const hungerMul = ((v.trait && v.trait.id==='glutton') ? 1.3 : 1) * climateHungerMul() * dep.decreeHungerMul();
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
  if(getWeather().type==='storm') mTarget -= 10;
  if(G.researched.hearth) mTarget += 8;
  if(dep.festivalOn()) mTarget += 20;
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
      dep.toast('💔 '+v.name+' has lost heart and left the hold...', true);
      // A left-behind partner carries their memory — and steadier resolve
      if(v.partner){
        const p = G.villagers.find(o=>o.name===v.partner);
        if(p){ p.trait = LEGACY_TRAITS.steadfast; dep.toast('🕯️ '+p.name+' keeps '+v.name+'\'s memory close — Steadfast.'); }
      }
      return;
    }
  } else v.moraleLowT = 0;

  // illness: triggered by prolonged hunger (>85) or winter + frail
  if(!v.sick){
    const illnessRisk = (v.hunger>85 ? 0.004 : 0) + ((seasonIndex()===3 && v.trait && v.trait.id==='frail') ? 0.003 : 0);
    if(Math.random() < illnessRisk * (G.researched.herbs?0.6:1) * dt){ v.sick=true; v.sickTimer = (25+Math.random()*20)*(G.researched.herbs?0.6:1); dep.toast(v.name+' has fallen ill!', true); }
  } else {
    v.sickTimer -= dt;
    if(v.sickTimer<=0){ v.sick=false; dep.toast(v.name+' has recovered.'); }
  }

  // famine: if food is out AND hungry, villager's speed drops sharply (already via effMultiplier),
  // but if hunger hits 100 for >20s, trigger a critical crisis toast once
  if(v.hunger>=99.9){
    if(!v._famineWarned){ v._famineWarned=true; dep.toast(v.name+' is starving!', true); }
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
            if(!_frozenFisherToldOnce){ _frozenFisherToldOnce = true; dep.toast('❄️ The river is frozen over — the fishers wait for thaw.', true); }
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
        if(v.carrying){ gainResource(v.carrying.type, v.carrying.amount); dep.spawnFly(v.gx, v.gy, v.carrying.type); v.carrying=null; }
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

