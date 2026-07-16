# Oakenfall 🏰

A dark-medieval isometric colony sim that runs entirely in your browser —
one self-contained HTML file, mobile-first, zero runtime dependencies.

**Play:** open `index.html` directly, or visit the deployed URL (see repo
description once live).

**Found a bug? Have an idea?** Play the game, open the 📜 Goals sheet, and
tap 🐛 Report Bug or 💡 Suggest — it opens a pre-filled GitHub Issue with
your idea plus full game diagnostics attached automatically. No account
juggling, no manual repro steps.

## How this project ships updates

Built iteratively with Claude, now running on a Claude Code + GitHub loop:

1. Players (or Syntaxx) file an issue — in-game button or the templates below
2. Claude Code picks up the issue, implements the fix/feature, opens a PR
3. Syntaxx reviews and merges
4. Deployment updates automatically

## Development

No build step. `index.html` is the entire game — open it in any browser to
run it locally. See **`CLAUDE.md`** for the full architecture map, hard
constraints, and verification workflow before making changes.

## Credits

See `CREDITS.md` for third-party art asset attribution.
