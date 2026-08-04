// One-time hints.
//
// Small surface, but two of its behaviours are the kind that fail silently:
// a hint that repeats every session is an irritation nobody reports, and a
// restore that merges instead of replacing leaks one character's progress
// into another's.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Hints, HINT_IDS } from '../src/systems/hints.ts';

test('a hint is due once and never again', () => {
  const h = new Hints();
  assert.equal(h.due('firemaking'), true);
  assert.equal(h.due('firemaking'), false);
  assert.equal(h.due('firemaking'), false);
});

test('hints are independent of each other', () => {
  const h = new Hints();
  h.due('firemaking');
  assert.equal(h.due('cooking'), true, 'showing one hint consumed another');
});

test('shown hints survive a save round trip', () => {
  const h = new Hints();
  h.due('firemaking');
  h.due('mining');

  const back = new Hints();
  back.restore(JSON.parse(JSON.stringify(h.snapshot())));

  assert.equal(back.due('firemaking'), false);
  assert.equal(back.due('mining'), false);
  assert.equal(back.due('cooking'), true, 'restore invented a hint that was never shown');
});

test('restoring replaces rather than merges', () => {
  // Loading a second character in one session must not inherit the first
  // character's hints, and a fresh character must not start silenced.
  const h = new Hints();
  h.suppressAll(HINT_IDS);
  assert.equal(h.due('firemaking'), false);

  h.restore([]);
  assert.equal(h.due('firemaking'), true, 'an empty restore left old hints behind');
});

test('a save from before hints existed silences all of them', () => {
  // That save belongs to somebody who has already played. Teaching them to
  // chop a tree at Woodcutting 30 reads as a bug.
  const h = new Hints();
  h.suppressAll(HINT_IDS);
  for (const id of HINT_IDS) {
    assert.equal(h.due(id), false, `${id} still fires for a returning player`);
  }
});

test('restore ignores anything that is not a list of strings', () => {
  // The save is a parsed blob from storage the player can edit by hand.
  const h = new Hints();
  h.restore(undefined);
  h.restore(null);
  h.restore('firemaking');
  h.restore({ firemaking: true });
  assert.equal(h.due('firemaking'), true, 'malformed data silenced a hint');

  const mixed = new Hints();
  mixed.restore(['cooking', 42, null, { id: 'mining' }]);
  assert.equal(mixed.due('cooking'), false);
  assert.equal(mixed.due('mining'), true, 'a non-string was treated as a hint id');
});
