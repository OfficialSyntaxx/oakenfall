/* The Redeem sheet, and the developer panel hidden behind it.
 *
 * Redeem is the player-facing half: paste a code bought on the website, and
 * unlocks.ts verifies it on the device. The admin panel is the other half — a
 * promo code reveals it, and from then on it is one button away.
 *
 * It exists for two reasons beyond convenience. Several systems take an hour of
 * play to reach honestly (mastery, guilds, a third winter), and the automated
 * suites drive this panel to reach them in seconds — which is why it is worth
 * saying that every grant here goes through the SAME code path the game uses.
 * A button that fakes its effect proves nothing, and one of them used to: the
 * fire grant filtered buildings by name while igniteBuilding filters by
 * FLAMMABLE, so it could land on stone, do nothing, and report success.
 */
import { G } from './state';
import { TECH_TREE, UNLOCK_SKUS } from './defs';
import { toast } from './hud';
import { sheetContent, sheetNav, sheetAll } from './sheet';
import { CYCLE_LEN, DAY_LEN, SEASON_LEN } from './time';
import { ADMIN } from './admin';
import { ADMIN_PROMO, hasUnlock, isPatron, redeemCode, saveUnlocks,
         applyPatronBanners } from './unlocks';
import { capFor } from './economy';
import { setWeather } from './weather';
import { recomputeGuilds } from './skills';
import { launchRaid, raidEntryPoint } from './raiders';
import { FLAMMABLE, igniteBuilding } from './fire';
import { sfx } from './audio';

/* Three things the panel needs from the run itself: how a settler is brought
   into the world, and whether there is a hold to save afterwards. */
type Deps = { spawnVillager: () => any; saveIfRunning: () => void };
let dep: Deps = { spawnVillager: () => null, saveIfRunning: () => {} };
export function initAdminPanel(deps: Deps): void { dep = deps; }

