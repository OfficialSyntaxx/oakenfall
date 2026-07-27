/* Everything the hold sounds like.
 *
 * Two layers, and the order matters: real Kenney RPG samples (CC0) when one
 * exists for a sound, and a tiny procedural WebAudio synth underneath that
 * covers every kind unconditionally. The synth is NOT a placeholder — a sample
 * can fail to load, fail to decode, or be refused by autoplay policy, and the
 * game must still make the noise. Same philosophy as the sprites: assets are an
 * upgrade layer, never a dependency.
 *
 * Music is separate and off by default. It is ~12MB of audio nobody should be
 * made to download to play a city builder on a phone, so it streams from files
 * only once the player asks for it — which conveniently is also the user
 * gesture browsers require before audio may play at all.
 *
 * Self-contained: it owns its own on/off state rather than reading the game's,
 * which is what made it liftable out of main.ts.
 */
import { AUDIO_B64, MUSIC_URLS } from './assets';

/* ── SAMPLES ── bundled locally and service-worker cached, so offline is fine. */
const audioCache: Record<string, HTMLAudioElement> = {};
function playSample(kind: string): boolean {
  const src = AUDIO_B64[kind];
  if(!src || !sfxOn) return false;
  try {
    let el = audioCache[kind];
    if(!el){ el = new Audio(src); el.preload='auto'; audioCache[kind]=el; }
    else { el.currentTime = 0; }
    el.volume = 0.5;
    const p = el.play();
    if(p && p.catch) p.catch(()=>{}); // autoplay-policy rejection is fine — synth already covers this call
    return true;
  } catch(e){ return false; }
}

/* ── MUSIC ── ambient loops, advancing to the next track when one ends. */
const MUSIC_KEYS = Object.keys(MUSIC_URLS).filter(k=>MUSIC_URLS[k]);
let musicOn = false, musicEl: HTMLAudioElement | null = null, musicIdx = 0;
function playCurrentTrack(): void {
  if(!musicOn || !musicEl || !MUSIC_KEYS.length) return;
  try {
    musicEl.src = MUSIC_URLS[MUSIC_KEYS[musicIdx]];
    musicEl.volume = 0.35;
    const p = musicEl.play();
    if(p && p.catch) p.catch(()=>{});
  } catch(e){}
}
export function startMusic(): void {
  if(!MUSIC_KEYS.length) return;
  if(!musicEl){
    musicEl = new Audio();
    musicEl.preload = 'auto';
    musicEl.addEventListener('ended', ()=>{ musicIdx = (musicIdx+1) % MUSIC_KEYS.length; playCurrentTrack(); });
  }
  playCurrentTrack();
}
export function stopMusic(): void { if(musicEl){ try{ musicEl.pause(); }catch(e){} } }

