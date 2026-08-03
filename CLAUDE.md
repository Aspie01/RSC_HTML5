# Project rules

An RSC-inspired, single-player, browser game. TypeScript + Vite, static bundle,
no runtime dependencies, no server.

The full plan lives in `docs/`: `roadmap-technical.md` for the engine
(architecture, tick model, milestones M0-M10, itch.io constraints) and
`roadmap-content.md` for the game (skills, 24 quests, regions, release phases).
This file is the settled conclusions only -- go to the roadmaps for the
reasoning behind them, and for everything not built yet.

Read this before writing code. These rules exist because they are the ones an
assistant will otherwise break by default, and because each is expensive to
retrofit once violated.

## The three hard rules

### 1. Simulation purity

The simulation must be able to run under bare Node with no browser globals.

- No `document`, `window`, `localStorage`, `canvas`, `performance`, or `Date`
  in simulation code. Ever. Not temporarily, not behind a guard.
- The tick pipeline never calls into the renderer or the UI. It mutates state;
  something else reads that state and draws it.
- Dependency direction is one-way: `data -> sim -> {render, ui}` and
  `input -> sim`. Nothing flows backwards.

The test: if the simulation cannot be imported and stepped from a Node script,
this rule has been broken.

**Current status: violated.** `game.ts` owns both the tick loop and the
renderer/UI/DOM bindings. This is a known debt, not a licence to add more.
Do not deepen it — new gameplay logic goes in `systems/`, which stays clean.

### 2. Seeded randomness only

Gameplay randomness goes through the seeded PRNG. Never `Math.random()`.

The seed and the call count live in saved state, so a save replays identically.
This is what makes deterministic tests possible:

> seed N, level 1, chop 100 trees, assert exact XP and log count; rerun,
> identical result.

Render-only jitter (flame flicker, sprite wobble) may use `Math.random()`,
because it never touches state. If it can change an outcome, it is gameplay.

**Current status: violated** in `skilling`, `combat`, `ground`, `objects`,
`util`, and `game`. Route new rolls through the PRNG rather than adding to it.

### 3. Content is data, not code

Adding a tree, ore, bar, item, or recipe must be a data edit in `src/data/`,
never a new `switch` arm or an `if (id === 'oak')`.

- No hardcoded item ids in engine code. Match on **tags** (`axe`, `tinderbox`,
  `pickaxe`, `hammer`, `raw_food`), not id lists.
- A new metal tier should be rows in `resources.ts` and `items.ts`, nothing else.
- Skill actions should converge on one shape rather than one bespoke resolver
  each: level requirement, XP, tool tag, inputs, outputs, success curve, and a
  failure behaviour of `retry | consume | abort`. Cooking's burn is
  `consume` + a burnt output; if that fits without a special case, the schema
  is generalising correctly.

## Locked decisions

Changing any of these is expensive. Do not revisit without being asked.

| Decision | Choice |
|---|---|
| Multiplayer | No. Single-player only, no server, no accounts |
| Simulation | Fixed 600ms tick, deterministic, seeded RNG |
| Renderer | Canvas2D, isometric |
| Content | TS data registries in `src/data/` |
| Distribution | Static bundle, relative paths (`base: './'`) |
| Level cap | **50.** Content gates land at 1/10/20/30/40/50 |
| Inventory | 30 slots |
| Persistence | Versioned saves + migration; never silently discard progress |

### Level cap and gates

Cap 50, curve `xp(L) = floor( sum(n=1..L-1) floor(n + 300 * 2^(n/9)) / 4 )` --
RuneScape's formula with a 9-level doubling instead of 7. Level 2 = 81,
level 50 = 43,347.

Equipment tiers, and the levels they gate:

| Tier | Level | Material |
|---|---|---|
| 1 | 1 | Bronze |
| 2 | 10 | Iron |
| 3 | 20 | Steel |
| 4 | 30 | *(unimplemented)* |
| 5 | 40 | *(unimplemented)* |
| 6 | 50 | *(unimplemented, quest-gated)* |

Never use **mithril** — it is Tolkien's coinage and carries real estate risk.
Item, place, person, and quest names must be original; skill names are generic
English nouns.

## Design pillars

1. **Single-player pacing.** Target ~40-60 hours to finish, not 2,000. RSC's
   grind assumed thousands of players and social pressure; none of that exists
   here, so grind reads as padding.
2. **RSC's shape, not its content.** Tick-based, click-to-interact, small
   viewport, terse chat-box prose. Everything named is original.
3. **Every skill interlocks.** No skill ships without at least one inbound and
   one outbound dependency. Woodcutting alone is a grind; Woodcutting that
   gates Cooking that gates Combat is a game.
4. **Quests teach, then reward.** A quest introduces a mechanic, then gives a
   reason to use it. Every quest unlocks something; one that gives only XP is
   a chore.

## Skills

14 for v1. Cut before adding.

| Group | Skills |
|---|---|
| Combat | Attack, Strength, Defence, Vitality, Archery, Magic |
| Gathering | Woodcutting, Mining, Fishing, Foraging |
| Production | Firemaking, Cooking, Smithing, Crafting |

Deferred post-1.0: Alchemy, Thieving, Agility, Farming, Construction,
Inscription, task systems. Fletching is folded into Crafting.

Note the naming: **Vitality** not Hitpoints, **Archery** not Ranged, **Alchemy**
not Herblore. There is no Prayer skill.

## Code style

Match the surrounding code. Specifically:

- Comments explain *why*, not what. A comment that restates the line is noise;
  one that explains a design constraint or a RuneScape mechanic earns its place.
- Every non-obvious module opens with a short block on what it owns and why it
  is separate.
- Strict TypeScript, including `noUncheckedIndexedAccess`. No `any`, no
  non-null assertions on values that genuinely might be absent.
- Discriminated unions over magic strings for results and actions.
- Skill ids are baked into saves. Renaming one requires a migration.

## Before committing

- `npm run build` must pass (this runs `tsc --noEmit` first).
- Changes to gameplay should be verified against the real tick loop, not just
  typechecked. `window.game` is exposed in dev for exactly this.
