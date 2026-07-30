/* The heads-up display, and the toasts that scroll past it.
 *
 * Everything here writes to the DOM around the canvas rather than to the canvas
 * itself: the resource pills, the clock strip, the day tint, and the transient
 * messages the hold sends the player.
 *
 * `toast` is the reason this module comes before the rest of the UI. Twelve
 * simulation modules report to the player, and every one of them was being
 * handed `toast` through its init() — not because the coupling was wanted, but
 * because there was nowhere to import it from. There is now.
 *
 * The HUD reserves its own space rather than trusting hard-coded offsets. Those
 * silently broke every time a button was added to the row.
 */
import { G } from './state';
import { fmt } from './math';
import { GAME_MODES, HOLD_TIERS } from './defs';
import { DAY_LEN, CYCLE_LEN, dayPhaseFrac, seasonName } from './time';
import { capFor } from './economy';
import { popCapacity } from './buildings';
import { getTier } from './progress';
import { getWeather } from './weather';
import { sfx } from './audio';

/* The two things the clock strip says that this module cannot work out for
   itself: which game mode is running, and how much of the goal list is done. */
type Deps = { gameModeId: () => string; questProgress: () => { done: number; seen: number } };
let dep: Deps = { gameModeId: () => 'settler', questProgress: () => ({ done: 0, seen: 0 }) };
export function initHud(deps: Deps): void { dep = deps; }

/* ── TOASTS ── */

export type LogEntry = { msg: string; warn: boolean; day: number; cat: string };

/** Recent toasts, re-readable from the Journal → Events inbox. Capped at 40. */
export const eventLog: LogEntry[] = [];

/** Sort a toast into an inbox category from its own text. Tagging ~100 call
 *  sites by hand would have been the alternative, and would have drifted. */
export function eventCategory(msg: string): string {
  if (/🏴|🐺|bandit|raid|wolves|wolf/i.test(msg)) return 'raid';
  if (/🔥|🪣|💧|fire|ablaze|blaze|burned|burns/i.test(msg)) return 'build';
  if (/🔨|🏗|raise|disrepair|repair|building|bridge|granary|tower|palisade|manor|house|tavern|bakery/i.test(msg)) return 'build';
  if (/joins|left|lost heart|has fallen ill|wed|married|born|of age|passed|grieic|💔|💞|👶|🕯|settler|villager|elder/i.test(msg)) return 'folk';
  return 'general';
}

/** A message from the hold. Logged first, so a toast that scrolls past unseen is
 *  still readable in the inbox afterwards. */
export function toast(msg: string, warn?: boolean): void {
  eventLog.push({ msg, warn: !!warn, day: G.dayCount, cat: eventCategory(msg) });
  if (eventLog.length > 40) eventLog.shift();
  if (warn) sfx('warn');
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast' + (warn ? ' warn' : '');
  el.textContent = msg;
  container.appendChild(el);
  // Keep the stack short and compact — drop the oldest beyond three.
  while (container.children.length > 3) container.removeChild(container.firstChild!);
  requestAnimationFrame(() => el.classList.add('show'));
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  };
  // Tap to dismiss immediately; otherwise auto-clear well within three seconds.
  el.style.cursor = 'pointer';
  el.addEventListener('click', dismiss);
  setTimeout(dismiss, 2200);
}

/* ── THE PILLS ── */

/* Looked up once. The resource row is in the shell HTML and never rebuilt, so
   re-querying six ids sixty times a second is pure waste. */
let refs: Record<string, HTMLElement | null> | null = null;
function hudRefs() {
  if (!refs) {
    const id = (s: string) => document.getElementById(s);
    refs = {
      wood: id('res-wood'), stone: id('res-stone'), food: id('res-food'),
      pop: id('res-pop'), cap: id('res-cap'),
      capWood: id('cap-wood'), capStone: id('cap-stone'), capFood: id('cap-food'),
      planks: id('res-planks'), capPlanks: id('cap-planks'),
      bread: id('res-bread'), capBread: id('cap-bread'),
      flour: id('res-flour'), capFlour: id('cap-flour'),
      coins: id('res-coins'), badge: id('idle-badge'),
    };
  }
  return refs;
}
/** Forget the cached element lookups. Only needed if the shell HTML is ever
 *  rebuilt under us; kept so a test can force a re-query. */
export function resetHudRefs(): void { refs = null; }

const setText = (el: HTMLElement | null, s: string) => { if (el) el.textContent = s; };

