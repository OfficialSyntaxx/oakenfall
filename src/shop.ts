/* Where coins go: the hold shop, the caravan routes, and the ledger that says
 * what the coffers have done.
 *
 * All three are panels rather than systems — the rules they act on live in
 * economy.ts (the ledger's own totals), contracts.ts (the routes) and events.ts
 * (what a bought festival actually does). This module is the surface.
 *
 * Buying is deliberately not a table of effects. Each item does something the
 * others do not, and the branch below reads as the list of what coins are FOR;
 * a generic {effect: fn} table would hide that behind indirection for no gain
 * at six items.
 */
import { G } from './state';
import { toast } from './hud';
import { sheetContent, sheetNav, sheetAll } from './sheet';
import { gainResource, logCoinOut } from './economy';
import { hasActiveBuilding } from './buildings';
import { startEvent } from './events';
import { bannerPalette } from './unlocks';
import { refreshRouteOffers, acceptRoute, cancelRoute, routeGoodLabel } from './contracts';

/* Re-opening the hub's Shop tab after a purchase is main.ts's to do — the hub
   owns which tab is showing. */
type Deps = { reopenShop: () => void };
let dep: Deps = { reopenShop: () => {} };
export function initShop(deps: Deps): void { dep = deps; }

export const SHOP_ITEMS = [
  { id:'festival', ic:'🎉', name:'Feast Day',        cost:30, desc:'Begin a festival at once — the hold works 25% faster for a while.' },
  { id:'merchant', ic:'🧳', name:'Summon Merchant',  cost:25, desc:'A merchant arrives immediately with improved trade rates.' },
  { id:'healer',   ic:'🌿', name:'Healer\'s Visit',  cost:20, desc:'Cure every sick settler in the hold instantly.' },
  { id:'repairs',  ic:'🔧', name:'Mend the Hold',    cost:18, desc:'Instantly repair every building to full condition.' },
  { id:'rations',  ic:'🥖', name:'Emergency Rations',cost:15, desc:'A cart of 25 food arrives at the stores.' },
  { id:'banner',   ic:'🚩', name:'New Banner Dye',   cost:12, desc:'Re-dye the hold banner in a new colour (cycles red → blue → green → gold).' },
];
export function renderLedgerSheet(){
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
export function renderTradeRoutesSheet(){
  refreshRouteOffers();
  const hasPost = hasActiveBuilding('tradingPost');
  sheetContent.innerHTML = `
    <div class="sheet-sub">Recurring caravan contracts — deliver goods on schedule for a steady flow of coins. Requires a Trading Post.</div>
    ${!hasPost ? '<div class="sheet-sub" style="color:#e8b2a4;">⚠️ No active Trading Post — build one to broker routes.</div>' : ''}
    <div class="sheet-sub" style="margin-top:8px;"><b>Active routes</b> (${G.tradeRoutes.length}/3)</div>
    <div class="roster-list">
      ${G.tradeRoutes.length ? G.tradeRoutes.map(r=>`<div class="route-row">
        <span style="font-size:20px;">${r.ic}</span>
        <span class="rr-main"><b>${r.name}</b><br><span class="rr-sub">${r.giveAmt} ${routeGoodLabel(r.giveType)} every ${r.everyDays}d → 💰${r.coins} · next day ${r.nextDay}${r.missed?` · <span style="color:#e8b2a4;">missed once</span>`:''}</span></span>
        <button class="chip" data-hitslop="6" data-cancel="${r.id}">End</button>
      </div>`).join('') : '<div class="sheet-sub" style="opacity:.7;">No active routes yet.</div>'}
    </div>
    <div class="sheet-sub" style="margin-top:10px;"><b>Caravans seeking contracts</b></div>
    <div class="roster-list">
      ${G.routeOffers.map(o=>`<button class="action-btn list-row${(!hasPost||G.tradeRoutes.length>=3)?' dim':''}" data-accept="${o.id}">
        <span style="font-size:20px;">${o.ic}</span>
        <span><b>${o.name}</b><br><span style="font-size:11.5px;opacity:.8;">${o.giveAmt} ${routeGoodLabel(o.giveType)} every ${o.everyDays} days → 💰${o.coins} each run</span></span>
      </button>`).join('')}
    </div>`;
  sheetAll('[data-accept]').forEach(b=>b.addEventListener('click', ()=>acceptRoute(b.dataset.accept)));
  sheetAll('[data-cancel]').forEach(b=>b.addEventListener('click', ()=>cancelRoute(b.dataset.cancel)));
}
export function buyShopItem(id: string){
  const it = SHOP_ITEMS.find(x=>x.id===id);
  if(!it) return;
  if(G.coins < it.cost){ toast('Not enough coins — complete bounties and goals to earn more.', true); return; }
  const _coinsBefore = G.coins;
  if(id==='festival'){ if(!startEvent('festival',55)){ toast('An event is already underway.', true); return; } G.coins-=it.cost; toast('🎉 A feast day begins!'); }
  else if(id==='merchant'){ if(!startEvent('merchant',70)){ toast('An event is already underway.', true); return; } G.coins-=it.cost; toast('🧳 A merchant arrives at your call!'); }
  else if(id==='healer'){ const n=G.villagers.filter(v=>v.sick).length; if(!n){ toast('No one is sick.', true); return; } G.coins-=it.cost; G.villagers.forEach(v=>{v.sick=false;v.sickTimer=0;}); toast('🌿 The healer cures '+n+' settler'+(n>1?'s':'')+'.'); }
  else if(id==='repairs'){ G.coins-=it.cost; let n=0; G.buildings.forEach(b=>{ if(b.condition!==undefined&&b.condition<100){b.condition=100;n++;} }); toast('🔧 '+n+' building'+(n!==1?'s':'')+' restored.'); }
  else if(id==='rations'){ G.coins-=it.cost; const got=gainResource('food',25); toast('🥖 +'+got+' food delivered.'); }
  else if(id==='banner'){ G.coins-=it.cost; G.bannerIdx=(G.bannerIdx+1)%bannerPalette.length; toast('🚩 The hold flies new colours!'); }
  if(_coinsBefore > G.coins) logCoinOut('shop', _coinsBefore - G.coins);
  dep.reopenShop();
}
export function renderShopSheet(){
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
  sheetAll('[data-shop]').forEach(btn=>btn.addEventListener('click', ()=>buyShopItem(btn.dataset.shop)));
  document.getElementById('routes-btn').addEventListener('click', ()=>{
    sheetNav.push({ id:'routes', title:'🐫 Trade Routes', render:()=>renderTradeRoutesSheet() });
  });
  document.getElementById('ledger-btn').addEventListener('click', ()=>{
    sheetNav.push({ id:'ledger', title:'📒 Trader\'s Ledger', render:()=>renderLedgerSheet() });
  });
}
