# RuneScape Classic-Inspired HTML5 Game — Development Roadmap

**Status:** In development — M0–M9 built, M10 (ship) next
**Scope:** Single-player, browser-based, static bundle
**Targets:** itch.io (primary), blog link-out (secondary)
**Starter skills:** Woodcutting → Firemaking → Cooking

---

## 0. Locked decisions

These are settled. Changing any of them later is expensive.

| Decision | Choice | Rationale |
|---|---|---|
| Multiplayer | No, single-player only | No netcode seams, no server, no accounts |
| Simulation model | Fixed-tick, deterministic, seeded RNG | Testability, replay, save integrity |
| Sim purity | Zero browser APIs in sim module | Must run headless in Node |
| Content | JSON/TS data registries, not code | Adding a tree type is a data edit |
| Logical resolution | Fixed, integer-scaled | Pixel-art integrity |
| Distribution | Static bundle, relative paths | itch.io serves from a subpath |
| Persistence | Storage with in-memory fallback + manual export | Sandboxed iframes eat saves |

### Still open

- ~~Final title and package name.~~ **Thalren Vale**, package `thalren-vale`.
  Settled at M10, because the placeholder was "Untitled RuneScape-like" and
  shipping that to itch.io invites a complaint from a rights holder who pursues
  them. The name has to be original for the same reason no item may be mithril.
- ~~Renderer.~~ Canvas2D isometric.
- ~~Authenticity contract.~~ RSC-*shaped*, original numbers throughout.
- Mobile/touch support: yes or no. Decide before the input adapter is written.
  Still genuinely open — the game is mouse-only today and the deferred list in
  §7 keeps touch controls out of v1.

---

## 1. Architecture

```
content/          Pure data. Items, objects, skills, actions, map.
  ├─ items.ts
  ├─ objects.ts
  ├─ skills.ts
  ├─ actions.ts
  └─ map/

sim/              Pure. No DOM, no window, no Date, no Math.random.
  ├─ state.ts         Full serializable world state
  ├─ tick.ts          step(state, commands) -> state
  ├─ rng.ts           Seeded PRNG, seed + call count in state
  ├─ pathing.ts       A* over tile grid + blocking mask
  ├─ inventory.ts
  ├─ actions/         woodcutting.ts, firemaking.ts, cooking.ts
  └─ objects.ts       Spawn, despawn, respawn timers

render/           Reads sim state. Never mutates it.
  ├─ canvas.ts
  ├─ atlas.ts
  └─ interpolate.ts   Smooths between ticks at 60fps

ui/               Inventory panel, skills panel, chat log, menus
input/            DOM events -> sim commands
persist/          Serialize, storage adapter, export/import
main.ts           Wires it together, owns the loop
```

**The enforcing rule:** if `sim/` cannot run under `node` with no browser globals, the boundary has been violated. Add a CI check that imports `sim/` in a bare Node context and fails on `ReferenceError`.

**Dependency direction:** `content → sim → {render, ui}`, and `input → sim`. Nothing flows backwards.

---

## 2. Tick model

- Fixed tick length. 600ms is the RS2 value and a reasonable target; RSC was in the same neighbourhood.
- Accumulator loop:
  ```
  accumulator += deltaTime
  while (accumulator >= TICK_MS) { step(); accumulator -= TICK_MS }
  render(interpolationAlpha)
  ```
- Rendering interpolates position between the last two tick states. Gameplay never reads frame time.
- Player input is enqueued as commands and consumed at tick boundaries. A click does not mutate state directly.
- Seeded PRNG only. Store `{seed, callCount}` in state, never the output stream.

**Command shape:**
```ts
type Command =
  | { type: 'walk_to'; x: number; y: number }
  | { type: 'interact_object'; x: number; y: number; action: string }
  | { type: 'use_item_on_item'; slotA: number; slotB: number }
  | { type: 'use_item_on_object'; slot: number; x: number; y: number }
  | { type: 'drop_item'; slot: number }
```

---

## 3. Data schemas

Rough shapes. Refine on contact with the first skill.

**Item**
```ts
{ id, name, examine, stackable, value,
  equipSlot?, tags: string[],       // 'axe', 'tinderbox', 'raw_food'
  actions: string[] }
```

**Object** (world scenery)
```ts
{ id, name, examine, footprint: [w, h],
  blocking: boolean,
  actions: string[],               // 'chop', 'cook_on'
  depletesTo?: objectId,           // tree -> stump
  respawnTicks?: number,
  lifetimeTicks?: number }         // fire -> ash -> gone
```

