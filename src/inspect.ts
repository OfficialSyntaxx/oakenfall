/* What you see when you tap something: a settler, a building, a patch of land.
 *
 * These three are the game's answer to "what is this?", and each is written to
 * answer it in the same shape — a title, what the thing is doing now, and the
 * few actions that make sense for it. They re-render THEMSELVES in place after
 * an action (reassigning a trade, trading at the post, dousing a fire) rather
 * than pushing a new view, because the panel you are looking at is the thing
 * that changed.
 */
import { G } from './state';
import { project, hashStr } from './math';
import { BUILD_DEFS, ROLE_DEFS, roleLabel } from './defs';
import { SPRITE_URLS } from './assets';
import { toast } from './hud';
import { sheetContent, sheetAll, statBar } from './sheet';
import { panCameraTo } from './camera';
import { deselectAll } from './selection';
import { seasonIndex } from './time';
import { skillTier } from './skills';
import { capFor, foodSafeCap, gainResource } from './economy';
import { hasBuildingType, popCapacity } from './buildings';
import { releaseClaims } from './lives';
import { reassignRole } from './work';
import { eventTradeBonus } from './events';
import { enterMoveMode } from './build';
import { researchPanelHtml, bindResearchButtons } from './holdmenu';
import { sfx } from './audio';

/* ── WHO THEY WERE BEFORE ── every settler not born in the hold arrives from
   somewhere. Derived from a hash of the name, so the same settler tells the
   same story every time you open their sheet without it being saved. */
const BACKSTORY_ORIGINS = ['a burned lowland farm','the old river crossings','a shuttered mining town','the eastern trade roads','a forgotten chapel hamlet','the salt-marsh coast','a woodcutter camp up north','the ruins of Old Kal'];
const BACKSTORY_HOOKS: Record<string,string> = {
  hardy:'and never once complained of the cold', swift:'outrunning worse things than wolves',
  glutton:'with little more than a legendary appetite', diligent:'seeking honest work and quiet',
  frail:'hoping the pines would be kinder', lucky:'after a coin-flip spared their life',
};
function backstoryFor(v: any){
  const seed = hashStr(v.name);
  const origin = BACKSTORY_ORIGINS[seed % BACKSTORY_ORIGINS.length];
  const hook = BACKSTORY_HOOKS[v.trait.id] || 'looking for a fresh start';
  return v.name+' came to Oakenfall from '+origin+', '+hook+'.';
}

export function renderVillagerSheet(v: any){
  const roles = Object.keys(ROLE_DEFS).map(key=>{
    const r = ROLE_DEFS[key];
    // Deadfall and foraging need no building — the trade is just slower by hand.
    const byHand = (key==='lumberjack' || key==='hunter');
    const hasPlace = !r.needsBuilding || hasBuildingType(r.needsBuilding);
    return { key, label:r.label, ic:r.ic, enabled: hasPlace || byHand,
             needs: r.needsBuilding, byHand: !hasPlace && byHand };
  });
  const pKey = ({ lumberjack:'lumberjack', miner:'miner', farmer:'farmer', fisher:'fisher', guard:'guard' })[v.role] || 'peasant';
  const pUri = (SPRITE_URLS as any)['portrait_' + pKey];
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
  for(const btn of sheetAll('.role-btn') as HTMLButtonElement[]){
    btn.addEventListener('click', ()=>{
      if(btn.disabled) return;
      reassignRole(v, btn.dataset.role!);
      renderVillagerSheet(v);
    });
  }
}
function stateLabel(v: any){
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
export function renderBuildingSheet(b: any){
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
    sfx('tap');
    try{ navigator.vibrate?.(15); }catch(e){}
    renderBuildingSheet(b);
  });
  const dbtn = document.getElementById('demolish-btn');
  if(dbtn) dbtn.addEventListener('click', ()=>demolishBuilding(b));
  const mbtn = document.getElementById('move-btn');
  if(mbtn) mbtn.addEventListener('click', ()=>enterMoveMode(b));
  sheetAll('[data-trade]').forEach(btn=>{
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
export function renderTileSheet(t: any){
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

export function demolishBuilding(b: any){
  for(const v of G.villagers){
    if(v.targetBuilding===b){ releaseClaims(v); v.state='idle'; }
  }
  gainResource('wood', Math.floor((BUILD_DEFS[b.type]?BUILD_DEFS[b.type].cost.wood:0) * 0.5));
  for(let yy=b.gy; yy<b.gy+b.h; yy++) for(let xx=b.gx; xx<b.gx+b.w; xx++){ if(G.grid[yy] && G.grid[yy][xx]) G.grid[yy][xx].building=null; }
  G.buildings = G.buildings.filter(x=>x!==b);
  toast('Building demolished.');
  deselectAll();
}
