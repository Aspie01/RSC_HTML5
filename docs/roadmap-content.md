# Full Game Roadmap — RSC-Inspired HTML5 Game

**Companion to:** `roadmap-technical.md` (technical/engine roadmap)
**This document:** content design — skills, quests, world, progression, release phases
**Scope:** single-player, browser, static bundle

---

## 1. Design pillars

Four constraints that should decide every argument later.

1. **Single-player pacing, not MMO pacing.** RSC's grind assumed thousands of players, years of playtime, and social pressure. None of that exists here. Target ~40–60 hours to a satisfying finish, not 2,000.
2. **RSC's *shape*, not its content.** Tick-based, click-to-interact, 30-slot inventory, small fixed viewport, terse chat-box prose. All original items, NPCs, places, and quests.
3. **Every skill must interlock.** A skill that only feeds itself is a grind. Each one should consume another's output or unlock another's input.
4. **Quests teach, then reward.** RSC quests were the tutorial system. Keep that: a quest introduces a mechanic, then gives a reason to use it.

---

## 2. Setting frame

**Placeholder — replace this. You're the writer; this is scaffolding to hang quests on, not a proposal.**

Working frame: **the Reach** — a frontier of scattered settlements around a bay that flooded within living memory. The order that governed the region collapsed during the flood and nobody has replaced it. People fish, log, and mine at the edges of a drowned interior nobody surveys anymore.

Why this frame works structurally:

