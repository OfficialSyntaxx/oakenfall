# Changelog

## 1.23.0
Seasonal festivals. Once a year, at the turn into spring, the hold holds a
festival and you choose one of three lasting blessings: Harvest Feast (+20%
food yield from farms and foragers), Rite of Courage (+8 morale and half the
morale loss from raids), or Craftsmen's Fair (+15% work speed for every
settler). The chosen blessing lasts until the next year's festival, is written
into the Chronicle, and is shown in the Journal tab. A genuine yearly decision
point. Persists in saves.

## 1.22.0
Statistics. A new "📊 Statistics" view (from the Journal tab) charts settlers,
provisions, and timber over the last 60 days as a line graph, alongside
lifetime tallies — peak population, days survived, winters endured, buildings
raised, settlers welcomed, raids survived, weddings, births, and passings.
Per-day snapshots are captured at each dawn and persist in saves.

## 1.21.0
Deeds. The hold can now earn 14 one-time achievements — A Roof Raised, Hamlet,
Township, First Winter, Iron Heart, Bridge Builder, Full Granary, Timber Baron,
A Match Made, New Life, Grey Hairs, Remembered, Held the Gate, and Scholar —
shown as parchment badges in the Journal tab (locked ones greyed with their
requirement). Each is announced with a toast when earned and written into the
Chronicle. Earned deeds persist in saves.

## 1.20.0
Villager roster. The Hold Menu gains a "Folk" tab listing every settler,
sortable by role, morale, or name, each row showing their life stage, trait,
and a mood gauge. Tapping a settler opens their sheet and glides the camera to
them — the fastest way to find a specific worker (or the last idle one) as the
hold grows.

## 1.19.5
Polish batch. The camera now eases (~250ms) toward its target when you focus
a settler ("Find on map") or tap the minimap, instead of snapping — any drag,
pinch, or wheel cancels the glide. The villager sheet's morale bar and the
building sheet's condition bar now use the shared `statBar()` component for a
consistent look. Website: the Almanac gains a "River & Roads" chapter (bridges,
fords, winter freeze, road logistics) that had drifted out of date since v1.14.

## 1.19.4
Villager "Find on map" — a settler's sheet gains a button that pans the
camera straight to them, so tracking down a specific worker (or that last
idle settler) no longer means hunting across the map.

## 1.19.3
Build palette grouping — the "Raise a Building" sheet now organizes its 17
structures under category headers (Homes · Food & Provisions · Industry ·
Trade & Hall · Defense · Roadworks) instead of one flat grid, so the right
building is faster to find as the roster grows. Purely presentational.

## 1.19.2
Child sprite scaling — settlers in the child stage now render ~0.68x across
all villager draw paths (sprite, fallback sprite, and canvas), with shadow
and mood-bubble scaled to match, so children are visibly smaller until they
come of age. Purely visual.

## 1.19.1
Chronicle polish. Every chronicle moment now draws from several varied
phrasings so the hold's story reads written rather than logged, and a new
"Read the full Chronicle" view (from the Journal tab) presents it on an
illuminated-parchment page, grouped by day and season with a titled header —
made to be screenshotted. Purely presentational.

## 1.19.0
Living-world AI merge, increment 4 — the Chronicle. The hold now keeps a
curated, dated story of its significant moments (founding, friendships,
weddings, births, comings-of-age, passings, seasons), shown in the Journal
tab beneath the stats and above the raw recent-events log. Persists in saves.
This completes the four-part merge that brought the living-world AI's
citizens (relationships, generations, ambient life, chronicle) into the
city-builder while keeping all existing art, economy, and role mechanics.

## 1.18.0
Living-world AI merge, increment 3 — ambient life. Idle and young citizens
now act on context and personality instead of standing on their spot: they
gather at the hearth/tavern after dark, seek warmth in winter (the frail
especially), drift toward close friends, and children play near home — each
with a little mood bubble. Purely an idle-steering + bubble layer; it never
overrides assigned work or the economy.

## 1.17.0
Living-world AI merge, increment 2 — aging & generations. Settlers now have
life stages (child → adult → elder) on a session-paced clock: children are
born, come of age and join the workforce; elders work at reduced pace but
still contribute; the aged pass peacefully and are interred in a memorial
grove west of the Town Center, with partners widowed and children grieving
(morale hit + a lasting memory). Stage/age show in each settler's sheet.
All additive to the economy; ages/stages/lifespans and the grove persist in
saves (name-keyed, no dangling refs).

## 1.16.0
Living-world AI merge, increment 1 — relationships. Settlers now form
friendships (and occasional rivalries, from clashing work ethics) as they
spend time near one another; strong bonds are announced and remembered, each
settler's sheet shows their friends/rivals and a recent memory, and couples
now prefer to wed a close friend. Additive to the existing role/economy loop;
relationships persist across save/load (name-keyed, so no dangling refs).