**Skill action** (the generalization test)
```ts
{ id, skill, levelReq, xp,
  requires: { toolTag?, itemTag?, targetObject? },
  consumes?, produces?,
  successCurve: { lowChance, highChance },
  failureBehaviour: 'retry' | 'consume' | 'abort' }
```

Cooking's burn mechanic is `failureBehaviour: 'consume'` with a `burnedProduces` field. If that fits without a special case, the schema is generalizing correctly.

---

## 4. Milestones

Each milestone has a concrete acceptance test. Do not advance until it passes.

Headings carry their state: **[done]** means the acceptance test above was
actually run, not that the code looks finished. Anything unmarked is unbuilt.
Where a milestone shipped something other than what was planned, the deviation
is noted under it rather than quietly rewritten.

### M0 — Skeleton *[done]*
- Vite project, TypeScript, `base: './'` set from day one.
- Tick loop running, logging tick count.
- Empty tile grid, player entity, fixed-resolution canvas with integer scaling.
- **Accept:** tick counter advances at a stable rate; canvas scales 1x/2x/3x cleanly on window resize.

### M1 — Movement *[done]*
- Tile grid with a blocking mask.
- A* pathfinding.
- Click-to-walk. Player traverses one tile per tick along the path.
- Camera follows player.
- **Accept:** clicking across the map produces a sensible path; clicking a blocked tile walks to the nearest reachable neighbour.

### M2 — Action state machine *[done]*
- States: `idle → walking → arrived → performing → interrupted`.
- Actions only fire when the player is adjacent to the target tile.
- Clicking elsewhere mid-action cancels cleanly.
- **Accept:** no orphaned actions. Interrupt mid-action, verify no further ticks of that action execute.

*This is the milestone people skip. Every skill reuses it.*

### M3 — Inventory *[done]*
- Fixed 30 slots, RSC-style.
- Item registry loaded, items renderable in a panel.
- Drop, examine, and item-on-item plumbing (no behaviours bound yet).
- Inventory-full is a defined, testable condition.
- **Accept:** fill inventory, attempt to add an item, correct rejection message.

### M4 — Woodcutting *[done, acceptance test not run]*
- Tree objects on the map with `depletesTo: stump` and respawn timers.
- Axe detection by item tag.
- Level-gated success roll per tick.
- XP award, logs to inventory, tree depletes on success.
- Stops cleanly on inventory-full.
- **Accept:** deterministic test — seed N, level 1, chop 100 trees, assert exact XP and log count. Rerun, identical result.

*Woodcutting works, but the acceptance test cannot be written yet: gathering
rolls still go through `Math.random()`, so there is no seed to fix and no
repeatable result to assert. This is the debt CLAUDE.md records under "Seeded
randomness only", and it is the reason no test suite exists at all. Paying it
means a PRNG in the sim, its call count in the save, and the rolls in
`skilling`, `combat`, `ground`, `objects` and `util` routed through it.*

### M5 — Skills panel + XP curve *[done]*
- Level curve implemented and matching whichever reference you chose.
- Skills panel showing level, XP, XP to next.
- Level-up message in the chat log.
- **Accept:** XP-to-level table matches reference at levels 1, 50, 92, 99.

### M6 — Firemaking *[done]*
- Item-on-item: tinderbox + logs.
- Spawns a **dynamic** fire object on the player's tile.
- Fire blocks the tile and invalidates pathing.
- Lifetime timer: fire → ashes → despawn.
- **Accept:** light a fire, confirm pathfinding routes around it, confirm the fire is still interactable from an adjacent tile, confirm it decays on schedule.

*This milestone forces the object system to become dynamic. Expect it to break assumptions from M4.*

### M7 — Cooking *[done]*
- Item-on-object: raw food + fire.
- Level-scaled burn chance; failure consumes the input and produces burnt food.
- Same action bound to a second target type (range) with different burn rates.
- **Accept:** cooking works on both fire and range through the same `actions.ts` entry, with zero special-casing in the sim.

### M8 — Persistence *[done]*
- Full state serialization, versioned: `{version: 1, state: {...}}`.
- IndexedDB primary, localStorage fallback, in-memory fallback if both throw.
- **Manual export/import**: base64 save string in a copyable textarea.
- **Accept:** save, hard-refresh, load, state identical. Then disable storage in devtools and confirm export/import still works.

*Not polish. On itch.io this is the failure mode for a real fraction of players.*

Lives in `src/persist/`: `storage.ts` (the tier chain) and `save.ts` (format,
version, base64 codec). Two things the plan did not anticipate, both found by
testing rather than by reading:

