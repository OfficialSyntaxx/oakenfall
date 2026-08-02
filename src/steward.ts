/* The Steward's Word — a natural-ish command console.
 *
 * You type an order in plain words ("build 3 houses", "we need more wood",
 * "put 2 to mining") and a local parser turns it into a queue the settlers work
 * through: gather any shortfall first, then place and raise what you asked for.
 *
 * Fully offline. No network, no model, no API — a forgiving keyword grammar and
 * a synonym table, which is the whole point: the game has to work on a plane.
 * Every phrase it understands is listed in the tables below, and adding a new
 * one is adding a row rather than retraining anything.
 *
 * Simulation apart from one function: updateStewardStatus writes the standing
 * order into the HUD and touches the DOM directly, because it is a view of this
 * queue and nothing else reads it.
 */
import { G } from './state';
import { toast } from './hud';
import { reassignRole } from './work';
import { BUILD_DEFS, ROLE_DEFS, TECH_TREE, NUM_WORDS, roleLabel } from './defs';
import { dist2 } from './math';
import { tileAt } from './mapgen';
import { tileWalkable } from './pathfind';
import { findTC, addBuilding, removeBuilding, buildingCenter, BUILD_NEEDS_ADJ,
  hasBuildingType, hasActiveBuilding, nearestBuildingOfTypes } from './buildings';
import { roleNeedScores } from './work';
import { releaseClaims } from './lives';
import { skillTier } from './skills';
import { sfx } from './audio';
import { spawnDust } from './fx';
import { capFor } from './economy';

type Deps = {
  /** Put a settler into a trade — handles the walk and the claim release. */
  /** Begin a study by tech id. */
  startResearch: (id: string) => void;
  /** Tear a building down, refunding half its timber. */
  demolishBuilding: (b: any) => void;
};
let dep: Deps = {
  startResearch: () => {}, demolishBuilding: () => {},
};
export function initSteward(deps: Deps): void { dep = deps; }

export let stewardOrders: any[] = [];
/** Importers cannot assign to `stewardOrders` — an imported binding is
 *  read-only — so clearing the queue goes through here. */
export function clearStewardOrders(): void { stewardOrders.length = 0; }
/* Condition decays every day, so almost every building sits a shade under 100.
   This is the line where a roof is actually worth mending — mending to "100 or
   nothing" would spend wood forever and never finish. */
export const WORN_ENOUGH = 70;
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
/* `max` exists because 50 is the right ceiling for "build 200 houses" and the
   wrong one for "always keep 200 food" — the first is a slip, the second is an
   ordinary granary. A standing order passes its own cap. */
