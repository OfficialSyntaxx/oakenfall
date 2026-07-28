/* Weather, climate spells and blight.
 *
 * Three layers over the same valley. Weather is rolled fresh each dawn and
 * weighted by season. A climate spell is a multi-day mood — a drought, a cold
 * snap, a fair spell — laid over the top. Blight is a sickness that starts in a
 * few settlers and spreads between those standing close.
 *
 * Pure simulation: no canvas, no DOM. It reports what happened through the
 * callbacks handed to initWeather(), rather than reaching for main.ts's
 * toast/chron/sfx directly.
 *
 * Today's weather is deliberately NOT saved. Reloading a hold gives it a fresh
 * sky, which is the existing behaviour and a kind one — nobody wants to reload
 * back into the storm they just left.
 */
import { G } from './state';
import { dist2 } from './math';
import { WEATHER_TABLE } from './defs';
import { seasonIndex } from './time';

export interface WeatherDef { type: string; label: string; ic: string; }

export const WEATHER_DEFS: WeatherDef[] = [
  { type: 'clear', label: 'Clear',     ic: '☀️' },
  { type: 'rain',  label: 'Rain',      ic: '🌧️' },
  { type: 'storm', label: 'Storm',     ic: '⛈️' },
  { type: 'snow',  label: 'Snowfall',  ic: '🌨️' },
];

/** Multi-day conditions with real bite. `farm` and the rest are multipliers,
 *  so they sit either side of 1 — a drought at 0.6 is fields withering. That
 *  0.6 spent five versions as 22.6 after a stray edit in an unrelated commit,
 *  turning the game's worst weather into a twenty-two-fold harvest bonus, so:
 *  if a number here leaves the 0.4–1.4 band, it is a typo, not a design. */
export const CLIMATE_DEFS: Record<string, any> = {
  drought:  { ic: '🏜️', name: 'Drought',    farm: 0.6, fire: 1.8, hunger: 1.0,  fatigue: 1.0, morale: -4, seasons: [1, 2] },
  coldsnap: { ic: '🥶', name: 'Cold Snap',  farm: 0.8, fire: 0.4, hunger: 1.25, fatigue: 1.2, morale: -4, seasons: [2, 3] },
  fair:     { ic: '🌤️', name: 'Fair Spell', farm: 1.2, fire: 0.8, hunger: 1.0,  fatigue: 0.9, morale: 5,  seasons: [0, 1, 2] },
};

let weather: WeatherDef = { type: 'clear', label: 'Clear', ic: '☀️' };
export function getWeather(): WeatherDef { return weather; }
export function setWeather(type: string): void {
  const d = WEATHER_DEFS.find((x) => x.type === type);
  if (d) weather = { type: d.type, label: d.label, ic: d.ic };
}

type Deps = {
  toast: (msg: string, urgent?: boolean) => void;
  chron: (type: string, a?: any) => void;
  sfx: (name: string) => void;
  /** Iron Winter runs its own weather and skips climate spells entirely. */
  forceWinter: () => boolean;
};
let d: Deps = { toast: () => {}, chron: () => {}, sfx: () => {}, forceWinter: () => false };
export function initWeather(deps: Deps): void { d = deps; }

/** Rolled each dawn, weighted by the season. */
export function rollWeather(): void {
  const w = WEATHER_TABLE[seasonIndex()];
  const r = Math.random();
  let acc = 0, pick = 0;
  for (let i = 0; i < 4; i++) { acc += w[i]; if (r < acc) { pick = i; break; } }
  const prev = weather.type;
  weather = WEATHER_DEFS[pick];
  if (weather.type !== 'clear' && weather.type !== prev) {
    const msgs: Record<string, string> = {
      rain: '🌧️ Rain sweeps in — crops drink deep, boots drag in the mud.',
      storm: '⛈️ A storm batters the hold — stay near shelter!',
      snow: '🌨️ Snow falls softly over Oakenfall.',
    };
    d.toast(msgs[weather.type]);
  }
}

