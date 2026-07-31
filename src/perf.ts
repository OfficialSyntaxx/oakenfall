/* How long a frame takes, and where it goes.
 *
 * The budget is 16.7ms for 60fps and 33.3ms for 30. Oakenfall is aimed at
 * phones, where the CPU is slower and the thermal ceiling is real, and until
 * this existed nobody had a number for either half of the frame.
 *
 * Wall-clock frame delta is the wrong thing to measure here: headless browsers
 * do not pace to a display, a backgrounded tab is throttled to one frame a
 * second, and a machine under load reports the load rather than the game. What
 * IS ours, and is comparable between runs and machines, is the time the game
 * spends inside its own update and render. That is what this samples.
 *
 * Percentiles, not averages. A mean hides exactly the frames that matter — one
 * 90ms hitch every couple of seconds is the thing a player feels, and it barely
 * moves a mean taken over 300 frames.
 */

/** Ring of recent samples, in milliseconds. Two seconds' worth at 60fps, which
 *  is long enough to catch a periodic hitch and short enough to still reflect
 *  what is happening NOW rather than what happened at the title screen. */
const CAP = 120;

type Ring = { buf: Float64Array; n: number; total: number };
const mk = (): Ring => ({ buf: new Float64Array(CAP), n: 0, total: 0 });

/* Rings are created on demand, so a new phase can be timed by naming it — the
   point of this is to answer "where does the frame go", and that question moves
   as the renderer changes. */
const rings: Record<string, Ring> = {};
const ring = (k: string): Ring => (rings[k] || (rings[k] = mk()));

/* Timing is itself a cost — performance.now() is cheap but not free, and this
   runs three times a frame forever. Off by default; the debug overlay and the
   perf suite turn it on. */
let on = false;
export function setPerfOn(v: boolean): void {
  on = v;
  if (!on) for (const k of Object.keys(rings)) delete rings[k];
}
export function isPerfOn(): boolean { return on; }

/** Start a span. Returns a function that closes it — cheaper than a label
 *  lookup on both ends, and it cannot be left unbalanced. */
export function span(kind: string): () => void {
  if (!on) return noop;
  const t0 = performance.now();
  return () => {
    const r = ring(kind);
    r.buf[r.total % CAP] = performance.now() - t0;
    r.total++;
    if (r.n < CAP) r.n++;
  };
}
const noop = () => {};

function pct(r: Ring, p: number): number {
  if (!r.n) return 0;
  const a = Array.from(r.buf.subarray(0, r.n)).sort((x, y) => x - y);
  return Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))] * 100) / 100;
}

export type PerfReport = Record<string, { p50: number; p95: number; worst: number; n: number }>;

/** A snapshot for the debug overlay and the perf suite. */
export function perfReport(): PerfReport {
  const out: PerfReport = {};
  for (const [k, r] of Object.entries(rings)) {
    out[k] = { p50: pct(r, 0.5), p95: pct(r, 0.95), worst: pct(r, 0.999), n: r.n };
  }
  return out;
}
