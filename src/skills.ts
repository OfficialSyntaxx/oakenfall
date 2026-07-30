/* Proficiency and guilds.
 *
 * A settler gets better at a trade the longer they work it, and two Masters of
 * the same trade form a guild that lifts that craft across the whole hold. The
 * two are one system: guilds are built out of skill tiers, and mastery is what
 * makes a mentor.
 *
 * Reports straight to the toast row and the chronicle by importing both, and
 * depends on nothing else — the progression can be reasoned about on its own.
 */
import { G } from './state';
import { toast } from './hud';
import { chron } from './chronicle';
import { dist2 } from './math';
import { roleLabel } from './defs';


/** Experience is measured in seconds worked, so the thresholds are roughly
 *  "half a day" and "a day and a half" of steady work in one trade. */
export const SKILL_TIERS = [
  { min: 0,   label: '',        ic: '',  mul: 1 },
  { min: 150, label: 'Skilled', ic: '✦', mul: 1.08 },
  { min: 420, label: 'Master',  ic: '★', mul: 1.18 },
];

export function skillTier(v: any, role: string) {
  const xp = (v.skills && v.skills[role]) || 0;
  let t = SKILL_TIERS[0];
  for (const s of SKILL_TIERS) if (xp >= s.min) t = s;
  return t;
}
export function skillMul(v: any): number {
  return v.role && v.role !== 'idle' ? skillTier(v, v.role).mul : 1;
}

/** A Master of the same trade working within ~4 tiles teaches the learner. */
export function hasNearbyMentor(v: any): boolean {
  for (const o of G.villagers) {
    if (o === v || o.role !== v.role) continue;
    if (skillTier(o, o.role).label !== 'Master') continue;
    if (dist2(o.gx, o.gy, v.gx, v.gy) < 16) return true;
  }
  return false;
}

/** Called each tick a settler spends actually working. */
export function gainSkill(v: any, dt: number): void {
  if (!v.role || v.role === 'idle' || v.stage === 'child') return;
  if (!v.skills) v.skills = {};
  const before = skillTier(v, v.role);
  // Apprenticeship doubles learning, but only for those not yet Masters.
  const mentored = before.label !== 'Master' && hasNearbyMentor(v);
  if (mentored) v._mentored = 0.6;                                  // flag for the mood bubble
  else if (v._mentored) v._mentored = Math.max(0, v._mentored - dt);
  v.skills[v.role] = (v.skills[v.role] || 0) + dt * (mentored ? 2 : 1);
  const after = skillTier(v, v.role);
  if (after.label && after.label !== before.label) {
    toast(after.ic + ' ' + v.name + ' is now a ' + after.label + ' ' + roleLabel(v.role) +
      (mentored ? ' (well taught)' : '') + '.');
  }
}

/* ── GUILDS ── two or more Masters of a trade form a guild, granting a small
   hold-wide bonus to that craft's output. */
const GUILD_BONUS = 0.10;
/** A Charter raises what every guild is worth. */
export function guildBonusVal(): number { return G.researched.charter ? 0.15 : GUILD_BONUS; }

export const GUILD_DEFS: Record<string, any> = {
  lumberjack: { res: 'wood',  ic: '🪓', name: "Woodwrights' Guild",  blurb: 'timber comes in faster hold-wide' },
  miner:      { res: 'stone', ic: '⛏️', name: "Stonecutters' Guild", blurb: 'stone comes in faster hold-wide' },
  farmer:     { res: 'farm',  ic: '🌾', name: "Ploughmen's Guild",   blurb: 'the fields yield more hold-wide' },
  fisher:     { res: 'fish',  ic: '🎣', name: "Fishers' Guild",      blurb: 'the nets come back fuller' },
  hunter:     { res: 'meat',  ic: '🏹', name: "Hunters' Lodge",      blurb: 'the hunt is more bountiful' },
};

/** Recount the Masters and form or dissolve guilds. `announce` is false on
 *  load, so restoring a hold does not replay every guild it ever formed. */
export function recomputeGuilds(announce?: boolean): void {
  const count: Record<string, number> = {};
  for (const v of G.villagers) {
    if (v.role && skillTier(v, v.role).label === 'Master') count[v.role] = (count[v.role] || 0) + 1;
  }
  for (const role in GUILD_DEFS) {
    const active = (count[role] || 0) >= 2;
    if (active && !G.guilds[role] && announce) {
      const g = GUILD_DEFS[role];
      toast(g.ic + ' The ' + g.name + ' has formed — ' + g.blurb + ' (+' + Math.round(guildBonusVal() * 100) + '%).');
      chron('guild', g.name);
    }
    G.guilds[role] = active;
  }
}

const GUILD_FOR_RES: Record<string, string> = { wood: 'lumberjack', stone: 'miner', fish: 'fisher', meat: 'hunter' };
export function guildMulRes(resKind: string): number {
  const role = GUILD_FOR_RES[resKind];
  return (role && G.guilds[role]) ? 1 + guildBonusVal() : 1;
}
export function guildFarmMul(): number { return G.guilds.farmer ? 1 + guildBonusVal() : 1; }
