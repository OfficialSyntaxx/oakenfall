# Architecture decisions

Decisions that have been made and should not be re-litigated without new
evidence. Each says what was considered, what was chosen, and why — so the next
person (or the next session) can disagree with the reasoning rather than
rediscover the question.

---

## Engine and logic upgrades (2026-07)

The question: should villager logic move to **behaviour trees**, should entities
move to an **ECS**, and is a **game framework** (Babylon, Phaser, three.js)
worth adopting?

### What the game actually is

Measured on a loaded hold — large map, 33 settlers, 33 critters, buildings up:

| | phone 390×844 | desktop 1280×900 |
|---|---|---|
| small map (26²) | 60 fps | — |
| normal map (36²) | 55 fps | 25 fps |
| large map (46²) | 41 fps | 24 fps |

JS profiler over 5s on the large map, by self time:

```
83.3%  (program)          native — canvas rasterisation
 4.0%  drawImage          native
 3.7%  ellipse/stroke/fill/beginPath/lineTo/closePath   native canvas paths
 4.3%  all game functions combined
 0.4%  garbage collector
```

Reproduce with `node tools/perf-probe.mjs`.

**Caveat that matters:** headless Chromium rasterises canvas in software with no
GPU, so the absolute numbers are far worse than a real device. What survives the
caveat is the *ratio* — the frame is spent drawing pixels, and all of the game's
own logic put together is about 4% of it.

### Decisions

**ECS — no.** An ECS buys cache-coherent iteration over thousands of entities.
This game has ~40 villagers, ~30 critters and ~40 buildings, and their combined
update cost is inside that 4%. Adopting one would restructure everything to
optimise the part that isn't the problem, and add a framework to maintain
forever. Revisit only if entity counts grow by roughly two orders of magnitude,
which the design does not call for.

**Behaviour trees — no, for now.** `updateVillager` is 11 flat states in 271
lines, and the "what job should I take" decision — the part that genuinely was
hard — is already handled by utility scoring in `roleNeedScores`, which is the
technique behaviour trees usually end up delegating that decision to anyway. A
BT would re-express the same logic with more machinery and an authoring layer
nobody is asking for. Revisit if the state machine passes ~20 states or starts
nesting more than one level deep.

**Game framework — no.** The owner decided to stay 2.5D; the projection, the
depth sort and the terrain are all a few hundred lines of canvas that already
work. A 3D engine solves problems this game does not have, and would cost the
offline-first, zero-dependency property that the whole thing is built around.

**Vite + TypeScript — yes, already done.** This part of the question was settled
by adopting it. See CLAUDE.md for migration state.

### What the numbers say to do instead

The lever is fill rate, not logic:

1. **Cache the static terrain.** `drawTerrain` redraws every visible tile every
   frame, sprite stamp included — a few hundred `drawImage` calls per frame that
   produce an identical result until the ground, season or weather changes.
   Rendering it once to an offscreen canvas and blitting that would remove most
   of the frame. This is the single biggest win available and is not yet done.
2. **Atlas the sprites** so the per-frame `drawImage` calls come from one
   texture rather than dozens.
3. Keep the existing discipline: no per-frame gradient allocation, flat fills
   over gradients, `drawImage` in try/catch on hot paths.

None of these require an architectural change. They are all local to the
renderer.
