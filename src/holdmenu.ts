/* The Hold Menu: one hub, five tabs, and the panels they open onto.
 *
 * Goals · Research · Shop · Folk · Journal. Before this existed every menu was
 * a separate full overwrite of the sheet with no way back, which is why the tab
 * row is REBUILT and prepended by renderHubSheet on every render rather than
 * living in the page: each tab body writes the whole sheet body, so anything
 * shared has to be put back afterwards.
 *
 * The hub uses `replace`, not `push` — it is a destination, not a step. The
 * panels it opens onto (the chronicle, the statistics, the events inbox) use
 * `push`, so the back chevron returns to the tab that opened them.
 */
import { G } from './state';
import { project } from './math';
import { ROLE_DEFS, HOLD_TIERS, TECH_TREE } from './defs';
import { GAME_VERSION, CHANGELOG } from './version';
import { toast, eventLog } from './hud';
import { sheetContent, sheetNav, sheetAll, miniBar } from './sheet';
import { panCameraTo } from './camera';
import { selection } from './selection';
import { seasonName } from './time';
import { roleLabel } from './defs';
import { skillTier, GUILD_DEFS, guildBonusVal } from './skills';
import { getTier, techAvailable, startResearch } from './progress';
import { QUESTS, questsDoneCount, DEED_DEFS, rewardText } from './goals';
import { renderDecreesSheet, decreesInForce } from './decrees';
import { renderShopSheet } from './shop';
import { renderFeedbackSheet } from './feedback';
import { startEvent } from './events';
import { chron } from './chronicle';
import { deselectAll } from './selection';
import { sfx } from './audio';

/* Two panels this hub links to still live in main.ts: a settler's own sheet,
   and the share-card exporter that paints a PNG. */
type Deps = { renderVillager: (v: any) => void; exportHoldCard: () => void };
let dep: Deps = { renderVillager: () => {}, exportHoldCard: () => {} };
export function initHoldMenu(deps: Deps): void { dep = deps; }

/* ── THE YEAR'S FESTIVAL ── a blessing chosen once a year and held until the
   next. Defined here because two panels show it and one of them offers it. */
export const FESTIVAL_BOONS = [
  { id: 'harvest', ic: '🌾', name: 'Harvest Feast', desc: 'Fields and foragers yield +20% for the year.' },
  { id: 'courage', ic: '🛡️', name: 'Rite of Courage', desc: 'Spirits stay higher (+8 morale) and raids sting less.' },
  { id: 'craft',   ic: '🔨', name: 'Craftsmen\'s Fair', desc: 'Every settler works +15% faster for the year.' },
];

/* How much of the goal list the player has SEEN done. The clock strip shows a
   dot when the two disagree, so opening the Goals tab is what clears it. */
let lastSeenQuestCount = 0;
export function questsSeen(): number { return lastSeenQuestCount; }
export function resetQuestsSeen(): void { lastSeenQuestCount = 0; }

export function renderQuestSheet(){
  lastSeenQuestCount = questsDoneCount();
  document.getElementById('quest-dot').classList.add('hidden');
  sheetContent.innerHTML = `
    <div class="sheet-sub">${questsDoneCount()}/${QUESTS.length} complete</div>
    <div class="row" style="margin:6px 0 4px;flex-wrap:wrap;gap:6px;">
      <div class="pill" style="pointer-events:none;">${HOLD_TIERS[getTier()].ic} ${HOLD_TIERS[getTier()].name}</div>
      ${getTier() < HOLD_TIERS.length-1 ? `<div class="sheet-sub" style="align-self:center;">Next: ${HOLD_TIERS[getTier()+1].name} at ${HOLD_TIERS[getTier()+1].pop} settlers &amp; ${HOLD_TIERS[getTier()+1].bld} buildings</div>` : `<div class="sheet-sub" style="align-self:center;">Highest tier reached!</div>`}
    </div>
    ${G.dailyBounties.length ? `<div class="sheet-sub" style="margin:6px 0 2px;"><b>📯 Today's Bounties</b></div>`+G.dailyBounties.map(bb=>`<div class="sheet-sub">${bb.done?'✅':'▫️'} ${bb.ic} ${bb.desc} — <b>${(G.dailyProgress[bb.key]||0) >= bb.n ? bb.n : Math.min(bb.n, Math.floor(G.dailyProgress[bb.key]||0))}/${bb.n}</b> · 💰${bb.reward}</div>`).join('') : ''}
    <div class="row" style="margin:4px 0 6px;gap:6px;">
      <button class="action-btn" id="decrees-btn" style="flex:1;">⚖️ Decrees${decreesInForce()?' ('+decreesInForce()+')':''}</button>
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
  sheetAll('[data-fb]').forEach(btn=>btn.addEventListener('click', ()=>{
    const kind = btn.dataset.fb==='bug' ? 'bug' : 'idea';
    sheetNav.push({ id:'feedback', title: kind==='bug'?'🐛 Report a Bug':'💡 Suggest a Feature', render:()=>renderFeedbackSheet(kind) });
  }));
  const db = document.getElementById('decrees-btn');
  if(db) db.addEventListener('click', ()=>{ sheetNav.push({ id:'decrees', title:'⚖️ Decrees', render:()=>renderDecreesSheet() }); });
}
/* ── Research panel: extracted from the Town Center sheet so the hub's
   Research tab and the building sheet share one implementation ── */
