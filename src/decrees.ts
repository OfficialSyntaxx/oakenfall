/* Standing law: four policies the steward can enact, each a real trade-off.
 *
 * A decree is not an upgrade. Every one of them costs something the player also
 * wants — that is the point, and it is why they toggle freely rather than
 * costing coins to enact. Changing your reign should be a decision you can
 * revisit when the season turns against you.
 *
 * The three multipliers below are the whole of their effect on the simulation.
 * Keeping them here, next to the descriptions that promise them, is what stops
 * the text and the numbers drifting apart: a decree whose blurb says −30% night
 * raids has that −30% four lines away.
 */
import { G } from './state';
import { toast } from './hud';
import { sheetContent, sheetAll } from './sheet';
import { isNight } from './time';
import { sfx } from './audio';

export const DECREE_DEFS = [
  { id: 'curfew', ic: '🌙', name: 'Curfew',
    on: 'Folk stay in after dark — raids are less likely, but spirits chafe.',
    good: '−30% night raid risk', bad: '−5 morale' },
  { id: 'tithe', ic: '💰', name: 'Tithe',
    on: 'A daily levy fills the coffers, at the cost of goodwill.',
    good: '+coins each day', bad: '−6 morale' },
  { id: 'openGates', ic: '🚪', name: 'Open Gates',
    on: 'Word spreads that all are welcome — newcomers arrive faster, but the hold is easier to reach.',
    good: 'faster immigration', bad: '+20% raid risk' },
  { id: 'rationing', ic: '🥣', name: 'Rationing',
    on: 'Careful portions stretch the stores, but hungry work is slow work.',
    good: 'food lasts 20% longer', bad: '−6% work speed' },
];

/** Curfew only helps at night — it is a rule about being indoors after dark, so
 *  it does nothing to a raid that comes at noon. */
export function decreeRaidMul(): number {
  let m = 1;
  if (G.decrees.curfew && isNight()) m *= 0.7;
  if (G.decrees.openGates) m *= 1.2;
  return m;
}
export function decreeHungerMul(): number { return G.decrees.rationing ? 0.8 : 1; }
export function decreeWorkMul(): number { return G.decrees.rationing ? 0.94 : 1; }

/** How many are in force — the Goals tab shows this on its Decrees button. */
export function decreesInForce(): number { return Object.values(G.decrees).filter(Boolean).length; }

export function renderDecreesSheet(): void {
  sheetContent.innerHTML = `
    <div class="sheet-sub">Lasting laws for the hold. Each is a trade-off — enact what suits your reign, and change your mind whenever you like.</div>
    <div class="roster-list" style="margin-top:8px;">
      ${DECREE_DEFS.map((d) => {
        const on = !!G.decrees[d.id];
        return `<button class="action-btn list-row${on ? '' : ' dim'}" data-decree="${d.id}" style="align-items:flex-start;">
          <span style="font-size:20px;">${d.ic}</span>
          <span style="flex:1;"><b>${d.name}</b> <span style="color:${on ? '#8fc46a' : 'var(--parchment-dim)'};font-size:11.5px;">${on ? '● Enacted' : '○ Off'}</span><br>
          <span style="font-size:11.5px;opacity:.85;">${d.on}</span><br>
          <span style="font-size:11px;color:#8fc46a;">▲ ${d.good}</span> &nbsp; <span style="font-size:11px;color:#e8b2a4;">▼ ${d.bad}</span></span>
        </button>`;
      }).join('')}
    </div>`;
  for (const btn of sheetAll('[data-decree]')) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.decree!;
      G.decrees[id] = !G.decrees[id];
      const d = DECREE_DEFS.find((x) => x.id === id)!;
      toast(d.ic + ' ' + d.name + (G.decrees[id] ? ' enacted.' : ' repealed.'));
      sfx('tap');
      renderDecreesSheet();      // in place: the toggle's own state is the view
    });
  }
}
