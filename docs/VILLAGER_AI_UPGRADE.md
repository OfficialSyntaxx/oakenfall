# VILLAGER_AI_UPGRADE.md — paste into Claude Code (oakenfall repo)

Goal: evolve Oakenfall from "numbers go up" idle into the first playable slice
of the living-villager vision ("influence, don't control"). This is Phase 1 —
the ten-minute test. Do NOT build seasons, disasters, relationships, or
procedural worlds yet. Ship the smallest thing that feels alive.

## A. Villager entities (cap: 30)

Each villager: `{ id, name, traits[2], needs:{food,warmth,rest}, job, home,
pos, task, emote }`.

- Names: draw from a curated list (mix cozy/medieval: Bram, Sarah, Odo, Wren…).
- Traits: pick 2 from exactly this pool of 10 — every one must be VISIBLE in
  behavior, not just a stat: Lazy (naps mid-work), Diligent (works longer),
  Glutton (eats sooner/more), Hardy (warmth decays slower), Chilly (seeks fire
  often), Early Riser (works at dawn), Night Owl (works at night), Social
  (drifts toward other villagers), Loner (wanders the edges), Forager (gathers
  faster).
- Needs decay in real time (delta-time, never setInterval — matches the
  existing economy code). Tune so a need goes critical in ~3-4 min of neglect.

## B. Utility AI (the brain)

Tick villager decisions at 4 Hz max (not per frame). Each tick, score candidate
actions and run the max:

- EatFood: urgency = (100 - food) * hunger multiplier; requires stockpile > 0;
  walk to granary/fire, play eat, +food, -stockpile.
- Rest: urgency = (100 - rest); Lazy multiplies by 1.5; walk home (or nap on
  the spot if Lazy), 💤 emote.
- Warm up: urgency = (100 - warmth); walk to nearest fire/hearth.
- Work job: baseline urgency 40; Diligent +15; produces resources at the
  existing economy rates (fold current passive rates INTO villager work so the
  economy is literally the villagers — a hut's output now comes from its
  resident actually working).
- Wander/Socialize: low baseline; Social biases toward crowd centroid, Loner
  away from it.

Legibility is the acceptance bar: floating emotes (🍞 💤 ❄️ 🔨 💬) over heads
during actions, and the tile/villager inspector must show name + traits +
current thought in plain words ("Bram is napping by the granary. Again.").

## C. Organic building (villagers build, player influences)

- Village stockpile of timber/acorns replaces direct spend-to-place.
- When homeless villagers exist AND stockpile ≥ hut cost, a villager with the
  builder role picks a site: spiral-search outward from the town center for a
  free grass tile adjacent to an existing structure (this alone produces
  organic, unique village shapes). Construction takes real time with a visible
  scaffold/frame state before the finished hut.
- Player levers (replace the old "build hut" button):
  1. Zone forest: toggle tiles as gathering zones (foragers prefer them).
  2. Mark farmland: villagers cut farms there when food priority is high.
  3. Priority sliders: Food / Building / Industry (weights the utility scores).
- Migration: a new villager arrives when (housing exists) && (food surplus) —
  walking in from the map edge, announced in the chronicle.

## D. The Chronicle (the killer feature)

- Append events to a persistent log with timestamps: arrivals, buildings
  finished, need crises averted or suffered, trait moments (fire once per
  villager per session max: "Sarah stayed by the fire all night").
- Offline: on return, statistically fast-forward (closed-form production math
  + sample 0-3 random events weighted by elapsed time). Present as a
  "While you were away" card: 3-5 lines, most dramatic first. Cap simulated
  offline time at 12h of gains.
- Add a Chronicle panel in the HUD listing the last ~30 events.

## E. Performance & save

- Population hard cap 30; villager sprites reuse the existing procedural style.
- AI ticks 4 Hz; pathing = straight-line lerp between tiles (no A* yet).
- Extend the existing save format additively; migrate old saves by spawning
  villagers to match existing huts. Never wipe a current save.

## F. Acceptance test (do this before committing)

Run the game 10 minutes with 5 starting villagers and answer honestly:
1. Can you tell which villager is Lazy WITHOUT opening the inspector?
2. Did a hut get built somewhere you didn't choose?
3. Close the tab 5 min, return — is the away-card readable and true?
If any answer is no, iterate before shipping.

## G. Website punch-list (same PR or separate)

1. `site/`: add real OG/social meta (og:title, og:description, og:image
   1200x630 placeholder at /assets/og.png, twitter:card) to landing + play.
2. Favicon: use the acorn SVG from the /valley landing page.
3. Preload the display font; lazy-load below-fold images; quick Lighthouse
   pass on mobile.
4. Footer link from the main site to /valley/ ("the scenic route") if not
   already present.

Ship: build locally, verify HUD fixes still hold at 390x844 / 844x390,
commit with clear messages, push to main (Netlify auto-deploys).
