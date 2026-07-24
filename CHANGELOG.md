# Changelog

## 1.51.0
The admin panel grows up. The hidden developer panel (reached via a promo code
in Redeem) is now a full debug console: force any weather (clear, rain, storm,
snowfall), jump the clock to dawn or night or skip whole days and seasons,
trigger raids and fires on demand or douse them, grant resources and coins,
fill stores to cap, summon settlers, heal the hold, unlock all research and
cosmetics — plus sandbox toggles to freeze hunger/fatigue, block raids, and
show a live debug overlay (FPS, population, weather, tier, and more).

## 1.50.0
Seven new buildings. The art pass continues: the Tavern, Sawmill, Windmill,
Bakery, Granary, Trading Post, and Watchtower all get hand-generated painterly
sprites in the same dark-medieval style as the house — weathered timber, dark
stone, mossy roofs, warm-lit windows. Each layers over its procedural fallback,
which stays intact. The hold is starting to look like a real place.

## 1.49.0
Longer days, tap-away notices, a seated house, and a hidden panel. The day and
night cycle now runs much longer, so an afternoon in the hold no longer flies
by. Notification toasts clear on their own within three seconds and vanish the
moment you tap them. The new house sprite now sits properly on its tile instead
of hovering. And a developer/admin panel is tucked away behind a promo code in
the Redeem sheet — enter the code and a sandbox of grants and unlocks opens up.

## 1.48.0
A new house. The first hand-generated building sprite lands in the game: a
painterly dark-medieval cottage — weathered timber frame, dark stone footing,
mossy thatch roof, a stone chimney, and a warm-lit window — replacing the old
placeholder house art. It layers over the procedural canvas fallback, which
stays intact. First of a wider art pass on the hold's buildings.

## 1.47.0
Water boundaries, smarter building sites, and a more varied crowd. Settlers no
longer stroll across the river — every path and wander target now snaps to solid
ground, so folk keep to the banks and cross only at bridges, fords, or winter
ice (fishers work from the shore instead of standing in the water). Resource
buildings must now be raised beside the terrain they work: a Fishing Hut by
water, a Forestry Camp at the treeline, a Mining Post by a stone outcrop, a
Hunting Cabin along the wilds — and if you try to place one wrongly, the game
tells you exactly what it needs. Finally, settlers no longer look like one
person copied a dozen times: each now carries a subtle clothing tint and a
slightly different build, so a bustling hold reads as a real crowd.

## 1.46.0
Lamp posts. A new roadworks structure — a pitch-soaked lantern on a timber post
that casts a warm pool of light after dark. Line your roads and squares with
them to push the night back: each one punches a glow into the darkness overlay
and flickers like a real flame. Cheap to raise (8 wood, 6 stone), no settler
needed. Purely light and atmosphere — the first of a small wave of decorative
lighting.

## 1.45.0
Shareable hold card. A new "Share Card" button in the Journal tab renders a
1200×630 chronicle card — your hold's name and crest, its tier, and its tallies
(days survived, winters endured, settlers, deeds earned) — and offers it to the
device share sheet or a direct download. A tidy way to show off a hold (and,
being share-sized, it doubles nicely as a social image).

## 1.44.0
Watchable raids. A bandit raid is no longer just a line of text — torch-bearing
raiders now march in from a map edge (or pour across an unwatched bridge) toward
the Town Center, and your Guards ride out to intercept and turn them back. A
well-defended hold visibly holds; a poorly-defended one watches thieves reach
the stores. The raid's actual outcome is still governed by the same defense math
(guards, palisades, watchtowers, the river moat), so this is drama layered over
proven balance, not a change to how raids resolve. Raiders are transient (not
saved).

## 1.43.0
Sustainable land. Forest stands now tire as they're felled — each regrowth
yields one less than before, and a fully-worked stand eventually goes barren and
stops regrowing. The new **Forester's Grove** (🌲, Industry, 25 wood + 10 stone)
replants nearby forest within ~4½ tiles, reviving barren ground back toward full
growth with no worker needed. The tile panel shows a stand's health (tiring /
barren). Turns "infinite timber" into real land management — tend the woods or
spread your camps. Twenty buildings now.

## 1.42.0
Decision events — dilemmas that make your word matter. Every few days (once the
hold is past its first days, and only when no panel is open so they never
interrupt) a decision appears with two or three choices and real consequences:
strangers at the gate asking to join, a bandit's tribute demand, a wandering
scholar, a folk feast, a peddler's sealed crate, or old ruins worth digging.
Choices affect food, coins, morale, research, or population, and each ruling is
written into the Chronicle. Six dilemmas to start, gated so they only appear
when they make sense.

## 1.41.0
Decrees — hold-wide policies you rule by. From the Goals tab, enact or repeal
four lasting laws, each a genuine trade-off: **Curfew** (−30% night raid risk,
−5 morale), **Tithe** (a daily coin levy scaled to population, −6 morale),
**Open Gates** (newcomers arrive faster, +20% raid risk), and **Rationing**
(food lasts 20% longer, −6% work speed). Toggle freely at any time; the choices
persist in saves, and Tithe income shows in the Trader's Ledger.

