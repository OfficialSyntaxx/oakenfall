/* Where a hold is kept.
 *
 * Three backings, picked in this order:
 *   1. A host-provided window.storage (the KV the game was originally embedded
 *      in). If it's there, it wins — the host owns the data.
 *   2. Capacitor Preferences, on a real iOS/Android build. WebView localStorage
 *      is evictable under storage pressure; Preferences is not, and losing a
 *      hold to a cache sweep is not a bug anyone forgives.
 *   3. localStorage, for the web build.
 *
 * The shape is the host's: get() resolves to { value } or null, set() resolves
 * to a boolean. Everything above this layer is written against that already.
 */

export interface KVResult { value: string }
export interface KV {
  get(key: string, shared?: boolean): Promise<KVResult | null>;
  set(key: string, value: string, shared?: boolean): Promise<boolean>;
}

declare global {
  interface Window { storage?: KV; Capacitor?: { isNativePlatform?: () => boolean } }
}

const localKV: KV = {
  async get(key) {
    try { const v = localStorage.getItem(key); return v === null ? null : { value: v }; }
    catch (e) { return null; }
  },
  async set(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },
};

/** True on a Capacitor native build (iOS/Android), false in a browser. */
export function isNative(): boolean {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch (e) { return false; }
}

/* Preferences is loaded lazily and only on native, so the web bundle never
   pays for a plugin it cannot use. Until it resolves, reads and writes fall
   through to localStorage, which the WebView also has — so an early save is
   never simply dropped. */
let prefs: any = null;
let prefsReady: Promise<void> | null = null;
function loadPrefs(): Promise<void> {
  if (!prefsReady) {
    prefsReady = import('@capacitor/preferences')
      .then((m) => { prefs = m.Preferences; })
      .catch(() => { prefs = null; });
  }
  return prefsReady;
}

const nativeKV: KV = {
  async get(key) {
    await loadPrefs();
    if (!prefs) return localKV.get(key);
    try {
      const { value } = await prefs.get({ key });
      if (value !== null && value !== undefined) return { value };
      // A hold saved before the native build existed still lives in localStorage.
      const legacy = await localKV.get(key);
      if (legacy) { try { await prefs.set({ key, value: legacy.value }); } catch (e) {} }
      return legacy;
    } catch (e) { return localKV.get(key); }
  },
  async set(key, value) {
    await loadPrefs();
    if (!prefs) return localKV.set(key, value);
    try { await prefs.set({ key, value }); return true; }
    catch (e) { return localKV.set(key, value); }
  },
};

/** Install window.storage unless the host already provided one. */
export function installStorage(): KV {
  if (!window.storage) window.storage = isNative() ? nativeKV : localKV;
  return window.storage;
}
