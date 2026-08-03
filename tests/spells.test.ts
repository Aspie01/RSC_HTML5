// Spells, and the one property that makes choosing between them a decision.

import test from 'node:test';
import assert from 'node:assert/strict';

import { spells, getSpell, spellsUpTo } from '../src/data/spells.ts';
import { items } from '../src/data/items.ts';
import { MAX_LEVEL } from '../src/data/xp.ts';

test('every spell is castable, costed and reachable', () => {
  const seen = new Set<string>();

  for (const s of spells) {
    assert.ok(!seen.has(s.id), `duplicate spell ${s.id}`);
    seen.add(s.id);

    assert.ok(s.level >= 1 && s.level <= MAX_LEVEL, `${s.id} level ${s.level}`);
    assert.ok(s.maxHit > 0, `${s.id} cannot hurt anything`);
    assert.ok(s.reagents >= 1, `${s.id} is free to cast`);
    assert.ok(s.xp > 0, `${s.id} teaches nothing`);
    assert.ok(getSpell(s.id) === s, `${s.id} is not retrievable by id`);
  }
});

test('a stronger spell costs more, one way or another', () => {
  const ordered = [...spells].sort((a, b) => a.level - b.level);

  for (let i = 1; i < ordered.length; i++) {
    const weaker = ordered[i - 1]!;
    const stronger = ordered[i]!;

    assert.ok(stronger.maxHit > weaker.maxHit,
      `${stronger.id} does not hit harder than ${weaker.id}`);
    assert.ok(stronger.reagents >= weaker.reagents,
      `${stronger.id} is cheaper than ${weaker.id}`);
  }
});

test('there is something castable from the moment the book opens', () => {
  assert.ok(spellsUpTo(1).length > 0, 'no spell is castable at Magic 1');
  assert.equal(spellsUpTo(0).length, 0, 'a level-0 caster should have nothing');
  assert.equal(spellsUpTo(MAX_LEVEL).length, spells.length, 'the cap unlocks everything');
});

test('the reagent spells burn is a real, equippable item', () => {
  const leaf = items.emberleaf;
  assert.ok(leaf.tags.includes('reagent'), 'emberleaf is not a reagent');
  assert.equal(leaf.slot, 'ammo', 'a reagent has to fit the ammo slot');
  assert.ok(leaf.stackable, 'reagents must stack or a caster carries nothing else');
});

test('the focus that casts them declares Magic and reagents', () => {
  const focus = items.emberglass_focus;
  assert.equal(focus.combatSkill, 'magic');
  assert.equal(focus.ammoTag, 'reagent');
  assert.ok(focus.range > 1, 'a focus should outrange a fist');
  assert.ok(focus.bonuses.magic > 0, 'the focus adds no accuracy');
});