## 1.40.0
Second-tier research. The tech tree gains four advanced technologies, each gated
behind a first-tier one, so late-game research isn't finished by mid-game:
Hill Terracing (+15% farm yield again, after Crop Rotation), Aqueducts (every
farm counts as irrigated, after Stone Masonry), Cold Storage (food spoils half
as fast, after Deep Cellars), and the Guild Charter (guild bonuses rise from
+10% to +15%, after Hearthfires). Cold Storage and the Charter tie directly into
the new spoilage and guild systems. Thirteen techs in all now; site copy updated.

## 1.39.0
Food spoilage — Granaries finally earn their keep. Raw food held beyond a safe
amount slowly spoils (~14% of the excess per day). A small pantry baseline keeps
a little safe; each Granary adds a large safe allowance and the Deep Cellars
research adds more, so genuinely stockpiling for winter now depends on building
the storage to hold it. Bread and flour don't spoil. Nothing spoils in Peaceful
(zero decay); Iron Winter spoils faster. The Granary panel shows the current
safe amount, and an occasional notice warns when spoilage is mounting.

## 1.38.0
Name your hold. The start screen now lets you name your settlement and pick a
crest colour when you found it. The name appears in the HUD clock line, heads
the Chronicle ("The Chronicle of …"), colours the Town Center banner from the
first day, and is read by the website's deeds showcase. Both persist in saves;
leaving the name blank keeps the classic "Oakenfall".

## 1.37.1
Cleanup + website refresh. Removed a dead "route penalties" row from the
Trader's Ledger (missed trade routes cost morale, not coins, so the category was
always zero). On the website, the homepage feature cards and the Almanac now
reflect the systems added since — fire, blight, climate spells, livestock,
guilds, trade routes — and the Almanac gained a "Hardships of the Hold" chapter
plus a link through to the full Wiki.

## 1.37.0
Audio pass — distinct stingers for the moments that matter, all synthesized by
the built-in WebAudio engine (no new samples, no added load): a rising fanfare
for earning a deed, a warm chord when a festival begins, a low wobbling crackle
when a fire ignites, an uneasy falling tone for a blight, and a two-note alarm
for a wolf or bandit raid. Layered over the existing effect set and governed by
the same 🔊 sound toggle.

## 1.36.0
Trader's Ledger — an economy view (📒 in the Shop tab). It tracks coin flow by
category as you play and shows an all-time breakdown of income (daily bounties,
goals, deeds, trade routes) versus spending (the Hold Shop, missed-route
penalties), each with a proportion bar, plus a running net. Makes the coin
economy legible — you can finally see whether your trade routes are actually
paying off. The running totals persist in saves.

## 1.35.0
Guilds. When two or more settlers reach Master in the same trade, they form a
guild — the Woodwrights', Stonecutters', Ploughmen's, Fishers', or Hunters' —
granting a +10% hold-wide bonus to that craft's output (wood, stone, farm food,
fish, or meat respectively). Builds directly on skill mastery and apprenticeship:
growing, keeping, and pairing veterans now pays off settlement-wide. Guilds form
automatically, are announced and written to the Chronicle, and the active ones
are listed in the Journal. Derived from settlers' skills, so nothing extra is
stored in saves.

## 1.34.0
The Blight — a disease-outbreak disaster to sit alongside fire and climate.
Rarely (past the early days, in a hold of five or more), a sickness strikes:
roughly a third of the settlers fall ill at once, and over the next few days it
spreads between those standing close before running its course. Sick settlers
work slower and the whole hold's morale dips while it lasts. Herbal Lore
research cuts both the initial infection and the spread rate, and a Healer
(shop or wandering event) clears the currently sick. Shown in the status strip
and written to the Chronicle; the outbreak persists in saves.

## 1.33.0
Named districts. When three or more buildings cluster together, the hold gives
that corner a name — the Timber Row, the Hearth Quarter, the Mill End — drawn
faintly on the map above the rooftops and recorded in the Chronicle when it
first forms. The name derives from whichever building type dominates the
cluster, and stays stable across recomputes and reloads. Labels fade out when
you zoom far out. Purely presentational; recomputed on a slow timer from the
current buildings, so nothing extra is stored in saves.

## 1.32.0
Livestock — a second food chain. The new **Pasture** (🐑, Food category) grazes
a herd that breeds on its own up to six animals and yields a steady trickle of
food through spring, summer, and autumn, needing no assigned worker — a
hands-off complement to farming. The catch: in winter the animals must be
foddered from your food stores, and if the stores run dry the herd dwindles one
animal at a time. Herd size persists in saves and is shown on the Pasture's
panel; the field renders with animals that reflect the current herd.

## 1.31.0
Approachability and legibility pass, plus a monetization refinement.

- **Onboarding ribbon**: a brand-new hold now gets a dismissible step-by-step
  guide — raise a House, set a Lumberjack, build a Farm, survive the first
  winter — that completes and bows out on its own (or on the ✕). Persists so it
  doesn't nag returning players.
