// Content integrity, and the two hard rules that can be checked mechanically.
//
// Most of this file is not testing logic -- it is testing that the data
// registries agree with each other. Every id below is one a quest, a recipe or
// a drop table points at, and a typo in any of them is a runtime failure that
// no amount of type-checking catches.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { items, getItem } from '../src/data/items.ts';
import { npcs } from '../src/data/npcs.ts';
import { quests, getQuest } from '../src/data/quests.ts';
import { shops } from '../src/data/shops.ts';
import { combinations, combinationFor } from '../src/data/combinations.ts';
import { inspectable } from '../src/data/inspect.ts';
import { transitions } from '../src/data/transitions.ts';
import {
  gatherables, bars, recipes, burnables, smithables, fletchables
} from '../src/data/resources.ts';
import * as XP from '../src/data/xp.ts';
import { SKILL_LIST } from '../src/systems/skills.ts';
import { generateMap, INTERIOR_STAIR, VAULT_SEAL, VAULT_FLOOR } from '../src/world/map.ts';
import { find } from '../src/world/pathfind.ts';

/** One generated world, shared by the tests that need to look at it. */
const map = generateMap();

const itemIds = new Set(Object.keys(items));
const npcIds = new Set(Object.keys(npcs));
const skillIds = new Set(SKILL_LIST.map((s) => s.id));

const exists = (id: string, where: string) =>
  assert.ok(itemIds.has(id), `${where} refers to unknown item "${id}"`);

// --------------------------------------------------------------------------
// Cross-references
// --------------------------------------------------------------------------

test('every gatherable produces a real item and trains a real skill', () => {
  for (const def of Object.values(gatherables)) {
    exists(def.outputId, `gatherable ${def.id}`);
    assert.ok(skillIds.has(def.skill), `${def.id} trains unknown skill ${def.skill}`);
    assert.ok(def.level >= 1, `${def.id} has a level below 1`);
    assert.ok(def.depleteChance >= 0 && def.depleteChance <= 1, `${def.id} deplete chance`);
  }
});

test('every furnace recipe and its ingredients exist', () => {
  for (const bar of bars) {
    exists(bar.id, `bar ${bar.id}`);
    assert.ok(skillIds.has(bar.skill), `${bar.id} uses unknown skill ${bar.skill}`);
    for (const i of bar.ingredients) exists(i.id, `bar ${bar.id} ingredient`);
  }
});

test('every cooking recipe has a raw, a cooked and a burnt item', () => {
  for (const r of Object.values(recipes)) {
    exists(r.rawId, 'recipe raw');
    exists(r.cookedId, 'recipe cooked');
    exists(r.burntId, 'recipe burnt');
    assert.ok(getItem(r.cookedId)!.heals > 0, `${r.cookedId} heals nothing`);
    assert.equal(getItem(r.burntId)!.heals, 0, `${r.burntId} should not heal`);
    assert.equal(getItem(r.burntId)!.value, 0, `${r.burntId} must not be sellable`);
  }
});

test('every burnable and smithable and fletchable resolves', () => {
  for (const b of Object.values(burnables)) exists(b.logId, 'burnable');
  for (const s of smithables) {
    exists(s.id, `smithable ${s.id}`);
    exists(s.barId, `smithable ${s.id} bar`);
  }
  for (const f of fletchables) {
    exists(f.outputId, `fletch ${f.id}`);
    for (const i of f.inputs) exists(i.id, `fletch ${f.id} input`);
    assert.ok(f.outputQty > 0, `${f.id} produces nothing`);
  }
});

test('every shop line is a real item with a price', () => {
  for (const shop of shops) {
    assert.ok(npcIds.has(shop.npc), `${shop.id} has unknown keeper ${shop.npc}`);
    assert.ok(shop.buyRate > shop.sellRate, `${shop.id} would print money`);
    for (const line of shop.stock) {
      exists(line.id, `shop ${shop.id}`);
      assert.ok(getItem(line.id)!.value > 0, `${line.id} is stocked but worthless`);
      assert.ok(line.max > 0 && line.restockTicks > 0, `${line.id} restock`);
    }
  }
});

