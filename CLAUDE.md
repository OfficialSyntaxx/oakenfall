# Oakenfall — Project Brief for Claude Code

Mobile-first isometric 2:1 city-builder/civ sim. ONE self-contained HTML file
(`index.html`), vanilla JS + Canvas 2D. No frameworks, no build step, no npm,
no external network requests at runtime. All art is base64-embedded.

## Hard constraints (never violate)
- Single file. All assets embedded as data URIs.
- Mobile touch first: drag-pan, pinch-zoom, double-tap zoom, bottom-docked
  sheets (side-docked in landscape). 44px minimum touch targets.
- Every sprite consumer has a procedural canvas fallback. NEVER remove
  fallbacks — sprites are an upgrade layer, not a dependency.
- Dark old-school-MMORPG palette. New assets get color-graded (darkened,
  earth-tinted) before embedding, matching existing GRADE conventions.

## Architecture map
- Terrain: `drawTerrain` + `terrainStampFor` (Kenney block tiles in
  TERRAIN_B64; water recessed WATER_DROP=6; procedural fallback).
- Buildings: `BUILD_DEFS` (17 types incl. processors with `proc` recipes),
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
1. Extract script and syntax-check:
   `node -e "const m=require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*)<\/script>/); require('fs').writeFileSync('/tmp/c.js',m[1]);" && node --check /tmp/c.js`
2. Feature asserts: for each change, grep/assert the exact strings landed.
3. Duplicate function scan (no duplicate `function X` declarations).
4. Bump GAME_VERSION + add a CHANGELOG.md entry for player-visible changes.

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
- `applyDifficulty` references GAME_MODES declared later in the file — only
  call it from user-gesture handlers, never at top level during boot.

## Workflow preferences (from the project owner, Syntaxx)
- Outline architecture before large code dumps; approve roadmap before big
  feature batches; minimize tool calls.
- Zero external asset dependencies at runtime — everything embedded.
- Prefers reviewing a proposed plan before large batches of changes.

## Asset licenses
See CREDITS.md. Kenney packs (CC0), Tiny Swords free pack (Pixel Frog,
CC-friendly per itch page), one painterly tree asset.