export function rollClimate(): void {
  if (G.climate) {
    if (G.dayCount >= G.climate.endsDay) {
      d.toast(G.climate.ic + ' The ' + CLIMATE_DEFS[G.climate.type].name.toLowerCase() + ' has broken.');
      G.climate = null;
    }
    return;
  }
  if (d.forceWinter()) return;                          // Iron Winter is its own climate
  if (G.dayCount <= 3 || Math.random() > 0.16) return;  // uncommon
  const s = seasonIndex();
  const options = Object.keys(CLIMATE_DEFS).filter((k) => CLIMATE_DEFS[k].seasons.includes(s));
  if (!options.length) return;
  const type = options[Math.floor(Math.random() * options.length)];
  const def = CLIMATE_DEFS[type];
  G.climate = { type, ic: def.ic, name: def.name, endsDay: G.dayCount + 2 + Math.floor(Math.random() * 2) };
  const blurb: Record<string, string> = {
    drought: '🏜️ A drought settles over the valley — fields wither and timber turns tinder-dry. Mind the fire.',
    coldsnap: '🥶 A cold snap grips the hold — folk burn through food and tire fast. Keep the stores full.',
    fair: '🌤️ A spell of fair weather blesses the valley — crops thrive and hearts lift.',
  };
  d.toast(blurb[type], type !== 'fair');
  d.chron('climate', def.name);
}

/* ── BLIGHT ── several settlers fall ill at once, and it spreads between those
   standing close while it lasts. Herbal Lore softens it; a Healer clears the
   currently sick. */
export function rollPlague(): void {
  if (G.plague) {
    if (G.dayCount >= G.plague.endsDay) {
      G.plague = null;
      d.toast('🌿 The sickness has run its course — the hold breathes easier.');
    }
    return;
  }
  if (G.dayCount <= 4 || G.villagers.length < 5) return;
  if (Math.random() > 0.09) return;   // rare
  G.plague = { endsDay: G.dayCount + 2 + Math.floor(Math.random() * 2) };
  const frac = G.researched.herbs ? 0.18 : 0.32;
  const healthy = G.villagers.filter((v: any) => !v.sick && v.stage !== 'child');
  const target = Math.max(1, Math.round(healthy.length * frac));
  let n = 0;
  for (let i = 0; i < target && healthy.length; i++) {
    const v = healthy.splice(Math.floor(Math.random() * healthy.length), 1)[0];
    v.sick = true;
    v.sickTimer = (25 + Math.random() * 20) * (G.researched.herbs ? 0.6 : 1);
    n++;
  }
  d.toast('🤢 A blight sweeps the hold — ' + n + ' settler' + (n > 1 ? 's' : '') +
    ' have fallen ill! Seek a healer, and keep the sick from crowding.', true);
  d.sfx('blight');
  d.chron('plague');
}

export function plagueTick(dt: number): void {
  if (!G.plague) return;
  const sick = G.villagers.filter((v: any) => v.sick);
  if (!sick.length) return;
  const spread = (G.researched.herbs ? 0.02 : 0.05) * dt;
  for (const v of G.villagers) {
    if (v.sick || v.stage === 'child') continue;
    for (const s of sick) {
      if (dist2(v.gx, v.gy, s.gx, s.gy) < 4) {
        if (Math.random() < spread) {
          v.sick = true;
          v.sickTimer = (25 + Math.random() * 20) * (G.researched.herbs ? 0.6 : 1);
        }
        break;
      }
    }
  }
}

export function climateFarmMul(): number { return G.climate ? CLIMATE_DEFS[G.climate.type].farm : 1; }
export function climateFireMul(): number { return G.climate ? CLIMATE_DEFS[G.climate.type].fire : 1; }
export function climateHungerMul(): number { return G.climate ? CLIMATE_DEFS[G.climate.type].hunger : 1; }
export function climateFatigueMul(): number { return G.climate ? CLIMATE_DEFS[G.climate.type].fatigue : 1; }
export function weatherMoveMul(): number { return weather.type === 'storm' ? 0.8 : (weather.type === 'rain' ? 0.9 : 1); }
export function weatherFarmMul(): number { return (weather.type === 'rain' ? 1.25 : 1) * climateFarmMul(); }
export function weatherFatigueMul(): number { return weather.type === 'storm' ? 1.2 : 1; }