function stewardNum(s, max = 50){
  const m = s.match(/\b(\d{1,4})\b/); if(m) return Math.min(max, parseInt(m[1],10));
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
function stewardAfford(bkey){ const def: any = BUILD_DEFS[bkey];
  return !!def && Object.entries(def.cost).every(([k, amt]: [string, any]) => !amt || (G.stockpile[k]||0) >= amt); }
export function stewardOrderLine(o){
  if(o.kind==='build')    return '🔨 Raise '+o.count+' '+o.label+' — '+o.placed+'/'+o.count;
  if(o.kind==='gather')   return '🌾 Gather '+o.res+' — '+Math.floor(G.stockpile[o.res]||0)+'/'+o.target;
  if(o.kind==='assign')   return '⚒️ '+o.count+' to '+(ROLE_DEFS[o.role]?ROLE_DEFS[o.role].label:o.role);
  if(o.kind==='demolish') return '⛏️ Tear down '+o.count+' '+o.label+' — '+o.done+'/'+o.count;
  if(o.kind==='repair')   return '🔧 Mend the hold — '+o.done+' mended';
  if(o.kind==='research') return '🔬 Study '+o.name;
  return '';
}
export function updateStewardStatus(){
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
/* Why is this order not moving? The queue always knew — it just never said,
   and "the steward is ignoring me" was the single most common confusion.
   Returns null when the order is simply under way. */
export function stallReason(o){
  if(!o) return null;
  if(o.kind==='build'){
    const def: any = BUILD_DEFS[o.bkey]; if(!def) return null;
    for(const [k, amt] of Object.entries(def.cost) as [string, number][]){
      const have = Math.floor(G.stockpile[k]||0);
      if(amt>0 && have < amt) return 'waiting on '+(amt-have)+' more '+k;
    }
    if(!stewardFindSpot(o.bkey)) return 'no room near the hold';
    return null;
  }
  if(o.kind==='gather'){
    const st = stewardAssignGatherers(o.res);
    if(st==='noplace')  return 'no '+(STEWARD_WORKPLACE[o.res]||'workplace')+' to work from';
    if(st==='noidle')   return 'no hands free to send';
    if(st==='unprocessable') return o.res+' is crafted, not gathered';
    return null;
  }
  if(o.kind==='repair'){
    const worn = G.buildings.filter(b=>b.condition!==undefined && b.condition<WORN_ENOUGH);
    if(!worn.length) return null;
    worn.sort((a,b)=>a.condition-b.condition);
    const cost = Math.max(2, Math.ceil((100-worn[0].condition)/10));
    if((G.stockpile.wood||0) < cost) return 'waiting on '+(cost-Math.floor(G.stockpile.wood||0))+' more wood';
    return null;
  }
  if(o.kind==='research'){
    if(G.activeResearch) return 'another study is under way';
    const t = TECH_TREE.find(x=>x.id===o.id);
    const short = t && Object.entries(t.cost).find(([k,amt]: [string, any])=>(G.stockpile[k]||0) < amt);
    if(short) return 'waiting on '+short[0];
    return null;
  }
  return null;
}

/* ── STANDING ORDERS ──
   "always keep 40 food" is a RULE. It is checked at every dawn for the life of
   the hold, and it ends only when it is repealed. That is the whole difference
   from "gather 40 food", which finishes once and is forgotten. */
export function standingLine(r){
  const have = Math.floor(G.stockpile[r.res]||0);
  return '♾️ keep '+r.target+' '+r.res+' — '+have+'/'+r.target + (r.blocked ? ' — '+r.blocked : '');
}
export function setStandingOrder(res: string, target: number): string {
  // A rule the hold could never keep is refused at the point of asking rather
  // than accepted and quietly never acted on.
  if(stewardAssignGatherers(res)==='unprocessable')
    return '📜 '+res+' is crafted at a workshop, not gathered — I cannot keep a standing store of it.';
  const cap = capFor(res);
  let msg = '';
  if(target > cap){ target = cap; msg = ' (our stores hold no more than '+cap+')'; }
  const cur = G.standingOrders.find(r=>r.res===res);
  if(cur){ cur.target = target; cur.blocked = null; }
  else G.standingOrders.push({ res, target, blocked: null });
  return '📜 Standing order: keep '+target+' '+res+' in hand'+msg+'. I will see to it.';
}
export function clearStandingOrders(res?: string): string {
  if(res){
    const i = G.standingOrders.findIndex(r=>r.res===res);
    if(i<0) return '📜 There is no standing order for '+res+'.';
    G.standingOrders.splice(i,1);
    return '📜 The standing order for '+res+' is repealed.';
  }
  const n = G.standingOrders.length;
  G.standingOrders.length = 0;
  return n ? ('📜 '+n+' standing rule'+(n!==1?'s':'')+' repealed.') : '📜 No standing rules were in force.';
}
/** Run at every dawn: any rule below its mark queues a gather, once. */
export function checkStandingOrders(): void {
  for(const r of G.standingOrders){
    const have = Math.floor(G.stockpile[r.res]||0);
    if(have >= r.target){ r.blocked = null; continue; }
    if(stewardOrders.some(o=>o.kind==='gather' && o.res===r.res)) continue;
    // Queue it only if it could actually be worked — an order dropped at the
    // moment it is queued teaches the player the rule does nothing.
    const st = stewardAssignGatherers(r.res);
    if(st!=='ok'){
      const why = st==='noplace' ? 'no '+(STEWARD_WORKPLACE[r.res]||'workplace')+' to work from'
                : st==='noidle'  ? 'no hands free to send'
                : r.res+' is crafted, not gathered';
      if(r.blocked !== why){ r.blocked = why; toast('📜 Standing order for '+r.res+': '+why+'.', true); }
      continue;
    }
    r.blocked = null;
    stewardOrders.push({ kind:'gather', res:r.res, target:r.target, standing:true });
  }
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
export function processStewardOrders(dt){
  updateStewardStatus();
  if(!stewardOrders.length) return;
  _stewardT -= dt; if(_stewardT>0) return; _stewardT = 1.0;   // act about once a second
  const o = stewardOrders[0];
  if(o.kind==='build'){
    if(o.placed>=o.count){ toast('📜 The '+o.count+' '+o.label+' '+(o.count>1?'stand':'stands')+' raised, as you ordered.'); stewardOrders.shift(); return; }
    if(stewardAfford(o.bkey)){
      const spot = stewardFindSpot(o.bkey);
      if(!spot){ toast('📜 There is no room to raise the '+o.label+' near the hold.', true); stewardOrders.shift(); return; }
      const def: any = BUILD_DEFS[o.bkey];
      for(const [k, amt] of Object.entries(def.cost) as [string, number][]){ if(amt>0) G.stockpile[k]-=amt; }
      addBuilding(o.bkey, spot.gx, spot.gy); spawnDust(spot.gx+0.5, spot.gy+0.5); sfx('build');
      o.placed++; o.stall = 0;
      if(o.placed>=o.count){ toast('📜 The '+o.count+' '+o.label+' '+(o.count>1?'stand':'stands')+' raised, as you ordered.'); stewardOrders.shift(); }
    } else {
      const def: any = BUILD_DEFS[o.bkey]; let blocked=null;
      for(const [k, amt] of Object.entries(def.cost) as [string, number][]){ if(amt>0 && (G.stockpile[k]||0) < amt){ const st=stewardAssignGatherers(k); if(st!=='ok') blocked={res:k,why:st}; } }
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
    dep.demolishBuilding(match[0]); o.done++;
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
    dep.startResearch(o.id); stewardOrders.shift();
  }
}

/* ── PARSER ──
   A forgiving keyword grammar, no network and no model. Orders are split on
   "and"/"then"/commas first, so one sentence can carry several instructions —
   "build 2 farms and put 3 to farming" is two orders, not one misread. */
function stewardAnswer(s){
  if(/\b(help|what can you|what can i say|commands)\b/.test(s)){
    return '📜 Try: "build 3 houses", "we need more wood", "put 2 to mining", "tear down a palisade", "mend the hold", "always keep 40 food", "study irrigation", "why", or "how much stone".';
  }
  if(/\b(how much|how many|do we have|what do we have)\b/.test(s)){
    const res = stewardLookup(s, STEWARD_RES);
    if(res) return '📜 We hold '+Math.floor(G.stockpile[res]||0)+' '+res+'.';
    if(/\b(settlers|people|folk|G.villagers|souls|population)\b/.test(s)){
      const idle = G.villagers.filter(v=>v.role==='idle').length;
      return '📜 '+G.villagers.length+' souls in the hold'+(idle?', '+idle+' of them idle.':', all at work.');
    }
  }
  if(/\b(who is idle|who's idle|whos idle|anyone idle|idle hands|who is free)\b/.test(s)){
    const idle = G.villagers.filter(v=>v.role==='idle' && v.stage!=='child');
    if(!idle.length) return '📜 No one stands idle — every hand is at work.';
    return '📜 Idle: '+idle.slice(0,6).map(v=>v.name).join(', ')+(idle.length>6?' and '+(idle.length-6)+' more':'')+'.';
  }
  if(/\b(why|stuck|blocked|what is wrong|whats wrong|hold up|holding up)\b/.test(s)){
    const lines = stewardOrders.map(o=>{ const r = stallReason(o); return r ? stewardOrderLine(o)+' — '+r : null; }).filter(Boolean);
    const blocked = G.standingOrders.filter(r=>r.blocked).map(standingLine);
    if(!lines.length && !blocked.length){
      return stewardOrders.length ? '📜 Nothing is stuck — the work is under way.'
                                  : '📜 Nothing is stuck, because nothing is ordered.';
    }
    return '📜 '+lines.concat(blocked).join(' · ');
  }
  if(/\b(what are you doing|status|report|progress)\b/.test(s)){
    const rules = G.standingOrders.map(standingLine);
    if(!stewardOrders.length && !rules.length) return '📜 Nothing stands ordered — the hold awaits your word.';
    return '📜 '+stewardOrders.map(stewardOrderLine).concat(rules).join(' · ');
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
/* "always keep 40 food" / "stop keeping food". Checked before the generic
   stop branch, which would otherwise swallow the repeal and leave the rule in
   force while telling the player it was cleared. */
function stewardStanding(s){
  const repeal = /\b(stop|cease|end|cancel|no longer|forget)\b/.test(s) &&
                 /\b(keep|keeping|maintain|maintaining|stock|stocking)\b/.test(s);
  const set    = /\b(always|standing order|standing|from now on|keep at least|at all times|forever)\b/.test(s) &&
                 /\b(keep|maintain|hold|stock|have)\b/.test(s);
  if(!repeal && !set) return null;
  const res = stewardLookup(s, STEWARD_RES);
  if(repeal) return clearStandingOrders(res || undefined);
  if(!res) return '📜 Keep what? Name a store — wood, stone or food.';
  const n = stewardNum(s, 999);
  if(!n) return '📜 How much '+res+' should I keep in hand?';
  return setStandingOrder(res, n);
}
export function stewardCommand(text){
  const clean = (t)=>' '+String(t||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim()+' ';
  const s = clean(text);
  if(!s.trim()) return { ok:false, msg:'🤔 Say the word and it is done.' };
  const standing = stewardStanding(s);
  if(standing) return { ok:true, msg:standing, answered:true };
  if(/\b(stop|cancel|halt|nevermind|never mind|abort|clear orders|disregard|belay)\b/.test(s)){
    const n = stewardOrders.length; clearStewardOrders();
    // A rule is not a task. "Stop" clears the queue; repealing a standing order
    // takes saying so, or a player loses a rule they set days ago by accident.
    const rules = G.standingOrders.length;
    const tail = rules ? ' '+rules+' standing rule'+(rules!==1?'s':'')+' still hold'+(rules===1?'s':'')+'.' : '';
    return { ok:true, msg: (n ? ('⛔ '+n+' order'+(n!==1?'s':'')+' cleared.') : '⛔ Nothing was ordered.') + tail };
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


