/* Wolves and bandits — everything that comes to take what the hold has.
 *
 * Two threats on separate clocks. Wolves prowl the treeline and pick off a
 * settler working the wilds, or raid the stores if nobody is out there. Bandits
 * only bother once the hold is worth robbing, and how much they get is decided
 * by what stands in their way: guards, palisades, watchtowers, and the river
 * itself. Every bridge is a door in that moat unless a guard post watches it —
 * which is the mechanic that makes bridge placement a real decision.
 */
import { G } from './state';
import { ADMIN } from './admin';
import { clamp, dist2 } from './math';
import { RAIDER_VARIANTS, LEGACY_TRAITS } from './defs';
import { riverFrozen } from './time';
import { findTC, buildingCenter, hasBuildingType } from './buildings';
import { getTier } from './progress';
import { releaseClaims } from './lives';
import { sfx } from './audio';
import { spawnBoom } from './fx';

type Deps = {
  toast: (msg: string, urgent?: boolean) => void;
  /** Are bandits enabled at all — Peaceful mode says no. */
  raidsEnabled: () => boolean;
  /** Curfew and open-gates decrees change how often trouble comes. */
  decreeRaidMul: () => number;
};
let dep: Deps = { toast: () => {}, raidsEnabled: () => true, decreeRaidMul: () => 1 };
export function initRaiders(deps: Deps): void { dep = deps; }

/** Difficulty and game mode together set how dangerous the wilds are. */
let wolfRiskMul = 1;
export function setWolfRisk(n: number): void { wolfRiskMul = n; }

let wolfTimer = 60;
let banditTimer = 200;
export function resetRaidTimers(): void { wolfTimer = 60; banditTimer = 200; }
/** Bring the next raid forward — refusing strangers at the gate has a cost. */
export function hastenRaid(within: number): void { banditTimer = Math.min(banditTimer, within); }

export function raidEntryPoint(openBridges){
  if(openBridges && openBridges.length){ const b=openBridges[Math.floor(Math.random()*openBridges.length)]; return {gx:b.gx, gy:b.gy}; }
  // else nearest map edge to a random side
  const side = Math.floor(Math.random()*4);
  const m = G.MAP_SIZE-1;
  if(side===0) return {gx:Math.random()*m, gy:0};
  if(side===1) return {gx:Math.random()*m, gy:m};
  if(side===2) return {gx:0, gy:Math.random()*m};
  return {gx:m, gy:Math.random()*m};
}

export function launchRaid(n, didSteal, entry){
  for(let i=0;i<n;i++){
    G.raiders.push({ gx:clamp(entry.gx+(Math.random()-0.5)*2,0,G.MAP_SIZE-1), gy:clamp(entry.gy+(Math.random()-0.5)*2,0,G.MAP_SIZE-1),
      state:'advance', didSteal, phase:Math.random()*6, spd:1.5+Math.random()*0.6, facing:1, life:34, _flee:null,
      variant: RAIDER_VARIANTS[Math.floor(Math.random()*RAIDER_VARIANTS.length)] });
  }
}
export function raiderTick(dt){
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
        spawnBoom(r.gx, r.gy);
        r.state='flee';
        r._flee = { gx: r.gx + (r.gx<G.MAP_SIZE/2?-7:7), gy: r.gy + (r.gy<G.MAP_SIZE/2?-7:7) };
        continue;
      }
    } else if(d < 0.6){ G.raiders.splice(G.raiders.indexOf(r),1); continue; }
    r.gx += (dx/d)*r.spd*dt; r.gy += (dy/d)*r.spd*dt;
    r.facing = dx<0?-1:1;
  }
}

/** Wolves at the treeline. */
export function wolfTick(dt: number): void {
    wolfTimer -= dt;
  if(wolfTimer<=0){
    wolfTimer = 100 + Math.random()*70;
    const riskMul = (hasBuildingType('watchtower') ? 0.3 : 1) * wolfRiskMul * dep.decreeRaidMul();
    if(Math.random() < 0.55*riskMul){
      const exposed = G.villagers.filter(v=>(v.state==='walkingToResource'||v.state==='working') && v.targetTile && (v.targetTile.type==='forest'||v.targetTile.wilds));
      if(exposed.length>0){
        const v = exposed[Math.floor(Math.random()*exposed.length)];
        releaseClaims(v); v.carrying=null; v.state='idle'; v.fatigue=clamp(v.fatigue+15,0,100);
        dep.toast('Wolves prowl the treeline — '+v.name+' flees home!', true);
        G.wolfEvents++;
      } else {
        const loss = Math.min(G.stockpile.food, 4+Math.floor(Math.random()*8));
        if(loss>0){
          G.stockpile.food -= loss;
          dep.toast('A wolf pack raids the stores — '+loss+' food stolen!', true); sfx('raid');
          G.wolfEvents++;
        }
      }
    }
  }

}

/** Bandits, once the hold is worth the walk. */
export function banditTick(dt: number): void {
  // Bandit raids — only once the hold is big enough to be worth robbing
  banditTimer -= dt;
  if(banditTimer<=0){
    banditTimer = 160 + Math.random()*120;
    if(!ADMIN.noRaids && dep.raidsEnabled() && getTier()>=2 && Math.random()<0.5*dep.decreeRaidMul()){
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
      const strength = 10 + getTier()*6 + Math.random()*8;
      const mitigation = Math.min(0.95, defense / (defense + strength));
      const raidN = 2 + Math.floor(Math.random()*2) + (getTier()>=3?1:0);
      launchRaid(raidN, mitigation <= 0.72, raidEntryPoint(openBridges));
      if(mitigation > 0.72){
        G.journal.raidsRepelled = (G.journal.raidsRepelled||0) + 1;
        dep.toast('🛡️ Bandits probed the walls — your guards drove them off!'); sfx('raid');
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
            dep.toast('🌉 Raiders poured across the unwatched bridge!', true);
          }
          dep.toast('🏴 Bandits raid the hold — lost '+stolen.join(', ')+'!', true); sfx('raid');
          G.villagers.forEach(v=>{ if(v.morale!==undefined){ let hit=(v.trait&&v.trait.id==='brave')?4:8; if(G.festivalBoon==='courage') hit*=0.5; v.morale=clamp(v.morale-hit,0,100); } });
          // Surviving a raid can steel a settler for life
          if(Math.random()<0.3 && G.villagers.length){
            const cand = G.villagers.filter(v=>!v.trait || (v.trait.id!=='brave' && v.trait.id!=='steadfast'));
            if(cand.length){
              const vv = cand[Math.floor(Math.random()*cand.length)];
              vv.trait = LEGACY_TRAITS.brave;
              dep.toast('🦁 '+vv.name+' stood firm through the raid — they are Brave now.');
            }
          }
        } else {
          dep.toast('🏴 Bandits found nothing worth taking.');
        }
      }
    }
  }

}