- **A drowned interior** gives a natural difficulty gradient. Coast = safe/early, inland/underwater = late.
- **A collapsed institution** gives you a quest spine (recovering the Wardens' records) without needing a villain up front.
- **A recent disaster** means NPCs remember. Dialogue can carry lore without exposition dumps.
- **Optional deep thread.** If you want the cosmic-horror register, the flood's cause is the vein for it — and it stays entirely optional. The early game reads as ordinary frontier fantasy either way.

Placeholder names below are marked *(placeholder)*. Swap freely; the structure holds.

---

## 3. Skill roster

### 3.1 IP notes

You said generic skills are fine. Three flags:

| Term | Verdict | Suggested |
|---|---|---|
| Woodcutting, Mining, Fishing, Cooking, Firemaking, Smithing, Crafting, Fletching, Thieving, Agility, Attack, Strength, Defence, Magic, Prayer | Generic. Safe. | Use as-is |
| **Herblore** | Jagex portmanteau, not a real word | **Alchemy** or **Apothecary** |
| **Runecrafting** | Jagex-distinctive as a skill concept | Cut, or rename to **Inscription** |
| **Slayer** (as a skill) | Jagex-distinctive framing | Cut for v1; it's a task system, not a skill |
| **Mithril** (ore tier) | Tolkien estate IP, not Jagex | Never use |
| **Hitpoints** | Generic but strongly RS-flavoured | **Vitality** or **Constitution** |

The safest posture: generic English nouns for skills, wholly original nouns for places, people, quests, and item tiers.

### 3.2 The roster

**14 skills for v1.0.** This is already ambitious for one person. Cut before you add.

**Combat (6)**
| Skill | Role |
|---|---|
| Attack | Accuracy, weapon tier gating |
| Strength | Melee damage |
| Defence | Damage reduction, armour gating |
| Vitality | Health pool. Rises passively from combat XP |
| Archery | Ranged accuracy + damage. Consumes Fletching output |
| Magic | Spellcasting. Consumes Crafting/Alchemy output |

**Gathering (4)**
| Skill | Produces | Feeds |
|---|---|---|
| Woodcutting | Logs | Firemaking, Fletching, Crafting |
| Mining | Ore, stone, gems | Smithing, Crafting |
| Fishing | Raw fish | Cooking |
| Foraging | Herbs, fibres, reagents | Alchemy, Cooking |

**Production (4)**
| Skill | Consumes | Produces |
|---|---|---|
| Firemaking | Logs | Fires (cooking sites, light, warmth mechanic) |
| Cooking | Raw fish/meat + fire | Food (the healing economy) |
| Smithing | Ore + fire | Weapons, armour, tools |
| Crafting | Hides, gems, glass, timber | Armour, jewellery, containers, magic foci |

*Fletching folds into Crafting for v1. Split it out later if Archery gets deep enough to justify it.*

**Deferred to post-1.0:** Alchemy, Thieving, Agility, Farming, Construction, Inscription. Each is listed in §8.

### 3.3 Interlock graph

Every arrow is a dependency you must actually implement.

```
Woodcutting ──logs──> Firemaking ──fire──> Cooking ──food──> Combat
     │                    │                    ↑
     └──timber───> Crafting                    │
                       ↑                    Fishing
Mining ──ore──> Smithing ──> Weapons/Armour ──> Combat
   └──gems──────> Crafting ──focus──> Magic
Foraging ──reagents──> Cooking (later: Alchemy)
```

**Rule to enforce:** no skill ships without at least one inbound and one outbound arrow. Woodcutting alone is a grind; Woodcutting that gates Cooking that gates Combat is a game.

### 3.4 Level cap and curve

**Recommendation: cap at 50, not 99.**

- RSC's curve is exponential specifically so 99 takes years. That's an MMO retention mechanic. It has no function in a single-player game and will read as padding.
- A cap of 50 with a gentler exponential gives you the same *feel* of milestone levels (10/20/30/40/50 tiers) in a fraction of the time.
- 14 skills × 50 levels is still a large number of hours.
- Content gates land at 1, 10, 20, 30, 40, 50. Six tiers per skill is plenty of texture.

If you want the 99 aesthetic, keep 99 as a post-game "mastery" cap unlocked after the capstone quest, with cosmetic rewards only. Don't gate content behind it.

---

## 4. Equipment and resource tiers

Six tiers, mapped to the level gates above. Original names — none of these are borrowed.

| Tier | Level | Ore/Material | Notes |
|---|---|---|---|
| 1 | 1 | Copper + Tin → **Bronze** | Real-world alloy, generic |
| 2 | 10 | **Iron** | Generic |
| 3 | 20 | Iron + Coal → **Steel** | Generic |
| 4 | 30 | **Blackiron** | Original; quest-gated as well as level-gated |
| 5 | 40 | **Adamantine** | Generic mythological term |
| 6 | 50 | **Tidefall Steel** *(placeholder)* | Original; quest-gated, not just level-gated |

**Do not use mithril.** It is Tolkien's coinage and it is the one metal name in the standard RPG ladder that carries actual estate risk.

Tier 6 being quest-gated rather than purely level-gated is deliberate — it makes the capstone quest the endgame rather than a grind wall.

---

## 5. Quest design

### 5.1 Principles

RSC quests were short. Fifteen to forty minutes, linear, no branching, one memorable beat each. Copy that structure precisely — it's the correct structure for a solo dev, and branching quests are where scope death happens.

**Standard quest anatomy:**
1. **Hook** — one NPC, one problem, stated in under four chat-box lines.
2. **Gate** — a skill requirement, an item requirement, or a prior quest.
3. **Body** — two to four steps. At least one uses a skill mechanic.
4. **Beat** — one thing the player will remember. A reveal, a fight, a choice with no mechanical consequence but emotional weight.
5. **Reward** — quest points, XP in a relevant skill, plus *one* unlock (an item, a shop, an area, a recipe).

**Hard rules:**
- No branching outcomes. One ending per quest.
- No quest longer than four steps in v1.
- No fetch quest without a mechanical justification — if the player is walking somewhere, something must be *there*.
- Every quest unlocks something. A quest that gives only XP is a chore.

### 5.2 Quest list

**24 quests, 5 tiers.** Names and premises are original. Quest points in brackets.

#### Tier 0 — Onboarding (no combat)

| # | Quest | Teaches | Gate | Reward unlock |
|---|---|---|---|---|
| 1 | **Cold Hearth** [1] | Firemaking, Cooking | None | Tinderbox, the inn as a hub |
| 2 | **Green Timber** [1] | Woodcutting, inventory management | None | Better axe, log merchant |
| 3 | **Low Tide** [1] | Fishing | None | Fishing rod, the docks |

*These three are effectively the tutorial, split so no single quest is a wall of instruction. Together they cover your shipped vertical slice.*

#### Tier 1 — Foundations

| # | Quest | Teaches | Gate | Reward unlock |
|---|---|---|---|---|
| 4 | **The Bent Nail** [1] | Smithing, Mining | WC 10 | Forge access, tool repair |
| 5 | **Salt in the Well** [2] | Investigation, dialogue | Q1 | Village well, Foraging intro |
| 6 | **A Weight Off** [1] | Shops, currency, value | None | Merchant, first gold sink |
| 7 | **Deepcut** [2] | Mining depth, hazards | Mining 10 | Lower mine, coal |

*"Salt in the Well" is where you first plant the flood thread. A fouled well, an explanation that doesn't quite hold. No payoff yet.*

#### Tier 2 — Combat introduction

| # | Quest | Teaches | Gate | Reward unlock |
|---|---|---|---|---|
| 8 | **First Blood on the Ridge** [2] | Melee combat, food healing | Q1, Cooking 10 | Combat training area |
| 9 | **A Debt of Feathers** [2] | Archery, Crafting/fletching | Q8 | Bow, arrow crafting |
| 10 | **The Quiet Grove** [2] | Woodcutting tiers, respawn mechanics | WC 20 | Hardwood trees |
| 11 | **Glass and Ash** [2] | Crafting — glass, containers | Firemaking 20 | Glassblower, vials |

#### Tier 3 — The Wardens

The spine begins. Each of these recovers a fragment of what the collapsed order left behind.

| # | Quest | Teaches | Gate | Reward unlock |
|---|---|---|---|---|
| 12 | **The Cartographer's Error** [3] | Exploration, map system | Q7 | New region, map item |
| 13 | **Vigil** [3] | Magic intro | Q11, Crafting 20 | Spellbook, first spells |
| 14 | **What the Warden Wrote** [3] | Lore, item combination | Q12 | Warden's ledger (key item) |
| 15 | **The Sunken Road** [3] | Hazard traversal | Q12, Q14 | Route to the drowned interior |
| 16 | **Ironmonger's Bargain** [2] | Smithing tiers 3–4 | Smithing 30 | Blackiron recipes |

#### Tier 4 — The Drowned Interior

| # | Quest | Teaches | Gate | Reward unlock |
|---|---|---|---|---|
| 17 | **What the Tide Kept** [4] | Underwater/flooded areas | Q15 | Flooded ruins region |
| 18 | **The Alchemist's Third Mistake** [3] | Saltwort, and steeping it | Q11, Q12, Foraging 30 | The saltwort draught |
| 19 | **Nine Names** [4] | Boss phases, prep | Q17, Vitality 30 | Adamantine, tier 5 |
| 20 | **The Last Warden** [5] | Four-phase combat | Q14, Q19, Vitality 35 | Warden's seal (cape slot) |
| 21 | **Unmarked** [3] | Choice without consequence | Q20 | Nothing mechanical. Deliberate, and pinned by a test. |

*"Unmarked" is the one quest that gives no unlock. It exists so the player learns that not everything in this world pays out — which makes it land when the capstone does.*

#### Tier 5 — Capstone

| # | Quest | Teaches | Gate | Reward unlock |
|---|---|---|---|---|
| 22 | **Watermark** [4] | Endurance, all-skill check | Q20, 8 skills at 40 | Tidefall Steel |
| 23 | **The Long Answer** [6] | Everything | Q22, all quests | Ending, mastery cap |
| 24 | **Wayfarer** [2] | — | 60 QP | Cosmetic cloak, statistics screen |

**Total quest points: 58.** Cape/cloak at the full total.

### 5.3 Quest volume reality check

24 quests, each with unique NPCs, dialogue trees, item chains, and at least one bespoke mechanic, is genuinely a lot. For a solo developer this is measured in quarters, not weeks.

**Mitigation:** ship in phases (§7) with quests 1–3 in the first public build. A five-quest game that's polished beats a 24-quest game that's half-implemented, and the phase structure means you can stop at any tier boundary and still have shipped something coherent.

---

## 6. World structure

Six regions, unlocked by quest rather than level where possible.

| Region | Unlock | Skills served | Danger |
|---|---|---|---|
| **The Landing** *(placeholder)* — starting village | Start | WC, Cooking, Firemaking, Fishing | None |
| **Kettle Ridge** — hills, mine, forge | Q4 | Mining, Smithing | Low |
| **The Cut** — deep mine | Q7 | Mining, Combat | Medium |
| **Wrackwood** — old forest | Q10 | WC, Foraging, Combat | Medium |
| **The Sunken Road** — flooded causeway | Q15 | Traversal, Combat | High |
| **The Drowned Interior** | Q17 | All, endgame | Very high |

**Map scale:** aim small. RSC's world felt large because travel was slow and the viewport was tiny, not because the tile count was high. A world you can cross in four minutes at walking pace is plenty. Resist expanding the map before the existing regions have reasons to return to them.

---

## 7. Release phases

| Phase | Version | Content | Milestone dependency |
|---|---|---|---|
| **A** *[done]* | 0.1 — first public build | WC, Firemaking, Cooking. Quests 1–3. The Landing only. | Engine M0–M10 |
| **B** *[done]* | 0.3 | Mining, Smithing, Fishing. Quests 4–7. Kettle Ridge, The Cut. | — |
| **C** *[done]* | 0.5 | Full combat suite + Vitality. Quests 8–11. Wrackwood. | Combat system |
| **D** *[done]* | 0.7 | Magic, Crafting, Foraging. Quests 12–16. | Spell system |
| **E** | 0.9 | Drowned Interior. Quests 17–21. Tiers 5–6 equipment. | Boss framework |
| **F** | 1.0 | Capstone quests 22–24. Balance pass. Mastery cap. | — |
| **Post** | 1.x | Alchemy, Thieving, Agility, task system, Farming | — |

Phase A is the build you already have a technical roadmap for. Everything after it is content on a proven engine.

**Phases A and B are built.** Seven quests, seven skills, and both regions:
Kettle Ridge is the surface quarry and smithy, The Cut is the sealed lower mine
that Deepcut opens. Shops and coins arrived with quest 6, which the economy
section below asks for and the phase table does not mention.

Two deviations worth knowing:

- **Coal moved.** It used to sit in the open quarry, which made Deepcut an
  optional detour rather than the thing that unlocks steel. The only coal in
  the world is now inside The Cut. A save made before this keeps its coal but
  has to finish Deepcut to mine more — the quest gates on Mining 10, so anyone
  who could reach coal at all can open it immediately.
- **Foraging did not arrive with quest 5.** The phase table lists a "Foraging
  intro" as its unlock, but Foraging is a Phase D skill and introducing it here
  would mean shipping a skill with no production chain to feed. Salt in the
  Well plants the flood thread instead, which is what §5.2 actually says it is
  for; the hook stays for Phase D.

**Phase C is built too.** Melee, Vitality and the accuracy and damage formulas
were already in place from the engine work, so the gap was Archery: bows,
arrows in their own slot, and weapon reach. Crafting arrived with it, through
glass and then fletching.

Three deviations:

- **Crafting came before quest 9, not with quest 11.** Fletching is folded into
  Crafting per §3.2, so building arrows before the skill that owns them existed
  was backwards. Glass and Ash was implemented first and quest 9 sits on it.
- **Quest stages can require kills.** Quest 8 asks for four goblins and the
  goal schema could not express it, which would have left the dialogue claiming
  a requirement nothing checked.
- **The grove is guarded by boars, not goblins.** Aggressive spawns killed a
  test woodcutter mid-chop. A Woodcutting reward gated on Woodcutting cannot
  charge a combat toll, which the Cut had already taught once.

**Phase D is done.** Magic, Foraging and Crafting are in, quests 12 to 15
carry the Wardens arc from the first measurement that does not make sense to
the stair at the end of the causeway, and quest 16 fills equipment tier 4.

The register was settled here: the flood goes somewhere stranger. Nothing
before quest 12 commits either way, so the earlier quests still read as
written.

Phase E is next, and the road already points at it: the descent at (47,44)
is the way into the Drowned Interior.

---

## 8. Deferred systems

Explicitly out of scope for 1.0, listed so they don't creep in:

- **Alchemy / Thieving / Agility** — good skills, but three more full progression curves. Post-1.0.
- **Farming / Construction** — both need persistent world-state systems (growth timers, player-placed objects) that are a project each.
- **Inscription** — only worth building if Magic is deep enough to need a rune economy.
- **Task system** ("kill N of X for a reward") — cheap replayability, but add it after the quests, not instead of them.
- **Multiplayer, trading, any server component** — settled as out of scope.
- **Branching quests, multiple endings** — the fastest route to never shipping.
- **Randomized/procedural content** — this game's appeal is handcrafted density. Procedural generation would undercut it.

---

## 9. Economy without other players

No player market means the whole RS economy model is inapplicable. What replaces it:

- **NPC shops with finite stock and restock timers.** Creates scarcity without a market.
- **Gold sinks:** tool repair, smithing fuel, shop restock premiums, teleport/travel fees.
- **Gold sources:** quest rewards, NPC buy prices for surplus goods, gems from mining.
- **Deliberate deflation.** Since nobody's farming gold for real money, you can make gold scarce and meaningful. A 500-gold purchase should feel like a decision.
- **No bank early.** Inventory pressure is a design tool. Introduce banking at Phase B, not Phase A.

---

## 10. Open questions

Ordered by how much they block.

1. **Setting.** Everything above is scaffolding on a placeholder. This is your call and it should be made before Phase B quests are written.
2. **Register.** Straight frontier fantasy, or does the flood thread go somewhere strange? It changes tone, art direction, and the last six quests. It does not change anything in Phase A — you have time.
3. **Level cap.** 50 vs. 99. Affects XP tables, which affect saves.
4. **Combat model.** RSC's was tick-based rounds with an accuracy roll then a damage roll. Cloning it is defensible and well-documented; designing your own is more work but more yours.
5. **Fletching split.** Folded into Crafting for v1. Revisit if Archery gets its own content depth.

---

## 11. Honest scope assessment

You asked for the complete roadmap, so: **this is a multi-year project at hobbyist hours.** 14 skills, 24 quests, 6 regions, a combat system, and a magic system is commercial-indie scope, not weekend scope.

That is not an argument against it. It is an argument for the phase structure. Each phase in §7 is independently shippable, gets real players on itch.io, and produces feedback before you commit to the next one. The failure mode is building Phases A through F privately and releasing nothing for two years.

**Ship Phase A.** Three skills, three quests, one village. Then decide whether Phase B is still the game you want to make.
