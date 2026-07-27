# incoming/ — the drop-off for generated art

Put freshly generated PNGs here, named after the thing they are
(`forestCamp.png`, `deer.png`, `stump.png`), then run:

    node tools/import-sprites.mjs incoming sprites    # buildings, animals
    node tools/import-sprites.mjs incoming decor      # scenery props

The importer knocks out the flat background, trims to the opaque box, grades the
art into the hold's palette, scales it to sprite size, writes it into
`public/assets/`, and prints the SPRITE_URLS / SPRITE_SCALE / SPRITE_ANCHOR_Y
lines to paste.

This directory is tracked deliberately. The earlier scratch folder (`drop/`) is
gitignored, which meant `git add -A` silently skipped everything put in it —
art would be downloaded, committed, pushed, and still not be there.
