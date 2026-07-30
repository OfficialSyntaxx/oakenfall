/* The steward's dilemmas, and the ribbon that teaches a new one the ropes.
 *
 * A decision is a dialogue with real, lasting consequences and no undo. Two
 * rules keep them from being an annoyance: they never interrupt an open panel,
 * and the same one never fires twice running. Both are the difference between a
 * dilemma and a pop-up.
 *
 * The onboarding ribbon lives here too because it is the same idea from the
 * other end — the game telling the player something unprompted. It steps
 * forward on what the hold has actually DONE rather than on what the player was
 * shown, so skipping ahead by building the right thing early just works.
 */
import { G } from './state';
import { clamp } from './math';
import { toast } from './hud';
import { sheetContent, sheetNav, sheetAll, openSheet, isSheetOpen } from './sheet';
import { clearSelection, deselectAll } from './selection';
import { chron } from './chronicle';
import { CLIMATE_DEFS } from './weather';
import { hastenRaid } from './raiders';
import { FESTIVAL_BOONS } from './holdmenu';
import { popCapacity } from './buildings';
import { gainResource } from './economy';
import { getTier } from './progress';
import { sfx } from './audio';

/* Two things a dilemma may need that live with the run: whether bandits are
   enabled at all in this mode, and how a newcomer is brought into the world. */
type Deps = { banditsEnabled: () => boolean; spawnVillager: () => any };
let dep: Deps = { banditsEnabled: () => true, spawnVillager: () => null };
export function initDecisions(deps: Deps): void { dep = deps; }

/* In-game days until the next dilemma. Counted down by the world tick, which
   also decides the interval — three to five days, so they do not become a
   rhythm the player waits for. */
let decisionTimer = 3.2;
export function decisionCountdown(dt: number): boolean {
  decisionTimer -= dt;
  return decisionTimer <= 0;
}
export function resetDecisionTimer(): void {
  decisionTimer = 3 + Math.floor(Math.random() * 3);
}
export function resetDecisions(): void { decisionTimer = 3.2; lastDecision = ''; }
let lastDecision = '';
function changeMorale(delta: number){ G.villagers.forEach(v=>{ if(v.morale!==undefined) v.morale=clamp(v.morale+delta,0,100); }); }
const DECISIONS: any[] = [
  { id:'refugees', ic:'🚪', title:'Strangers at the Gate',
    text:'A ragged family stands at the palisade — three souls, footsore and hungry, asking to join the hold.',
    choices:[
      {label:'Take them in', outcome:'The family joins the hold, grateful.', run:()=>{ let n=0; const room=popCapacity()-G.villagers.length; for(let i=0;i<Math.min(2,Math.max(0,room));i++){ dep.spawnVillager(); n++; } G.stockpile.food=Math.max(0,(G.stockpile.food||0)-10); toast(n>0?('👪 '+n+' newcomer'+(n>1?'s':'')+' join the hold.'):'👪 No room — but you shared what you could.'); changeMorale(4); }},
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
    cond:()=>getTier()>=1 && (G.stockpile.food||0)>=25 && dep.banditsEnabled(),
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
export function rollDecision(){
  if(isSheetOpen()) return; // never interrupt an open panel
  const pool = DECISIONS.filter(d=>d.id!==lastDecision && (!d.cond || (()=>{ try{return d.cond();}catch(e){return false;} })()));
  if(!pool.length) return;
  const d = pool[Math.floor(Math.random()*pool.length)];
  lastDecision = d.id;
  clearSelection();
  openSheet(); sheetNav.reset();
  sheetNav.push({ id:'decision', title:d.ic+' '+d.title, render:()=>renderDecisionSheet(d) });
  sfx('open');
}
function renderDecisionSheet(d: any){
  sheetContent.innerHTML = `
    <div class="sheet-sub" style="font-style:italic;line-height:1.5;">${d.text}</div>
    <div class="roster-list" style="margin-top:10px;">
      ${d.choices.map((c,i)=>`<button class="action-btn list-row" data-choice="${i}"><span style="flex:1;text-align:left;">${c.label}</span></button>`).join('')}
    </div>`;
  sheetAll('[data-choice]').forEach(btn=>btn.addEventListener('click', ()=>{
    const c = d.choices[+btn.dataset.choice!];
    try{ c.run(); }catch(e){}
    chron('decision', d.title);
    sheetContent.innerHTML = `<div class="sheet-sub" style="line-height:1.5;">${c.outcome}</div>
      <button class="action-btn primary" id="decision-done" style="margin-top:10px;">Continue</button>`;
    document.getElementById('decision-done')!.addEventListener('click', ()=>deselectAll());
  }));
}
const ONBOARD_STEPS: any[] = [
  {hint:'👋 Welcome, steward. Tap 🔨 and raise a House to make room for more settlers.',
   done:()=>G.buildings.some(b=>b.type==='house')},
  {hint:'🪓 Build a Forestry Camp, then tap a settler and set them to Lumberjack — timber builds everything.',
   done:()=>G.buildings.some(b=>b.type==='forestCamp') && G.villagers.some(v=>v.role==='lumberjack')},
  {hint:'🌾 Food is life. Build a Farm and assign a Farmer before the cold comes.',
   done:()=>G.buildings.some(b=>b.type==='farm') && G.villagers.some(v=>v.role==='farmer')},
  {hint:'❄️ Now stock food and firewood — and survive your first winter.',
   done:()=>(G.journal.wintersEndured||0)>=1},
];
export function updateOnboard(){
  const el=document.getElementById('onboard-ribbon'); if(!el) return;
  if(G.onboardDone){ el.classList.add('hidden'); return; }
  let step=null;
  for(const s of ONBOARD_STEPS){ let d=false; try{ d=s.done(); }catch(e){} if(!d){ step=s; break; } }
  if(!step){ G.onboardDone=true; el.classList.add('hidden'); toast('✓ You\'ve found your feet, steward — the hold is yours.'); return; }
  const t=document.getElementById('onboard-text'); if(t) t.textContent=step.hint;
  el.classList.remove('hidden');
}
export function updateStatuses(){
  const el=document.getElementById('statuses'); if(!el) return;
  const pills: {t:string;c:string}[] = [];
  if(G.climate){ const c=CLIMATE_DEFS[G.climate.type]; pills.push({t:G.climate.ic+' '+c.name, c: G.climate.type==='fair'?'good':'warn'}); }
  if(G.festivalBoon){ const b=FESTIVAL_BOONS.find(x=>x.id===G.festivalBoon); if(b) pills.push({t:b.ic+' '+b.name, c:'good'}); }
  if(G.tradeRoutes.length) pills.push({t:'🐫 '+G.tradeRoutes.length+' route'+(G.tradeRoutes.length>1?'s':''), c:''});
  if(G.buildings.some(b=>b._fire)) pills.push({t:'🔥 Fire!', c:'warn'});
  if(G.plague) pills.push({t:'🤢 Blight', c:'warn'});
  el.innerHTML = pills.map(p=>`<span class="status-pill ${p.c}">${p.t}</span>`).join('');
}
