/* Fire.
 *
 * The one hazard that can take a hold apart while you watch. A blaze starts on
 * its own in dry weather, burns a building's condition down, spreads to timber
 * neighbours, and goes out when enough people stand near it with buckets — or
 * when the rain does the work for them.
 *
 * The bucket brigade lives in lives.ts: idle adults run toward a fire before
 * anything else. This module only decides what is burning and how fast.
 */
import { G } from './state';
import { toast } from './hud';
import { chron } from './chronicle';
import { clamp, dist2 } from './math';
import { BUILD_DEFS } from './defs';
import { seasonIndex } from './time';
import { getWeather, climateFireMul } from './weather';
import { buildingCenter, removeBuilding } from './buildings';
import { sfx } from './audio';

type Deps = {
  /** Peaceful mode has no fires, the same flag that turns off bandits. */
  hazardsEnabled: () => boolean;
  /** Game-mode decay multiplier — a harsher hold burns more readily. */
  decayMul: () => number;
};
let dep: Deps = { hazardsEnabled: () => true, decayMul: () => 1 };
export function initFire(deps: Deps): void { dep = deps; }

/** Stone and earth do not burn: wells, roads, bridges, palisades and the mining
 *  post are all absent from this set on purpose. */
let fireTimer = 340 + Math.random() * 260;   // world-seconds until the next roll

export const FLAMMABLE = new Set(['house','manor','tavern','bakery','sawmill','forestCamp',
  'farm','granary','windmill','huntingCabin','fishingHut','tradingPost','guardPost']);
export function fireDrynessMul(){
  let m = 1; const s = seasonIndex();
  if(s===1) m *= 1.7;          // summer — dry
  else if(s===3) m *= 0.12;    // winter — snow-damped
  else if(s===2) m *= 1.15;    // autumn — dry leaves
  if(getWeather().type==='rain') m *= 0.3;
  else if(getWeather().type==='storm') m *= 0.5;
  else if(getWeather().type==='snow') m *= 0.2;
  else if(getWeather().type==='clear') m *= 1.2;
  m *= climateFireMul();   // drought dries the timber; a cold snap damps it
  return m;
}
export function nearWell(gx, gy){
  return G.buildings.some(w=>w.type==='well' && (w.condition===undefined||w.condition>=35) && dist2(gx,gy,w.gx,w.gy) < 12.25); // within ~3.5 tiles
}
export function igniteBuilding(b: any, announce?: boolean){
  if(!b || b._fire || !FLAMMABLE.has(b.type)) return;
  if(b.condition!==undefined && b.condition<=0) return;
  b._fire = 20 + Math.random()*14;
  if(announce){
    toast('🔥 Fire! Your '+(BUILD_DEFS[b.type]?BUILD_DEFS[b.type].name:b.type)+' is ablaze — tap it and send a bucket brigade!', true);
    sfx('fire');
  }
}
export function fireTick(dt){
  fireTimer -= dt;
  if(fireTimer<=0){
    fireTimer = 320 + Math.random()*300;
    const cand = G.buildings.filter(b=>FLAMMABLE.has(b.type) && (b.condition===undefined||b.condition>0));
    // Only once the hold is established, and never while one is already ablaze.
    if(dep.hazardsEnabled() && G.dayCount>2 && cand.length>=4 && !G.buildings.some(b=>b._fire)){
      const chance = Math.min(0.6, 0.28 * fireDrynessMul() * dep.decayMul());
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
  const ambientDouse = getWeather().type==='storm'?11:getWeather().type==='rain'?8:getWeather().type==='snow'?6:0;
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
      chron('fire', nm);
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
