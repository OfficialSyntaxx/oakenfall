/* Short-lived visual effects: resources flying to the HUD, construction dust,
 * and the burst where a raider is turned back.
 *
 * All three are fire-and-forget — something calls spawnX() and forgets about
 * it, and the render pass drains the list. That is why they are worth a module:
 * the spawn side is called from the simulation (a settler delivering, a
 * building raised, a raid repelled) and was being pushed into three modules as
 * a callback because there was nowhere to import it from.
 *
 * Canvas code cannot import `ctx` and write to it, so the context and the
 * live view metrics come in through initFX().
 */
import { project } from './math';
import { decorImg } from './sprites';

type Deps = {
  ctx: any;
  /** Live canvas metrics — these change on every resize, so read, not copied. */
  viewport: () => { w: number; h: number; dpr: number };
  /** The camera object itself: const binding, mutable contents, so the live
   *  pan and zoom are always visible here. */
  camera: { panX: number; panY: number; scale: number };
};
let dep: Deps = {
  ctx: null, viewport: () => ({ w: 0, h: 0, dpr: 1 }),
  camera: { panX: 0, panY: 0, scale: 1 },
};
export function initFX(deps: Deps): void { dep = deps; }

/* Effects are short-lived and never assertable from a screenshot, so they
   report how many have ever been spawned. The debug snapshot surfaces this,
   which is the only way a test can tell that a delivery still throws a
   resource at the HUD. */
const spawned = { fly: 0, dust: 0, boom: 0 };
export function fxSpawned(): { fly: number; dust: number; boom: number } { return { ...spawned }; }

/* ── RESOURCE FLY ── a gathered load arcs from the world to its HUD counter,
   which is the only thing tying the two together visually. */

const flyFX: any[] = [];
const FLY_ICON: Record<string, string> = {
  wood: '🪵', stone: '🪨', food: '🌾', planks: '🪚', bread: '🍞', flour: '🌾',
};

export function spawnFly(gx: number, gy: number, resType: string): void {
  if (flyFX.length > 14) return;                    // a busy hold would bury the screen
  // Flour has no counter of its own; it flies to the food pile.
  const el = document.getElementById('res-' + (resType === 'flour' ? 'food' : resType))
          || document.getElementById('res-wood');
  if (!el) return;
  const r = el.getBoundingClientRect();
  const p = project(gx, gy);
  const view = dep.viewport();
  flyFX.push({
    sx: view.w / 2 + dep.camera.panX + p.x * dep.camera.scale,
    sy: view.h / 2 + dep.camera.panY + p.y * dep.camera.scale,
    tx: r.left + r.width / 2, ty: r.top + r.height / 2,
    ic: FLY_ICON[resType] || '✨', t: 0,
  });
  spawned.fly++;
}

export function renderFlyFX(dt: number): void {
  if (!flyFX.length) return;
  const ctx = dep.ctx;
  ctx.save();
  // Screen space, not world space: these end at a HUD element, so the world
  // transform has to come off.
  ctx.setTransform(dep.viewport().dpr, 0, 0, dep.viewport().dpr, 0, 0);
  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = flyFX.length - 1; i >= 0; i--) {
    const f = flyFX[i];
    f.t += dt * 1.7;
    if (f.t >= 1) { flyFX.splice(i, 1); continue; }
    const e = f.t * f.t * (3 - 2 * f.t);            // smoothstep
    // Quadratic bezier with the control point lifted above both ends, so the
    // load arcs over rather than sliding.
    const mx = (f.sx + f.tx) / 2, my = Math.min(f.sy, f.ty) - 70;
    const x = (1 - e) * (1 - e) * f.sx + 2 * (1 - e) * e * mx + e * e * f.tx;
    const y = (1 - e) * (1 - e) * f.sy + 2 * (1 - e) * e * my + e * e * f.ty;
    ctx.globalAlpha = 1 - e * 0.3;
    ctx.fillText(f.ic, x, y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ── DUST AND DEBRIS ── world-space bursts. Both are sprite-sheet animations
   played by index, and both simply skip if the sheet has not decoded. */

const dustFX: any[] = [];
const boomFX: any[] = [];

export function spawnBoom(gx: number, gy: number): void { spawned.boom++; boomFX.push({ gx, gy, t: 0 }); }
export function spawnDust(gx: number, gy: number): void { spawned.dust++; dustFX.push({ gx, gy, t: 0 }); }

/** Shared by both bursts: advance, expire, and draw the right sheet frame. */
function renderBurst(list: any[], dt: number, opts: {
  key: string; life: number; frames: number; size: number; grow: number;
  /** Vertical offset from the tile's projected point. */
  offY: (s: number) => number;
  fade: (k: number) => number;
}): void {
  const ctx = dep.ctx;
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    f.t += dt;
    if (f.t > opts.life) { list.splice(i, 1); continue; }
    const k = f.t / opts.life;
    const img = decorImg(opts.key, k * opts.frames);
    if (!img) continue;
    const p = project(f.gx, f.gy);
    const s = opts.size + f.t * opts.grow;
    ctx.globalAlpha = opts.fade(k);
    // iOS Safari can throw from drawImage under memory pressure; a dropped
    // puff of dust is not worth taking the frame down for.
    try { ctx.drawImage(img, p.x - s / 2, p.y + opts.offY(s), s, s * (img.naturalHeight / img.naturalWidth)); } catch (e) {}
    ctx.globalAlpha = 1;
  }
}

export function renderBoomFX(dt: number): void {
  renderBurst(boomFX, dt, {
    key: 'explosion', life: 0.6, frames: 4, size: 54, grow: 40,
    offY: (s) => -s + 6, fade: (k) => 1 - k * 0.5,
  });
}

export function renderDustFX(dt: number): void {
  renderBurst(dustFX, dt, {
    key: 'dust', life: 0.55, frames: 6, size: 44, grow: 30,
    offY: (s) => -s / 2 - 8, fade: (k) => 1 - k,
  });
}
