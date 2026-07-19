# PHASE2_LIVING_WORLD.md — paste into Claude Code (oakenfall repo)

Prerequisite: Phase 1 (VILLAGER_AI_UPGRADE.md) is merged AND passed its
ten-minute test. Phase 2 has three jobs: (A) harden the AI so it provably
works, (B) make villagers deeply individual, (C) Skylines-style zoning +
seasons/weather/disasters. Implement in that order — A before features.

════════════════════════════════════════════════════════
A. AI CORRECTNESS HARDENING (do this first)
════════════════════════════════════════════════════════
Utility AI has four classic failure modes. Guard against each explicitly:

1. FLIP-FLOPPING (villager oscillates eat→work→eat every tick):
   - Task commitment: once an action starts it runs to completion or a
     minimum 8-15s unless a need crosses CRITICAL (>85 urgency).
   - Hysteresis: to interrupt the current task, a competing action must
     score current+20, not merely higher.
   - Cooldowns: after eating, EatFood is score-0 for 60s regardless of need.

2. NEED DEATH-SPIRALS (everyone starves because everyone built):
   - Urgency curves must be QUADRATIC, not linear:
     urgency = ((100-need)/100)^2 * 100 — mild needs stay ignorable,
     critical needs dominate everything.
   - Global governor: if village food < 1 day's consumption, temporarily
     boost all food-work scores by +30 (village survival instinct).

3. STUCK VILLAGERS (walking into water/props forever):
   - Movement watchdog: if position delta < 2px over 5s while in a walking
     state, abort task, teleport-snap to nearest valid tile, log to console.

4. CLUMPING (all 30 villagers stand on the granary tile):
   - Interaction points: each building exposes 2-4 offset stand-slots;
     villagers claim a slot or queue visibly beside it (queues read as LIFE,
     clumps read as bugs).

VALIDATION HARNESS (required, not optional):
- `debug=1` URL param → overlay showing each villager's current task, top 3
  action scores, need bars, and target line. This is how we "make sure it
  works well" — by seeing the brain.
- Headless soak test (node script, no renderer): run the sim at 100x for a
  simulated 6 hours with default settings and assert: zero starvation
  deaths, zero stuck-watchdog triggers > 3, food stockpile stays within
  [0.5x, 20x] of daily consumption (economy neither collapses nor explodes),
  every villager changed task at least 10 times (nobody frozen).
  Wire it as `npm test` and run before every commit to sim code.

════════════════════════════════════════════════════════
B. DEEP INDIVIDUALITY — no two villagers alike
════════════════════════════════════════════════════════
Identity is layered; every layer is seeded from the villager's id so saves
stay consistent:

1. TRAITS v2 — one from each of three categories + 30% chance of a quirk:
   - Work ethic: Diligent / Lazy / Perfectionist (slower, +quality) /
     Restless (frequent task switches, small commitment penalty is OK here).
   - Social: Social / Loner / Gossip (spreads mood to neighbors) /
     Mentor (works faster when near a young villager).
   - Comfort: Hardy / Chilly / Glutton / Frugal (eats less) /
     Homebody (rest recovers faster at home only).
   - Quirks (pure flavor, must be visible): Whistler (♪ emote while
     walking), Stargazer (stops at night to look up), Early Riser,
     Night Owl, Collector (detours past the market), Fisher-at-heart
     (lunch breaks by the water).
   Category structure guarantees behavioral spread; 4x4x5 x quirks ≈
   hundreds of combos before names/portraits even count.

2. PERSONAL SCHEDULE — each villager gets a seeded daily rhythm:
   wake time ±2h, meal times ±1h, a preferred idle spot (specific tile),
   and a work-intensity curve over the day. Two Diligent farmers now differ:
   one is in the field at dawn, the other works late. Schedules GATE the
   utility scores (Work score x0.2 outside personal work hours) rather than
   scripting behavior — the brain still decides.

3. PARAMETER JITTER — per-villager ±15% seeded variance on walk speed,
   need-decay rates, emote frequency, and each utility weight. This is the
   cheapest anti-clone tool in the book; behavior diverges automatically.

