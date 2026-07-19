# Oakenfall — Handover to Claude Code

This is the complete context for continuing Oakenfall in Claude Code. Read this
file first, then drop the referenced files into your repo (suggested: a `/docs`
folder for the specs, repo root for the game files).

Claude Code has what this chat lacked: **repo write access and network**, so it
can build, run the test, commit, and let Netlify auto-deploy — end to end.

---

## 1. WHERE THINGS STAND

**The game concept (locked):** "Tiny Kingdoms" — a cozy, AI-driven civilization
sim. You don't control villagers, you influence them (zone land, set priorities,
respond to disasters). Every villager has traits, needs, relationships, and a
life; the world keeps evolving while you're away; every playthrough writes its
own history. One-line pitch: *"a cozy civilization sim where every villager has
a personality, every building tells a story, and the world keeps living while
you're gone."*

**What's been BUILT and VALIDATED (not just specced):**
`oakenfall-living.html` is a single-file, playable implementation of **Phases
1–3** (villagers + zoning/seasons/disasters + relationships/generations). It
passes a headless soak test across ~15 in-game years. This is your working
reference implementation — the logic is proven; it needs porting into the repo's
real structure and art.

**Deploy status:** three Netlify sites exist on the team:
- `oakenfall` — the live game project (game served at `/play/`). THE real one.
- `oakenfall-valley` — landing-page test site (created, may be empty).
- `oakenfall-living-test` — Phases 1–3 test site (created, awaiting a deploy).

Deploys from the previous chat couldn't complete because that sandbox had no
network. Claude Code can deploy normally (git push → Netlify CI, or the Netlify
MCP).

---

## 2. FILES IN THIS HANDOVER

**Playable / code:**
- `oakenfall-living.html` — Phases 1–3 reference implementation. Runs in any
  browser. Structured in three sections: `SIM` (pure logic, zero rendering),
  `RENDER` (PixiJS adapter), `HUD` (DOM). **This split is the whole porting
  strategy: keep SIM, rewrite RENDER against the repo's sprites.**
- `oakenfall-landing.html` — cinematic scroll landing page (day cycle, parallax
  mountains, particles). Play button resolves the game URL: relative `/play/`
  on any `*oakenfall.netlify.app` host, absolute elsewhere.
- `soak-test.js` — headless validation harness (see §4). Wire as `npm test`.

**Specs (the roadmap, in build order):**
- `VILLAGER_AI_UPGRADE.md` — Phase 1 (villager brains). Already implemented in
  the reference file; use as the design-rationale doc.
- `PHASE2_LIVING_WORLD.md` — Phase 2 (AI hardening, zoning, seasons, weather,
  disasters). Implemented in reference file.
- `PHASE3_GENERATIONS.md` — Phase 3 (relationships, families, aging, death,
  history). Implemented in reference file.
- `CLAUDE_CODE_HUD_FIX.md` — the mobile hotbar overflow fix + remove the
  play-page logo/return tab. **Still TODO in the real repo.**
- `HIGGSFIELD_ASSET_MANIFEST.md` — asset production plan for when Higgsfield is
  active. Credit-safety rules included. Not urgent.

---

## 3. FIRST TASKS FOR CLAUDE CODE (in order)

1. **Read the repo.** Understand `site/build.js`, how `_site/` is assembled, and
   what currently serves at `/` and `/play/`. The reference game files here were
   built blind to the repo — reconcile them with the real structure.

2. **Ship the HUD fix + logo removal** (`CLAUDE_CODE_HUD_FIX.md`). Small, high
   value, unblocks mobile testing. Verify at 390x844 and 844x390.

3. **Port the simulation.** Bring the `SIM` section of `oakenfall-living.html`
   into the repo's game as the villager engine. Keep the logic intact; rewrite
   only the RENDER adapter to use the repo's existing sprites/canvas. Extract
   SIM into `sim_only.js` and get `npm test` (soak-test.js) passing in-repo.

4. **Wire the landing page** (optional, `CLAUDE_CODE_PROMPT.md`): serve
   `oakenfall-landing.html` at `/valley/` without disturbing `/` or `/play/`.

5. **Deploy & verify.** Push to main, let Netlify build, fetch the live `/play/`
   and confirm the sim renders and the HUD holds on mobile.

---

## 4. THE SOAK TEST (don't skip this)

The sim has four classic failure modes: task flip-flopping, need death-spirals,
stuck pathing, and dangling references after villagers die. `soak-test.js`
fast-forwards ~15 in-game years and asserts none of them happen, plus that the
birth/death cycle actually works.

Running it caught THREE real bugs during development that were invisible in
casual play:
- runaway food inflation (stockpile hit 134,000) — fixed with diminishing returns.
- false-positive stuck detection on slow elders — fixed with a windowed
  no-progress watchdog.
- a `null !== null` bug that silently blocked ALL founder marriages, killing
  reproduction entirely — fixed with a proper shared-parent check.

Lesson for Claude Code: **any change to the sim must keep `npm test` green.**
The current reference file passes: no extinction, no frozen villagers, no
dangling refs, ~1 re-path/min, healthy births across generations.

---

## 5. DESIGN DECISIONS TO PRESERVE

- **Legibility beats complexity.** A trait only counts if a player can SEE it in
  30 seconds (Lazy naps visibly, Chilly hugs the fire). Don't add stats you
  can't show.
- **The "while you were away" card is the killer feature.** Offline gains are
  computed closed-form + sampled life events, presented as a short story. Invest
  in making it read well.
- **Influence, not control** (Cities: Skylines model). Player paints zones and
  sets priorities; villagers decide where/what to build. Never re-introduce
  manual placement as the primary loop.
- **Death is cozy.** Old age at home, a soft moment, a tree in the memorial
  grove. No graphic content. It exists to enable generations, not drama for its
  own sake.
- **Performance:** AI ticks at 4 Hz (not per frame); relationships update on
  events (not per tick); population capped (30 mobile / higher desktop);
  straight-line movement (no A* yet). Keep these.

---

## 6. ROADMAP BEYOND PHASE 3 (not yet built)

- **Chronicle writing system:** sentence templates that turn the event log into
  prose worth screenshotting (currently functional but plain).
- **Phase 4 — legacy loop:** what keeps an idle player returning for months
  (dynasties, town reputation, milestones, prestige/newgame+).
- **Higgsfield assets:** portraits, key art, trailer — per the manifest, when
  the subscription is active. Validate style on a trial with ONE asset first.

---

## 7. TONE / WORKING NOTES

- Timescales in the reference file are compressed for testing (SEASON_LEN=180s,
  LIFESPAN_BASE=6yr). Scale up for shipping (spec target: 7 min/season).
- The reference file is deliberately asset-free (procedural PixiJS shapes) so it
  runs anywhere. Real art replaces this later.
- Everything here is additive to the existing game — nothing should delete the
  current `/play/` build. Port and integrate, don't replace wholesale, unless
  you decide the reference sim should become the new core (a reasonable call —
  discuss before doing it).
