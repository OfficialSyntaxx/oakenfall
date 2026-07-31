/* Reading and writing a hold, and refusing to lose one.
 *
 * The failure this module exists to prevent: `loadGame` used to return a bare
 * false for every possible reason — no save, unreadable save, save from a
 * version that doesn't exist yet — and the caller answered every false the same
 * way, by starting a new hold. So a player who tapped Continue on a slot the
 * title screen advertised as "Day 47 · 12 settlers" could be dropped into an
 * empty valley without a word, and the next autosave, ninety seconds later,
 * would write over the hold they had lost. The slot index is stored separately
 * from the save, which is what let the two disagree in the first place.
 *
 * Three rules follow from that:
 *   1. A load failure is never silent and never destroys anything. The caller
 *      gets a REASON, not a boolean, and the player stays on the title screen.
 *   2. Every slot keeps one known-good previous save. Overwriting a hold is the
 *      only operation here that can lose data, so the thing being overwritten is
 *      copied aside first — a rollback of one autosave beats an empty valley.
 *   3. A save is validated BEFORE any of it is applied. Restoring is a long
 *      series of writes into G, and a throw halfway through leaves a world that
 *      is neither the old one nor the new one.
 *
 * Validation is deliberately structural, not exhaustive: it checks the shapes
 * that restoreState indexes into without asking, because those are the ones
 * that throw. Field-level defaults are state.ts's job (LOAD_DEFAULTS), and a
 * save missing an ordinary field is not damaged — it is old, which is fine.
 */

/** Bumped only when the format changes in a way an older build cannot read.
 *  A save from the FUTURE is refused rather than half-understood. */
export const SAVE_VERSION = 2;

/** The smallest map the game offers is 26²; anything under this is not a map. */
const MIN_MAP = 8;

export type LoadFailure = 'empty' | 'unreadable' | 'invalid' | 'future';

export type LoadOutcome =
  | { ok: true; data: any; fromBackup: boolean }
  | { ok: false; kind: LoadFailure; detail: string };

/** Where a slot's previous known-good save lives. One deep, per slot. */
export function backupKey(key: string): string { return key + ':prev'; }

/** Structural check. Returns null when the save is usable, else a short reason.
 *
 * Only the parts restoreState walks blindly are checked: it reads
 * data.grid[y][x].type for every tile of the map it derives FROM data.grid, and
 * iterates data.buildings and data.villagers without testing them. Those are
 * the three shapes that can throw. */
export function validateSave(data: any): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'not a save object';

  const grid = data.grid;
  if (!Array.isArray(grid) || grid.length < MIN_MAP) return 'no map in the save';
  const size = grid.length;
  for (let y = 0; y < size; y++) {
    const row = grid[y];
    // Every row must be as long as the map is tall — restoreState derives the
    // map size from the row COUNT and then indexes every row by it.
    if (!Array.isArray(row) || row.length !== size) return `map row ${y} is the wrong length`;
    for (let x = 0; x < size; x++) {
      const cell = row[x];
      if (!cell || typeof cell.type !== 'string') return `tile ${x},${y} has no terrain`;
    }
  }

  if (!Array.isArray(data.buildings)) return 'no buildings list';
  for (const b of data.buildings) {
    if (!b || typeof b.type !== 'string') return 'a building has no type';
    // Out-of-bounds coordinates index past the grid rows during restore.
    if (!(b.gx >= 0 && b.gx < size && b.gy >= 0 && b.gy < size)) return `a ${b.type} stands off the map`;
  }

  if (!Array.isArray(data.villagers)) return 'no settlers list';
  for (const v of data.villagers) {
    if (!v || typeof v.name !== 'string') return 'a settler has no name';
  }

  // The hold's own position is read back directly, so it has to be on the map.
  if (data.tcX !== undefined && !(data.tcX >= 0 && data.tcX < size)) return 'the hold stands off the map';
  if (data.tcY !== undefined && !(data.tcY >= 0 && data.tcY < size)) return 'the hold stands off the map';

  return null;
}

/** Parse and validate one stored string. Never throws. */
export function readSaveText(text: string | null | undefined): LoadOutcome {
  if (!text) return { ok: false, kind: 'empty', detail: 'nothing stored' };
  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e) {
    // A truncated or garbled write lands here — the save exists but cannot be read.
    return { ok: false, kind: 'unreadable', detail: 'the save could not be read' };
  }
  const v = Number(data && data.v);
  if (Number.isFinite(v) && v > SAVE_VERSION) {
    return { ok: false, kind: 'future', detail: `saved by a newer version of the game (format ${v})` };
  }
  const bad = validateSave(data);
  if (bad) return { ok: false, kind: 'invalid', detail: bad };
  return { ok: true, data, fromBackup: false };
}

/** Load a slot, falling back to its one-deep backup if the current save is
 *  damaged. The backup is only ever offered when the live save FAILED — a
 *  readable save is always preferred, even if it is a moment older. */
export async function loadSlot(kv: any, key: string): Promise<LoadOutcome> {
  const live = await safeGet(kv, key);
  const first = readSaveText(live);
  if (first.ok) return first;
  // Nothing stored at all means an empty slot, not a damaged one — do not go
  // looking for a backup of a hold that never existed.
  if (first.kind === 'empty') return first;

  const prev = await safeGet(kv, backupKey(key));
  const second = readSaveText(prev);
  if (second.ok) return { ...second, fromBackup: true };
  return first;      // report the ORIGINAL failure, not the backup's
}

/** Write a slot, keeping the previous known-good save aside first.
 *
 * The copy is skipped when what is already stored cannot be read: keeping a
 * damaged save as the backup would overwrite the last good one with rubbish,
 * which is the opposite of the point. */
export async function writeSlot(kv: any, key: string, text: string): Promise<boolean> {
  const existing = await safeGet(kv, key);
  if (existing && readSaveText(existing).ok) {
    try { await kv.set(backupKey(key), existing, false); } catch (e) { /* a missing backup must not fail the save */ }
  }
  try { return !!(await kv.set(key, text, false)); } catch (e) { return false; }
}

async function safeGet(kv: any, key: string): Promise<string | null> {
  try {
    const res = await kv.get(key, false);
    return res && typeof res.value === 'string' ? res.value : null;
  } catch (e) { return null; }
}

/** What to tell the player. Written to be read by someone who has just lost
 *  something, so each one says what happened AND what is still true. */
export function describeFailure(kind: LoadFailure, detail: string): string {
  switch (kind) {
    case 'future':
      return '⚠️ This hold was saved by a newer version of Oakenfall and cannot be opened here. ' +
             'It has been left untouched — update the game to continue it.';
    case 'unreadable':
      return '⚠️ This hold\'s record could not be read, and no earlier copy survived. ' +
             'It has been left untouched rather than overwritten.';
    case 'invalid':
      return `⚠️ This hold's record is damaged (${detail}), and no earlier copy survived. ` +
             'It has been left untouched rather than overwritten.';
    default:
      return '⚠️ There is no hold saved in this slot.';
  }
}
