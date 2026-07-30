/* Cosmetic entitlements — what a supporter has bought, and how the game proves
 * it without ever touching the network.
 *
 * A pack bought on the website comes back as a "payload.signature" code signed
 * by a private key that lives only in the site's Netlify function. The game
 * verifies it OFFLINE against the public key embedded below, so redeeming works
 * on a plane and a code cannot be forged from anything shipped here.
 *
 * Unlocks are written to their own storage key as well as into the save, so a
 * redeemed pack survives a wiped hold — someone who paid does not lose what
 * they paid for by starting over.
 */
import { G } from './state';
import { UNLOCK_SKUS } from './defs';

/* Saving the whole hold after a redeem is main.ts's job (it owns the slot the
   run is in, and whether a run has started at all). */
type Deps = { saveIfRunning: () => void };
let dep: Deps = { saveIfRunning: () => {} };
export function initUnlocks(deps: Deps): void { dep = deps; }

/** ECDSA P-256 public key, SPKI, base64. Public by design — it can only verify. */
const REDEEM_PUBKEY_SPKI = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAERa+HGQmoarIV601nzvFQOQDNa9nAJDdY8ZOSjedDrMTvfEDGKFlzBIUNc6RTQl/qMlRAXzxeW5F9mhLFTo6auQ==';

/** Promo code that reveals the hidden developer panel from the Redeem sheet. */
export const ADMIN_PROMO = 'Joy904';

export function hasUnlock(sku: string): boolean { return !!G.unlocks[sku]; }
export function isPatron(): boolean { return !!G.unlocks.supporter; }

let _redeemKeyPromise: Promise<CryptoKey> | null = null;
function redeemPubKey(): Promise<CryptoKey> {
  if (!_redeemKeyPromise) {
    const raw = Uint8Array.from(atob(REDEEM_PUBKEY_SPKI), (c) => c.charCodeAt(0));
    _redeemKeyPromise = crypto.subtle.importKey('spki', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  return _redeemKeyPromise;
}

/** base64url → bytes. The signature and payload both travel URL-safe so a code
 *  survives being pasted out of an email or a query string. */
function b64uToBytes(s: string): Uint8Array {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
}

export type RedeemResult =
  | { ok: true; sku: string; name: string; already: boolean }
  | { ok: false; reason: string };

/** Verify a code offline and apply what it grants. Never throws — every failure
 *  path comes back as a sentence the Redeem sheet can show as-is. */
export async function redeemCode(codeStr: string): Promise<RedeemResult> {
  try {
    const parts = String(codeStr || '').trim().split('.');
    if (parts.length !== 2) return { ok: false, reason: 'That doesn\'t look like an Oakenfall code.' };
    const payloadBytes = b64uToBytes(parts[0]);
    const sigBytes = b64uToBytes(parts[1]);
    const key = await redeemPubKey();
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
      sigBytes as BufferSource, payloadBytes as BufferSource);
    if (!ok) return { ok: false, reason: 'This code could not be verified.' };
    const data = JSON.parse(new TextDecoder().decode(payloadBytes));
    const sku = data.s;
    if (!(UNLOCK_SKUS as any)[sku]) return { ok: false, reason: 'This code is for content this version doesn\'t know.' };
    const already = !!G.unlocks[sku];
    G.unlocks[sku] = true;
    applyPatronBanners();
    if (data.n) (G.unlocks as any)._patronName = String(data.n).slice(0, 24);
    saveUnlocks();
    dep.saveIfRunning();
    return { ok: true, sku, name: (UNLOCK_SKUS as any)[sku].name, already };
  } catch (e) {
    return { ok: false, reason: 'Something went wrong reading that code.' };
  }
}

/* ── BANNERS ── the one cosmetic that shows on the map. The base four are
   everyone's; supporter packs append to the palette rather than replacing it. */

export const BANNER_COLORS = ['#a4402c', '#2c5a8a', '#3a7a3a', '#c8982c'];
const BANNER_UNLOCK_COLORS: Record<string, string[]> = {
  supporter: ['#6b3fa0', '#b8862c'],   // royal purple, antique gold
  frost:     ['#3a8fb0', '#7fb0c4'],   // glacier, frostlight
  ember:     ['#c2451f', '#e08a2c'],   // ember red, forge orange
};

/** Rebuilt whenever unlocks change. Exported for reading only — importers see
 *  the live binding, so a reassignment here is visible everywhere. */
export let bannerPalette: string[] = BANNER_COLORS.slice();

export function applyPatronBanners(): void {
  bannerPalette = BANNER_COLORS.slice();
  for (const sku of Object.keys(BANNER_UNLOCK_COLORS)) {
    if (G.unlocks && G.unlocks[sku]) bannerPalette = bannerPalette.concat(BANNER_UNLOCK_COLORS[sku]);
  }
  // A palette that shrank (it cannot today, but a save could carry a stale
  // index) must not leave bannerIdx pointing past the end.
  if (G.bannerIdx >= bannerPalette.length) G.bannerIdx = 0;
}

/** The banner currently flown, with the base red as the last resort. */
export function bannerColor(): string {
  return bannerPalette[G.bannerIdx] || BANNER_COLORS[G.crestChoice] || BANNER_COLORS[0];
}

/* ── PERSISTENCE ── a key of their own, beside the save slots. */

export async function saveUnlocks(): Promise<void> {
  try { await (window as any).storage.set('oakenfall-unlocks', JSON.stringify(G.unlocks || {}), false); } catch (e) {}
}

export async function loadUnlocks(): Promise<void> {
  try {
    const res = await (window as any).storage.get('oakenfall-unlocks', false);
    if (res && res.value) {
      const u = JSON.parse(res.value);
      G.unlocks = Object.assign({}, u, G.unlocks);   // in-memory (just-redeemed) wins
      applyPatronBanners();
    }
  } catch (e) {}
}
