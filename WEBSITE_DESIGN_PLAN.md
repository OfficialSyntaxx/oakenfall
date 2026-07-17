# Oakenfall — Official Website: Master Prompt & Design Plan

This document is the single source of truth for designing and building the
official Oakenfall website. Part 1 is a **master prompt** you can hand to any
AI or human designer/developer to produce work that stays on-vision. Part 2
is the **end-to-end design plan**: brand system, sitemap, page-by-page specs,
animation/interaction language, game integration strategy, tech decisions,
and a phased build roadmap.

---

## Part 1 — The Master Prompt

> Copy-paste this block (plus any section of Part 2 as context) into any
> design or build session for the website.

```
You are designing/building the official website for OAKENFALL, a mobile-first
isometric city-builder / civilization sim rendered in a dark, old-school-MMORPG
art style (think early Ultima Online / RuneScape-classic mood, painterly and
earth-toned, not neon fantasy). The game itself is a single self-contained
HTML file (vanilla JS + Canvas 2D, all art base64-embedded).

THE WEBSITE'S CONCEPT — "The Living Settlement":
The site is not a brochure; it IS a settlement. Every page is a district of a
persistent isometric village that grows as the visitor scrolls and explores.
Navigation is diegetic: the visitor doesn't click menu links, they travel to
buildings. The Town Center is the homepage, the Tavern is the community page,
the Scribe's Hut is the changelog/devlog, the Watchtower is support/feedback,
and the gates open into the game itself.

NON-NEGOTIABLE PRINCIPLES:
1. Mobile-first, touch-first. Every interaction works with a thumb. 44px
   minimum touch targets. Drag/pinch/tap gestures mirror the game's controls.
2. Dark earth-toned palette matching the game: deep umber, moss, slate,
   candle-amber highlights, parchment for text surfaces. No pure black, no
   pure white, no saturated primaries.
3. Performance is a feature. Canvas/CSS animations only where they earn their
   cost; everything degrades gracefully; the site must feel instant on a
   mid-range phone. Lazy-load all heavy scenes. Respect
   prefers-reduced-motion completely.
4. Everything interactive should ANSWER the visitor: hover/tap on a building
   and its windows glow, chimney smoke thickens, a villager waves. The site
   world reacts like the game world.
5. Iconography is bespoke: hand-drawn isometric mini-sprites (wood, stone,
   food, gold, banner sigils), never a generic icon font.
6. Typography: a display face with medieval/woodcut character for headings
   (used sparingly), a highly readable humanist sans for body. Parchment
   panels with subtle torn/deckled edges for content cards.
7. The game embed is the crown jewel: "Enter Oakenfall" is a full-screen,
   zero-friction transition — the site camera zooms through the town gates
   into the actual game. No app-store detour, no loading spinner walls.
8. Accessibility: full keyboard navigation with visible focus states, ARIA
   landmarks per "district", alt text for every scene, motion-reduced
   fallback that swaps animations for elegant static illustration.

TONE OF COPY: warm, wry, slightly archaic without being cosplay. "Your
villagers await" not "Download now!". Short sentences. Player-first.

Deliver work that could belong to no other game's website.
```

---

## Part 2 — End-to-End Design Plan

### 2.1 Concept: "The Living Settlement"

The site is one continuous isometric world. The visitor arrives at dawn
outside the palisade; scrolling is *traveling*. Sections are physical
places, connected by the same stone roads the game uses. Time of day
advances as you move deeper into the site (dawn on the hero, dusk at the
community section, torch-lit night at the footer). A tiny ambient
simulation — 3–5 villagers walking roads, smoke, birds, swaying oaks —
runs at all times (paused off-screen, disabled under reduced motion).

Why this wins: it demonstrates the game *by being the game*. Nobody needs a
trailer to understand Oakenfall — the website already made them feel it.

### 2.2 Brand System

**Palette** (mirrors in-game GRADE conventions):
- `--night: #14120e` (base background, warm near-black)
- `--umber: #2a2118` (panels)
- `--parchment: #d8c9a3` (text surfaces)
- `--ink: #241d14` (text on parchment)
- `--moss: #4a5d3a` (accents, success)
- `--slate: #5a6570` (secondary)
- `--ember: #d9913b` (primary CTA, candle-glow highlights)
- `--bloodbanner: #7d3030` (alerts, bandit-themed warnings)