test('every NPC drop is a real item', () => {
  for (const [id, def] of Object.entries(npcs)) {
    for (const drop of def.drops) {
      if (drop.id !== null) exists(drop.id, `npc ${id} drop`);
    }
  }
});

// --------------------------------------------------------------------------
// Quests
// --------------------------------------------------------------------------

test('every quest is internally consistent', () => {
  const seen = new Set<string>();

  for (const q of quests) {
    assert.ok(!seen.has(q.id), `duplicate quest id ${q.id}`);
    seen.add(q.id);

    assert.ok(q.stages.length > 0, `${q.id} has no stages`);
    assert.ok(q.reward.points > 0, `${q.id} awards no quest points`);
    assert.ok(q.reward.unlock.length > 0, `${q.id} unlocks nothing`);

    for (const dep of q.requires?.quests ?? []) {
      assert.ok(getQuest(dep), `${q.id} requires unknown quest ${dep}`);
    }
    for (const skill of Object.keys(q.requires?.skills ?? {})) {
      assert.ok(skillIds.has(skill), `${q.id} requires unknown skill ${skill}`);
    }
    for (const skill of Object.keys(q.reward.xp ?? {})) {
      assert.ok(skillIds.has(skill), `${q.id} rewards unknown skill ${skill}`);
    }
    for (const item of q.reward.items ?? []) exists(item.id, `${q.id} reward`);

    for (const stage of q.stages) {
      assert.ok(npcIds.has(stage.npc), `${q.id} stage names unknown npc ${stage.npc}`);
      assert.ok(stage.journal.length > 0, `${q.id} has a stage with no journal line`);
      assert.ok(stage.done.length > 0, `${q.id} has a stage that says nothing`);

      for (const item of stage.gives ?? []) exists(item.id, `${q.id} stage gift`);
      if (stage.goal.type === 'give') {
        for (const item of stage.goal.items) exists(item.id, `${q.id} goal`);
      }
      if (stage.goal.type === 'kill') {
        assert.ok(npcIds.has(stage.goal.npcId), `${q.id} hunts unknown npc`);
        assert.ok(stage.goal.count > 0, `${q.id} asks for no kills`);
      }
    }
  }
});

test('a quest never asks for an item it does not also make obtainable', () => {
  // Everything a player can end up holding, from any source.
  const obtainable = new Set<string>();
  for (const g of Object.values(gatherables)) obtainable.add(g.outputId);
  for (const b of bars) obtainable.add(b.id);
  for (const s of smithables) obtainable.add(s.id);
  for (const f of fletchables) obtainable.add(f.outputId);
  for (const c of combinations) obtainable.add(c.output);
  for (const r of Object.values(recipes)) { obtainable.add(r.cookedId); obtainable.add(r.burntId); }
  for (const shop of shops) for (const l of shop.stock) obtainable.add(l.id);
  for (const def of Object.values(npcs)) {
    for (const d of def.drops) if (d.id) obtainable.add(d.id);
  }
  for (const q of quests) {
    for (const i of q.reward.items ?? []) obtainable.add(i.id);
    for (const s of q.stages) for (const i of s.gives ?? []) obtainable.add(i.id);
  }
  // Dealt out by the starting inventory.
  for (const id of ['bronze_scimitar', 'wooden_shield', 'bronze_axe', 'tinderbox',
                    'bronze_pickaxe', 'hammer', 'cooked_chicken']) obtainable.add(id);

  // Ash is the one item no data table produces: it is dropped by the tick loop
  // when a fire burns out. If a second engine-side source ever appears, this
  // list is where it has to be declared, or this test will not know about it.
  obtainable.add('ash');

  for (const q of quests) {
    for (const stage of q.stages) {
      if (stage.goal.type !== 'give') continue;
      for (const item of stage.goal.items) {
        assert.ok(
          obtainable.has(item.id),
          `${q.id} asks for "${item.id}", which nothing in the game produces`
        );
      }
    }
  }
});

// --------------------------------------------------------------------------
// Experience curve
// --------------------------------------------------------------------------

test('the experience curve is monotonic and starts at zero', () => {
  assert.equal(XP.forLevel(1), 0);
  for (let l = 2; l <= XP.MAX_LEVEL; l++) {
    assert.ok(XP.forLevel(l) > XP.forLevel(l - 1), `curve fell at level ${l}`);
  }
});

