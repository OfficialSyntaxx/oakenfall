# Building Oakenfall

Three targets from one codebase: the website, an installable web app, and
native iOS/Android builds. The web parts build anywhere. The native builds need
platform tooling that only exists on your own machine — nothing in this repo
can produce a signed app for you.

---

## Web (site + game)

```bash
npm install
npm run build        # vite build → dist/, then site/build.js → _site/
```

`_site/` is what Netlify publishes. `npm run build` fails if `GAME_VERSION` in
`src/main.ts` and the top entry of `CHANGELOG.md` disagree — that guard is
deliberate, so a shipped build always says what changed.

### Verifying

```bash
npm run verify       # build + all six suites, ~3 minutes
npx tsc --noEmit     # typecheck
```

The suites are smoke (renders at three viewports), gameplay (settlers take and
switch trades), scenario (lands differ, goals complete), editor (paint, undo,
share codes, play), slots (four saves stay four saves), steward (the command
console understands and acts). Individually: `npm run smoke`, `gameplay`,
`scenario`, `editor`, `slots`, `steward`.

Screenshots, for anything visual: `node tools/shots.mjs`,
`tools/weather-shots.mjs`, `tools/perf-probe.mjs` (frame rate and profile).

---

## Native (iOS / Android)

Both platforms are scaffolded and committed. The web assets they wrap are a
build output and are gitignored, so **the first thing after cloning is a sync**
— without it the native project has no game in it.

```bash
npm run cap:sync     # build → sync native versions → copy web assets across
```

`cap:sync` also derives the native version numbers from `GAME_VERSION`, so
bumping the game bumps the app. Never edit `versionCode`, `versionName`,
`MARKETING_VERSION` or `CURRENT_PROJECT_VERSION` by hand — they will be
overwritten.

### Icons and splash screens

```bash
npm run icons        # regenerate all 30 from icon-512.png
```

Capacitor scaffolds both platforms with its own placeholder art; this replaces
it. Run it after any change to `icon-512.png`. Note the iOS 1024 app icon is a
2× upscale of the 512 source — fine for flat artwork, but if the icon ever
gains fine detail, redraw the source larger first.

### Android

Needs Android Studio (or the SDK + JDK 17).

```bash
npm run android      # sync, then open the project in Android Studio
```

Then in Android Studio: **Build → Build APK** for a test build, or
**Build → Generate Signed Bundle / APK → Android App Bundle** for Play, which
needs an upload keystore you create once and must never lose.

### iOS

Needs a Mac with Xcode, and CocoaPods installed (`sudo gem install cocoapods`).

```bash
npm run ios          # sync, then open the workspace in Xcode
```

Then in Xcode: pick your team under **Signing & Capabilities** (the bundle id
is `com.oakenfall.game`), choose a device, and **Product → Run** for a test, or
**Product → Archive** for App Store Connect.

### What to check on a real device

The suites run in headless Chromium and cannot see any of this:

- Saves survive a force-quit and a reboot. Native builds store holds in
  Capacitor Preferences rather than WebView localStorage precisely because the
  OS can evict the latter — worth confirming once on real hardware.
- The Android back button closes an open sheet, then leaves build mode, then
  saves and exits. It should never drop a hold.
- Backgrounding the app saves.
- Safe areas: notches and home indicators, both orientations.
- Frame rate with a large map and a busy hold. Headless numbers are software
  rasterised and pessimistic; a device with a GPU is the only honest measure.

---

## Releasing

1. Bump `GAME_VERSION` in `src/main.ts` and add a `CHANGELOG.md` entry.
2. `npm run verify` and `npx tsc --noEmit`.
3. Push — Netlify builds the web release from the branch.
4. For a store release: `npm run cap:sync`, then archive from Xcode / Android
   Studio as above.
