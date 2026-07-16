# Changelog

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
