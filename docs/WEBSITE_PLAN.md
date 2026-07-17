# Oakenfall — Official Website: Master Prompt & Design Plan

This document is two things:

1. **The Master Prompt** — a single, self-contained brief you can hand to any
   designer, agency, or AI session and get the *same* website out the other
   end. It encodes the game's identity so the site can never drift off-brand.
2. **The Design Plan** — the full beginning-to-end build plan: concept,
   sitemap, page-by-page design, animation system, icon system, game
   integration strategy, tech stack, and phased roadmap.

---

## PART 1 — THE MASTER PROMPT

> Copy everything in this block when briefing a new design/build session.

```
Build the official website for OAKENFALL — a mobile-first isometric (2:1)
medieval city-builder / civilization sim rendered in a single HTML file with
vanilla JS + Canvas 2D. The game's soul: dark old-school-MMORPG palette,
earth-tinted and torch-lit, cozy-but-harsh survival tone (seasons, weather,
bandit raids, villager families, decay and repair). The website must feel
like an EXTENSION OF THE GAME WORLD, not a marketing page about it.

CORE CONCEPT — "The Hold Charter": the website IS a living settlement. The
visitor is a traveler arriving at the gates of Oakenfall. Scrolling the page
is walking deeper into the hold. Every section is a district; every UI
element is diegetic (parchment charters, carved oak signposts, wax seals,
banner cloth, iron-banded chests). Navigation is a hand-inked map. The
"Play" button is the town gate.

NON-NEGOTIABLE RULES
- Visual DNA must match the game: dark backgrounds (#1a1610–#2a2318 range),
  desaturated earth tones, warm amber/torch highlights, cool moonlit blues
  for night sections. Never bright, never flat-modern, never corporate.
- Isometric 2:1 motifs everywhere: section dividers, cards, icons, and the
  hero all use the game's diamond-tile geometry.
- Mobile-first. Touch targets ≥44px. All animations degrade gracefully:
  every animated element has a static fallback, mirroring the game's
  "sprites are an upgrade layer, not a dependency" philosophy.
- Performance budget: Lighthouse ≥90 mobile. No heavy frameworks for the
  marketing shell. prefers-reduced-motion fully honored.
- The game itself embeds into the site (it is one self-contained
  index.html) — the site must treat the game as a first-class resident:
  full-bleed play mode, no iframe scroll traps on mobile, and a
  visibility-gated canvas (pause when offscreen).
- Custom iconography only: a hand-drawn isometric icon set (resources,
  buildings, seasons, roles) drawn in the game's grading. No stock icon
  libraries, no emoji.
- Typography: a display face with medieval/carved character for headings
  (e.g. a chiseled serif), a highly readable humanist serif/sans for body.
  Never blackletter body text.
- Sound is optional and OFF by default (ambient hold sounds behind a
  diegetic toggle — a hanging bell).
- Accessibility: WCAG AA contrast on all text, full keyboard nav, semantic
  HTML under all the theming.

DELIVER: the pages, systems, and interactions specified in the Oakenfall
Website Design Plan (docs/WEBSITE_PLAN.md, Part 2), in its phase order.
```

---

## PART 2 — THE DESIGN PLAN

### 2.1 Concept: "The Hold Charter"

The site is framed as arriving at Oakenfall itself. One long scroll =
one walk from the outer gate to the keep. This gives us:

- A **narrative spine** for the page order (gate → market → chronicle wall →
  library → keep).
- A reason for every animation (things that would move in a living town:
  smoke, banners, torchlight, birds, weather).
