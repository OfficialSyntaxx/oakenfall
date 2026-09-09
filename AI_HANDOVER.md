# AI HANDOVER — pointer

**This repository is not the active project.** As of 2026-09-09 it is **frozen and read-only**.

The full vision, the complete feature catalogue, the technology decisions and the build plan
live in one canonical document:

> **`OfficialSyntaxx/Arcanum-Academy` → `AI_HANDOVER.md`**

Read it before doing any work that touches this repository.

## Why this repo is frozen

Four repositories were compared in full (source, docs, git history, build reports, asset
trees). `Arcanum-Academy` was chosen as the spine for its architecture and server — an
executable boundary linter, a deterministic server-authoritative kernel, correctly-built
identity, a persistence port with optimistic concurrency, tunables-as-data and ADRs. The
other three became **quarries**: sources of assets, content data and hard-won lessons.

**Role: SHELL & ART QUARRY. This repo stays live and playable — do not take it down.** The new game takes its PWA shell (`manifest.webmanifest`, `sw.js`, the `apple-*` meta and the `env(safe-area-inset-*)` usage throughout `index.html`), its asset pipeline and GRADE colour-grading convention, its sprite-with-procedural-fallback pattern, its palette, its feedback loop (`netlify/functions/submit-feedback.js`) and its verification scripts. The colony-sim logic in `main.ts` is **not** the new core loop; it may return much later, much smaller, as the player-owned hold.

## The one rule when taking anything from here

> **Port data and assets. Never port code you have not read and understood.**

---

*See `Arcanum-Academy/AI_HANDOVER.md` for everything else.*