test('the curve matches the values CLAUDE.md pins', () => {
  assert.equal(XP.forLevel(2), 81);
  assert.equal(XP.forLevel(XP.MAX_LEVEL), 43_347);
  assert.equal(XP.MAX_LEVEL, 50);
});

test('levelFor is the inverse of forLevel', () => {
  for (let l = 1; l <= XP.MAX_LEVEL; l++) {
    assert.equal(XP.levelFor(XP.forLevel(l)), l, `level ${l} did not round-trip`);
    if (l < XP.MAX_LEVEL) {
      assert.equal(XP.levelFor(XP.forLevel(l + 1) - 1), l, `off-by-one below level ${l + 1}`);
    }
  }
});

test('experience past the cap does not exceed the cap', () => {
  assert.equal(XP.levelFor(XP.forLevel(XP.MAX_LEVEL) * 10), XP.MAX_LEVEL);
});

// --------------------------------------------------------------------------
// The hard rules, checked mechanically
// --------------------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('rule 2: no unmarked Math.random outside the renderer and the audio synth', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles('src')) {
    // Whole modules that only draw. Nothing they roll can change an outcome.
    if (file.includes('render') || file.includes('audio')) continue;

    const src = readFileSync(file, 'utf8');
    src.split(/\r?\n/).forEach((line, i) => {
      if (!line.includes('Math.random()')) return;

      // Comments talking ABOUT the rule are not breaking it -- including the
      // doc blocks that explain why a function does not use it.
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return;

      const code = line.split('//')[0] ?? '';
      if (!code.includes('Math.random()')) return;

      // A render-only roll must say so on its own line. Requiring the marker
      // rather than keeping a list here means the justification lives next to
      // the code, and a new unmarked call fails this test by default.
      if (line.includes('render-only')) return;

      offenders.push(`${file}:${i + 1}`);
    });
  }

  assert.deepEqual(offenders, [], 'gameplay randomness must go through core/rng');
});

test('rule 1: the simulation imports under bare Node, with no browser globals', async () => {
  // Reaching this line at all proves most of it: every import at the top of
  // this file is simulation or data, and none of it touched document, window
  // or Date.
  assert.equal(typeof globalThis.document, 'undefined');
  assert.ok(SKILL_LIST.length === 14, 'expected 14 skills');

  // The world is the real test. Generating the map here means terrain,
  // scenery, pathfinding and spawns all run headless -- which is the whole
  // claim rule 1 makes, and it stays true only while nothing in that chain
  // reaches for a browser or uses syntax Node cannot strip.
  const { generateMap } = await import('../src/world/map.ts');
  const map = generateMap();

  assert.equal(map.width, 48);
  assert.equal(map.height, 48);
  assert.ok(map.spawns.length > 0, 'the generated world has nobody in it');
  assert.ok(map.isWalkable(24, 24), 'the starting tile is not walkable');

  const { find } = await import('../src/world/pathfind.ts');
  assert.ok(find(map, 24, 24, 20, 20).length > 0, 'cannot path across the crossroads');
});

test('every combination consumes and produces real items', () => {
  for (const c of combinations) {
    for (const input of c.inputs) exists(input, `combination making ${c.output}`);
    exists(c.output, 'combination output');
    assert.ok(c.outputQty > 0, `${c.output} produces nothing`);
    assert.notEqual(c.inputs[0], c.inputs[1], `${c.output} combines an item with itself`);
  }
});

test('every quest-gated recipe names a quest that exists', () => {
  // A typo here fails open in the worst direction: recipeKnown() cannot find
  // the quest, so the method is permanently unlearnable and the quest that
  // was supposed to teach it rewards nothing. Nothing else would notice.
  const known = new Set(quests.map((q) => q.id));

  const gated: ReadonlyArray<{ what: string; quest: string | undefined }> = [
    ...combinations.map((c) => ({ what: `combination -> ${c.output}`, quest: c.quest })),
    ...bars.map((b) => ({ what: `furnace -> ${b.id}`, quest: b.quest })),
    ...smithables.map((s) => ({ what: `anvil -> ${s.id}`, quest: s.quest }))
  ];

  for (const g of gated) {
    if (!g.quest) continue;
    assert.ok(known.has(g.quest), `${g.what} is gated on unknown quest "${g.quest}"`);
  }
});

