/* Raising and moving buildings: the palette, the placement mark, and the rules
 * about where a thing may stand.
 *
 * Placement is centre-of-screen, not touch-a-tile. On a phone your finger covers
 * the tile you are aiming at, so the mark sits under the crosshair in the middle
 * of the view and the player pans the MAP to aim. That is why the ghost reads
 * the camera rather than a pointer position, and why build mode has a sheet of
 * its own with a confirm button rather than placing on tap.
 *
 * Moving an existing building runs through the same mode with the same rules and
 * costs nothing — the only difference is that the old tiles are released first.
 */
import { G } from './state';
import { project, inProject, TILE_W, TILE_H } from './math';
import { BUILD_DEFS } from './defs';
import { camera, view, screenToWorldPixel } from './camera';
import { toast } from './hud';
import { sheetContent, sheetNav, openSheet } from './sheet';
import { deselectAll, clearSelection } from './selection';
import { tileAt } from './mapgen';
import { BUILD_NEEDS_ADJ, addBuilding } from './buildings';
import { spawnDust } from './fx';
import { tileDiamond } from './isokit';
import { sfx, buzz } from './audio';

/* Two things this module cannot reach: the canvas it draws the mark on, and the
   "put everyone to work" button the palette offers when settlers are idle. */
type Deps = { ctx: any; bulkAssignIdle: () => void };
let dep: Deps = { ctx: null, bulkAssignIdle: () => {} };
export function initBuild(deps: Deps): void { dep = deps; }

/** Live build state. A const object with mutable contents, like G and camera, so
 *  every module that asks "are we placing something?" can import it. */
export const buildMode: {
  active: boolean; key: string | null; movingBuilding: any;
  ghostGX: number; ghostGY: number;
} = { active: false, key: null, movingBuilding: null, ghostGX: 0, ghostGY: 0 };

const fab = () => document.getElementById('build-fab');
const crosshair = () => document.getElementById('crosshair');

/* ── WHERE A BUILDING MAY STAND ── */

/** Null if the spot is good, else a short sentence for the toast.
 *
 * Resource buildings must be raised beside the terrain they work: a fishing hut
 * on the riverbank, a forestry camp at the treeline, a mining post by a stone
 * outcrop. BUILD_NEEDS_ADJ maps a build key to that test plus the phrase shown
 * when no neighbouring tile passes it. */
export function buildSpotReason(gx: number, gy: number): string | null {
  const t = tileAt(gx, gy);
  if (!t) return 'Off the map.';
  if (buildMode.key === 'bridge') {
    return (t.type === 'water' && !t.building) ? null : 'Bridges span the river — place one on water.';
  }
  if (t.type === 'water') return 'Cannot build on water.';
  if (t.type !== 'grass' && t.type !== 'dirt') return 'Clear ground only — not on ' + t.type + '.';
  if (t.building) return 'That tile is already occupied.';
  const moving = buildMode.movingBuilding;
  if (moving && moving.gx === gx && moving.gy === gy) return 'Already here.';
  const adj = (BUILD_NEEDS_ADJ as any)[buildMode.key!];
  if (adj) {
    let ok = false;
    for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nt = tileAt(gx + dx, gy + dy);
      if (nt && adj.test(nt)) { ok = true; break; }
    }
    if (!ok) return (BUILD_DEFS as any)[buildMode.key!].name + ' must be raised ' + adj.need + '.';
  }
  return null;
}

export function isValidBuildSpot(gx: number, gy: number): boolean { return buildSpotReason(gx, gy) === null; }

/* ── THE MARK ── drawn in world space each frame while placing. */

