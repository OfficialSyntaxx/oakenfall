# HIGGSFIELD_ASSET_MANIFEST.md — Oakenfall asset production plan
(Commit this to the repo under /docs so it's never lost. Execute when
Plus/trial is active — current balance is ~0 credits, generate nothing yet.)

## Ground rules (learned from their tooling — follow these to not burn credits)

1. ALWAYS preflight cost: every generate tool accepts `get_cost: true` which
   returns the credit price WITHOUT running the job. Preflight anything
   unfamiliar, especially video.
2. Trial trap: the 3-day free Plus trial requires a card and AUTO-RENEWS into
   a paid charge unless cancelled. Cancelling keeps trial access. Decide on
   day 1, not day 3.
3. Audio reality check: Higgsfield's standalone audio is SPEECH ONLY (TTS /
   voice cloning). There is no standalone music or SFX generation — their
   music/SFX models only exist inside their own game-builder pipeline. Source
   game music/SFX elsewhere (e.g. freesound/OpenGameArt/commission).
4. Style consistency: generate ONE style anchor image first, save it as a
   reusable reference element, and reference it in every later prompt so 12
   portraits look like one game, not 12 games.
5. AI tiles warning: generated images rarely drop cleanly into an isometric
   grid (perspective/edge mismatch). Use Higgsfield for CONCEPTS, PORTRAITS,
   and MARKETING; keep actual in-game tiles procedural/hand-made until the
   art style is locked and worth the integration pain.

## Tier 1 — Identity (generate these first, images only, cheapest)

1. STYLE ANCHOR / KEY ART (1 hero image, 16:9, then 3:4 crop variants)
   Prompt: "Cozy isometric fantasy village at golden hour, storybook
   watercolor-meets-gouache style, mossy valley surrounded by pine forest,
   thatched huts with chimney smoke, tiny villagers with visible
   personality, warm lantern amber against deep spruce greens, soft painted
   light, no text"
   → save as reference element; every other prompt cites it.

2. LOGO / WORDMARK PLATE (1:1 and wide): "Hand-carved wooden sign reading
   'OAKENFALL' with a small brass acorn inlay, moss on the edges, warm
   tavern-sign style, isolated on transparent background" (+ remove_background
   pass). Keep the current acorn SVG as the favicon regardless.

3. VILLAGER PORTRAIT SET (12 portraits, 1:1, batch of 4 x3)
   Base prompt: "Bust portrait of a [ROLE], cozy storybook style matching
   reference, warm earthy palette, friendly hand-painted look, plain dark
   background" — roles: forager woman, old blacksmith, young fisher, tired
   builder, cheerful farmer, night watchman, baker, herbalist, shepherd boy,
   elder, hunter, child. These become the inspector/chronicle faces and give
   traits a literal face.

4. OG / SOCIAL CARD (1200x630): key art crop + slot the wordmark in code,
   not in the generation (AI text is unreliable).

## Tier 2 — Marketing (video; preflight EVERY one, most expensive tier)

5. TEASER TRAILER, 3 shots (image→video from Tier 1 stills, ~5s each,
   16:9): (a) slow push-in over the valley at dawn, chimney smoke drifting;
   (b) villagers raising a hut frame, dust motes in light; (c) night shot,
   fireflies, one lit window. Stitch + title cards yourself (the explainer
   assembly tool can join clips nearly free).
6. THREE VERTICAL SHORTS (9:16) for TikTok/Reels: same three shots reframed
   vertical + a hook line burned in post ("your villagers build this
   themselves").
7. WINTER SPLASH (16:9 image): the same valley under snow, windows glowing —
   doubles as the seasons-update announcement.

## Tier 3 — In-game garnish (only after Tier 1-2 prove the style)

8. Building portraits for the inspector (hut, farm, mill, keep, granary).
9. Event/chronicle cards: harvest, first snow, bandit sighting, festival
   (illustration only, no text in image).
10. Ambient loading vignettes (3-4 painterly scene crops).

## Explicitly NOT buying Higgsfield for
- Villager brains/simulation (that's code — already specced in
  VILLAGER_AI_UPGRADE.md, costs nothing).
- Music/SFX (not offered standalone — see rule 3).
- Final isometric tilesets (see rule 5).

## Budget shape for the first session
Tier 1 complete ≈ a modest number of image credits; preflight one image first
to calibrate real prices, then batch. Don't touch Tier 2 until Tier 1's style
is locked — regenerating a trailer because the style changed is the classic
way to torch a credit balance.