export function researchPanelHtml(){
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
export function bindResearchButtons(rerender: ()=>void){
  sheetAll('[data-tech]').forEach(btn=>{
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
export function renderRosterSheet(){
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
      ${['role','morale','name'].map(s=>`<button class="chip${s===rosterSort?' sel':''}" data-hitslop="6" data-sort="${s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}
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
  sheetAll('[data-sort]').forEach(b=>b.addEventListener('click', ()=>{ rosterSort=b.dataset.sort; renderHubSheet('folk'); }));
  sheetAll('.roster-row').forEach(b=>b.addEventListener('click', ()=>{
    const v = list[+b.dataset.i]; if(!v) return;
    selection.type='villager'; selection.ref=v;
    sheetNav.push({ id:'sel-villager', render:()=>dep.renderVillager(v) });
    const p = project(v.gx, v.gy); panCameraTo(p.x, p.y);
  }));
}
export function renderHubSheet(tab: string){
  sheetNav.replace({ id:'hub:'+tab, title:HUB_TABS[tab].title, render(){
    HUB_TABS[tab].body();
    const row = document.createElement('div');
    row.className = 'tab-row';
    row.innerHTML = Object.keys(HUB_TABS).map(k=>
      `<button class="tab-btn${k===tab?' sel':''}" data-tab="${k}">${HUB_TABS[k].ic} ${HUB_TABS[k].label}</button>`).join('');
    sheetContent.prepend(row);
    for(const b of Array.from(row.querySelectorAll('[data-tab]')) as HTMLElement[]){
      b.addEventListener('click', ()=>renderHubSheet(b.dataset.tab!));
    }
  }});
}
export function renderResearchTab(){
  sheetContent.innerHTML = `
    <div class="sheet-sub">Knowledge grows at the Town Center along the ancient oak's many branches.</div>
    ${researchPanelHtml()}`;
  bindResearchButtons(()=>renderHubSheet('research'));
}
export function renderJournalSheet(){
  sheetContent.innerHTML = `
    <div class="sheet-sub">📖 <b>Hold Journal</b> — Peak settlers: ${G.journal.peakPopulation} · Days: ${G.journal.daysSurvived} · Winters: ${G.journal.wintersEndured} · Buildings raised: ${G.journal.buildingsRaised} · Settlers welcomed: ${G.journal.settlersWelcomed} · Wolf raids survived: ${G.journal.wolvesSurvived}${G.journal.passed?' · Passed on: '+G.journal.passed:''}</div>
    ${(()=>{ const g=Object.keys(GUILD_DEFS).filter(r=>G.guilds[r]); return g.length?`<div class="sheet-sub" style="margin-top:6px;"><b>⚜️ Guilds</b> — ${g.map(r=>GUILD_DEFS[r].ic+' '+GUILD_DEFS[r].name).join(' · ')} <span style="opacity:.7">(+${Math.round(guildBonusVal()*100)}% each)</span></div>`:''; })()}
    <div class="sheet-sub" style="margin:8px 0 2px;"><b>🏅 Deeds</b> — ${Object.keys(G.deeds).length} of ${DEED_DEFS.length} earned</div>
    <div class="deed-grid">
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
  if(hc) hc.addEventListener('click', ()=>dep.exportHoldCard());
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
export function renderChronicleSheet(){
  const tier = HOLD_TIERS[getTier()] || { ic: '🏕️', name: 'Hold' };
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
export function renderStatsSheet(){
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
    ${G.festivalBoon ?(()=>{const b=FESTIVAL_BOONS.find(x=>x.id===G.festivalBoon);return b?`<div class="sheet-sub" style="margin-top:8px;">${b.ic} <b>${b.name}</b> — this year's festival blessing. ${b.desc}</div>`:'';})():''}
    <div class="sheet-sub" style="margin-top:8px;">Peak settlers <b>${G.journal.peakPopulation}</b> · Days survived <b>${G.journal.daysSurvived}</b> · Winters endured <b>${G.journal.wintersEndured}</b></div>
    <div class="sheet-sub">Buildings raised <b>${G.journal.buildingsRaised}</b> · Settlers welcomed <b>${G.journal.settlersWelcomed}</b> · Raids survived <b>${G.wolfEvents}</b>${G.journal.weddings?` · Weddings <b>${G.journal.weddings}</b>`:''}${G.journal.childrenBorn?` · Children born <b>${G.journal.childrenBorn}</b>`:''}${G.journal.passed?` · Passed on <b>${G.journal.passed}</b>`:''}</div>`;
}

let inboxFilter = 'all';
export function renderInboxSheet(){
  const CATS = { all:'All', raid:'⚔ Raids', folk:'👥 Folk', build:'🏗 Building', general:'✦ Other' };
  const shown = eventLog.slice().reverse().filter(e=> inboxFilter==='all' || e.cat===inboxFilter);
  sheetContent.innerHTML = `
    <div class="sheet-sub">The hold's recent tidings — newest first.</div>
    <div class="roster-sort">
      ${Object.keys(CATS).map(c=>`<button class="chip${c===inboxFilter?' sel':''}" data-hitslop="6" data-cat="${c}">${CATS[c]}</button>`).join('')}
    </div>
    <div class="roster-list">
      ${shown.length ? shown.map(e=>`<div class="inbox-row${e.warn?' warn':''}">
          <span class="ib-day">Day ${e.day}</span>
          <span class="ib-msg">${e.msg}</span>
        </div>`).join('') : '<div class="sheet-sub" style="opacity:.7;">No tidings of this kind yet.</div>'}
    </div>`;
  sheetAll('[data-cat]').forEach(b=>b.addEventListener('click', ()=>{ inboxFilter=b.dataset.cat; renderInboxSheet(); }));
}
export function openFestivalChoice(){
  sfx('open');
  toast('🎊 A new year dawns — the hold gathers for its festival!');
  sheetNav.push({ id:'festival', title:'🎊 The Year\'s Festival', render(){
    sheetContent.innerHTML = `
      <div class="sheet-sub">A new year turns over the valley. The folk gather — choose the blessing that will guide the hold until next spring.</div>
      ${G.festivalBoon ?`<div class="sheet-sub" style="opacity:.75;">Last year's blessing: ${(FESTIVAL_BOONS.find(b=>b.id===G.festivalBoon)||{}).name||'—'}.</div>`:''}
      <div class="roster-list" style="margin-top:8px;">
        ${FESTIVAL_BOONS.map(b=>`<button class="action-btn list-row" data-boon="${b.id}">
          <span style="font-size:22px;">${b.ic}</span>
          <span><b>${b.name}</b><br><span style="font-size:11.5px;opacity:.8;">${b.desc}</span></span>
        </button>`).join('')}
      </div>`;
    sheetAll('[data-boon]').forEach(btn=>btn.addEventListener('click', ()=>{
      const b = FESTIVAL_BOONS.find(x=>x.id===btn.dataset.boon); if(!b) return;
      G.festivalBoon = b.id;
      startEvent('festival', 55); // a real feast to mark it
      toast(b.ic+' '+b.name+' — the hold rejoices!'); sfx('festival');
      chron('festival', b.name);
      sfx('tap');
      deselectAll();
    }));
  }});
}
