/* Hands on the map: drag to pan, pinch to zoom, tap to select, double-tap to
 * zoom in — and, in the land editor, one finger to paint.
 *
 * Touch is the primary path and the mouse is the fallback, not the other way
 * round. That ordering matters for the two gestures below that took real work
 * to get right:
 *
 *   · A pinch pivots around the world point captured ONCE at pinch start.
 *     Recomputing it each move reads it against a camera the previous move just
 *     mutated, which feeds back on itself and sends the view flying.
 *   · A one-finger drag tracks velocity in px/ms so releasing it glides. The
 *     glide is decayed by the frame loop, and any new touch cancels it — the
 *     player's hand always wins over momentum.
 *
 * In the editor, one finger paints and two still pinch and pan, so the map stays
 * navigable while you work on it.
 */
import { clamp, inProject } from './math';
import {
  camera, panVel, camGlide, view, clampCamera, screenToWorldPixel, ZOOM_MIN, ZOOM_MAX,
} from './camera';
import { pickAt } from './selection';
import { drawMinimap } from './minimap';

/* The editor's brush. It lives in main.ts with the rest of the editor, and this
   module only needs to know whether it is active and how to lay a stroke down. */
type Deps = {
  canvas: HTMLCanvasElement;
  editing: () => boolean;
  /** Start a new undo step — called once per stroke, not per move. */
  beginStroke: () => void;
  paintTile: (gx: number, gy: number) => void;
};
let dep: Deps = {
  canvas: null as any, editing: () => false, beginStroke: () => {}, paintTile: () => {},
};

type TouchState = {
  mode: 'pan' | 'pinch' | 'paint' | null;
  startX: number; startY: number; startPanX: number; startPanY: number;
  startDist: number; startScale: number;
  midStartX: number; midStartY: number;
  pinchWorld: { x: number; y: number } | null;
  moved: boolean; startTime: number; lastMoveT: number;
};
const touch: TouchState = {
  mode: null, startX: 0, startY: 0, startPanX: 0, startPanY: 0,
  startDist: 0, startScale: 1, midStartX: 0, midStartY: 0,
  pinchWorld: null, moved: false, startTime: 0, lastMoveT: 0,
};

/** Paint from a screen point, converting through the same projection a tap uses. */
function paintScreen(sx: number, sy: number): void {
  const wp = screenToWorldPixel(sx, sy);
  const g = inProject(wp.x, wp.y);
  dep.paintTile(g.gx, g.gy);
}

const touchDist = (a: Touch, b: Touch) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
const touchMid = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

/** Zoom about a fixed screen point, keeping the world under it where it is.
 *  Shared by the wheel, the pinch and the double-tap — all three are the same
 *  move, and having written it three ways once is why it is a function. */
function zoomAbout(sx: number, sy: number, newScale: number, anchor?: { x: number; y: number }): void {
  const a = anchor || screenToWorldPixel(sx, sy);
  camera.scale = newScale;
  camera.panX = sx - view.w / 2 - a.x * newScale;
  camera.panY = sy - view.h / 2 - a.y * newScale;
  clampCamera();
}

let lastTapT = 0, lastTapX = 0, lastTapY = 0;

