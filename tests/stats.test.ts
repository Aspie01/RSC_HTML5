// Lifetime counters.
//
// There is not much logic here to test, and the parts worth pinning are the
// ones that touch saves: a counter that silently resets, or one that eats a
// number written by a newer build, loses a player something they cannot get
// back by playing better.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Stats, STAT_ROWS, formatPlaytime } from '../src/systems/stats.ts';

test('an unknown counter reads zero rather than undefined', () => {
  const s = new Stats();
  assert.equal(s.get('felled'), 0);
  assert.equal(s.get('a-counter-nobody-has-written'), 0);
});

test('bumping adds, and defaults to one', () => {
  const s = new Stats();
  s.bump('felled');
  s.bump('felled');
  s.bump('felled', 10);
  assert.equal(s.get('felled'), 12);
});

test('counters survive a save round trip, ticks included', () => {
  const s = new Stats();
  s.ticks = 12345;
  s.bump('felled', 7);
  s.bump('slain', 3);

  const back = new Stats();
  back.restore(JSON.parse(JSON.stringify(s.toJSON())));

  assert.equal(back.ticks, 12345);
  assert.equal(back.get('felled'), 7);
  assert.equal(back.get('slain'), 3);
});

test('a save written before statistics existed loads as zeroes', () => {
  const s = new Stats();
  s.bump('felled', 5);
  s.restore(undefined);
  assert.equal(s.get('felled'), 5, 'restoring nothing must not wipe the live counters');

  const fresh = new Stats();
  fresh.restore({});
  assert.equal(fresh.ticks, 0);
  assert.equal(fresh.get('felled'), 0);
});

test('a counter from a newer build is kept, not dropped', () => {
  // Exporting a save from a later build and importing it into this one should
  // not quietly delete numbers this build has never heard of.
  const s = new Stats();
  s.restore({ ticks: 5, felled: 2, somethingAddedLater: 99 });

  assert.equal(s.get('somethingAddedLater'), 99);
  assert.equal(s.toJSON()['somethingAddedLater'], 99);
});

test('every displayed row has a distinct key and a group', () => {
  const keys = new Set<string>();
  for (const row of STAT_ROWS) {
    assert.ok(!keys.has(row.key), `duplicate stat key "${row.key}"`);
    keys.add(row.key);
    assert.ok(row.label.length > 0, `${row.key} has no label`);
    assert.ok(row.group.length > 0, `${row.key} has no group`);
  }
});

test('rows are grouped contiguously, since the panel breaks on change', () => {
  // renderStats starts a new section whenever the group changes, so a group
  // that appears twice would render as two identical headings.
  const seen = new Set<string>();
  let current = '';
  for (const row of STAT_ROWS) {
    if (row.group === current) continue;
    assert.ok(!seen.has(row.group), `group "${row.group}" is not contiguous`);
    seen.add(row.group);
    current = row.group;
  }
});

test('playtime reads as hours and minutes at 600ms a tick', () => {
  assert.equal(formatPlaytime(0), '0m');
  assert.equal(formatPlaytime(100), '1m');          // 60s
  assert.equal(formatPlaytime(6000), '1h 00m');     // 3600s
  assert.equal(formatPlaytime(84102), '14h 01m');
});
