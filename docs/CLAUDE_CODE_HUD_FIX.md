# Paste into Claude Code (oakenfall repo)

Two fixes for the game (root `index.html` / whatever is served at `/play/`):

## 1. Hotbar/HUD overflows and overlaps in portrait AND landscape

Diagnose first: open the game and identify every fixed/absolute HUD element
(hotbar, resource readouts, menu buttons) and which ones collide at
390x844 (portrait phone), 844x390 (landscape phone), and ~1280x800.

Then apply these patterns — don't invent alternatives unless one clearly
can't work here:

a) Viewport units: replace any `100vh` sizing with `100dvh` (mobile URL
   bars make 100vh lie, which pushes bottom bars off-screen or over other
   elements).

b) Safe areas: the hotbar and any top bar must pad with
   `env(safe-area-inset-bottom)` / `env(safe-area-inset-top)`, and the page
   needs `<meta name="viewport" content="... viewport-fit=cover">`.

c) Reserve space instead of overlapping: give the hotbar a measured height
   in a CSS variable (`--hotbar-h`), and give the game canvas/content
   container `padding-bottom: calc(var(--hotbar-h) + env(safe-area-inset-bottom))`.
   Nothing should rely on "it probably fits underneath."

d) Make the hotbar itself unbreakable:
   - `display:flex; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none;`
     with `scroll-snap-type:x mandatory` on the bar and `scroll-snap-align:center`
     on items, so extra buttons scroll instead of spilling; OR wrap to a
     second row if that suits the design better — pick one, not both.
   - Size buttons fluidly: `width: clamp(40px, 9vw, 56px)` and
     `gap: clamp(4px, 1.5vw, 10px)` instead of fixed px.
   - `max-width: 100%` and `margin-inline: auto` on the bar container.

e) Short-landscape mode: add
   `@media (orientation: landscape) and (max-height: 520px) { ... }`
   and in it either shrink the hotbar (smaller clamp bounds, tighter gap)
   or dock it as a vertical rail on the right edge — whichever collides
   less with the existing panels. Resource/info readouts that currently sit
   at the bottom should move to the top corners in this mode.

f) After changes, re-test all three sizes above plus iPhone SE (375x667),
   and rotate mid-session — listen to `visualViewport` resize or a simple
   `resize`/`orientationchange` handler to re-measure `--hotbar-h`.

## 2. Remove the logo button on the play page

The play page currently has a floating logo/return tab (added in the
"save-aware hero" commit) that links back to the old site design. Remove it
entirely — the game should have no navigation back to the old site chrome.
Check `site/build.js` for where it's injected into `_site/play/index.html`
and delete the injection (and its CSS/JS), not just hide it.

## Ship
Run `node site/build.js`, verify `_site/play/index.html` has no logo tab and
the HUD holds at the test sizes, commit, push to main (Netlify auto-deploys).