- **Active-status strip**: a small centre-top row of pills now shows what's
  currently in effect — climate spell, festival blessing, active trade routes,
  and an ongoing fire — so their effects are felt, not forgotten.
- **Unlocks survive a save wipe**: redeemed cosmetic packs are now stored in
  their own key (`oakenfall-unlocks`) as well as the save, so a fresh hold or a
  cleared save keeps your entitlements.

Website: the header nav's lore pages (Almanac, Wiki, Chronicle) are grouped
under a single "Lore" dropdown to keep the bar uncluttered.

## 1.30.1
Housekeeping from a full review pass. The memorial grove is now capped at 40
graves — the oldest are "reclaimed by the forest" over very long games, so the
per-frame render list and the save stay bounded; grave placement now reflows by
a monotonic count so a reclaimed plot is reused instead of new graves stacking.
Also corrected the homepage's building count (eighteen) after the Well was added.

## 1.30.0
Redeem codes — the foundation for supporting Oakenfall. Cosmetic packs bought on
the website can be unlocked in-game (⚙ → 🎁 Redeem) with a signed code that the
game verifies **offline** against an embedded public key, so the hard "zero
network requests at runtime" rule still holds and codes can't be forged. The
first SKUs are strictly cosmetic (a Patron plaque and premium banner dyes) —
never anything pay-to-win. Unlocks persist in saves. A companion Netlify signing
function (`sign-unlock.js`) and `MONETIZATION.md` document the storefront setup;
the private signing key lives only in the site's environment. This ships the
plumbing; wiring a specific storefront (Stripe/Gumroad/itch) is the next step.

## 1.29.0
Three additions that deepen the fire, skill, and weather systems.

- **The Well** (⛲, Defense category) is a firebreak: timber buildings within
  ~3.5 tiles of an intact well rarely catch fire and are doused much faster,
  turning fire from pure RNG into something you plan against by spacing wells
  through your timber.
- **Apprenticeship**: a Master working within ~4 tiles of a novice of the same
  trade teaches them, doubling the novice's skill growth (shown with a 📖
  bubble) — so pairing veterans with youth is now a real placement decision.
- **Climate spells**: multi-day conditions layered over daily weather —
  droughts (fire risk up, farm yield down), cold snaps (extra food and stamina
  drain), and fair spells (better crops and morale). Each is announced, lasts a
  few days, shows beside the season in the clock, and is written to the
  Chronicle. Disabled under Iron Winter. Persists in saves.

## 1.28.1
Refinements to the deed-reward, skill-growth, and fire systems shipped in
1.26–1.28: idle adult settlers now form a bucket brigade — they run to the
nearest blaze (🪣) and help douse it; fires ignite less often (tuned down and
capped) and only after the hold is established (4+ timber buildings, past the
first days); and the death of a Master now saddens the whole hold, not just
their kin. A burned-down building also closes its panel cleanly if it was open.

## 1.28.0
Fire — a new disaster. Timber buildings can catch fire (far more likely in a dry
summer, rare in winter or rain). A blaze steadily damages its building and, left
unchecked, spreads to nearby timber structures; if it consumes a building
entirely, that building is lost and the hold's morale takes a hit. Fight it by
tapping the burning building and flinging water (a bucket brigade); nearby
settlers, rain, storms, and winter all help put it out. Rewards spacing timber
buildings apart and keeping people close. Disabled in Peaceful mode. Fires are
transient (not saved), though any fire damage to a building's condition is.

## 1.27.0
Villager skill growth. Settlers now accumulate experience in whatever role they
work, rising through tiers — Skilled (+8% output) and Master (+18%) — that speed
their labour. Proficiency is shown in the settler sheet and the Folk roster, a
promotion is announced with a toast, and experience persists in saves (per
role), so a long-serving veteran is genuinely valuable and their passing costs
the hold real productivity. A new "Master of the Craft" deed marks the first
settler to top out.

## 1.26.0
Deed rewards. Earning a deed now grants a one-time reward — coins, and for some
deeds a parcel of resources (food, timber, stone, or planks) — announced in the
earn toast and shown on each badge in the Journal. The deed wall becomes a real
set of goals to chase rather than pure cosmetics. (Deeds already earned in older
saves keep their badge but were not retroactively paid.)

## 1.25.0
Trade routes. With a Trading Post, the hold can now broker recurring caravan
contracts (🐫 in the Shop tab): agree to deliver a set amount of a good —
planks, bread, timber, stone, or provisions — every few days, and each
fulfilled run pays coins automatically at dawn. Miss a delivery twice and the
route breaks, with a small morale knock. Up to three routes at once, giving a
steady coin income that rewards a well-supplied, road-linked hold and ties the
merchant economy to production. Persists in saves.

## 1.24.0
Events inbox. The recent-events log becomes a filterable inbox (📨 in the
Journal tab): every toast is sorted into a category — Raids, Folk, Building, or
Other — and kept as a list of the last 40 tidings, newest first, so a notice
missed while the game was in the background can be read back. Categorization is
inferred from each message, so nothing about existing notifications changed.

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
