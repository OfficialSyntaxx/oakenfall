# Paste this into Claude Code (in the oakenfall repo)

I have a new cinematic landing page for Oakenfall in a single self-contained
file: `oakenfall-landing.html` (I'll place it in the repo root — move it
wherever fits).

Do the following:

1. Read `site/build.js` to understand how `_site` is assembled.
2. Integrate the landing page so the **built output serves it at `/valley/`**
   (i.e. `_site/valley/index.html`). Do NOT replace the existing homepage —
   the current site at `/` and the game at `/play/` must keep working exactly
   as they do now.
3. The landing page's Play button already resolves the game URL dynamically:
   on any `*oakenfall.netlify.app` host it navigates to relative `/play/`,
   elsewhere it uses the absolute URL. No changes needed there — just verify
   `/play/` still exists in the build output.
4. Add a small "Scenic route" link from the current homepage footer to
   `/valley/` (optional, skip if it clashes with the design).
5. Run the build locally (`node site/build.js`), confirm `_site/valley/index.html`
   and `_site/play/index.html` both exist, then commit and push to `main`
   so Netlify auto-deploys.

If you'd rather it REPLACE the homepage instead of living at /valley/, ask me
first — default to /valley/.