export function renderRedeemSheet(){
  const owned = Object.keys(UNLOCK_SKUS).filter(hasUnlock);
  sheetContent.innerHTML = `
    <div class="sheet-sub">Bought a pack on the Oakenfall website? Paste your code below to unlock it here. Codes are verified on your device — the game never goes online.</div>
    ${G.unlocks._admin ? `<button class="action-btn primary" id="admin-open" style="margin:2px 0 8px;">🛠️ Open Admin Panel</button>` : ''}
    <input id="redeem-input" class="redeem-input" type="text" autocomplete="off" spellcheck="false" placeholder="OAK-…  (paste your code)" aria-label="Redeem code">
    <button class="action-btn primary" id="redeem-go" style="margin-top:6px;">🎁 Redeem</button>
    <div id="redeem-msg" class="sheet-sub" style="margin-top:6px;"></div>
    <div class="sheet-sub" style="margin-top:10px;"><b>Your unlocks</b></div>
    <div class="roster-list">
      ${owned.length ? owned.map((s: string)=>`<div class="inbox-row"><span class="ib-day">${(UNLOCK_SKUS as any)[s].ic}</span><span class="ib-msg"><b>${(UNLOCK_SKUS as any)[s].name}</b> — ${(UNLOCK_SKUS as any)[s].desc}</span></div>`).join('')
        : '<div class="sheet-sub" style="opacity:.7;">No unlocks yet. Support the hold from the website to receive a code.</div>'}
    </div>
    ${isPatron() ? `<div class="sheet-sub" style="margin-top:8px;color:var(--amber)">✦ Patron of Oakenfall${G.unlocks._patronName?' — '+G.unlocks._patronName:''}. Thank you.</div>` : ''}`;
  const input = document.getElementById('redeem-input') as HTMLInputElement;
  const msg = document.getElementById('redeem-msg')!;
  const adminOpen = document.getElementById('admin-open');
  if(adminOpen) adminOpen.addEventListener('click', ()=>{ sheetNav.push({ id:'admin', title:'🛠️ Admin Panel', render:()=>renderAdminSheet() }); });
  document.getElementById('redeem-go')!.addEventListener('click', async ()=>{
    // Hidden admin unlock: a special promo code opens the developer panel.
    if(String(input.value||'').trim() === ADMIN_PROMO){
      G.unlocks._admin = true; saveUnlocks();
      sfx('tier');
      sheetNav.push({ id:'admin', title:'🛠️ Admin Panel', render:()=>renderAdminSheet() });
      return;
    }
    msg.textContent = 'Checking…'; msg.style.color = 'var(--parchment-dim)';
    const r: any = await redeemCode(input.value);
    if(r.ok){
      msg.style.color = '#8fc46a';
      msg.textContent = r.already ? '✓ '+r.name+' is already yours.' : '✓ Unlocked '+r.name+'! Thank you for supporting Oakenfall.';
      if(!r.already) sfx('tier');
      renderRedeemSheet();
    } else {
      msg.style.color = '#e8b2a4'; msg.textContent = '✗ '+r.reason;
    }
  });
}
export function adminGrant(kind: string){
  const bump = (k: string, n: number)=>{ G.stockpile[k] = (G.stockpile[k]||0) + n; };
  const toDawn = ()=>{ G.worldTime = Math.floor(G.worldTime/CYCLE_LEN)*CYCLE_LEN + 30; };
  const toNight = ()=>{ G.worldTime = Math.floor(G.worldTime/CYCLE_LEN)*CYCLE_LEN + DAY_LEN + 20; };
  switch(kind){
    // ── Economy ──
    case 'res': ['wood','stone','food','planks','flour','bread'].forEach(k=>bump(k,500)); toast('🛠️ +500 of every resource.'); break;
    case 'coins': G.coins += 1000; toast('🛠️ +1000 coins.'); break;
    case 'coinsBig': G.coins += 10000; toast('🛠️ +10,000 coins.'); break;
    case 'craftClear': ['planks','flour','bread'].forEach(k=>{ G.stockpile[k]=0; }); toast('🛠️ Crafted stores emptied.'); break;
    case 'maxout': ['wood','stone','food','planks','flour','bread'].forEach(k=>{ G.stockpile[k] = capFor(k); }); toast('🛠️ Stores filled to capacity.'); break;
    // ── Progress / unlocks ──
    case 'tech': TECH_TREE.forEach(t=>{ G.researched[t.id] = true; }); G.activeResearch = null; toast('🛠️ All research unlocked.'); break;
    case 'cosmetics': Object.keys(UNLOCK_SKUS).forEach(s=>{ G.unlocks[s]=true; }); applyPatronBanners(); saveUnlocks(); toast('🛠️ All cosmetic packs unlocked.'); break;
    // ── Population ──
    case 'settlers': for(let i=0;i<5;i++) dep.spawnVillager(); toast('🛠️ +5 settlers summoned.'); break;
    case 'settler1': dep.spawnVillager(); toast('🛠️ A settler joins.'); break;
    case 'morale': G.villagers.forEach(v=>{ v.morale = 100; }); toast('🛠️ Every settler is content.'); break;
    /* Mastery takes ~420 seconds of steady work in a trade, so guilds are all
       but unreachable in a test run. Granting it outright is the only way to
       exercise them without playing for an hour. */
    case 'master': G.villagers.forEach(v=>{ if(v.role && v.role!=='idle'){ v.skills = v.skills||{}; v.skills[v.role] = 500; } });
                   recomputeGuilds(true); toast('🛠️ Every settler is a Master of their trade.'); break;
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
    case 'raid':   launchRaid(4, true, raidEntryPoint(G.buildings.filter(b=>b.type==='bridge'))); toast('🛠️ Raiders incoming!'); sfx('raid'); break;
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
  if(kind!=='raid') sfx('tier');
  dep.saveIfRunning();
  if(sheetContent.querySelector('[data-admin]')) renderAdminSheet(); // refresh toggle labels
}
export function renderAdminSheet(){
  const sect = (title: string, rows: string[][])=>`<div class="sheet-sub" style="margin:10px 0 4px;"><b>${title}</b></div><div class="roster-list">${
    rows.map(([k,label])=>`<button class="action-btn list-row" data-admin="${k}" style="text-align:left;">${label}</button>`).join('')}</div>`;
  const onoff = (b: boolean)=> b ? ' ✓' : '';
  sheetContent.innerHTML = `
    <div class="sheet-sub">Developer tools. Changes apply to your hold immediately. Use freely — this is your sandbox.</div>
    ${sect('💰 Economy', [['res','📦 +500 of every resource'],['maxout','🏺 Fill all stores to cap'],['craftClear','🧹 Empty crafted stores'],['coins','💰 +1,000 coins'],['coinsBig','💰 +10,000 coins']])}
    ${sect('🌤️ Weather', [['wClear','☀️ Clear'],['wRain','🌧️ Rain'],['wStorm','⛈️ Storm + lightning'],['wSnow','🌨️ Snowfall']])}
    ${sect('🕰️ Time', [['tDawn','🌅 Jump to dawn'],['tNight','🌙 Jump to night'],['tDay','📅 Advance one day'],['tSeason','🍂 Advance one season']])}
    ${sect('👥 Population', [['settler1','🚶 Summon 1 settler'],['settlers','👥 Summon 5 settlers'],['morale','😊 All morale to 100'],['heal','❤️ Heal, feed & rest all'],['master','★ Master every trade']])}
    ${sect('🔓 Unlocks', [['tech','🔬 Unlock all research'],['cosmetics','🎁 Unlock all cosmetic packs']])}
    ${sect('🔥 Hazards', [['raid','🏴 Trigger a raid'],['fire','🔥 Start a fire'],['douse','🪣 Douse all fires'],['decay','🏚️ Wear every building down']])}
    ${sect('🐛 Toggles', [['freeze','🧊 Freeze hunger/fatigue'+onoff(ADMIN.freezeNeeds)],['noraid','🛡️ Block raids'+onoff(ADMIN.noRaids)],['debug','📊 Debug overlay'+onoff(ADMIN.debug)]])}
    <div class="sheet-sub" style="margin-top:10px;opacity:.7;">Reach this panel any time from 🎁 Redeem once unlocked.</div>`;
  sheetAll('[data-admin]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ adminGrant(btn.dataset.admin!); });
  });
}
