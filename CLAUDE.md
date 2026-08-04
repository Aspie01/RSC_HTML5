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

**Current status: partly violated.** `game.ts` owns both the tick loop and the
renderer/UI/DOM bindings. This is a known debt, not a licence to add more.
Do not deepen it — new gameplay logic goes in `systems/`, which stays clean,
and browser-facing concerns go in `persist/`, `render/` or `ui/`.

Everything *below* `game.ts` does hold, and is tested: `tests/` imports
`systems/`, `data/` and `core/` under bare Node and steps them. That only works
because every relative import carries an explicit `.ts` extension — Node will
not guess one. Keep it that way, or the rule stops being checkable.

### 2. Seeded randomness only

Gameplay randomness goes through the seeded PRNG. Never `Math.random()`.

The seed and the call count live in saved state, so a save replays identically.
This is what makes deterministic tests possible:

> seed N, level 1, chop 100 trees, assert exact XP and log count; rerun,
> identical result.

Render-only jitter (flame flicker, sprite wobble) may use `Math.random()`,
because it never touches state. If it can change an outcome, it is gameplay.

**Current status: held, and enforced.** The generator is `core/rng.ts`; its
state rides in the save, so a character replays rather than merely resembling
itself. Every function that rolls takes an optional generator as its last
argument — pass one in tests, omit it in the game.

A render-only call must carry a `// render-only` comment on its own line.
`tests/content.test.ts` fails the build on any unmarked `Math.random()` outside
`render/` and `audio/`, so the justification lives beside the code and a new
one cannot be added silently.

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

### Persistence

Saves live in `src/persist/`. `storage.ts` picks a backing store — IndexedDB,
then localStorage, then memory — and moves an opaque string in and out of it.
`save.ts` owns the format: `SaveData`, `SAVE_VERSION`, and the base64 codec
behind the export/import textarea.

Three rules that are cheap now and expensive later:

- **Bump `SAVE_VERSION` and add a migration step** for any change old data
  cannot survive unaltered. Skill ids, item ids and quest ids are all baked
  into saves.
- **Migration belongs in `game.ts`, not `persist/`.** Converting a save needs
  live skills, inventory and world objects to write into. `persist/` must not
  learn about game state.
- **A migration must never leave a loaded character worse off than a new one.**
  When v2 added Mining and Smithing, it also had to hand returning players the
  pickaxe and hammer they had no other way to obtain.

Storage is asynchronous, so the save is read *before* `Game` is constructed and
handed in. Do not move that read into the constructor.

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
| 4 | 30 | Blackiron |
| 5 | 40 | Adamantine *(quest-gated)* |
| 6 | 50 | *(unimplemented, quest-gated)* |

Blackiron and adamantine are also **quest-gated**, and that distinction is worth keeping: a
level gate says "not yet", a quest gate says "nobody has shown you how". A
recipe carrying a `quest` is hidden from the menus entirely rather than shown
greyed-out, because a method you have never heard of should not be advertised.
Both the menu and the resolver check it — an action can outlive the menu that
created it.

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

## Testing

`npm test` runs `tests/` on Node's built-in runner. Node executes TypeScript
directly, so there is no framework and no test dependency — matching the
no-runtime-dependencies rule.

`npm run build` runs the suite first and fails without it.

What is worth a test here, given there is no browser in it:

- **Anything with a formula.** XP curve, gather chance, max hit, hit chance.
- **Anything seeded.** Fix a seed, assert an exact outcome, assert it repeats.
- **Cross-references in `data/`.** Every quest, recipe, drop and shop line
  points at an item id by string; a typo is a runtime failure the compiler
  cannot see. The content tests walk all of them.
- **The hard rules themselves**, where a machine can check them.

What is not: anything needing the DOM, the renderer, or `game.ts`, which still
binds both. Those are still checked by hand against the running tick loop —
`window.game` is exposed in dev, and `game.tick()` can be stepped directly when
`requestAnimationFrame` is unavailable.

## Before committing

- `npm run build` must pass (tests, then `tsc --noEmit`, then the bundle).
- Changes to gameplay should be verified against the real tick loop, not just
  typechecked. `window.game` is exposed in dev for exactly this.
