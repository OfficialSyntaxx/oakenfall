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
  Forty modules now, and `main.ts` is down from 7,826 lines to under 3,500.
  Everything except `critters.ts` and `main.ts` itself
  typechecks WITHOUT `@ts-nocheck`, which is the property worth protecting: a
  name that stops resolving in a typed module fails the build, where the same
  mistake in `main.ts` throws into a frame loop that swallows it. When moving
  code, remove `@ts-nocheck` and let `npx tsc --noEmit` name every unresolved
  dependency at once — a regex scan over the block finds some and misses others
  (it missed `activeEvent` where tsc named it immediately).

  Extracted so far, in rough dependency order:
  - **Foundations** — `math`, `defs`, `assets`, `state` (`G`), `version`,
    `storage`, `audio`, `time`, `landcode`, `admin`.
  - **Presentation plumbing** — `camera` (the camera, the viewport and the
    screen↔world projection, all const objects with mutable contents so seven
    modules import them instead of being handed them), `sprites`, `isokit` (the
    hand-drawn iso primitives; takes the canvas via `initIsoKit(ctx)` and its
    clock via `setKitTime(worldTime)` once per frame), `feedback`.
  - **Drawing** — `terrain`, `scenery`, `backdrop` (the void, the sea and the
    island skirt), `buildrender`, `villagerrender`, `critters`, `lighting`,
    `minimap`, `fx`.
  - **Simulation** — `mapgen`, `pathfind`, `weather`, `skills`, `lives`
    (friendship/marriage/aging/death/idling), `work` (the utility-AI trade
    scoring), `buildings`, `villager` (the state machine), `steward`, `economy`
    (stores + ledger), `progress` (study + hold tiers), `fire`, `raiders`,
    `contracts`, `chronicle` (the hold's own history), `unlocks` (offline code
    verification + the banner palette).

  **Extract the module others already depend on FIRST.** Doing `buildings`
  before `villager` turned seven injected callbacks into ordinary imports;
  `economy` and `progress` each removed injections from modules extracted
  earlier. Going the other way builds a module that is mostly plumbing.

  **Order of business in main.ts is load-bearing.** Cutting an inline block out
  of the world tick (wolves, bandits) must put the call back where the block
  was, not where it reads nicely.

  **The pattern for anything that draws:** a module cannot import `ctx` and
  write to it, so push the dependencies in through one `init*` call and keep a
  module-local reference. `initIsoKit`, `initCritters` and `setForceWinter` are
  all the same move. Site the call AFTER any `const` it reads — `initCritters`
  needs WATER_DROP, and calling it up beside `initIsoKit` hits that const's
  temporal dead zone, which throws into a frame loop that swallows it.

  **State lives in `src/state.ts` as one live object `G`.** A module cannot
  assign to an imported binding — `import { grid }` is a read-only view, so
  `grid = []` elsewhere is a compile error — which is why the split stalled for
  months. `G` is a const binding with mutable contents, so `G.grid = []` is an
  ordinary property write any module can do. `src/mapgen.ts` proves it: it
  writes the whole map cluster and could not have existed before.

  **Migration is per cluster, never big-bang.** Move one group of variables into
  `G`, rewrite `main.ts`'s references, `npm run verify`, commit. Done: the map
  (MAP_SIZE, grid, TC_*, tile lists), the people (villagers, usedNames,
  memorials, guilds, idleSlotCounter, courtship/birth timers), what stands on
  the land (buildings, districts), the stores (stockpile, totals), the outsiders
  (raiders, critters), and the world/run/coin cluster (worldTime, dayCount,
  researched, coins, ledger, journal, deeds, chronicle, decrees, unlocks,
  holdName, trade routes, climate, plague, …). That is everything
  `serializeState` writes. What remains in `main.ts` is UI and session flags:
  selection, buildMode, camera, sheet state, timers that do not persist.

  **Use `tools/migrate-cluster.mjs`, do not hand-roll the regex.** Five traps
  bite, and the script handles four of them and prints the fifth:
  - A name after `.` is somebody else's property (`data.grid` must NOT become
    `data.G.grid`) — but `...grid` is a spread of the real binding and also
    follows a dot.
  - A name before `:` is an object key (`grid:` in `serializeState`) OR a
    ternary arm (`typeof dayCount<'u' ? dayCount : 1`). Tell them apart by what
    comes *before*: a `?` means ternary, and that IS a reference. Getting this
    wrong ships a ReferenceError that only fires on the code path that uses it.
  - Shorthand properties (`{ usedNames, journal }`) and declarations
    (`let villagers = []`) cannot be rewritten in place; the script lists them.
  - A local may shadow a global of the same name (`const coins = …` inside
    `makeRouteOffer`). Those show up in the declaration list — revert them.
  - The code/text scanner needs REAL template nesting. The UI is templates
    holding `${…}` holes holding further templates; close the outer backtick at
    the first inner one and the rest of the file desynchronises, the next
    apostrophe in prose opens a string that never closes, and thousands of
    lines look like text. A naive scanner found 115 references where the
    correct one found 143.

  The end state: `serializeState`/`restoreState` collapse into save/load of
  `G`'s own fields, so the save format stops being a hand-maintained list that
  drifts from the state it mirrors. It drifted once already — TC_X was missing
  until the land editor put a hold somewhere other than the middle.
  `src/main.ts` still holds the rest under `@ts-nocheck`; split further with
  `tools/split-module.mjs`, verifying with `npm run smoke` after each move.
  Only lift declarations that are genuinely self-contained — anything closing
  over live game state (QUESTS, DECREE_DEFS) must wait for that state to move.
