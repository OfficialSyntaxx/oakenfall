# Oakenfall — Project Brief for Claude Code

Mobile-first isometric 2:1 city-builder/civ sim. Canvas 2D, no game framework.
Built with Vite: `index.html` is a shell, the game lives in `src/`, art in
`public/assets/`. Runs fully offline — assets are bundled from our own origin and
service-worker cached, never a third-party CDN.

(It began as one self-contained 15MB HTML file with everything base64-inlined.
That is retired: see the architecture direction below.)

## Architecture direction (decided; migration in progress)
The end goal is a shipped **mobile game (iOS/Android)**. The owner approved a
move to **Vite + TypeScript modules + Capacitor**. The "one self-contained file"
rule is being retired deliberately — its *purpose* (runs anywhere, fully
offline, no network dependency) is preserved by bundling assets locally and
caching via the service worker, which a Capacitor app satisfies natively.
Migration order: (1) extract assets out of the HTML, (2) move code into TS
modules, (3) Capacitor wrap + native storage.

- **Step 1 DONE** — all assets live in `public/assets/` (extracted by
  `tools/extract-assets.mjs`, rewritten by `tools/rewrite-assets.mjs`). The game
  went 15.3MB → ~395KB.
- **Step 2 in progress** — `index.html` is now a shell; code lives in `src/`,
  built by Vite (`npm run build` = `vite build && node site/build.js`).
  Extracted so far: `src/math.ts` (typed), `src/assets.ts`, `src/defs.ts`.
  `src/main.ts` still holds the rest under `@ts-nocheck`; split further with
  `tools/split-module.mjs`, verifying with `npm run smoke` after each move.
  Only lift declarations that are genuinely self-contained — anything closing
  over live game state (QUESTS, DECREE_DEFS) must wait for that state to move.
- **Step 3 pending** — Capacitor.

## Verification
- `npm run smoke` — builds, serves `_site`, boots the real game in Chromium at
  phone/landscape/desktop and asserts the world renders, assets load, the canvas
  is sized, the HUD does not collide, and no console/request errors occur.
- `node tools/shots.mjs` — screenshots both orientations × collapsed/expanded
  into /tmp/shots for eyeballing UI work.
- `node tools/weather-shots.mjs` — forces clear/rain/snow via the admin panel and
  shoots the terrain, since the living-surface effects are invisible by default.
- `npm run gameplay` / `npm run verify` — drives the real player flow (promo code
  → admin → Steward order) and asserts settlers self-employ and switch trades.
- `npx tsc --noEmit` — typecheck.

## Hard constraints (never violate)
- Assets are bundled **locally** — never fetched from a third-party CDN at
  runtime. Offline play must always work.
- Mobile touch first: drag-pan, pinch-zoom, double-tap zoom, bottom-docked
  sheets (side-docked in landscape). 44px minimum touch targets.
- Every sprite consumer has a procedural canvas fallback. NEVER remove
  fallbacks — sprites are an upgrade layer, not a dependency.
- Dark old-school-MMORPG palette. New assets get color-graded (darkened,
  earth-tinted) before embedding, matching existing GRADE conventions.

## Architecture map
- Terrain: `drawTerrain` + `terrainStampFor` (Kenney block tiles in
  TERRAIN_B64; water recessed WATER_DROP=6; procedural fallback).
- Buildings: `BUILD_DEFS` (20 types incl. processors with `proc` recipes),
  `drawBuilding` (sprite via `blitSprite`/SPRITE_URLS + hand-drawn iso-kit:
  isoBox/isoRoof/glowWindow/chimneySmoke). Decay via `condition` (<35 = worn,
  bonuses halt). `hasActiveBuilding` gates bonuses.
- Villagers: state machine in `updateVillager`; roles in ROLE_DEFS; animated
  via VANIM (Tiny Swords Pawn/Lancer frames), `villagerAnimFor` maps
  state+role→anim; morale system with leave mechanic; families (partner,
  births); traits; illness.
- Systems: seasons+weather (`rollWeather`), day/night lighting
  (`renderLighting`, destination-out pools), research (TECH_TREE, hooks
  scattered — grep `researched.`), hold tiers, daily bounties+coins+shop,
  bandits+defense, offline progress, 4 game modes (GAME_MODES — check
  gameMode multipliers before balancing).
- FX: DECOR sprites (dust/boom/splash/fire/clouds/oak), flyFX (resource→HUD).
- Save: `serializeState`/`restoreState`, key 'oakenfall-save', versioned,
  derives MAP_SIZE from saved grid. Uses window.storage (host KV), NOT
  localStorage.
- Feedback: GAME_VERSION + CHANGELOG + errorLog ring buffer +
  `buildDiagnostics`; report/suggest buttons POST to FEEDBACK_ENDPOINT
  (`/.netlify/functions/submit-feedback`), a Netlify Function that files the
  GitHub issue server-side via a repo-scoped token (`GITHUB_ISSUE_TOKEN` env
  var) — players never need a GitHub account. REPO_URL is only used as a
  manual fallback link if the function is unreachable. Function source:
  `netlify/functions/submit-feedback.js`.

## Verification workflow (run before every commit)
1. `npm run verify` — build + smoke + gameplay. This replaces the old
   extract-and-`node --check` dance; the build itself now catches syntax errors.
2. `npx tsc --noEmit` when modules changed.
3. Screenshot anything visual (`tools/shots.mjs`, `tools/weather-shots.mjs`) —
   the automated checks have passed while the UI looked wrong.
4. Bump GAME_VERSION in `src/main.ts` + add a CHANGELOG.md entry for
   player-visible changes. The site build fails if the two disagree.

## Known pitfalls (hard-won)
- Canvas resize feedback loop in iframes: never set canvas.width/height when
  unchanged (guards exist — keep them).
- Never multiply arc/ellipse radii by signed direction values; mirror with
  ctx.scale(-1,1).
- iOS Safari can throw spurious "RangeError: Maximum call stack size
  exceeded" from drawImage under memory pressure — keep drawImage calls in
  try/catch in hot paths; errors feed `errorLog`.
- Per-frame gradient allocation is expensive — cache or use flat fills.
- Sprite-sheet frames must be trimmed with a UNION bbox across frames, or
  animations jitter (fixed once already — don't reintroduce).
- ~~`applyDifficulty` references GAME_MODES declared later in the file~~ —
  RESOLVED: GAME_MODES moved to `src/defs.ts` and is imported, so it is
  initialised before `main.ts` runs. The ordering hazard is gone.
- Regex over `src/main.ts` can blow the stack on very long lines — the asset
  tooling hit this on 6MB base64 strings. Prefer manual scanning for big files
  (see `tools/extract-assets.mjs`).
- Splitting a function out of `main.ts` by brace-balancing must skip the
  parameter list: `function f(a,b){…}` closes to depth 0 at `)` before the body
  opens, which silently decapitates it (see `tools/split-module.mjs`).

## Workflow preferences (from the project owner, Syntaxx)
- Outline architecture before large code dumps; approve roadmap before big
  feature batches; minimize tool calls.
- Zero external asset dependencies at runtime — everything embedded.
- Prefers reviewing a proposed plan before large batches of changes.

## Asset licenses
See CREDITS.md. Kenney packs (CC0), Tiny Swords free pack (Pixel Frog,
CC-friendly per itch page), one painterly tree asset.