export function drawGhost(): void {
  if (!buildMode.active) return;
  const ctx = dep.ctx;
  // The mark tracks the centre of the screen, which is what the crosshair sits
  // over — the player aims by panning, not by pointing.
  const wp = screenToWorldPixel(view.w / 2, view.h / 2);
  const g = inProject(wp.x, wp.y);
  const gx = Math.round(g.gx), gy = Math.round(g.gy);
  buildMode.ghostGX = gx; buildMode.ghostGY = gy;
  const valid = isValidBuildSpot(gx, gy);
  const p = project(gx, gy);

  const pulse = 0.6 + Math.sin(G.worldTime * 4) * 0.25;
  ctx.fillStyle = valid ? `rgba(120,200,120,${pulse * 0.38})` : `rgba(220,80,60,${pulse * 0.40})`;
  tileDiamond(p.x, p.y, TILE_W, TILE_H); ctx.fill();

  // Two strokes: a bright inner edge and a faint outer one, so the mark reads
  // against both grass and stone. Line widths divide by scale to stay one
  // screen pixel wide however far the camera is zoomed.
  ctx.lineWidth = 2.5 / camera.scale;
  ctx.strokeStyle = valid ? `rgba(160,240,160,${pulse * 0.95})` : `rgba(240,120,100,${pulse * 0.95})`;
  tileDiamond(p.x, p.y, TILE_W, TILE_H); ctx.stroke();
  ctx.lineWidth = 1 / camera.scale;
  ctx.strokeStyle = valid ? 'rgba(80,160,80,0.4)' : 'rgba(160,60,40,0.4)';
  tileDiamond(p.x, p.y, TILE_W + 4, TILE_H + 2); ctx.stroke();

  // Corner ticks pointing inward from each vertex.
  const tick = 5 / camera.scale;
  ctx.strokeStyle = valid ? 'rgba(120,230,120,0.9)' : 'rgba(240,100,80,0.9)';
  ctx.lineWidth = 2 / camera.scale;
  for (const [ox, oy] of [[0, -TILE_H / 2], [TILE_W / 2, 0], [0, TILE_H / 2], [-TILE_W / 2, 0]]) {
    const ang = Math.atan2(oy, ox);
    ctx.beginPath();
    ctx.moveTo(p.x + ox, p.y + oy);
    ctx.lineTo(p.x + ox - Math.cos(ang) * tick, p.y + oy - Math.sin(ang) * tick);
    ctx.stroke();
  }
}

/* ── ENTERING AND LEAVING ── */

function enterMode(key: string, moving: any): void {
  buildMode.active = true;
  buildMode.key = key;
  buildMode.movingBuilding = moving;
  fab()?.classList.add('active');
  crosshair()?.classList.add('show');
  renderPlacementSheet();
  openSheet();
}

export function enterBuildMode(key: string): void { enterMode(key, null); }
export function enterMoveMode(b: any): void { enterMode(b.type, b); }

export function exitBuildMode(): void {
  buildMode.active = false;
  buildMode.key = null;
  buildMode.movingBuilding = null;
  fab()?.classList.remove('active');
  crosshair()?.classList.remove('show');
}

/** Leave build mode if it is running. Safe to call when it is not — this is what
 *  every "the player did something else" path calls. */
export function exitBuildModeIfActive(): void { if (buildMode.active) exitBuildMode(); }

/* ── THE PALETTE ── */

/* Categories, so twenty-one cards do not arrive as one flat wall. A key with no
   entry falls into trade rather than vanishing. */
const CAT_LABEL: Record<string, string> = {
  home: '🏠 Homes', food: '🌾 Food & Provisions', industry: '🪓 Industry',
  trade: '⚖️ Trade & Hall', defense: '🛡️ Defense', road: '🛤️ Roadworks',
};
const CAT_OF: Record<string, string> = {
  house: 'home', manor: 'home',
  farm: 'food', fishingHut: 'food', huntingCabin: 'food', bakery: 'food',
  windmill: 'food', granary: 'food', pasture: 'food',
  forestCamp: 'industry', miningPost: 'industry', sawmill: 'industry', forester: 'industry',
  tradingPost: 'trade', tavern: 'trade',
  watchtower: 'defense', guardPost: 'defense', palisade: 'defense', well: 'defense',
  road: 'road', bridge: 'road', lampPost: 'road',
};

export function renderBuildPalette(): void {
  const keys = Object.keys(BUILD_DEFS).filter((k) => {
    const d = (BUILD_DEFS as any)[k];
    return !d.needsTech || G.researched[d.needsTech];
  });
  const idle = G.villagers.some((v: any) => v.role === 'idle' && v.state !== 'spawning');
  const card = (k: string) => {
    const d = (BUILD_DEFS as any)[k];
    const afford = Object.entries(d.cost).every(([kk, amt]: any) => !amt || (G.stockpile[kk] || 0) >= amt);
    return `<button class="build-card ${afford ? '' : 'disabled'}" data-key="${k}" ${afford ? '' : 'disabled'}>
      <span class="ic">${d.icon}</span>
      <span class="name">${d.name}</span>
      <div class="cost">${d.cost.wood ? ('🪵 ' + d.cost.wood + ' ') : ''}${d.cost.stone ? ('🪨 ' + d.cost.stone + ' ') : ''}${d.cost.planks ? ('🪚 ' + d.cost.planks) : ''}</div>
    </button>`;
  };
  sheetContent.innerHTML = `
    <div class="sheet-title">🔨 Raise a Building</div>
    <div class="sheet-sub">Choose a structure, then position it and confirm.</div>
    ${idle ? `<button class="action-btn primary" id="bulk-assign-btn" style="margin:4px 0 8px;">⚒️ Put all idle settlers to work</button>` : ''}
    ${['home', 'food', 'industry', 'trade', 'defense', 'road'].map((cat) => {
      const inCat = keys.filter((k) => (CAT_OF[k] || 'trade') === cat);
      // NOTE: build-grid is a CSS class. It has been broken once by a
      // search-and-replace that did not know a string from a reference.
      return inCat.length
        ? `<div class="build-cat">${CAT_LABEL[cat]}</div><div class="build-grid">${inCat.map(card).join('')}</div>`
        : '';
    }).join('')}`;
  const bulkBtn = document.getElementById('bulk-assign-btn');
  if (bulkBtn) bulkBtn.addEventListener('click', () => { dep.bulkAssignIdle(); deselectAll(); });
  for (const btn of Array.from(sheetContent.querySelectorAll('.build-card')) as HTMLButtonElement[]) {
    btn.addEventListener('click', () => { if (!btn.disabled) enterBuildMode(btn.dataset.key!); });
  }
}