- **Step 3 DONE (scaffold)** — Capacitor wraps both platforms. `capacitor.config.ts`
  points at `dist`; `npm run cap:sync` builds and copies; `npm run android` /
  `npm run ios` open the native projects. The native projects ARE committed
  (manifests, icons, signing live there) but everything `cap sync` regenerates
  is gitignored — the copied web assets alone are 13MB per platform.
  Saves go through `src/storage.ts`: host KV → Capacitor Preferences on native
  → localStorage on web. Android's back button closes a sheet, leaves build
  mode, then saves and exits. Building an IPA still needs Xcode on a Mac;
  an APK needs the Android SDK.

## Verification
- `npm run verify` — everything, in two halves. It now takes over ten minutes,
  so `npm run verify:sim` (build + smoke + gameplay + scenario + editor) and
  `npm run verify:hold` (slots + steward + health + systems + site) can be run
  separately when a tool or shell caps out at ten.
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
- `npm run freevars` (`tools/free-vars.mjs`) — the guard `main.ts` was missing.
  It strips `@ts-nocheck` in a temp copy of `src/` and reports **only** TS2304
  "Cannot find name", which is not a type complaint: the name is not there.
  A free variable in `main.ts` throws at runtime, and a throw inside one of the
  render try/catch blocks is swallowed in silence — that is how the sea stopped
  drawing for five versions when `windPhase` moved into `terrain.ts`. Part of
  `verify:sim`. Real host globals go in its KNOWN_GLOBALS with a reason.

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
2. `npx tsc --noEmit` when modules changed. `npm run freevars` after moving
   ANY code out of `main.ts` — that is the move that creates free variables.
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
- Cutting a function out by matching `\nfunction name(` … `\n}\n` must put the
  newline back. Splicing `s[:i] + s[j+3:]` consumes the separator, so the NEXT
  function no longer starts at a line break and the following cut silently
  deletes it too — functions disappear in pairs. Verify counts after any bulk
  extraction.
- Extracted drawing code can't reach `ctx`, `worldTime` or the sun angle. Push
  them in (`initIsoKit`, `setKitTime`, `setSunShadow`) rather than re-exporting
  mutable state — ES module bindings are read-only to importers, so a module
  that wants to *assign* to shared state can't simply import it. This is the
  reason the remaining split is blocked on state design, not on effort.

## Workflow preferences (from the project owner, Syntaxx)
- Outline architecture before large code dumps; approve roadmap before big
  feature batches; minimize tool calls.
- Zero external asset dependencies at runtime — everything embedded.
- Prefers reviewing a proposed plan before large batches of changes.

## Asset licenses
See CREDITS.md. Kenney packs (CC0), Tiny Swords free pack (Pixel Frog,
CC-friendly per itch page), one painterly tree asset.
