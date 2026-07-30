/* What the island sits in. Drawn before anything else, under the whole world.
 *
 * The hold used to sit on flat black, which read as an unfinished cut-out
 * rather than a place. Three passes fix that: a cold radial void behind
 * everything, the sea the island floats in, and a skirt of haze softening the
 * hard geometric line where the land ends.
 *
 * Two costs shape all of it. A gradient allocated per frame is one of this
 * project's known traps, so the void's is cached and keyed on canvas size plus
 * a quantised time-of-day band. And the sea and the skirt use nothing but flat
 * translucent fills — nested diamonds, nine of them — for the same reason.
 *
 * The sea and the skirt are drawn in WORLD space so they pan and zoom with the
 * land. A backdrop pinned to the screen reads as a painted wall behind a
 * floating slab, which is exactly what the black void looked like.
 */
import { project } from './math';
import { G } from './state';
import { view } from './camera';
import { darknessFactor } from './time';
import { windTime } from './terrain';

type Deps = { ctx: any };
let dep: Deps = { ctx: null };
export function initBackdrop(deps: Deps): void { dep = deps; }

let _voidGrad: any = null, _voidKey = '';

/** The cold expanse beyond the sea. Returns a fillStyle for the whole canvas. */
export function voidBackdrop(): any {
  const dark = darknessFactor();
  const band = Math.round(dark * 4);   // quantised so we rebuild rarely, not per frame
  const key = view.w + 'x' + view.h + ':' + band;
  if (_voidGrad && _voidKey === key) return _voidGrad;
  const t = band / 4;
  // Day: slate-teal deep water. Night: near-black with a cold blue cast.
  const mix = (a: number[], b: number[]) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const inner = mix([34, 54, 64], [12, 18, 30]);
  const outer = mix([13, 21, 28], [5, 8, 14]);
  const g = dep.ctx.createRadialGradient(
    view.w / 2, view.h * 0.46, Math.min(view.w, view.h) * 0.12,
    view.w / 2, view.h * 0.46, Math.max(view.w, view.h) * 0.78);
  g.addColorStop(0, `rgb(${inner[0]},${inner[1]},${inner[2]})`);
  g.addColorStop(1, `rgb(${outer[0]},${outer[1]},${outer[2]})`);
  _voidGrad = g; _voidKey = key;
  return g;
}

/** The map's four corners projected, plus their centre — both world-space passes
 *  below grow diamonds outward from exactly this shape. */
function mapDiamond() {
  const c = [project(0, 0), project(G.MAP_SIZE, 0), project(G.MAP_SIZE, G.MAP_SIZE), project(0, G.MAP_SIZE)];
  return { c, cx: (c[0].x + c[2].x) / 2, cy: (c[0].y + c[2].y) / 2 };
}

/** Trace the map diamond scaled by `grow` about its centre. */
function diamondPath(ctx: any, d: ReturnType<typeof mapDiamond>, grow: number): void {
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const x = d.cx + (d.c[k].x - d.cx) * grow, y = d.cy + (d.c[k].y - d.cy) * grow;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Open water fading outward to the void, then a bright rim of shallows hugging
 *  the shore — the giveaway that land meets water rather than simply stopping. */
export function drawSea(): void {
  const ctx = dep.ctx;
  const d = mapDiamond();
  ctx.save();
  // Densest near the shore, so the far distance stays dark.
  const deep: [number, number][] = [[3.6, 0.06], [2.7, 0.12], [2.1, 0.20], [1.7, 0.30],
                                    [1.42, 0.42], [1.22, 0.56], [1.09, 0.70]];
  for (const [grow, a] of deep) { ctx.fillStyle = 'rgba(31,54,66,' + a + ')'; diamondPath(ctx, d, grow); ctx.fill(); }
  // The rim breathes with the swell, on the same clock as the grass — one sine,
  // no extra fills.
  const swell = 0.5 + Math.sin(windTime() * 0.7) * 0.5;
  ctx.fillStyle = 'rgba(58,98,112,' + (0.48 + swell * 0.12).toFixed(3) + ')';
  diamondPath(ctx, d, 1.040 + swell * 0.010); ctx.fill();
  ctx.fillStyle = 'rgba(92,138,150,' + (0.36 + swell * 0.10).toFixed(3) + ')';
  diamondPath(ctx, d, 1.014 + swell * 0.006); ctx.fill();
  ctx.restore();
}

/** Haze fading the dark outward from the map's edge, settling the hold into the
 *  distance instead of cutting it out. */
export function drawIslandSkirt(): void {
  const ctx = dep.ctx;
  const d = mapDiamond();
  ctx.save();
  for (let i = 6; i >= 1; i--) {
    ctx.fillStyle = 'rgba(6,10,16,' + (0.10 - i * 0.013).toFixed(3) + ')';
    diamondPath(ctx, d, 1 + i * 0.055);
    ctx.fill();
  }
  ctx.restore();
}