test('a combination is found whichever way round it is used', () => {
  for (const c of combinations) {
    const [a, b] = c.inputs;
    assert.equal(combinationFor(a, b), c, `${c.output} not found forwards`);
    assert.equal(combinationFor(b, a), c, `${c.output} not found backwards`);
  }
  assert.equal(combinationFor('logs', 'coins'), undefined, 'nonsense pairs must not combine');
});

test('anything a quest sends you to look at is clickable', () => {
  // An inspect stage is only reachable if its scenery kind is inspectable --
  // otherwise clicking the thing does nothing and the quest cannot proceed.
  // This caught the reed wall, whose stage was only reachable from a test.
  for (const q of quests) {
    for (const stage of q.stages) {
      if (stage.goal.type !== 'inspect') continue;
      const scenery = map.sceneryAt(stage.goal.x, stage.goal.y);
      assert.ok(scenery, `${q.id} inspects (${stage.goal.x},${stage.goal.y}) where there is nothing`);
      assert.ok(
        inspectable(scenery.kind),
        `${q.id} inspects a "${scenery.kind}", which cannot be clicked to inspect`
      );
      // Clicking is done from an adjacent tile, so a thing with nowhere to
      // stand beside it is as unreachable as one that is not inspectable.
      assert.ok(
        ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(
          ([dx, dy]) => map.isWalkable(stage.goal.x + dx, stage.goal.y + dy)
        ),
        `${q.id} inspects (${stage.goal.x},${stage.goal.y}), which has nowhere to stand beside it`
      );
    }
  }
});

test('the ending waits for every other quest', () => {
  // The Long Answer lists its prerequisites rather than counting them, so
  // that adding a quest later is a deliberate decision about whether the
  // ending waits for it. This is what stops that list rotting: a new quest
  // that nobody added here would let the player finish the game with content
  // still in front of them, and nothing else would notice.
  const ending = getQuest('the_long_answer');
  assert.ok(ending);

  const required = new Set(ending.requires?.quests ?? []);
  const missing = quests
    .filter((q) => q.id !== ending.id && q.id !== 'wayfarer')
    .map((q) => q.id)
    .filter((id) => !required.has(id));

  assert.deepEqual(missing, [], 'quests exist that the ending does not wait for');
});

test('nothing is gated behind the ending except the victory lap', () => {
  // Wayfarer is allowed to come after The Long Answer -- it is the lap of
  // honour. Anything ELSE requiring the ending would be content placed after
  // the credits, which is content most players will never see.
  for (const q of quests) {
    if (q.id === 'wayfarer') continue;
    assert.ok(
      !(q.requires?.quests ?? []).includes('the_long_answer'),
      `${q.id} is gated behind the ending`
    );
  }
});

test('exactly one quest pays out nothing, and it is meant to', () => {
  // Unmarked is the deliberate exception to "every quest unlocks something".
  // It is pinned here so that adding a reward to it is a failing test rather
  // than a tidy-up, and so that a SECOND rewardless quest cannot appear by
  // accident and quietly turn the exception into a pattern.
  const rewardless = quests.filter((q) => (q.reward.items?.length ?? 0) === 0 &&
    Object.keys(q.reward.xp ?? {}).length <= 1);

  assert.deepEqual(
    rewardless.map((q) => q.id), ['unmarked'],
    'the set of quests that pay out almost nothing has changed'
  );

  const unmarked = getQuest('unmarked');
  assert.ok(unmarked);
  assert.equal(unmarked.reward.items, undefined, 'Unmarked has been given an item to hand over');
  assert.ok(unmarked.reward.points > 0, 'Unmarked must still be worth quest points');
  assert.ok(unmarked.reward.unlock.length > 0, 'Unmarked must still say what it did not do');
});

// --------------------------------------------------------------------------
// Passages
// --------------------------------------------------------------------------

