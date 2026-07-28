/* The clock and the calendar.
 *
 * Everything that turns — the day/night cycle, the seasons, and the handful of
 * multipliers the world hangs off them. Pure functions over `G.worldTime`, with
 * no canvas and no DOM, which is why this is the first piece of the simulation
 * that could leave main.ts cleanly.
 *
 * One wrinkle: the Endless Winter game mode pins the season, and game modes are
 * chosen in main.ts. An imported binding is read-only to this module, so rather
 * than reaching for the mode we are told about it — setForceWinter() is called
 * wherever the mode is set. That is the same shape as initIsoKit/setKitTime:
 * push state in, do not try to import a mutable.
 */
import { G } from './state';
import { SEASON_NAMES } from './defs';

/** A day is longer than the night that follows it — the hold is meant to be
 *  worked in the light and endured in the dark, not split evenly. */
export const DAY_LEN = 260;
export const NIGHT_LEN = 160;
export const CYCLE_LEN = DAY_LEN + NIGHT_LEN;
/** Three full day/night cycles to a season, so a year is twelve. */
export const SEASON_LEN = CYCLE_LEN * 3;

let forceWinter = false;
/** Endless Winter pins the season; called wherever the game mode is set. */
export function setForceWinter(on: boolean): void { forceWinter = on; }

/** 0 Spring · 1 Summer · 2 Autumn · 3 Winter */
export function seasonIndex(): number {
  if (forceWinter) return 3;
  return Math.floor(G.worldTime / SEASON_LEN) % 4;
}
export function seasonName(): string { return SEASON_NAMES[seasonIndex()]; }
/** Winter is lean, summer is bountiful. */
export function seasonYieldMul(): number { return seasonIndex() === 3 ? 0.6 : (seasonIndex() === 1 ? 1.15 : 1); }
export function seasonFatigueMul(): number { return seasonIndex() === 3 ? 1.25 : 1; }

/** Deep winter freezes the river solid: anyone can cross — raiders included,
 *  so the moat is gone — and the fish sleep under the ice. */
export function riverFrozen(): boolean { return seasonIndex() === 3; }

/** 0 at dawn, 1 at the end of the following night. */
export function dayPhaseFrac(): number { return (G.worldTime % CYCLE_LEN) / CYCLE_LEN; }
export function isNight(): boolean { return (G.worldTime % CYCLE_LEN) >= DAY_LEN; }

/** 0 = full daylight … 1 = deepest night, ramping smoothly through dawn and
 *  dusk so the lighting pass has something continuous to work with. */
export function darknessFactor(): number {
  const f = dayPhaseFrac();
  const dayFrac = DAY_LEN / CYCLE_LEN;
  if (f < dayFrac) {
    const df = f / dayFrac;
    if (df < 0.10) return 0.55 * (1 - df / 0.10);      // dawn fading out
    if (df > 0.82) return 0.65 * ((df - 0.82) / 0.18); // dusk fading in
    return 0;
  }
  return 0.72;                                          // night
}

/** Where the sun is, as the shadow shear the iso kit wants: leaning and long
 *  at dawn and dusk, tight underfoot at noon, gone at night.
 *  Returns [shear, length] for setSunShadow. */
export function sunShadow(): [number, number] {
  const f = dayPhaseFrac(), dayFrac = DAY_LEN / CYCLE_LEN;
  if (f >= dayFrac) return [0, 1];
  const df = f / dayFrac;              // 0..1 across the day
  const sun = (df - 0.5) * 2;          // -1 sunrise … +1 sunset
  return [-sun * 1.6, 1 + Math.abs(sun) * 1.3];
}