## 1.15.0
Menu restructure and mobile HUD fixes. The Goals (📜) button and coins (💰)
pill now open a single Hold Menu hub with four tabs — Goals, Research, Shop,
Journal — backed by a real sheet-navigation stack (push/replace/back) with a
header back-arrow; research is now reachable from the hub, not only by tapping
the Town Center. The bottom sheet has a working drag-to-expand grabber (two
detents). HUD: fixed the landscape day/season clock rendering under the
minimap (root cause: an inline `right` style overrode the media query), fixed
two dead `#hud`/`#sheet` selectors, and the landscape minimap now shrinks as
intended. The Play page (`/play/`) drops the site header and the old floating
return tab, so the game runs full-screen (100dvh) with no site chrome.

## 1.14.0
The living river update. Fords: two shallow rows per map where settlers can
wade across slowly with no bridge. Winter now freezes the river — anything
can cross the ice (the moat bonus disappears) but fishing halts until thaw,
with ice-sheet rendering. Guard posts within 3 tiles of a bridge keep that
crossing "watched" so it no longer erodes the moat, and raids narrate which
unwatched bridge the raiders used. Road logistics: processors beside a road
network connected to the Town Center run 12% faster. Legacy traits: settlers
can become Brave (survived a raid — half morale loss from attacks) or
Steadfast (a partner left — steadier morale). The traveling merchant now
physically parks a cart beside the Town Center. Photo mode (📷 in the ⚙
menu) captures a clean UI-free shot and shares/saves it. Critical fix: saves
now fall back to localStorage when the host KV is absent — save/load on the
website deploy was silently broken. Plus: an in-game event log in the Goals
sheet, minimap size persisting across sessions, and assorted Phase 1 fixes.

## 1.13.0
Rivers & Bridges: a new Bridge building (20 wood + 6 planks, so it arrives
with sawmill-era progression) placeable only on river tiles. Villagers
path across bridges, opening the far bank's timber, stone, and hunting
grounds. The river now counts as a natural moat in bandit-raid defense —
each bridge erodes that bonus, so spanning the river is a real strategic
trade-off. Farms adjacent to water gain +15% yield (irrigation).

## 1.12.1
iPhone polish: removed the Google Fonts fetch (the game now makes zero
network requests and works fully offline, honoring the project's hard
constraint; text falls back to the system serif stack), added home-screen
app support (theme color, status-bar style, and a generated oak
apple-touch-icon at the repo root), a screen wake lock so the display
doesn't dim mid-session, and all top-bar/minimap buttons enlarged to the
44px minimum touch target.

## 1.12.0
HUD quality-of-life: save/sound/fullscreen now live in a ⚙ overflow menu
(freeing top-bar width on phones), the resource row's right edge fades to
hint that it scrolls, selecting a villager/building/tile pans the camera so
the selection is never hidden behind the bottom/side sheet, and the minimap
gained a ⤢ button to toggle a larger view.

## 1.11.1
Mobile HUD overhaul: in portrait the top bar is now two rows (icon buttons
above, a full-width scrollable resource row below) so resource pills never
hide under the buttons; in landscape the resource row reserves real space
for the button cluster instead of sliding beneath it, and the day/season
clock line moved out from under the minimap.

## 1.11.0
Real audio samples layered in as an upgrade over the existing procedural
WebAudio synth (never a dependency — the synth still covers every kind if a
sample fails to load/play): chopping, mining, tap, warning, and sheet
open/close, sourced from Kenney's RPG Audio, Interface Sounds, and Impact
Sounds packs (all CC0). Added an optional ambient background-music toggle
(off by default to keep the initial load light); music tracks are sourced
from AlkaKrab's free medieval loop pack.

## 1.10.1
Fixed the Game Mode description on the start screen being cramped against
the Map Size row below it (reported as issue #1). Start-screen background
reworked from a flat radial gradient into a layered, textured background
(still pure CSS, no new assets) so it reads less flat/simple.

## 1.10.0
Bug reports & suggestions now file to GitHub automatically via a Netlify
Function (`/.netlify/functions/submit-feedback`) — players no longer need a
GitHub account or to click "submit" themselves. Falls back to the old
copy-to-clipboard / manual-issue flow if the server is unreachable.

## 1.9.0
GitHub pipeline live: in-game bug reports and suggestions file directly to
the project repo as issues, with full game diagnostics attached.

## 1.8.0
Feedback system foundation: report bugs & suggest features from the Goals
sheet. Knight guards (Lancer sprites), meat-hauling hunter animation, raid
explosion FX, fisher splash FX, resource-fly-to-HUD juice effect.

## 1.7.0
Kenney terrain tiles & stone-paved roads, Tiny Swords buildings (Town
Center, House, Manor, Watchtower, Guard Post, Tavern, Bakery) & animated
villagers (chop/mine/harvest/carry), swaying ancient oak trees, drifting
clouds, farm crops & fences, water rocks.

## 1.6.0
Research & policy tree (9 techs), Manor housing, 4 distinct game modes
(Settler/Peaceful/Iron Winter/Merchant), Hold Shop & coin economy, daily
bounty rotation, villager families (courtship/weddings/births), building
decay & repair, dynamic weather, morale system, bandit raids & defense
(Guard Post, Palisades).

## 1.5.0 and earlier
Core isometric city-builder loop: resource gathering, 11 building types,
villager AI with roles/traits/illness, day/night & seasons, wolf raids,
trading post, quests, save/load, offline progress, hold tiers, random
events, procedural canvas art for every building/villager/terrain feature.
