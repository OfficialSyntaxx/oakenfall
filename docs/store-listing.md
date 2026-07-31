# Store listing — Oakenfall

Copy for the App Store and Google Play, kept in the repo so it versions with the
game it describes. Field lengths are the stores' own limits; anything at the
limit is marked, because a listing that gets silently truncated reads as
carelessness on the shop page.

The screenshots are **not** kept here — `node tools/store-shots.mjs` renders them
at each store's exact required pixel size into `store/`, which is gitignored.
Regenerate them for every submission so they show the version being submitted.

---

## Identity

| Field | Value |
|---|---|
| Name | Oakenfall |
| Subtitle (Apple, ≤30) | `Raise a hold. Keep it alive.` (28) |
| Short description (Google, ≤80) | `A dark-medieval city-builder. Raise a hold, keep it through the winter.` (71) |
| Bundle / package | `com.oakenfall.game` (from `capacitor.config.ts`) |
| Primary category | Games → Simulation |
| Secondary category | Games → Strategy |
| Price | Free. Optional cosmetic packs only. |

## Full description

> A frontier hold, carved from the dark wood.
>
> Oakenfall is a city-builder about a handful of settlers making a life at the
> edge of a cold forest. You choose where the hold stands and what it raises;
> the folk decide the rest for themselves. They take up trades because the work
> needs doing, walk to it, tire, eat, and go home at dusk.
>
> **Every settler is a person.** They have names, traits and a past. They make
> friends and rivals, marry, have children, grow old and are remembered in the
> grove. A lumberjack who masters their craft teaches the next one. None of it
> is a number on a panel — it happens in the world, and you can tap any of them
> and read their whole life.
>
> **The seasons are the enemy.** Summer is for stockpiling. Winter freezes the
> river, thins the game in the woods and empties a granary faster than you
> expect. Rain makes the ground wet and the fields glad. Snow lies on the pines.
> Survive enough winters and the hold becomes a village, then a town.
>
> **Speak plainly to your steward.** Type "build a farm and put two to mining"
> and it happens. No menu-diving for the ordinary things.
>
> **Then the harder days.** Wolves out of the treeline. Bandits at the bridge if
> you left it unwatched. Fire in a timber roof, and a bucket brigade to fight
> it. Blight in the water. A stranger at the gate asking to be let in — and
> whatever you decide is written into the hold's chronicle, which you can read
> back like a history.
>
> Play it as an endless sandbox or set yourself a goal: five winters, a town
> raised from an outpost, three hundred planks sawn, eight raids turned back.
> Paint your own land in the map editor and share it as a code.
>
> No account. No ads. No trackers. Works with no connection at all — every
> picture, every sound and your entire hold live on your own device.

## Keywords (Apple, ≤100 chars, comma separated, no spaces)

```
citybuilder,settlement,village,medieval,colony,survival,isometric,strategy,sim,winter,builder
```
(93 characters of the 100 available; Apple counts the commas. Seven spare —
add a term rather than leaving them unused.)

Do **not** repeat the app name or the category in keywords; Apple indexes those
already and the space is better spent.

## Age rating

- **Apple: 9+**, **Google/IARC: Everyone 10+.** The honest answer, and here is
  why rather than a guess: raiders are driven off in a small burst of dust, not
  blood; settlers die of old age and are laid to rest with a candle; there is no
  gore, no language, no gambling, no user-to-user contact of any kind.
- **Data safety form (Google):** no data collected, no data shared, no
  third-party analytics. The one exception to declare is the optional in-game
  bug report, which the player composes and sends deliberately — see
  `/privacy/`.
- **Privacy policy URL:** `https://<domain>/privacy/` — required by both stores.

## In-app purchases

Three cosmetic packs (Supporter, Frostmark Banners, Emberlands Banners). Nothing
sold affects play. Codes are verified on the device against an embedded public
key; the game makes no network request to redeem one.

> **Before selling anything:** `netlify/functions/sign-unlock.js` still gates on
> a placeholder shared secret. It must be replaced with real storefront
> verification (a Stripe webhook signature, or a Gumroad/itch sale ping) or
> anyone can mint their own unlocks. Tracked as task #33.

## What's New (per release)

Take it from the top entry of `CHANGELOG.md` — it is written for players
already, which is why the version guard in `site/build.js` refuses to build when
it disagrees with `GAME_VERSION`.

## Screenshots

`node tools/store-shots.mjs` → `store/`, verified against each store's exact
pixel size on every run:

| Platform | Size | Pixels |
|---|---|---|
| iOS | 6.7-inch | 1290×2796 |
| iOS | 6.5-inch | 1242×2688 |
| Android | phone | 824×1830 |

Captions, in order, are written to `store/CAPTIONS.txt`.

## Still outstanding

- **Google Play feature graphic, 1024×500.** Required for the store page, and it
  is a piece of key art with the title set on it rather than a screenshot —
  design work, not something to auto-generate badly. The landing page's hero art
  in `site/img/` is the obvious place to start.
- **App preview video** (optional on both stores, and worth it — the game moves).
- The store icon is `icon-512.png`; the native projects already carry their own
  generated icon sets via `tools/make-app-icons.mjs`.
