# Changelog

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
