/* Grid geometry and small pure helpers.
 *
 * project/inProject are the isometric transform the whole game is built on:
 * a tile at (gx,gy) sits at ((gx-gy)*TILE_W/2, (gx+gy)*TILE_H/2) in world
 * pixels, and inProject inverts it. Anything drawing or hit-testing goes
 * through these, including the minimap, which shares the projection so that
 * what it shows lines up with what the player sees.
 *
 * First module to carry real types. The two coordinate spaces are easy to mix
 * up — a bug that has bitten this project more than once — so they are named:
 * GridPoint is tiles, WorldPoint is pixels before the camera transform.
 */

/** A tile position on the map grid. */
export interface GridPoint { gx: number; gy: number }
/** A position in world pixels, before camera pan/zoom is applied. */
export interface WorldPoint { x: number; y: number }

export const TILE_W = 64;
export const TILE_H = 32;

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Squared distance — callers compare against squared radii to avoid a sqrt. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/** Deterministic value noise in [0,1) — same tile always yields the same result. */
export function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Stable string hash, used to give each settler consistent traits and tints. */
export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Grid tile → world pixels (the isometric projection). */
export function project(gx: number, gy: number): WorldPoint {
  return { x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) };
}

/** World pixels → grid tile (the inverse projection). */
export function inProject(wx: number, wy: number): GridPoint {
  const a = wx / (TILE_W / 2), b = wy / (TILE_H / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

export function fmt(n: number): string {
  return Math.floor(n).toString();
}
