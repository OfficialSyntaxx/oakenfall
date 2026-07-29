/* Where the player is looking, and how big the window is.
 *
 * Both are const objects with mutable contents, for the same reason `G` is one:
 * a module cannot assign to an imported binding, so `camera.panX = …` from
 * anywhere works where a bare exported `let panX` could only ever be read.
 * That is what lets seven modules import the camera instead of being handed it.
 *
 * The projection helpers live here too, because screen↔world is entirely a
 * question of where the camera is and how large the canvas is.
 */
import { G } from './state';
import { clamp, inProject, TILE_W, TILE_H } from './math';

/** Pan is in screen pixels and NEGATIVE of the look-at point times scale:
 *  lookAt = -pan/scale. Easy to get backwards, and everything derives from it. */
export const camera = { panX: 0, panY: 0, scale: 1.05 };

/** Momentum from a flick, decayed each frame. */
export const panVel = { x: 0, y: 0, active: false };

/** Eased glide to a target pan, used when focusing a selection. Any direct
 *  drag or pinch clears it — the player's hand always wins. */
export const camGlide = { x: 0, y: 0, active: false };

/** CSS pixel size of the canvas, and the device pixel ratio it is backed at.
 *  Updated by main.ts on every resize; read live by every drawing pass. */
export const view = { w: window.innerWidth, h: window.innerHeight, dpr: 1 };
export function setViewport(w: number, h: number, dpr: number): void {
  view.w = w; view.h = h; view.dpr = dpr;
}

/** Glide the camera so a world point sits a little above centre — where a
 *  selected thing reads best with a sheet open below it. */
export function panCameraTo(wx: number, wy: number): void {
  panVel.active = false;
  camGlide.x = -wx * camera.scale;
  camGlide.y = -wy * camera.scale + view.h * 0.35;
  camGlide.active = true;
}

/** Keep at least 40% of the map on screen at either extreme. */
export const ZOOM_MIN = 0.4, ZOOM_MAX = 2.4;

/** Opening zoom, chosen so roughly ten tiles span the shorter side of the
 *  screen — the same amount of hold is visible on a phone and a desktop. */
export function initCameraZoom(): void {
  const minDim = Math.min(view.w, view.h);
  camera.scale = Math.max(0.6, Math.min(1.25, minDim / (10 * TILE_W)));
}

export function clampCamera(): void {
  /* The isometric diamond spans world X in [-half, +half] centred on zero, and
     world Y in [0, MAP_SIZE*TILE_H]. What gets clamped is the LOOK-AT point in
     world coordinates, not the pan — clamping the pan directly lets the camera
     wander into the void at some zooms. */
  camera.scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camera.scale));
  const s = camera.scale;
  const halfW = G.MAP_SIZE * (TILE_W / 2);
  const maxWY = G.MAP_SIZE * TILE_H;
  camera.panX = Math.max(-halfW * s, Math.min(halfW * s, camera.panX));
  camera.panY = Math.max(-maxWY * s, Math.min(0, camera.panY));
}

export function screenToWorldPixel(sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - view.w / 2 - camera.panX) / camera.scale,
           y: (sy - view.h / 2 - camera.panY) / camera.scale };
}
export function worldToScreen(wx: number, wy: number): { x: number; y: number } {
  return { x: wx * camera.scale + view.w / 2 + camera.panX,
           y: wy * camera.scale + view.h / 2 + camera.panY };
}

/** Which tiles could possibly be on screen. Everything that iterates the map to
 *  draw asks this first — without it the game draws the whole island every
 *  frame, most of it off screen. */
export function visibleTileRange(): { x0: number; x1: number; y0: number; y1: number } {
  // The margin scales with zoom: further out means more tiles visible per
  // pixel, so a fixed buffer would pop things in at the edges.
  const margin = Math.ceil(4 / camera.scale) + 2;
  const corners = [
    screenToWorldPixel(0, 0), screenToWorldPixel(view.w, 0),
    screenToWorldPixel(0, view.h), screenToWorldPixel(view.w, view.h),
  ];
  let minGX = Infinity, maxGX = -Infinity, minGY = Infinity, maxGY = -Infinity;
  for (const c of corners) {
    const g = inProject(c.x, c.y);
    minGX = Math.min(minGX, g.gx); maxGX = Math.max(maxGX, g.gx);
    minGY = Math.min(minGY, g.gy); maxGY = Math.max(maxGY, g.gy);
  }
  return {
    x0: clamp(Math.floor(minGX - margin), 0, G.MAP_SIZE - 1),
    x1: clamp(Math.ceil(maxGX + margin), 0, G.MAP_SIZE - 1),
    y0: clamp(Math.floor(minGY - margin), 0, G.MAP_SIZE - 1),
    y1: clamp(Math.ceil(maxGY + margin), 0, G.MAP_SIZE - 1),
  };
}
