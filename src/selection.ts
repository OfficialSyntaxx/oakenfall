/* What the player has tapped, and keeping it in view.
 *
 * One selection at a time — a settler, a building, or a resource tile — held in
 * a const object with mutable contents for the same reason `G` and `camera` are:
 * a module cannot assign to an imported binding, so `selection.ref = x` works
 * from anywhere where a reassignable export could only ever be read.
 *
 * The division of labour with sheet.ts: the sheet stack owns whether a panel is
 * showing, selection owns what the map has highlighted, and clearing a selection
 * clears both. Selecting uses `replace`, not `push` — tapping the world is a
 * fresh start, not another step down a history nobody asked for.
 */
import { G } from './state';
import { project, inProject, dist2, TILE_W, TILE_H } from './math';
import { camera, view, worldToScreen, clampCamera, screenToWorldPixel } from './camera';
import { sheetNav, closeSheet } from './sheet';
import { buildingCenter } from './buildings';
import { tileAt } from './mapgen';
import { sfx } from './audio';

/* The three panels a selection can open, and the build mode it interrupts —
   both still live in main.ts. */
type Deps = {
  renderVillager: (v: any) => void;
  renderBuilding: (b: any) => void;
  renderTile: (t: any) => void;
  /** Leave build mode if it is active. Safe to call when it is not. */
  exitBuildMode: () => void;
};
let dep: Deps = {
  renderVillager: () => {}, renderBuilding: () => {}, renderTile: () => {}, exitBuildMode: () => {},
};
export function initSelection(deps: Deps): void { dep = deps; }

export type SelectionKind = 'villager' | 'building' | 'tile' | null;

export const selection: { type: SelectionKind; ref: any } = { type: null, ref: null };

/** True when `thing` is what is currently selected — the render passes ask this
 *  to decide whether to draw a highlight. */
export function isSelected(thing: any): boolean { return !!thing && selection.ref === thing; }

export function clearSelection(): void { selection.type = null; selection.ref = null; }

/** Drop the selection and put the UI back the way it was. */
export function deselectAll(): void {
  clearSelection();
  dep.exitBuildMode();
  closeSheet();
}

export function selectVillager(v: any): void {
  sfx('tap');
  dep.exitBuildMode();
  selection.type = 'villager'; selection.ref = v;
  sheetNav.replace({ id: 'sel-villager', render: () => dep.renderVillager(v) });
  ensureSelectionVisible();
}

export function selectBuilding(b: any): void {
  sfx('tap');
  dep.exitBuildMode();
  selection.type = 'building'; selection.ref = b;
  sheetNav.replace({ id: 'sel-building', render: () => dep.renderBuilding(b) });
  ensureSelectionVisible();
}

export function selectTile(t: any): void {
  dep.exitBuildMode();
  selection.type = 'tile'; selection.ref = t;
  sheetNav.replace({ id: 'sel-tile', render: () => dep.renderTile(t) });
  ensureSelectionVisible();
}

/** Nudge the camera so the selected thing is not behind the sheet or under the
 *  HUD. The sheet is MEASURED rather than assumed: it docks to the bottom in
 *  portrait and to the side in short landscape, and its height changes with its
 *  contents. offsetHeight is used because it ignores the slide-in transform,
 *  which would otherwise report the sheet as off-screen mid-animation. */
export function ensureSelectionVisible(): void {
  if (!selection.type || !selection.ref) return;
  const g = selection.type === 'building' ? buildingCenter(selection.ref)
          : { gx: selection.ref.gx, gy: selection.ref.gy };
  if (g.gx === undefined || g.gy === undefined) return;
  const p = project(g.gx, g.gy);
  const s = worldToScreen(p.x, p.y);
  const sideDock = matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
  const top = 130, left = 40;
  const sheetEl = document.getElementById('bottom-sheet');
  const sheetH = sheetEl ? Math.min(sheetEl.offsetHeight, view.h * 0.5) : view.h * 0.5;
  const bottom = sideDock ? view.h - 50 : view.h - sheetH - 30;
  const right = sideDock ? view.w - Math.min(view.w * 0.46, 380) - 40 : view.w - 40;
  let dx = 0, dy = 0;
  if (s.x < left) dx = left - s.x; else if (s.x > right) dx = right - s.x;
  if (s.y < top) dy = top - s.y; else if (s.y > bottom) dy = bottom - s.y;
  if (dx || dy) { camera.panX += dx; camera.panY += dy; clampCamera(); }
}

/** What is under a screen point, in the order a player expects: the people
 *  first, then what they built, then the land. A tap that hits nothing clears
 *  the selection. */
export function pickAt(sx: number, sy: number): void {
  const wp = screenToWorldPixel(sx, sy);

  // Settlers: nearest within a generous radius, since they are small and moving.
  // The offsets lift the test to roughly body height rather than foot position.
  let hitV = null, hitVD = 22 * 22;
  for (const v of G.villagers) {
    const p = project(v.gx, v.gy);
    const d = dist2(wp.x, wp.y - 10, p.x, p.y - 12);
    if (d < hitVD) { hitVD = d; hitV = v; }
  }
  if (hitV) { selectVillager(hitV); return; }

  // Buildings: a box around the footprint, extended upward to cover the roof —
  // a building is drawn far above the tile it stands on.
  for (const b of G.buildings) {
    const c = buildingCenter(b);
    const p = project(c.gx, c.gy);
    const halfW = TILE_W * 0.55 * b.w, halfH = (TILE_H * 0.55 * b.h) + 50;
    if (wp.x > p.x - halfW && wp.x < p.x + halfW && wp.y > p.y - halfH && wp.y < p.y + 30) {
      selectBuilding(b); return;
    }
  }

  // Land: only tiles that have something to say for themselves.
  const g = inProject(wp.x, wp.y);
  const t = tileAt(Math.round(g.gx), Math.round(g.gy));
  if (t && (t.type === 'forest' || t.type === 'stone' || t.type === 'water' || t.wilds)) { selectTile(t); return; }

  deselectAll();
}