**Type**: Display — a woodcut/incised serif (e.g. self-hosted "Grenze
Gotisch" or a custom-lettered SVG wordmark). Body — "Alegreya Sans" or
system humanist stack. All fonts self-hosted (site-level; the game itself
stays dependency-free).

**Logo**: hand-lettered "OAKENFALL" wordmark with an oak-and-fallen-leaf
sigil; animated build-in where the oak grows from an acorn (SVG stroke
animation, ~1.2s, once per session).

**Bespoke icon set** (isometric 24/32px mini-sprites, drawn to match game
art, exported as an SVG sprite sheet):
resources (wood/stone/food/gold/coin), seasons (4), weather (sun/rain/snow/
storm), roles (builder/farmer/hunter/miner/scholar/guard), UI (map-pin
banner, quill, horn, shield, tankard, scroll, gear-as-millwheel).

### 2.3 Sitemap (districts)

```
/                 Town Center      — hero, elevator pitch, Enter the Game
/#village         The Village      — feature tour (scroll-driven vignettes)
/#chronicle       Scribe's Hut     — devlog + changelog (from CHANGELOG.md)
/#tavern          The Tavern       — community, screenshots, player tales
/#watchtower      The Watchtower   — feedback/bug report (reuses the game's
                                     Netlify submit-feedback function)
/#gates           The Gates        — full game embed / launch
/press            Courier's Post   — press kit (standalone page)
```

Single-page core with anchored districts (matches the "one world" concept);
press kit is the only separate route.

### 2.4 Page-by-Page Specs

**Town Center (hero)**
- Full-viewport isometric vignette of a small live settlement (Canvas 2D,
  reusing the game's actual sprite pipeline — see 2.6). Dawn light.
- The background must NOT read as "a few homes on a flat backdrop". Build it
  as a five-layer deep scene (see 2.4.1 for the full spec): sky, far ridge,
  mid-ground settlement, hero foreground, and framing silhouettes — each on
  its own parallax plane with atmospheric perspective between them.
- Wordmark build-in, one-line pitch ("Raise a village. Weather the winters.
  Outlast the bandits."), two CTAs: **Enter Oakenfall** (ember, primary) and
  **Read the Chronicle**.
- Parallax on device tilt (mobile, gyroscope, subtle) / mouse (desktop).
- A signpost doubles as the nav: each plank is a district link; on tap the
  camera *pans along the road* to that section instead of jump-scrolling.

**2.4.1 Hero background depth spec** (the anti-"too simple" treatment)

Five parallax planes, back to front, each moving at a different rate against
scroll/tilt (far layers barely move, foreground moves most):

1. **Sky plane** — pre-dawn gradient with a low moon fading out, two layers
   of drifting clouds (the game's DECOR cloud sprites, tinted), a slow
   wheeling flock of birds every ~40s, and faint stars that dissolve as the
   scene warms toward dawn.
2. **Far ridge** — silhouetted forested hills in 2–3 tones of blue-grey
   haze, a distant watchtower with a single lit window, a thin waterfall
   line catching light. Heavy atmospheric fog gradient at its base so the
   settlement never sits on a hard edge.
3. **Mid-ground settlement** — the homes themselves, but *staged*, not
   scattered: varied roof heights and rotations, clustered around a visible
   road that S-curves toward the viewer (leading line to the CTA), warm
   window glow flickering at slightly different phases per house, chimney
   smoke drifting with a shared wind direction, one mill wheel turning,
   laundry lines and fences filling gaps between buildings so no bare
   ground shows. Light shafts (god rays) rake across at a low dawn angle.
4. **Hero foreground** — a large ancient oak (the game's swaying oak) on
   one side anchoring the composition, a lit brazier or lamppost near the
   CTA whose glow literally illuminates the "Enter Oakenfall" button, 2–3
   villagers on the road (one waves if the visitor idles ~8s), fireflies /
   drifting pollen motes for air texture.
5. **Framing silhouettes** — out-of-focus dark branches and grass blades at
   the very edges of the viewport (slight blur), which is what makes the
   scene feel deep instead of like a flat painting.

Unifying tricks: a single global light direction; desaturate + lighten each
plane stepwise toward the horizon (atmospheric perspective); a soft
vignette; grain/texture overlay at ~3% so gradients never band. Under
reduced-motion, the same five layers render as one still composite — the
depth grading alone keeps it from looking simple.

**The Village (features)**
- Scroll-driven vignettes, one per pillar: Build (a house assembles plank
  by plank as it enters the viewport), Seasons & Weather (the vignette
  cycles summer→snow), Villagers & Families (two villagers meet, a hearth
  lights), Defense (watchtower scans, a bandit is repelled), Research
  (scroll unfurls into a mini tech-tree the visitor can tap through).
- Each vignette: sprite scene left/top, parchment card right/bottom with
  ~40 words of copy and one bespoke icon.

**Scribe's Hut (chronicle)**
- Changelog rendered as an illuminated scroll; entries generated at build
  time from `CHANGELOG.md` so it never drifts from the game. Latest version
  badge matches `GAME_VERSION`.
- Optional devlog posts as additional scroll sections.

**The Tavern (community)**
- Screenshot gallery framed as paintings on the tavern wall; lightbox on
  tap. Player quotes on hanging wooden shingles that sway slightly.
- Links out (Discord/socials) as coasters on the bar.

**The Watchtower (feedback)**
- A friendly report form ("Sound the horn") that POSTs to the existing
  `/.netlify/functions/submit-feedback` endpoint — same pipeline the game
  uses, so all reports land as GitHub issues in one place.

**The Gates (game)**
- CTA triggers the signature transition: site camera dollies toward the
  town gates, they swing open into white-amber light, and the game's
  `index.html` loads full-screen (see 2.6 for embed options).
- Persistent, unobtrusive "Return to the village" banner-tab inside the
  frame to get back to the site.

**Courier's Post (press kit)**
- Logo pack, palette, key art, GIF loops, fact sheet, contact. Plain,
  fast, downloadable — journalists get utility, not theatre.

### 2.5 Animation & Interaction Language

- **Scroll = travel**: sections connect via the road; a small ox-cart
  progress marker moves along a road drawn in the page margin (doubles as
  scroll progress). IntersectionObserver-driven; no scroll-jacking — the
  scroll position is always the user's.
- **Ambient loop** (Canvas, ~30fps cap, paused when tab/section hidden):
  chimney smoke, oak sway, cloud shadows, 3–5 pathing villagers.
- **Micro-interactions**: buttons are carved wood that *depresses* 2px with
  a dust puff; links underline with an ink-stroke draw; form focus lights a
  candle beside the field; successful submit raises a banner on the
  watchtower.
- **Day/night gradient** tied to scroll depth (CSS custom property, cheap).
- **Reduced motion**: all Canvas scenes swap to pre-rendered stills; travel
  becomes instant anchor jumps; essential fades only.
- **Performance budget**: < 200KB critical path before the hero scene;
  scenes lazy-loaded per district; Lighthouse mobile ≥ 90.

### 2.6 Game Integration Strategy

Because the game is one self-contained `index.html`, integration is
unusually clean. Three tiers, shipped in order:

1. **Tier 1 — Framed launch (MVP)**: `/play/` serves the game file;
   "Enter Oakenfall" runs the gate transition then navigates (or swaps in a
   full-screen iframe). The game already guards against iframe canvas-resize
   loops, so embedding is safe. Saves persist via the game's `window.storage`
   host-KV contract — the site shell provides that KV backend.
2. **Tier 2 — Living previews**: the site imports the game's sprite data
   (extracted at build time from index.html's base64 tables) so hero and
   vignette scenes use *real* game art and stay automatically in sync with
   art updates. Fallback: the same procedural-canvas fallbacks the game uses.
3. **Tier 3 — Cross-awareness**: if a local save exists, the hero
   personalizes ("Winter, Year 3 — your villagers await") and the CTA
   becomes "Return to your village". Changelog district highlights entries
   newer than the save's last-played version.

### 2.7 Tech Stack

- **Static site, no framework runtime**: Eleventy (or plain hand-rolled
  build script) → HTML + vanilla JS + Canvas, matching the game's ethos.
  No React; the site should feel like the game's craftsmanship extended.
- **Hosting**: Netlify (already in use for the feedback function). Site and
  game deploy from this repo; `/play/` maps to the game's `index.html`.
- **Build-time steps**: changelog → chronicle HTML; sprite extraction for
  Tier 2; SVG icon sprite assembly; image optimization (AVIF/WebP + PNG
  fallback).
- **Analytics**: none, or privacy-light (self-hosted Plausible-style) —
  consistent with the game's zero-external-request ethic; site-level
  requests kept minimal and first-party.

### 2.8 Build Roadmap

- **Phase 0 — Foundation (week 1)**: repo structure (`site/`), Netlify
  routing (`/` → site, `/play/` → game), palette/type tokens, wordmark,
  icon set v1.
- **Phase 1 — MVP (weeks 2–3)**: Town Center hero (static art + smoke/sway
  only), Village features (3 vignettes), Chronicle (auto from CHANGELOG),
  Gates with Tier 1 embed, Watchtower form, press kit. Ship it.
- **Phase 2 — The world comes alive (weeks 4–5)**: ambient villager sim,
  signpost travel-nav, ox-cart progress, day/night scroll gradient, full
  micro-interaction set, Tier 2 sprite pipeline.
- **Phase 3 — Personal touch (week 6+)**: Tier 3 save-awareness, Tavern
  gallery/community, seasonal site theming (site matches real-world season),
  devlog cadence.
- **Continuous**: Lighthouse + reduced-motion audits each phase; every
  player-visible site change noted in a site changelog.

### 2.9 Success Criteria

- A first-time mobile visitor understands what Oakenfall is within 5
  seconds and can be *in the game* within 2 taps.
- Site is describable only as "the Oakenfall website" — the Living
  Settlement concept is not transplantable to another game.
- Lighthouse mobile ≥ 90 across the board; zero layout shift on hero.
- Feedback from site and game funnels into one GitHub issue pipeline.
