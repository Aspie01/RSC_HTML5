// Boss phases.
//
// The whole mechanic is "cross a health threshold, swap some stats, say a
// line", so what is worth testing is the crossing: that it happens at the
// right health, that it cannot go backwards, that one large hit lands in the
// right phase rather than queueing, and that a second attempt is the same
// fight as the first.

import test from 'node:test';
import assert from 'node:assert/strict';

import { bosses, getBoss } from '../src/data/bosses.ts';
import { getNpc } from '../src/data/npcs.ts';
import { Npc } from '../src/entities/npc.ts';

test('every boss names a real NPC, and that NPC can be fought', () => {
  for (const boss of bosses) {
    const def = getNpc(boss.npcId);
    assert.ok(def, `boss "${boss.npcId}" has no NPC definition`);
    assert.ok(def.attackable, `boss "${boss.npcId}" cannot be attacked`);
    assert.ok(boss.phases.length > 1, `boss "${boss.npcId}" has nothing to change into`);
  }
});

test('phases run from full health downwards', () => {
  // advancePhase reads the list in order and takes the last match, so an
  // out-of-order list silently skips a phase rather than failing loudly.
  for (const boss of bosses) {
    assert.equal(boss.phases[0]?.at, 1.0, `${boss.npcId} does not start at full health`);
    for (let i = 1; i < boss.phases.length; i++) {
      const prev = boss.phases[i - 1]?.at ?? 0;
      const here = boss.phases[i]?.at ?? 0;
      assert.ok(here < prev, `${boss.npcId} phase ${i} is not below the one before it`);
      assert.ok(here > 0, `${boss.npcId} phase ${i} triggers at or below zero health`);
    }
  }
});

test('every phase says something', () => {
  for (const boss of bosses) {
    for (const p of boss.phases) {
      assert.ok(p.say.length > 0, `${boss.npcId} has a silent phase`);
    }
  }
});

test('a boss enters each phase at its threshold and not before', () => {
  const boss = getBoss('the_ninth');
  assert.ok(boss);

  const n = new Npc('the_ninth', 0, 0);
  assert.equal(n.phase, 0, 'a boss does not start in its first phase');

  for (let i = 1; i < boss.phases.length; i++) {
    const at = boss.phases[i]?.at ?? 0;
    const threshold = Math.floor(at * n.maxHp);

    // One hitpoint above the threshold: still the previous phase.
    n.hp = threshold + 1;
    assert.equal(n.advancePhase(), null, `phase ${i} fired one hitpoint early`);
    assert.equal(n.phase, i - 1);

    n.hp = threshold;
    const entered = n.advancePhase();
    assert.equal(entered, boss.phases[i], `phase ${i} did not fire at its threshold`);
    assert.equal(n.phase, i);

    // And it does not fire twice for the same crossing.
    assert.equal(n.advancePhase(), null, `phase ${i} fired again`);
  }
});

test('one big hit lands in the deepest phase it crossed', () => {
  const boss = getBoss('the_ninth');
  assert.ok(boss);

  const n = new Npc('the_ninth', 0, 0);
  n.hp = 1;                              // straight past every threshold
  const entered = n.advancePhase();

  assert.equal(n.phase, boss.phases.length - 1, 'a big hit left a phase queued up');
  assert.equal(entered, boss.phases[boss.phases.length - 1]);
});

test('a phase change swaps the stats it names and leaves the rest alone', () => {
  const n = new Npc('the_ninth', 0, 0);
  const def = getNpc('the_ninth');
  assert.ok(def);

  const first = n.combatStats();
  n.hp = Math.floor(0.25 * n.maxHp);
  n.advancePhase();
  const last = n.combatStats();

  // The Ninth sheds armour and hits harder as it goes. If that ever inverts,
  // the fight stops being the one the quest describes.
  assert.ok(last.defence < first.defence, 'the last phase is not softer');
  assert.ok(last.strength > first.strength, 'the last phase does not hit harder');
  assert.ok(n.attackSpeed < def.speed, 'the last phase is not faster');

  // Attack is not overridden by any phase, so it must still be the definition.
  assert.equal(last.attack, def.attack);
});

test('a boss comes back at phase one', () => {
  // Otherwise the second attempt is a different and much easier fight.
  const n = new Npc('the_ninth', 0, 0);
  const def = getNpc('the_ninth');
  assert.ok(def);

  n.hp = 1;
  n.advancePhase();
  assert.notEqual(n.phase, 0);

  n.respawn();
  assert.equal(n.phase, 0);
  assert.equal(n.hp, n.maxHp);
  assert.equal(n.combatStats().defence, getBoss('the_ninth')?.phases[0]?.defence);
});

test('the Last Warden armours up in the middle and drops it at the end', () => {
  // The whole argument for a second boss is that it is not the first one
  // again: the Ninth sheds armour as it goes, this one puts it on. A player
  // who learned "outlast the front, race the back" has to unlearn it, and if
  // this ever quietly becomes monotonic that lesson disappears.
  const boss = getBoss('the_last_warden');
  assert.ok(boss);

  const defences = boss.phases.map((p) => p.defenceBonus ?? 0);
  const opening = defences[0] ?? 0;
  const middle = Math.max(...defences);
  const last = defences[defences.length - 1] ?? 0;

  assert.ok(middle > opening, 'the Last Warden never armours up');
  assert.ok(last < opening, 'the Last Warden does not end unarmoured');
  assert.notEqual(defences.indexOf(middle), 0, 'its hardest armour is its opening');
  assert.notEqual(defences.indexOf(middle), defences.length - 1, 'it armours up at the end');

  // And it must be the harder fight of the two, or the order makes no sense.
  const ninth = getNpc('the_ninth');
  const warden = getNpc('the_last_warden');
  assert.ok(ninth && warden);
  assert.ok(warden.hitpoints > ninth.hitpoints, 'the Last Warden is not the longer fight');
  assert.ok(
    (getBoss('the_last_warden')?.phases.length ?? 0) > (getBoss('the_ninth')?.phases.length ?? 0),
    'the Last Warden does not have more stages than the Ninth'
  );
});

test('an ordinary NPC has no phases and never changes', () => {
  const goblin = new Npc('goblin', 0, 0);
  assert.equal(goblin.phase, -1);
  assert.equal(goblin.activePhase(), null);

  goblin.hp = 1;
  assert.equal(goblin.advancePhase(), null);

  const def = getNpc('goblin');
  assert.equal(goblin.combatStats().defence, def?.defence);
});
