/* The bottom sheet: the one panel every menu in the game is drawn into.
 *
 * There is a single sheet element, and every view overwrites its contents. What
 * makes that navigable rather than a maze is the stack below: a view is
 * {id, title?, render}, and the stack owns whether the sheet is open. Three
 * rules keep it honest —
 *   · the stack owns sheet visibility; selection owns map state; deselectAll
 *     clears both,
 *   · a renderer never opens the sheet itself, it only fills it,
 *   · map selections `replace` rather than `push`, so tapping the world resets
 *     the history instead of burying the player five backs deep.
 *
 * Views with a title get a header row with a back chevron, shown from depth two.
 * Map-selection views pass no title and get none.
 *
 * This module owns the sheet's DOM and its gestures, so anything that draws a
 * panel imports sheetContent from here rather than being handed it.
 */
import { sfx } from './audio';

/* Dismissing the sheet has to clear the map selection too, and what "selected"
   means lives with the input handling. */
type Deps = { deselectAll: () => void };
let dep: Deps = { deselectAll: () => {} };
export function initSheet(deps: Deps): void { dep = deps; }

export const sheetWrap = document.getElementById('sheet-wrap')!;
export const sheetContent = document.getElementById('sheet-content')!;
const bottomSheet = () => document.getElementById('bottom-sheet');

export function isSheetOpen(): boolean { return sheetWrap.classList.contains('open'); }
/** Whether an event landed inside the sheet — a tap there is not a tap on the
 *  world, and the world's handler asks this before acting. */
export function sheetContains(node: any): boolean { return sheetWrap.contains(node); }

export function openSheet(): void { sheetWrap.classList.add('open'); sfx('open'); }

export function closeSheet(): void {
  sheetWrap.classList.remove('open');
  document.body.classList.remove('sheet-open');
  bottomSheet()?.classList.remove('expanded');
  sheetNav.reset();
  sfx('close');
}

export type SheetView = { id: string; title?: string; render: () => void };

export const sheetNav = {
  stack: [] as SheetView[],
  push(view: SheetView) { this.stack.push(view); this._show(view); },
  replace(view: SheetView) { this.stack = [view]; this._show(view); },
  back() {
    this.stack.pop();
    const v = this.stack[this.stack.length - 1];
    // Backing out of the last view is a dismissal, not an empty sheet.
    if (v) this._show(v); else dep.deselectAll();
  },
  reset() { this.stack = []; },
  rerender() { const v = this.stack[this.stack.length - 1]; if (v) this._show(v); },
  _show(view: SheetView) {
    const wasOpen = isSheetOpen();
    view.render();
    if (view.title) renderSheetHeader(view);
    if (!wasOpen) sfx('open');   // re-rendering an open sheet is silent
    sheetWrap.classList.add('open');
    document.body.classList.add('sheet-open');
  },
};

function renderSheetHeader(view: SheetView): void {
  const h = document.createElement('div');
  h.className = 'sheet-header';
  h.innerHTML = `<button class="sheet-back${sheetNav.stack.length < 2 ? ' hidden' : ''}" aria-label="Back">‹</button>` +
                `<div class="sheet-title">${view.title}</div>`;
  sheetContent.prepend(h);
  h.querySelector('.sheet-back')!.addEventListener('click', () => sheetNav.back());
}

/** Drag-to-expand between two detents (46vh / 85vh). The handler is bound to the
 *  grabber zone ONLY: the sheet body scrolls, and a drag handler over both has
 *  to guess which the player meant. Binding the narrow strip removes the guess. */
export function initSheetDrag(): void {
  const zone = document.getElementById('grabber-zone');
  const sheet = bottomSheet();
  if (!zone || !sheet) return;
  let startY: number | null = null;
  zone.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
  zone.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < -24) { sheet.classList.add('expanded'); startY = null; }
    else if (dy > 24) {
      // Down from expanded collapses; down from collapsed dismisses.
      if (sheet.classList.contains('expanded')) sheet.classList.remove('expanded');
      else dep.deselectAll();
      startY = null;
    }
    e.preventDefault();
  }, { passive: false });
  zone.addEventListener('touchend', (e) => {
    if (startY !== null && Math.abs(e.changedTouches[0].clientY - startY) < 8) {
      sheet.classList.toggle('expanded');       // a tap on the grabber toggles
    }
    startY = null;
  });
  // Mouse: there is no touchend to fall back on, so click carries the toggle.
  zone.addEventListener('click', () => { if (!('ontouchstart' in window)) sheet.classList.toggle('expanded'); });
}

/** The sheet body's elements, typed. Every panel binds its buttons by data
 *  attribute right after writing its innerHTML, and `dataset` is not on the bare
 *  Element that querySelectorAll hands back. */
export function sheetAll(sel: string): HTMLElement[] {
  return Array.from(sheetContent.querySelectorAll(sel)) as HTMLElement[];
}

/* ── GAUGES ── the two bar shapes every sheet uses. Both were hand-rolled with
   inline styles at a dozen call sites before they were helpers; keep them here
   so a change to either lands everywhere at once. */

/** A slim inline bar, for a row that is mostly text. */
export function miniBar(pct: number, color: string): string {
  return `<span class="mini-bar"><i style="width:${pct}%;background:${color};"></i></span>`;
}

/** A full-width labelled bar with its percentage called out. */
export function statBar(label: string, val: number, color: string): string {
  return `<div class="stat-bar-label"><span>${label}</span><span>${Math.round(val)}%</span></div>
  <div class="stat-bar"><div class="stat-bar-fill" style="width:${val}%;background:${color}"></div></div>`;
}