- **Promoting a tier strands the saves below it.** Every existing save was in
  localStorage; making IndexedDB primary reads an empty database and looks
  exactly like a wiped character. An empty primary now inherits from a lower
  tier, and `clear()` reaches every tier — otherwise the inheritance step
  promotes a deleted save straight back on the next boot.
- **Import cannot reload on the memory tier.** Importing writes the save then
  reloads, but with no persistent store that reload boots from an empty one and
  discards the import — silently failing in the exact case the feature exists
  to rescue. Those players get an in-place swap instead.

Migration stays in `game.ts` rather than moving to `persist/`: converting an
old save needs live skills, inventory and world objects to write into.

### M9 — Presentation *[done]*
- ~~Sprite atlas (one PNG, not many files).~~ **Superseded.** `render/sprites.ts`
  draws everything from canvas primitives: no files to load, nothing to go
  missing in an iframe, and no atlas to keep in sync while content is still
  moving. Revisit only when committing to a real art style.
- ~~Chat log / message box.~~ `#chat-log`, written through `ui.message()`.
- ~~Click-to-start overlay (doubles as canvas focus and audio unlock).~~
  `ui/startoverlay.ts`. Also holds the tick loop until the player clicks — a
  fixed-tick world that starts on load means a goblin can reach you while you
  are still reading the welcome text.
- ~~`preventDefault` on keys that would scroll the parent page.~~ Arrows,
  Page Up/Down, Home, End and Space, skipped while typing in a text field.
- ~~Audio: ambient loop, action SFX.~~ Synthesised, not loaded — see below.
- **Accept:** loads and plays correctly inside a cross-origin iframe locally.
  `tools/` has the harness; `tools/README.md` says how to run it.

**Audio ships as `audio/cues.ts` + `audio/audio.ts`, with no audio files.**
Cues are data — stacks of tone and filtered-noise layers — rendered through
WebAudio on demand, for the same reasons the art is procedural: nothing to
fetch, nothing to license, nothing to go missing in a sandboxed iframe, and
adding a sound stays a data edit. Swap in real files later behind `play()`.

Two things the milestone did not mention but needed doing: cues fired in the
same tick are de-duplicated, or a hit that also levels a skill flanges; and
audio is guarded everywhere, so a browser that refuses it costs the player
sound and nothing else.

*Verified in the harness: both sandboxed frames fetch `index.html` and both
assets cross-origin with no 404, confirming the relative-path build. The
storage-denied frame cannot be inspected from outside — an opaque origin is
the point of it — so that path is covered by stubbing the storage globals to
throw, which produces the same condition somewhere observable.*

### M10 — Ship *[packaging done, upload outstanding]*
- ~~Build to static bundle, verify all paths relative.~~ Four files, both
  references `./`-relative, no `url()`, no external hosts, favicon inlined.
- ~~Zip with `index.html` at root.~~ `npm run pack`.
- Upload to itch.io, set embed dimensions. **Use 960×600.**
- Test in Chrome, Firefox, Safari — including private browsing.
- Blog post with screenshots, a short GIF, and a "Play on itch.io" link.
- **Accept:** a stranger on a phone or laptop can load it and chop a tree without instructions.

**Embed size is a judgement call, not a multiple.** The original plan assumed a
fixed logical resolution with integer scaling; the layout that got built is
fluid instead, so there is no multiple to take. Measured against the two things
that actually break — a stage too small to read and a side panel too short to
hold the inventory — 960×600 gives a 716×600 stage and a 288px panel. 800×500
is the practical floor. Below roughly 640×420 the panel stops being usable.

**The build is one self-contained `index.html`.** `tools/inline.mjs` folds the
CSS and JS in at the end of `npm run build`. A stock Vite build cannot be
opened by double-clicking — `crossorigin` tags plus a CORS-fetched module mean
a `file://` page loads neither — and unzipping and double-clicking is the first
thing anyone does with a downloaded archive. Inlining also leaves no asset path
to get wrong, so the blank-page-after-upload failure has nothing left to fail on.

**Packing is a script, not a documented command,** because of one trap:
PowerShell's `Compress-Archive` writes entry names with backslashes, which the
ZIP spec forbids. Extractors that take it literally produce a file named
`assets\index.js`, the page loads, every asset 404s, and the result is the
blank screen that gets reported as "worked locally, broken on itch".
`tools/pack.mjs` writes the archive directly so the separator is right
everywhere. Verified by extracting the zip and diffing every file against
`dist/`, then serving the extracted copy through the cross-origin harness.

**Ship order: Pages first, then itch.io.** `.github/workflows/pages.yml` builds
and publishes to GitHub Pages on every push to `main`, or on demand from any
branch via the Actions tab. That is not a second distribution channel — it is
the testing venue. A real HTTPS origin is the only honest way to run the
cross-browser and private-browsing passes, because `file://` gets stingy
storage in Firefox and Safari and a local server is awkward to reach from a
phone. Test there, then upload the same zip to itch.io.