/** Open the palette from scratch — what the build button does. */
export function openBuildPalette(): void {
  exitBuildModeIfActive();
  clearSelection();
  sheetNav.replace({ id: 'build', render: renderBuildPalette });
}

/* ── PLACING ── */

export function renderPlacementSheet(): void {
  const d = (BUILD_DEFS as any)[buildMode.key!];
  const moving = !!buildMode.movingBuilding;
  sheetContent.innerHTML = `
    <div class="sheet-title">${d.icon} ${moving ? 'Moving' : 'Placing'}: ${d.name}</div>
    <div class="sheet-sub">${moving ? 'Pan the map to its new home, then confirm. No cost to relocate.' : d.desc + ' Pan the map to position the mark, then confirm.'}</div>
    <div class="row placement-bar">
      <button class="action-btn" id="cancel-place-btn">✕ Cancel</button>
      <button class="action-btn primary" id="confirm-place-btn">✓ ${moving ? 'Set Down Here' : 'Place Here'}</button>
    </div>`;
  document.getElementById('cancel-place-btn')!.addEventListener('click', () => deselectAll());
  document.getElementById('confirm-place-btn')!.addEventListener('click', () => confirmPlacement());
}

/** Masonry shaves stone off every build. Applied at the check AND the spend, so
 *  the two can never disagree about what a thing costs. */
const costOf = (k: string, amt: number) => (k === 'stone' && G.researched.masonry) ? Math.ceil(amt * 0.85) : amt;

/* One warning per session, not per palisade. */
let palisadeWarned = false;
export function resetBuildWarnings(): void { palisadeWarned = false; }

export function confirmPlacement(): void {
  const gx = buildMode.ghostGX, gy = buildMode.ghostGY;
  const reason = buildSpotReason(gx, gy);
  if (reason) { toast(reason, true); return; }

  if (buildMode.movingBuilding) {
    const b = buildMode.movingBuilding;
    // Release every tile the old footprint held before claiming the new one.
    for (let yy = b.gy; yy < b.gy + b.h; yy++) {
      for (let xx = b.gx; xx < b.gx + b.w; xx++) if (G.grid[yy] && G.grid[yy][xx]) G.grid[yy][xx].building = null;
    }
    b.gx = gx; b.gy = gy;
    G.grid[gy][gx].building = b;
    toast((BUILD_DEFS as any)[b.type].name + ' relocated.');
    exitBuildMode();
    deselectAll();
    return;
  }

  const d = (BUILD_DEFS as any)[buildMode.key!];
  for (const [k, amt] of Object.entries(d.cost) as [string, number][]) {
    if (amt > 0 && (G.stockpile[k] || 0) < costOf(k, amt)) { toast('Not enough ' + k + '.', true); return; }
  }
  for (const [k, amt] of Object.entries(d.cost) as [string, number][]) {
    if (amt > 0) G.stockpile[k] -= costOf(k, amt);
  }
  addBuilding(buildMode.key!, gx, gy);
  spawnDust(gx + 0.5, gy + 0.5);
  G.journal.buildingsRaised++;
  if (G.dailyProgress.built !== undefined) G.dailyProgress.built++;
  sfx('build'); buzz(18);
  toast(d.name + ' constructed!');
  if (buildMode.key === 'palisade' && !palisadeWarned) {
    palisadeWarned = true;
    toast('⚠️ Settlers cannot cross palisades — mind you leave a gate gap.', true);
  }
  exitBuildMode();
  deselectAll();
}
