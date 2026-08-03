// Combat formulas and the experience they award.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Rng } from '../src/core/rng.ts';
import { maxHitFor, hitChance, resolve, STYLES } from '../src/systems/combat.ts';
import type { CombatStats, Mob } from '../src/types.ts';

/** A bare mob standing in for a real one -- combat only ever reads these. */
function fighter(stats: Partial<CombatStats> = {}): Mob {
  const full: CombatStats = {
    attack: 1, strength: 1, defence: 1,
    attackBonus: 0, strengthBonus: 0, defenceBonus: 0,
    styleAttack: 0, styleStrength: 0, styleDefence: 0,
    ...stats
  };
  return { combatStats: () => full } as unknown as Mob;
}

test('max hit matches the OSRS formula at known points', () => {
  // floor(0.5 + (1 + 0 + 8) * (0 + 64) / 640) = floor(0.5 + 0.9) = 1
  assert.equal(maxHitFor(1, 0, 0), 1);
  // floor(0.5 + (99 + 3 + 8) * (0 + 64) / 640) = floor(0.5 + 11) = 11
  assert.equal(maxHitFor(99, 3, 0), 11);
});

test('max hit never falls as level, style or equipment rise', () => {
  // Only ever monotonic, not strictly increasing: the formula floors, so three
  // style points can land inside the same integer. At level 20 both 0 and 3
  // give a max hit of 3, which is correct and worth pinning so nobody
  // "fixes" it later.
  assert.equal(maxHitFor(20, 3, 0), maxHitFor(20, 0, 0));

  for (let level = 1; level < 50; level++) {
    assert.ok(maxHitFor(level + 1, 0, 0) >= maxHitFor(level, 0, 0));
    assert.ok(maxHitFor(level, 3, 0) >= maxHitFor(level, 0, 0));
    assert.ok(maxHitFor(level, 0, 20) >= maxHitFor(level, 0, 0));
  }

  // And each of the three does move it somewhere. Style only crosses an
  // integer at certain levels -- 15 is one, 20 and 30 are not -- which is
  // exactly the flooring behaviour pinned above.
  assert.ok(maxHitFor(50, 0, 0) > maxHitFor(20, 0, 0));
  assert.ok(maxHitFor(15, 3, 0) > maxHitFor(15, 0, 0));
  assert.ok(maxHitFor(20, 0, 50) > maxHitFor(20, 0, 0));
});

test('hit chance is a probability, and favours the higher roll', () => {
  for (const [att, def] of [[1, 1], [100, 1], [1, 100], [5000, 4999]] as const) {
    const c = hitChance(att, def);
    assert.ok(c >= 0 && c <= 1, `hitChance(${att}, ${def}) = ${c}`);
  }
  assert.ok(hitChance(1000, 100) > hitChance(100, 1000));
});

test('a resolved attack is reproducible from a seed', () => {
  const run = () => {
    const gen = new Rng(4242);
    const attacker = fighter({ attack: 40, strength: 40, attackBonus: 20, strengthBonus: 20 });
    const defender = fighter({ defence: 10, defenceBonus: 5 });
    return Array.from({ length: 200 }, () => resolve(attacker, defender, gen));
  };

  assert.deepEqual(run(), run());
});

test('damage never exceeds the max hit, and a miss deals nothing', () => {
  const gen = new Rng(8);
  const attacker = fighter({ attack: 30, strength: 30, strengthBonus: 40 });
  const defender = fighter({ defence: 20, defenceBonus: 20 });

  let hits = 0;
  let misses = 0;

  for (let i = 0; i < 5_000; i++) {
    const r = resolve(attacker, defender, gen);
    assert.ok(r.damage >= 0 && r.damage <= r.maxHit, `damage ${r.damage} > max ${r.maxHit}`);
    if (r.hit) hits++; else { misses++; assert.equal(r.damage, 0); }
  }

  // Both outcomes must actually occur, or the roll is broken in one direction.
  assert.ok(hits > 0 && misses > 0, `hits ${hits}, misses ${misses}`);
});

test('a hit can roll zero damage, which is what a RuneScape 0 is', () => {
  const gen = new Rng(11);
  const attacker = fighter({ attack: 200, strength: 1, attackBonus: 200 });
  const defender = fighter({ defence: 1 });

  let zeroDamageHits = 0;
  for (let i = 0; i < 2_000; i++) {
    const r = resolve(attacker, defender, gen);
    if (r.hit && r.damage === 0) zeroDamageHits++;
  }
  assert.ok(zeroDamageHits > 0, 'a hit should sometimes roll 0');
});

test('every attack style awards experience to at least one skill', () => {
  for (const [id, style] of Object.entries(STYLES)) {
    assert.ok(style.xp.length > 0, `${id} trains nothing`);
    const bonuses = style.attack + style.strength + style.defence;
    assert.equal(bonuses, 3, `${id} does not spend exactly 3 bonus points`);
  }
});