test('every passage lands somewhere walkable, and has a way back', () => {
  for (const t of transitions) {
    assert.ok(
      map.isWalkable(t.to.x, t.to.y),
      `passage to (${t.to.x},${t.to.y}) lands on something unwalkable`
    );

    // A one-way door is how a player ends up somewhere they cannot leave.
    const back = transitions.find(
      (o) => o.from.x === t.to.x && o.from.y === t.to.y
    );
    assert.ok(back, `passage to (${t.to.x},${t.to.y}) has no way back`);
    assert.equal(back!.to.x, t.from.x, 'the return trip does not come back here');
    assert.equal(back!.to.y, t.from.y, 'the return trip does not come back here');
  }
});

test('a passage is anchored to scenery that can be clicked', () => {
  for (const t of transitions) {
    const scenery = map.sceneryAt(t.from.x, t.from.y);
    assert.ok(scenery, `passage at (${t.from.x},${t.from.y}) has nothing to click`);
    assert.ok(
      inspectable(scenery.kind),
      `passage sits on a "${scenery.kind}", which cannot be clicked to inspect`
    );
  }
});

test('the vault is sealed until one tile of it is cleared', () => {
  // Same shape as the Cut: a quest removes one piece of scenery and a region
  // opens. Worth a test because the seal is a hand-placed run of tiles and a
  // one-tile gap anywhere in it would open the vault to anyone who wandered
  // west -- silently, since nothing else would notice.
  const start = { x: INTERIOR_STAIR.x, y: INTERIOR_STAIR.y };

  assert.equal(
    find(map, start.x, start.y, VAULT_FLOOR.x, VAULT_FLOOR.y).length, 0,
    'the vault can be walked into before the quest opens it'
  );

  // The seal itself must be inspectable, since a quest stage sends the player
  // to look at it, and something must be standable beside it to do that from.
  const seal = map.sceneryAt(VAULT_SEAL.x, VAULT_SEAL.y);
  assert.ok(seal?.blocks, 'the seal does not block');
  assert.ok(inspectable(seal.kind), `the seal is a "${seal.kind}", which cannot be inspected`);
  assert.ok(
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
      ([dx, dy]) => map.isWalkable(VAULT_SEAL.x + dx, VAULT_SEAL.y + dy)
    ),
    'there is nowhere to stand to inspect the seal'
  );

  // Clearing that one tile is enough, and the floor behind it is dry -- the
  // fight happens there, and a hazard floor would make it a timer instead.
  const opened = generateMap();
  opened.scenery[opened.idx(VAULT_SEAL.x, VAULT_SEAL.y)] = null;
  assert.ok(
    find(opened, start.x, start.y, VAULT_FLOOR.x, VAULT_FLOOR.y).length > 0,
    'clearing the seal does not open a way in'
  );
  assert.equal(
    opened.terrainInfo(VAULT_FLOOR.x, VAULT_FLOOR.y).hazard, undefined,
    'the vault floor bleeds health, so the fight in it is a timer'
  );
});

test('the adamantine under the interior can be reached and worked from dry land', () => {
  // The islands moved when the vault was carved out of the west end. Every
  // rock needs somewhere dry to stand beside it and a route there from the
  // stair, or tier 5's ore is decorative.
  for (let y = 41; y <= 47; y++) {
    for (let x = 2; x <= 16; x++) {
      if (map.sceneryAt(x, y)?.resource !== 'adamantine') continue;

      const dry = ([ax, ay]: readonly [number, number]): boolean =>
        map.isWalkable(ax, ay) && map.terrainInfo(ax, ay).hazard === undefined;

      const stands = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        .map(([dx, dy]) => [x + dx, y + dy] as const)
        .filter(dry);

      assert.ok(stands.length > 0, `adamantine at (${x},${y}) can only be mined from the water`);
      assert.ok(
        stands.some(([ax, ay]) => find(map, INTERIOR_STAIR.x, INTERIOR_STAIR.y, ax, ay).length > 0),
        `adamantine at (${x},${y}) cannot be reached from the stair`
      );
    }
  }
});

test('the far side of a gated passage is not reachable on foot', () => {
  // The whole point of a seam is that the two ends are not connected on the
  // grid. If they were, the gate would be decorative.
  for (const t of transitions) {
    if (!t.quest) continue;
    assert.equal(
      find(map, t.from.x, t.from.y, t.to.x, t.to.y).length, 0,
      `(${t.from.x},${t.from.y}) can walk to its own destination, so the gate does nothing`
    );
  }
});
