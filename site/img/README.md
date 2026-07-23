# site/img — image assets for the website

Drop image files here and the build copies them verbatim to `/img/` on the
site. This is the home for AI-generated key art, hero backgrounds, and social
images. (The *game* is a single self-contained file and never loads external
images — these are for the **website only**.)

## Auto-wired: the social / OG image
If a file named **`og-oakenfall.jpg`** (or `.png` / `.webp`) exists here, the
build automatically uses it as the `og:image` for every page (and switches the
Twitter card to `summary_large_image`). If it's absent, the site falls back to
the oak icon. Recommended size: **1200×630**.

→ To set the social preview image, just drop `og-oakenfall.jpg` (1200×630) here
and run `node site/build.js`. Nothing else to edit.

## Suggested filenames (so we can wire them consistently)
| File | Use | Source |
|---|---|---|
| `og-oakenfall.jpg` (1200×630) | Social / OG preview image | Direction A key art, cropped to 1200×630 |
| `hero.jpg` (≥1600 wide, 16:9) | Optional painterly hero background | Direction A key art, full res |
| `villager-portrait.jpg` | Optional "meet the folk" / wiki art | Generated portrait |
| `tileset.png` | Optional art reference on the press/wiki page | Generated tileset |

Once the files are here, tell me and I'll wire the hero background and any art
placements into the pages. The OG image needs no code change — it activates on
the next build.