export function updateHud(): void {
  const R = hudRefs();
  setText(R.wood, fmt(G.stockpile.wood));
  setText(R.stone, fmt(G.stockpile.stone));
  setText(R.food, fmt(G.stockpile.food));
  setText(R.capWood, '/' + capFor('wood'));
  setText(R.capStone, '/' + capFor('stone'));
  setText(R.capFood, '/' + capFor('food'));
  setText(R.planks, fmt(G.stockpile.planks || 0));
  setText(R.capPlanks, '/' + capFor('planks'));
  setText(R.flour, fmt(G.stockpile.flour || 0));
  setText(R.capFlour, '/' + capFor('flour'));
  setText(R.bread, fmt(G.stockpile.bread || 0));
  setText(R.capBread, '/' + capFor('bread'));
  setText(R.coins, fmt(G.coins));
  setText(R.pop, String(G.villagers.length));
  setText(R.cap, '/' + popCapacity());
  // Attention badge: settlers standing idle who could be at work.
  const idleCount = G.villagers.filter((v: any) => v.role === 'idle' && v.state !== 'spawning').length;
  if (R.badge) {
    if (idleCount > 0) { R.badge.style.display = 'block'; R.badge.textContent = String(idleCount); }
    else R.badge.style.display = 'none';
  }
  updateDayTint();
}

/* ── THE CLOCK STRIP AND THE DAY TINT ── */

let tintEls: { tint: HTMLElement | null; phase: HTMLElement | null; clock: HTMLElement | null } | null = null;

export function updateDayTint(): void {
  if (!tintEls) {
    tintEls = {
      tint: document.getElementById('daytint'),
      phase: document.getElementById('phase-label'),
      clock: document.querySelector('#clock'),
    };
  }
  const f = dayPhaseFrac();
  let color: string, label: string;
  if (f < DAY_LEN / CYCLE_LEN) {
    const df = f / (DAY_LEN / CYCLE_LEN);
    if (df < 0.12) { color = 'rgba(120,90,150,0.30)'; label = 'Dawn'; }
    else if (df < 0.8) { color = 'rgba(255,255,255,0)'; label = 'Day'; }
    else { color = 'rgba(200,110,60,0.18)'; label = 'Dusk'; }
  } else {
    color = 'rgba(10,16,40,0.18)'; label = 'Night';
  }
  if (tintEls.tint) tintEls.tint.style.backgroundColor = color;
  setText(tintEls.phase, label);
  const tier = HOLD_TIERS[getTier()];
  const modeId = dep.gameModeId();
  // Written into the clock's FIRST text node, not its innerHTML — the element
  // also holds the phase label and the weather glyph as children.
  if (tintEls.clock && tintEls.clock.childNodes[0]) {
    tintEls.clock.childNodes[0].nodeValue =
      (G.holdName && G.holdName !== 'Oakenfall' ? G.holdName + ' · ' : '') +
      (modeId !== 'settler' ? (GAME_MODES as any)[modeId].name + ' · ' : '') +
      tier.ic + ' ' + tier.name + ' · Day ' + G.dayCount + ' · ' + seasonName() + ' ' +
      getWeather().ic + (G.climate ? ' ' + G.climate.ic : '') + ' · ';
  }
  const q = dep.questProgress();
  const dot = document.getElementById('quest-dot');
  if (dot) dot.classList.toggle('hidden', q.done >= q.seen);
}

/* ── ROOM FOR THE HUD ── */

/** Measure the right-hand button cluster (and the minimap under it) and reserve
 *  exactly that much room for the scrolling resource row, publishing the result
 *  as CSS custom properties. Hard-coded values broke whenever a HUD button was
 *  added; this cannot. */
export function updateHudReserve(): void {
  try {
    const right = document.getElementById('hud-right');
    if (!right) return;
    const rw = right.getBoundingClientRect().width || 0;
    const mm = document.getElementById('minimap-wrap');
    const mw = (mm && !mm.classList.contains('hidden')) ? (mm.getBoundingClientRect().width || 0) : 0;
    // In landscape the minimap sits beside the buttons; in portrait it's below.
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    const reserve = Math.ceil(Math.max(rw, landscape ? Math.max(rw, mw) : rw) + 16);
    document.documentElement.style.setProperty('--hud-reserve', reserve + 'px');
    // Publish where the stores actually end, so the clock and the minimap can
    // sit below them — the row's height changes when it wraps or is expanded,
    // and fixed offsets used to drive the clock straight through the pills.
    const bar = document.getElementById('hud-top');
    if (bar) {
      let bottom = bar.getBoundingClientRect().bottom;
      for (const p of bar.querySelectorAll('.pill')) bottom = Math.max(bottom, p.getBoundingClientRect().bottom);
      document.documentElement.style.setProperty('--hud-bottom', Math.ceil(bottom) + 'px');
    }
  } catch (e) {}
}
