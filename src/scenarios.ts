/* An optional end-goal for the hold, and the notice for reaching it.
 *
 * These close over live game state, which is why they are here rather than in
 * the definition tables — each one is a predicate over G plus a line of progress
 * text for the start screen and the debug snapshot.
 *
 * Reaching a goal is a moment, not a wall. The notice congratulates, offers a
 * chronicle card to keep, and then gets out of the way: the hold continues
 * exactly as it stands, and nothing ends unless the player decides it does.
 * That is deliberate — a city-builder that takes your city away when you win
 * has punished you for playing it well.
 */
import { G } from './state';
import { HOLD_TIERS } from './defs';
import { toast } from './hud';
import { seasonName } from './time';
import { getTier } from './progress';
import { chron } from './chronicle';
import { sfx } from './audio';

/* The chronicle card is painted onto an offscreen canvas by main.ts. */
type Deps = { exportHoldCard: () => void };
let dep: Deps = { exportHoldCard: () => {} };
export function initScenarios(deps: Deps): void { dep = deps; }

export const SCENARIOS: Record<string, any> = {
  endless:  { name:'Endless',        ic:'♾️', desc:'No set goal. Build the hold you want, for as long as you like.',
              done:()=>false, progress:()=>'' },
  winters:  { name:'Five Winters',   ic:'❄️', desc:'Endure five winters. The cold is the oldest enemy.',
              done:()=>G.journal.wintersEndured>=5, progress:()=>G.journal.wintersEndured+'/5 winters' },
  town:     { name:'Rise to a Town', ic:'🏰', desc:'Grow the hold from outpost to town.',
              done:()=>getTier()>=3, progress:()=>HOLD_TIERS[getTier()].name+' → Town' },
  timber:   { name:'Timber Trade',   ic:'🪚', desc:'Saw 300 planks — a hold that exports is a hold that lasts.',
              done:()=>(G.totals.planks||0)>=300, progress:()=>Math.floor(G.totals.planks||0)+'/300 planks' },
  bulwark:  { name:'Bulwark',        ic:'🛡️', desc:'Drive off eight raids without losing the hold.',
              done:()=>(G.journal.raidsRepelled||0)>=8, progress:()=>(G.journal.raidsRepelled||0)+'/8 raids repelled' },
};
export function checkScenario(){
  if(G.scenarioWon || G.scenarioId==='endless') return;
  const sc = SCENARIOS[G.scenarioId];
  if(!sc || !sc.done()) return;
  G.scenarioWon = true;
  showVictory(sc);
}
/* Reaching the goal is a moment, not a wall. The notice congratulates, offers a
   chronicle card to keep, and then either bows out or gets out of the way — the
   hold is never taken away from you. */
export function showVictory(sc: any){
  sfx('tier');
  chron('goal', sc.name);
  toast('🏆 '+sc.ic+' '+sc.name+' — achieved!');
  const wrap = document.createElement('div');
  wrap.id = 'victory-wrap';
  wrap.innerHTML = `
    <div id="victory-card">
      <div class="v-ic">${sc.ic}</div>
      <div class="v-title">${sc.name}</div>
      <div class="v-sub">Achieved on day ${G.dayCount}, ${seasonName()} — ${G.holdName||'Oakenfall'} stands.</div>
      <div class="v-stats">
        <span>👥 ${G.villagers.length} settlers</span>
        <span>🏗️ ${G.journal.buildingsRaised} raised</span>
        <span>❄️ ${G.journal.wintersEndured} winters</span>
        <span>${HOLD_TIERS[getTier()].ic} ${HOLD_TIERS[getTier()].name}</span>
      </div>
      <button class="action-btn primary" id="v-continue">Carry on with the hold</button>
      <button class="action-btn" id="v-card">🖼️ Keep a chronicle card</button>
      <div class="v-note">Your hold continues exactly as it stands. Nothing is ended unless you choose it.</div>
    </div>`;
  document.body.appendChild(wrap);
  const close = ()=>{ wrap.remove(); };
  wrap.querySelector('#v-continue')!.addEventListener('click', close);
  wrap.querySelector('#v-card')!.addEventListener('click', ()=>dep.exportHoldCard());
  // A tap on the dark surround dismisses it, like every other overlay.
  wrap.addEventListener('click', (e)=>{ if(e.target===wrap) close(); });
}
