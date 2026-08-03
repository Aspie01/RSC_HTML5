// Gathering and cooking rolls.
//
// This file contains the acceptance test M4 has asked for since the technical
// roadmap was written and which could not be written until the rolls were
// seeded: chop N trees on a fixed seed, assert the exact experience and log
// count, run it again and get the same answer.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Rng } from '../src/core/rng.ts';
import { gatherChance, rollGather, burnChance, rollBurn } from '../src/systems/skilling.ts';
import { gatherables } from '../src/data/resources.ts';
import { MAX_LEVEL } from '../src/data/xp.ts';

const TREE = gatherables.tree;

/**
 * Chop until `count` logs are won, exactly as the tick loop does: one
 * independent roll per tick, no progress bar. Returns what a player would have
 * to show for it.
 */
function chop(seed: number, level: number, count: number) {
  const gen = new Rng(seed);
  let logs = 0;
  let xp = 0;
  let ticks = 0;

  while (logs < count) {
    ticks++;
    if (rollGather(TREE.low, TREE.high, level, gen)) {
      logs++;
      xp += TREE.xp;
    }
    if (ticks > 1_000_000) throw new Error('gathering never succeeded');
  }

  return { logs, xp, ticks };
}

test('M4 acceptance: seed 1, level 1, 100 logs is exactly reproducible', () => {
  const first = chop(1, 1, 100);
  const second = chop(1, 1, 100);

  assert.deepEqual(first, second, 'the same seed must produce the same run');
  assert.equal(first.logs, 100);
  assert.equal(first.xp, 100 * TREE.xp);

  // Pin the tick count. If a change to the curve, the roll or the generator
  // moves this number, that is a balance change and it should be deliberate.
  // Pinned from a measured run. At level 1 the per-tick chance is 64/256, so
  // 100 successes in ~351 ticks is right on the expected 400 -- the point of
  // the assertion is not the number itself but that it never moves by accident.
  assert.equal(first.ticks, 351, 'chopping 100 logs at level 1 took a different number of ticks');
});

test('a different seed gives a different run of luck, but the same rewards', () => {
  const a = chop(1, 1, 100);
  const b = chop(2, 1, 100);

  assert.notEqual(a.ticks, b.ticks, 'two seeds should not roll identically');
  assert.equal(a.xp, b.xp, 'experience per log is not random');
});

test('a higher level chops faster', () => {
  const low = chop(7, 1, 200).ticks;
  const high = chop(7, MAX_LEVEL, 200).ticks;
  assert.ok(high < low, `level ${MAX_LEVEL} was not faster: ${high} vs ${low}`);
});

test('gather chance interpolates between the level 1 and cap weights', () => {
  const at1 = gatherChance(TREE.low, TREE.high, 1);
  const atCap = gatherChance(TREE.low, TREE.high, MAX_LEVEL);

  assert.equal(at1, TREE.low / 256);
  assert.equal(atCap, TREE.high / 256);

  // Monotonic in between, which is what stops a level-up ever feeling like a
  // downgrade.
  let previous = -1;
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const c = gatherChance(TREE.low, TREE.high, level);
    assert.ok(c > previous, `chance fell at level ${level}`);
    previous = c;
  }
});

test('gather chance clamps outside the level range', () => {
  assert.equal(gatherChance(TREE.low, TREE.high, 0), gatherChance(TREE.low, TREE.high, 1));
  assert.equal(
    gatherChance(TREE.low, TREE.high, MAX_LEVEL + 50),
    gatherChance(TREE.low, TREE.high, MAX_LEVEL)
  );
});

test('every gatherable is reachable at its own required level', () => {
  for (const def of Object.values(gatherables)) {
    const chance = gatherChance(def.low, def.high, def.level);
    assert.ok(chance > 0, `${def.id} is impossible at level ${def.level}`);
    assert.ok(chance <= 1, `${def.id} has a chance above 1`);
  }
});

test('burning stops entirely at the stop level and never before', () => {
  assert.equal(burnChance(15, 15), 0);
  assert.equal(burnChance(20, 15), 0);
  assert.ok(burnChance(14, 15) > 0);
  assert.ok(burnChance(1, 15) > burnChance(10, 15), 'burning should ease with level');
});

test('burn rolls are seeded and reproducible', () => {
  const run = (seed: number) => {
    const gen = new Rng(seed);
    let burnt = 0;
    for (let i = 0; i < 500; i++) if (rollBurn(5, 15, 0.4, gen)) burnt++;
    return burnt;
  };

  assert.equal(run(99), run(99));
  assert.ok(run(99) > 0 && run(99) < 500, 'burning should be neither never nor always');
});
