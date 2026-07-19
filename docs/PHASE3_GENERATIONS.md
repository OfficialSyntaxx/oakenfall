# PHASE3_GENERATIONS.md — paste into Claude Code (oakenfall repo)

Prerequisite: Phase 2 merged, soak test green. Phase 3 gives the village a
past and a future: relationships, families, aging, death, and a history that
outlives everyone in it. This is the "persistent history" pillar — the reason
one player's Oakenfall can never be another's.

Tone guard before anything: Oakenfall is COZY. Death exists (generations
require it) but it is gentle — villagers pass in old age by default,
mourning is warm, memorials matter. No graphic anything; disasters may
injure pride and property far more often than people.

════════════════════════════════════════════════════════
A. RELATIONSHIPS (the social graph)
════════════════════════════════════════════════════════
1. Sparse graph, hard caps: each villager holds max 6 relationship edges
   {other_id, type, strength -100..100}. Types: friend, rival, partner,
   family. Update on EVENTS (shared meal, worked adjacent, queued together,
   disaster survived together), never per-tick. Population 60 x 6 edges is
   nothing; do not build an NxN matrix.
2. Formation chemistry from traits: Social bonds fast; Loner slow but
   deep (their rare friendships get +strength); Gossip spreads mood along
   edges; matching quirks (+) and opposed work ethics (Diligent x Lazy
   coworkers) drift toward rivalry.
3. VISIBILITY (the whole point): friends synchronize idle time at one
   villager's preferred spot, walk paired (offset side by side), 💬 emote;
   rivals trade ⚡ emotes when queued together and won't share a work tile.
   Inspector gains a Relations line: "Best friend of Wren. Rival of Odo
   (the fence incident — see memories)."

════════════════════════════════════════════════════════
B. COURTSHIP, HOUSEHOLDS, CHILDREN
════════════════════════════════════════════════════════
1. Two adult friends with strength > 60 + chemistry → courtship arc over
   ~1 season: shared evening idle at the water/fire (Fisher-at-heart
   finally pays off), then a partnership + small festival event
   (chronicle: "Sarah and Tomas were wed beneath the oak").
2. Partners request a shared home (housing demand++, Skylines loop feeds
   itself). Households pool a small private food buffer on top of the
   village stockpile.
3. Children: partnered household + food surplus + housing headroom →
   birth chance each season (global governor caps births so population
   tracks the cap — see D). Child stages: infant (home, a parent's
   schedule bends around it — visible!), child (PLAYS: runs tile loops,
   chases other children, Stargazer kids stare at fireflies), reaching
   adult in ~2 in-game years → picks a job the village needs.
4. INHERITANCE: each trait category rolls 50% from a parent / 50% pool,
   quirks 25% inherited; family surname persists. Parameter jitter still
   applies — a child is recognizably "a bit like her mother," never a copy.

════════════════════════════════════════════════════════
C. AGING, DEATH, MEMORY
════════════════════════════════════════════════════════
1. Life stages: adult → elder (slower walk, mentor bonus doubles, work
   x0.6, wisdom generation +) → passing. Lifespan ~8 in-game years ±25%
   seeded jitter; Hardy adds a year. Default death is old age at home.
2. Passing: soft bell chime, village gathers briefly, chronicle entry
   written from the villager's own memory buffer ("Odo, who never stopped
   talking about the blizzard, died at 74. Forty villagers owed him a
   roof."). Close relations carry a mourning mood for a season; a Mentor's
   apprentices inherit a small permanent skill bonus — grief with warmth.
3. MEMORIAL GROVE: a zone-free auto-plot at the village edge; each passing
   plants a small tree with the villager's name on tap. The grove IS the
   village's age made visible. Founders (the original 5) get standing
   stones.

════════════════════════════════════════════════════════
D. POPULATION EQUILIBRIUM (the math that keeps it alive)
════════════════════════════════════════════════════════
Birth + migration must balance death or the sim dies one of two ways.
- Target population = min(hard cap 60 mobile / 100 desktop, housing x1.0,
  food production supports x1.2).
- Governor: births & migration scale with (target - current)/target;
  at/above target both approach zero. Deaths are never governed — age is
  age.
- EXTEND THE SOAK TEST: 100x speed, 3 simulated generations (≈24 in-game
  years), assert population stays within [40%, 110%] of target throughout,
  at least 2 generations of a founding family exist, zero orphaned
  references (dead villagers removed from tasks/edges/slots — the classic
  crash source; grep every system that stores villager ids and give each a
  cleanup path).

════════════════════════════════════════════════════════
E. PERSISTENT HISTORY (the book)
════════════════════════════════════════════════════════
1. Chronicle grows into a HISTORY panel with three tabs:
   - Chronicle: the live event feed (existing).
   - Families: tap a surname → simple tree (generations, partners, living
     in bold). Data is already there; render is a list-indent tree, not a
     graph layout problem.
   - Eras: every 2 in-game years auto-compile a one-paragraph era summary
     from event stats + 2 highest-drama events ("The Years of the Long
     Winter: 3 born, Odo passed, the mill burned and was rebuilt").
2. Records board: oldest villager ever, largest harvest, longest
   friendship, disasters weathered. Pure bragging-rights persistence.
3. Offline chronicle upgrade: the away-card now samples relationship and
   life events too ("While you were away: Bram and Wren became friends.
   Elder Sana passed peacefully."). Same closed-form + sampled-events
   model; life events draw from actual eligible villagers so it never
   lies about state.
4. Save format: additive again; version-stamp the save, migrate v2 saves
   by seeding relationships at 0 and ages uniformly across adult range.

════════════════════════════════════════════════════════
F. ACCEPTANCE
════════════════════════════════════════════════════════
1. Extended soak passes (D) — non-negotiable.
2. Generational playthrough: start fresh, play/idle to generation 2 —
   at least one marriage, one birth, one passing occurred WITHOUT the
   player doing anything but zoning; each produced a chronicle line worth
   reading aloud.
3. The funeral test: when a founder passes, does the moment land — chime,
   gathering, grove tree, era mention? If it feels like a stat change,
   iterate the presentation, not the sim.
4. Family tab shows a coherent 2-generation tree with zero dangling ids.
5. Performance: 60 villagers with relationships on a mid phone holds
   55+ fps; relationship updates confirmed event-driven (profile it).
6. All new UI passes the portrait/landscape HUD rules.

Ship: soak + acceptance, commit, push to main. After this phase, the game
matches the full pitch: alive, unique, and remembering.