- A diegetic excuse for every UI pattern (nav = signpost/map, footer =
  charter with wax seals, changelog = town crier's board).

**Tone words:** weathered, torch-lit, patient, handmade, slightly ominous.
**Anti-tone words:** glossy, neon, flat-design, playful-cartoon, corporate.

### 2.2 Sitemap

```
/                  The Gate (landing — hero, play CTA, feature districts)
/play              The Hold (full-bleed embedded game)
/chronicle         The Crier's Board (changelog + roadmap, from CHANGELOG.md)
/almanac           The Library (guide: buildings, roles, seasons, techs, modes)
/tavern            The Tavern (community: feedback, bug report, suggestions —
                   wired to the existing Netlify submit-feedback function)
/credits           The Charter (credits/licenses from CREDITS.md, about)
```

Small enough to hand-craft every page; each page keeps the district metaphor.

### 2.3 Page-by-page design

#### `/` — The Gate (landing)

- **Hero:** a full-viewport isometric vignette of the hold at dusk —
  parallax layers (sky → distant keep → mid buildings → foreground gate),
  chimney smoke particles, flickering window glow, drifting clouds (reuse
  the game's cloud/smoke DECOR art, re-exported). A **day/night cycle tied
  to the visitor's local clock** — visit at night, the site is moonlit with
  lit windows. This single feature makes the site feel alive and is cheap
  (two color-grade layers + a lighting overlay, exactly like the game's
  `renderLighting`).
- **CTA:** the town gate itself. "Enter Oakenfall" — hovering/tapping swings
  the gate open a few degrees with lantern flare; click transitions into
  `/play` with a gate-opening wipe.
- **Feature districts:** 4–6 sections as you scroll "into town", each an
  isometric diorama card that assembles as it scrolls into view (tiles rise
  and settle like placing buildings in-game):
  1. *Build* — building placement, decay/repair, 17 building types.
  2. *Live* — villagers, families, traits, morale, illness.
  3. *Survive* — seasons, weather, night, bandit raids, defense.
  4. *Prosper* — research tree, hold tiers, shop, bounties, 4 game modes.
- **Live vitals strip:** a thin HUD-styled bar ("Season: Autumn · Day 3 ·
  Villagers thriving") that mirrors real game HUD styling — pure flavor,
  seeded from the date, teaching the game's UI language before play.
- **Footer:** an unrolled parchment charter; links stamped as wax seals.

#### `/play` — The Hold

- Full-bleed game embed. Header collapses to a slim iron bar (auto-hides on
  scroll/idle, reappears on tap at top edge).
- Loading screen: an isometric tile grid fills in diamond-by-diamond as
  assets initialize (the game is one file, so this is a short, satisfying
  beat, not a progress crutch).
- Mobile: fullscreen orientation-aware; the site chrome fully yields —
  no scroll fighting with drag-pan/pinch (touch-action containment).
- Embed strategy: iframe the game's `index.html` unmodified (keeps the
  game's single-file constraint sacred — the site never forks game code).
  `postMessage` bridge for optional niceties later (site knows game
  version, can deep-link "report a bug" with diagnostics).

#### `/chronicle` — The Crier's Board

- Changelog rendered as notices pinned to a wooden board — newest sheet on
  top, older ones layered, weathered, and slightly rotated. Generated from
  `CHANGELOG.md` at build time so it never goes stale.
- Roadmap as a hand-inked map with an inked route: reached milestones get a
  wax seal, future ones are dotted trail.

#### `/almanac` — The Library

- Illustrated game guide as an in-world almanac book. Chapters: Buildings
  (with the custom icon set), Villager roles, Seasons & weather, Research
  tree (rendered as an actual branching oak — the game's namesake), Game
  modes, Beginner's first-winter guide.
- Interactive centerpiece: a small **explorable isometric mini-diorama** —
  a canvas-drawn 8×8 hold slice where tapping a building opens its almanac
  entry. This reuses the site icon art and doubles as a tutorial toy.

#### `/tavern` — Community

- Feedback and suggestions posted as notes nailed to the tavern wall.
  Submission forms styled as quill-on-parchment, wired to the **existing**
  `/.netlify/functions/submit-feedback` endpoint (players still never need
  GitHub). Link to the repo as "The Mason's Ledger".

#### `/credits` — The Charter

- CREDITS.md content as a formal illuminated charter: Kenney, Pixel Frog /
  Tiny Swords, the painterly tree, each with a seal and license note. About
  the project + its one-file philosophy (this is genuinely a story worth
  telling — lead with it).

### 2.4 Signature interactions & animation system

Rule: **animate consequences, not decorations** — everything that moves is
something that would move in a real settlement.

| System | Behavior |
|---|---|
| Day/night grade | Site-wide lighting overlay keyed to visitor's local time; smooth 2s crossfade; manual sun/moon toggle in the header. |
| Scroll-assembly | Section dioramas build tile-by-tile on first scroll-in (IntersectionObserver + staggered transforms); settle with a 1-frame dust puff. |
| Ambient layer | Chimney smoke, drifting clouds, occasional bird, torch flicker — one shared lightweight canvas layer behind content, capped particle count, paused when tab hidden. |
| Weather easter egg | ~1 visit in 12, it rains or snows (seasonal by real date). |
| Cursor/touch | Desktop cursor is a subtle lantern-glow radial that warms nearby wax seals; on touch, taps emit the game's fly-to-FX sparkle. |
| Nav | Signpost menu; active page's plank is lantern-lit. Mobile: bottom-docked sheet, matching the game's own bottom-sheet UI. |
| Page transitions | Gate-wipe into /play; page-turn into /almanac; simple crossfade elsewhere. All ≤400ms. |
| Reduced motion | Every one of the above has a static equivalent; `prefers-reduced-motion` kills ambient canvas entirely. |

### 2.5 Icon & asset system

- **Icon set (hand-drawn, isometric, game-graded):** resources (wood, stone,
  food, coin, plank, bread…), all 17 buildings, 4 seasons, villager roles,
  weather states, the oak sigil (logo). Drawn as tiny isometric dioramas on
  the 2:1 grid, exported as inline SVG sprites (crisp at any size, tintable
  for day/night, zero requests).
- **Logo:** the Ancient Oak inside a diamond tile ring — animated draw-on
  (branches grow) for the hero, static everywhere else.
- **Textures:** parchment, oak grain, iron banding as tiny tiling images or
  CSS noise — no large photographic textures.
- **Type:** headings — a chiseled/incised serif (e.g. "Alegreya SC" class of
  face, self-hosted); body — a warm readable serif (e.g. "Alegreya" /
  "Source Serif"); game-HUD accents — the pixel-adjacent face only for the
  vitals strip. All fonts self-hosted, subset, ≤2 families + 1 accent.

### 2.6 Color system (derived from the game)

- Night ground: `#15120c` · Day ground: `#241d12`
- Parchment: `#d8c9a3` (text-on-dark accent surfaces)
- Torch amber: `#e8a13c` (primary accent, CTAs, seals)
- Moonlit blue: `#5a708c` (night-mode accent, links at night)
- Blood banner red: `#7a2f26` (sparingly: raids, alerts, wax seals)
- Oak green: `#4a5d33` (success, growth, roadmap-done)
- All pairs validated to WCAG AA on their actual surfaces.

### 2.7 Tech stack & architecture

- **Static site, hand-built:** semantic HTML + modern CSS + small vanilla
  JS modules. No framework — matches the game's ethos, keeps Lighthouse
  trivial, and the team already lives in this stack. A tiny build step
  (single Node script) is allowed *for the site only* to: inline critical
  CSS, generate the SVG sprite, and render `/chronicle` + `/credits` from
  the repo's markdown. The game's single-file constraint is untouched.
- **Hosting:** Netlify (already in place — `netlify.toml`, functions).
  Site deploys from the repo; game served as `/play` iframe of the same
  origin's `index.html`, so saves/feedback keep working unchanged.
- **Repo layout:** `site/` directory beside `index.html`; Netlify publishes
  the built site with the game file copied through. The game remains the
  root-level artifact it is today.
- **Analytics:** none, or a privacy-respecting counter at most.

### 2.8 Build roadmap (phased, each phase shippable)

1. **Phase 0 — Foundation (1 session):** repo `site/` scaffold, build
   script, fonts, color tokens, parchment/oak surfaces, signpost nav,
   footer charter. Ship: a styled shell with working `/play` embed.
2. **Phase 1 — The Gate (1–2 sessions):** hero diorama with parallax +
   day/night grade, gate CTA + wipe transition, 4 feature districts with
   scroll-assembly, vitals strip. Ship: a landing page that already feels
   like no other game site.
3. **Phase 2 — Icons & Almanac (1–2 sessions):** SVG icon set, logo
   draw-on, `/almanac` chapters, research-oak visualization. Ship: guide.
4. **Phase 3 — Chronicle & Tavern (1 session):** markdown-driven crier's
   board, roadmap map, tavern forms on the existing feedback function,
   credits charter. Ship: full sitemap live.
5. **Phase 4 — Juice pass (1 session):** ambient canvas layer, weather
   easter egg, lantern cursor, sound toggle, page transitions, reduced-
   motion audit, Lighthouse + a11y hardening. Ship: v1.0 of the site.

### 2.9 Success criteria

- A first-time visitor understands *what the game feels like* within 5
  seconds of the hero loading — before reading a word.
- Play is never more than one tap away from any page.
- Lighthouse mobile ≥90 across the board; AA contrast; full keyboard nav;
  clean with reduced motion.
- Nothing on the site contradicts the game's grading or tone.
- The game file remains a single unmodified `index.html`.