4. MOOD — single value from recent need history + events (slept cold =
   grumpy, festival = cheerful). Mood tints emote choice, walk speed
   (±10%), and productivity (±10%), and is the #1 thing the inspector
   surfaces: "Wren is cheerful — she slept well and the harvest came in."

5. MEMORIES — ring buffer of the villager's last 5 notable events; the
   inspector and chronicle read from it ("Odo still talks about the
   blizzard"). Costs almost nothing, adds enormous perceived depth.

════════════════════════════════════════════════════════
C. ZONING, SEASONS, WEATHER, DISASTERS
════════════════════════════════════════════════════════
1. ZONING (Cities: Skylines model — paint intent, citizens develop it):
   - Zone brushes: Residential / Farmland / Forestry / Market. Painted
     tiles get a faint colored overlay; nothing spawns instantly.
   - DEMAND drives development, shown as three small bars (Housing / Food /
     Goods): homeless villagers or migration pressure → housing demand;
     food per capita low → farm demand; surplus food + population > 15 →
     market demand.
   - When demand exists AND stockpile suffices, builder villagers develop
     the matching zone tile-by-tile (site choice: zoned tile nearest
     existing structures). Buildings appear where THEY choose within your
     zones — every village layout unique, exactly the ant-farm feel.
   - GROWTH STAGES: hut → cottage → house. A residence upgrades when its
     resident's average needs stay >70 for a full season (visible scaffold,
     chronicle entry). Prosperity becomes something you can SEE from orbit.
   - De-zoning never demolishes; it only stops new development.

2. SEASONS (7 real-time minutes each, spring→summer→autumn→winter):
   - Winter: warmth decay x2, farms dormant (eat stores — the survival
     loop), snow tint + our existing weather visuals; Chilly villagers
     complain, Hardy ones shine.
   - Autumn: harvest bonus, leaves; Spring: migration chance up; Summer:
     longer workdays.
   - Season banner + chronicle entry on change ("First snow fell on
     Oakenfall").

3. WEATHER (layered on season): clear / rain / storm / snow. Rain: outdoor
   work x0.8, villagers seek shelter in storms (a visibly correct behavior
   that sells intelligence harder than any feature).

4. DISASTERS + RESPONSE (the player's "respond" pillar — one per season
   max, never in the first 10 minutes of a new game):
   - FIRE: a building ignites; villagers bucket-chain from water
     automatically; player response choice: "Prioritize the granary" vs
     "Save the homes" (weights their targets).
   - BLIZZARD: 60s warning; response: "Ration food" (slower starvation) vs
     "Burn extra timber" (warmth safe, stockpile hit).
   - BANDITS: demand a tribute; response: pay / refuse (refuse risks a
     building damaged, watchman trait villagers reduce the risk).
   Every disaster + choice + named-villager outcome goes to the chronicle —
   this is where the stories come from.

5. TECH LITE (player lever #4): a small 6-node unlock tree spending a
   "wisdom" resource earned passively: Granary (bigger food cap), Well
   (warmth/water radius), Watchtower, Better Ploughs, Stone Foundations
   (upgrades allowed), Festival (mood event, on demand).

════════════════════════════════════════════════════════
D. ACCEPTANCE (Phase 2 ships only if…)
════════════════════════════════════════════════════════
1. Soak test passes (section A) after ALL of B and C are in.
2. Zone-only playthrough: using nothing but zoning + sliders + tech, a
   village grows from 5 to 20 villagers across 4 seasons without manual
   placement and without collapse.
3. The clone test: pause the game, point at any 3 villagers — the debug
   overlay must show meaningfully different schedules, traits, and current
   intents for all 3.
4. Chronicle after 20 minutes reads like a story a player would screenshot.
5. Mobile: all new UI (demand bars, zone brushes, season banner, response
   modals) respects the Phase-1 HUD rules (safe areas, dvh, short-landscape
   mode) at 390x844 and 844x390.

Ship: run soak + manual acceptance, commit, push to main.