`dist/` stays gitignored and the site is built in CI, so the published game
cannot drift from the source it claims to be.

*The remaining items need a person: they need itch.io credentials, a GitHub
setting only the owner can flip, and browsers this environment does not have.
The Safari and private-browsing passes matter most, since they are where the
storage tiers earn their keep.*

---

## 5. Deployment constraints

### itch.io
- Static zip, `index.html` at root, sandboxed cross-origin iframe.
- **Relative paths mandatory.** `base: './'` in Vite config. Absolute paths are the #1 cause of a blank screen on upload that worked locally.
- No cross-origin fetch. Ship content as ES module imports so the bundler inlines it — avoids an entire class of load-order bug.
- ~~`file://` testing fails on fetch due to CORS even when the itch build is fine.~~
  It did, and for a subtler reason than fetch: Vite marks its script and
  stylesheet tags `crossorigin`, and a `file://` page has an opaque origin, so
  both are refused — the game renders as unstyled HTML with no code running.
  `tools/inline.mjs` folds both into `index.html`, and an inline module is
  never fetched, so the built game now opens by double-clicking. Test both
  ways: `file://` catches nothing that HTTP does not, but it is how a player
  who downloads the zip will open it.
- Keep the bundle small. One atlas, compressed audio.
- Set the itch embed dimensions to match your logical resolution × integer scale.

### WordPress.com
WordPress.com strips iframe, script, form, and input tags on standard plans. Options:

1. **Link out** (recommended for now) — screenshot + GIF + link. Zero cost, works on every plan.
2. **Business tier** — unlocks plugins and custom code. Verify current tier names before paying; they change.
3. **Self-host or move to a static site** — full CSP control.

Note this is independent of hosting. Even from your own domain, the iframe gets stripped. The gate is the plan tier.

---

## 6. Known traps

| Trap | Mitigation |
|---|---|
| Sim imports `document` via a "quick" render hack | Node import check in CI |
| Content baked into `switch` statements | Review every PR for hardcoded IDs |
| `Math.random()` sneaks into an action | Lint rule banning it outside `rng.ts` |
| Orphaned actions after interruption | M2 state machine, tested |
| Tile occupancy vs. pathing mask vs. interaction target conflated | Three separate fields on the object; never derive one from another |
| XP stored as float, changed later | Decide integer-tenths vs. float at M5; it's baked into saves |
| Save schema unversioned | `version` field from save #1 |
| Non-integer canvas scaling | Integer factors only, `image-rendering: pixelated` |
| Absolute asset paths | `base: './'` at M0, verified at M10 |
| Package name baked into imports | Pick a codename before M1 |

### Agentic codegen note

Claude Code will default to putting `ctx.fillRect` next to `player.woodcutting += 1` unless told not to. Put the architecture rules in a `CLAUDE.md` at repo root — specifically the sim-purity rule, the no-`Math.random` rule, and the content-as-data rule — before generating more code. Every session re-reads it; your memory of the constraint does not survive a context reset, but the file does.

---

## 7. Deferred

Explicitly out of scope for v1. Listed so they don't creep in.

- Banking
- Fishing, Foraging, Crafting, Archery, Magic *(planned for v1 in the content
  roadmap, not yet built)*
- Trading, multiplayer, any server component
- Mobile touch controls *(unless decided in §0)*
- World map beyond a single starting area
- Sound settings, keybinds, accessibility options

**This list was written before the scope widened, and four items have since
left it:** combat with NPCs and respawn, quests and dialogue, Mining, and
Smithing are all built. That was deliberate — `roadmap-content.md` is the
authority on what v1 contains, and it asks for 14 skills and 24 quests. Treat
the section above as "not started", not as "must never exist".

The advice underneath it still holds, though, and is the part worth keeping:
the starter skills plus movement, inventory and persistence are a complete
shippable slice. **Nothing has shipped yet.** M9 and M10 are the only things
between the current build and a playable link, and every additional skill
added before then is a skill shipped to nobody.

---

## 8. Suggested sequencing

| Phase | Milestones | Focus |
|---|---|---|
| Foundation | M0–M3 | Engine. No skills. Hardest to retrofit. |
| Vertical slice | M4–M7 | The three skills. Content system proves itself. |
| Shippable | M8–M10 | Persistence, presentation, release. |

Resist starting M4 before M2 passes. Woodcutting built on a broken action state machine will need rewriting, and by then Firemaking will be built on it too.