export function initInput(deps: Deps): void {
  dep = deps;
  const canvas = deps.canvas;

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      panVel.active = false; panVel.x = 0; panVel.y = 0; camGlide.active = false;
      const t = e.touches[0];
      touch.mode = 'pan';
      touch.startX = t.clientX; touch.startY = t.clientY;
      touch.startPanX = camera.panX; touch.startPanY = camera.panY;
      touch.moved = false; touch.startTime = performance.now();
      if (dep.editing()) { touch.mode = 'paint'; dep.beginStroke(); paintScreen(t.clientX, t.clientY); }
    } else if (e.touches.length >= 2) {
      const mid = touchMid(e.touches[0], e.touches[1]);
      touch.mode = 'pinch';
      touch.startDist = touchDist(e.touches[0], e.touches[1]);
      touch.startScale = camera.scale;
      touch.midStartX = mid.x; touch.midStartY = mid.y;
      // Captured ONCE — see the note at the top of the file.
      touch.pinchWorld = screenToWorldPixel(mid.x, mid.y);
      touch.moved = true;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (touch.mode === 'paint' && e.touches.length === 1) {
      paintScreen(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    if (touch.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - touch.startX, dy = t.clientY - touch.startY;
      if (Math.hypot(dx, dy) > 6) touch.moved = true;      // past this it is a drag, not a tap
      const now = performance.now();
      const prevX = camera.panX, prevY = camera.panY;
      camera.panX = touch.startPanX + dx;
      camera.panY = touch.startPanY + dy;
      clampCamera();
      const dtMs = Math.max(1, now - (touch.lastMoveT || now));
      panVel.x = (camera.panX - prevX) / dtMs; panVel.y = (camera.panY - prevY) / dtMs;
      touch.lastMoveT = now;
    } else if (touch.mode === 'pinch' && e.touches.length >= 2) {
      const dist = touchDist(e.touches[0], e.touches[1]);
      const mid = touchMid(e.touches[0], e.touches[1]);
      const newScale = clamp(touch.startScale * (dist / touch.startDist), ZOOM_MIN, ZOOM_MAX);
      // Pinning the captured point under the CURRENT midpoint is what lets two
      // fingers drag the map while they zoom it.
      const anchor = touch.pinchWorld || screenToWorldPixel(touch.midStartX, touch.midStartY);
      zoomAbout(mid.x, mid.y, newScale, anchor);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.touches.length === 0) {
      if (touch.mode === 'pan' && !touch.moved) {
        const now = performance.now();
        const tx = touch.startX, ty = touch.startY;
        // Double-tap zooms toward the tap, or back out if already zoomed in.
        if (now - lastTapT < 300 && Math.hypot(tx - lastTapX, ty - lastTapY) < 40) {
          zoomAbout(tx, ty, camera.scale < 1.5 ? 1.9 : 1.0);
          lastTapT = 0;
          return;
        }
        lastTapT = now; lastTapX = tx; lastTapY = ty;
      }
      // Fast enough on release to be a flick: let it glide.
      if (touch.mode === 'pan' && Math.hypot(panVel.x, panVel.y) > 0.15) panVel.active = true;
      const held = performance.now() - touch.startTime;
      if (touch.mode === 'pan' && !touch.moved && held < 400) pickAt(touch.startX, touch.startY);
      touch.mode = null;
    } else if (e.touches.length === 1) {
      // Pinch released down to one finger: re-baseline the pan, and mark it
      // moved so lifting that finger is not read as a tap.
      const t = e.touches[0];
      touch.mode = 'pan';
      touch.startX = t.clientX; touch.startY = t.clientY;
      touch.startPanX = camera.panX; touch.startPanY = camera.panY;
      touch.moved = true;
    }
  }, { passive: false });

  // The editor's minimap is not redrawn by the frame loop, so every gesture that
  // could have changed either the land or the viewport box has to ask for one.
  canvas.addEventListener('touchend', () => { if (dep.editing()) drawMinimap(); }, { passive: true });
  canvas.addEventListener('touchcancel', () => { touch.mode = null; }, { passive: false });

  /* ── MOUSE ── a desktop convenience over the same camera. mousemove and mouseup
     are bound to the WINDOW, not the canvas: a drag that leaves the canvas should
     keep panning, and a button released outside it must still end the drag. */
  let down = false, moved = false, painting = false;
  let startX = 0, startY = 0, startPanX = 0, startPanY = 0, startTime = 0;

  canvas.addEventListener('mousedown', (e) => {
    if (dep.editing() && e.button === 0) {
      down = false; painting = true; dep.beginStroke(); paintScreen(e.clientX, e.clientY);
      return;
    }
    down = true; moved = false;
    startX = e.clientX; startY = e.clientY;
    startPanX = camera.panX; startPanY = camera.panY;
    startTime = performance.now(); camGlide.active = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (painting) { paintScreen(e.clientX, e.clientY); return; }
    if (!down) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > 6) moved = true;
    camera.panX = startPanX + dx; camera.panY = startPanY + dy;
    clampCamera();
  });

  window.addEventListener('mouseup', (e) => {
    if (painting) { painting = false; drawMinimap(); return; }
    if (!down) return;
    down = false;
    if (!moved && performance.now() - startTime < 400) pickAt(e.clientX, e.clientY);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camGlide.active = false;
    zoomAbout(e.clientX, e.clientY, clamp(camera.scale * (e.deltaY < 0 ? 1.08 : 0.93), ZOOM_MIN, ZOOM_MAX));
  }, { passive: false });
}