/* ── SYNTH ── the floor under everything. NEVER remove. */
let AC: any = null, sfxOn = true;
function ac(): any { if(!AC){ try{ AC=new ((window as any).AudioContext||(window as any).webkitAudioContext)(); }catch(e){} } if(AC&&AC.state==='suspended') AC.resume(); return AC; }
export function sfx(kind: string): void {
  if(!sfxOn) return;
  if(AUDIO_B64[kind] && playSample(kind)) return;
  const a=ac(); if(!a) return;
  const t=a.currentTime;
  const o=a.createOscillator(), g=a.createGain();
  o.connect(g); g.connect(a.destination);
  if(kind==='tap'){ o.type='triangle'; o.frequency.setValueAtTime(520,t); o.frequency.exponentialRampToValueAtTime(330,t+0.06); g.gain.setValueAtTime(0.08,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.09); o.start(t); o.stop(t+0.1); }
  else if(kind==='build'){ o.type='square'; o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(65,t+0.16); g.gain.setValueAtTime(0.14,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.22); o.start(t); o.stop(t+0.24);
    const o2=a.createOscillator(),g2=a.createGain(); o2.connect(g2); g2.connect(a.destination); o2.type='triangle'; o2.frequency.setValueAtTime(880,t+0.04); g2.gain.setValueAtTime(0.05,t+0.04); g2.gain.exponentialRampToValueAtTime(0.001,t+0.14); o2.start(t+0.04); o2.stop(t+0.15); }
  else if(kind==='coin'){ o.type='sine'; o.frequency.setValueAtTime(880,t); o.frequency.setValueAtTime(1320,t+0.07); g.gain.setValueAtTime(0.10,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.24); o.start(t); o.stop(t+0.26); }
  else if(kind==='tier'){ [523,659,784,1047].forEach((f,i)=>{ const oo=a.createOscillator(),gg=a.createGain(); oo.connect(gg); gg.connect(a.destination); oo.type='triangle'; oo.frequency.setValueAtTime(f,t+i*0.09); gg.gain.setValueAtTime(0.09,t+i*0.09); gg.gain.exponentialRampToValueAtTime(0.001,t+i*0.09+0.22); oo.start(t+i*0.09); oo.stop(t+i*0.09+0.24); }); g.gain.setValueAtTime(0.0001,t); o.start(t); o.stop(t+0.01); }
  else if(kind==='warn'){ o.type='sawtooth'; o.frequency.setValueAtTime(220,t); o.frequency.setValueAtTime(180,t+0.12); g.gain.setValueAtTime(0.07,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.28); o.start(t); o.stop(t+0.3); }
  else if(kind==='repair'){ o.type='square'; o.frequency.setValueAtTime(660,t); o.frequency.setValueAtTime(660,t+0.08); o.frequency.setValueAtTime(880,t+0.12); g.gain.setValueAtTime(0.06,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.2); o.start(t); o.stop(t+0.22); }
  else if(kind==='chop'){ o.type='square'; o.frequency.setValueAtTime(140,t); o.frequency.exponentialRampToValueAtTime(70,t+0.05); g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.09); o.start(t); o.stop(t+0.1); }
  else if(kind==='mine'){ o.type='triangle'; o.frequency.setValueAtTime(300,t); o.frequency.exponentialRampToValueAtTime(160,t+0.06); g.gain.setValueAtTime(0.11,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.1); o.start(t); o.stop(t+0.11); }
  else if(kind==='open'){ o.type='triangle'; o.frequency.setValueAtTime(260,t); o.frequency.exponentialRampToValueAtTime(420,t+0.1); g.gain.setValueAtTime(0.07,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.14); o.start(t); o.stop(t+0.15); }
  else if(kind==='close'){ o.type='triangle'; o.frequency.setValueAtTime(420,t); o.frequency.exponentialRampToValueAtTime(220,t+0.08); g.gain.setValueAtTime(0.07,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12); o.start(t); o.stop(t+0.13); }
  // ── Event stingers ──
  else if(kind==='deed'){ [659,988,1319].forEach((f,i)=>{ const oo=a.createOscillator(),gg=a.createGain(); oo.connect(gg); gg.connect(a.destination); oo.type='triangle'; oo.frequency.setValueAtTime(f,t+i*0.07); gg.gain.setValueAtTime(0.08,t+i*0.07); gg.gain.exponentialRampToValueAtTime(0.001,t+i*0.07+0.24); oo.start(t+i*0.07); oo.stop(t+i*0.07+0.26); }); g.gain.setValueAtTime(0.0001,t); o.start(t); o.stop(t+0.01); }
  else if(kind==='festival'){ [523,659,784,1047].forEach((f)=>{ const oo=a.createOscillator(),gg=a.createGain(); oo.connect(gg); gg.connect(a.destination); oo.type='sine'; oo.frequency.setValueAtTime(f,t); gg.gain.setValueAtTime(0.055,t); gg.gain.exponentialRampToValueAtTime(0.001,t+0.5); oo.start(t); oo.stop(t+0.52); }); g.gain.setValueAtTime(0.0001,t); o.start(t); o.stop(t+0.01); }
  else if(kind==='fire'){ o.type='sawtooth'; o.frequency.setValueAtTime(140,t); o.frequency.linearRampToValueAtTime(90,t+0.4); const lfo=a.createOscillator(),lg=a.createGain(); lfo.type='square'; lfo.frequency.setValueAtTime(11,t); lg.gain.setValueAtTime(30,t); lfo.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.09,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.45); o.start(t); lfo.start(t); o.stop(t+0.46); lfo.stop(t+0.46); }
  else if(kind==='blight'){ o.type='triangle'; o.frequency.setValueAtTime(233,t); o.frequency.exponentialRampToValueAtTime(155,t+0.5); g.gain.setValueAtTime(0.09,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.55); o.start(t); o.stop(t+0.56); const o2=a.createOscillator(),g2=a.createGain(); o2.connect(g2); g2.connect(a.destination); o2.type='sine'; o2.frequency.setValueAtTime(220,t); o2.frequency.exponentialRampToValueAtTime(146,t+0.5); g2.gain.setValueAtTime(0.05,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.5); o2.start(t); o2.stop(t+0.52); }
  else if(kind==='raid'){ [[330,0],[247,0.18]].forEach(([f,d])=>{ const oo=a.createOscillator(),gg=a.createGain(); oo.connect(gg); gg.connect(a.destination); oo.type='sawtooth'; oo.frequency.setValueAtTime(f,t+d); gg.gain.setValueAtTime(0.1,t+d); gg.gain.exponentialRampToValueAtTime(0.001,t+d+0.22); oo.start(t+d); oo.stop(t+d+0.24); }); g.gain.setValueAtTime(0.0001,t); o.start(t); o.stop(t+0.01); }
}

/** Buzz the handset. Silently does nothing where unsupported. */
export function buzz(ms: number): void {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}

/* ---------- toggles ---------- */

export function isSfxOn(): boolean { return sfxOn; }
export function setSfxOn(on: boolean): void { sfxOn = on; }
export function isMusicOn(): boolean { return musicOn; }
/** Turning music on starts it; turning it off pauses it. */
export function setMusicOn(on: boolean): void {
  musicOn = on;
  if (on) startMusic(); else stopMusic();
}
/** True when there is any music bundled to play at all. */
export function hasMusic(): boolean { return MUSIC_KEYS.length > 0; }
