// The generator everything else in this suite depends on.
//
// Run with `npm test`. There is no test framework: Node runs TypeScript
// directly and `node:test` is built in, so the project still has no runtime
// and no test dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Rng } from '../src/core/rng.ts';

test('the same seed produces the same stream', () => {
  const a = new Rng(12345);
  const b = new Rng(12345);
  const from = (g: Rng) => Array.from({ length: 50 }, () => g.next());

  assert.deepEqual(from(a), from(b));
});

test('different seeds produce different streams', () => {
  const a = new Rng(1);
  const b = new Rng(2);
  assert.notDeepEqual(
    Array.from({ length: 20 }, () => a.next()),
    Array.from({ length: 20 }, () => b.next())
  );
});

test('values stay in [0, 1)', () => {
  const g = new Rng(99);
  for (let i = 0; i < 10_000; i++) {
    const v = g.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('int and range respect their bounds', () => {
  const g = new Rng(7);
  for (let i = 0; i < 5_000; i++) {
    const n = g.int(6);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 6, `int out of range: ${n}`);

    const r = g.range(3, 5);
    assert.ok(Number.isInteger(r) && r >= 3 && r <= 5, `range out of range: ${r}`);
  }
});

test('the distribution is not obviously skewed', () => {
  const g = new Rng(2024);
  const buckets = new Array(10).fill(0);
  const draws = 100_000;
  for (let i = 0; i < draws; i++) buckets[Math.floor(g.next() * 10)]!++;

  // Within 10% of even. Loose on purpose -- this is a smoke test for a broken
  // generator, not a statistical proof.
  for (const [i, count] of buckets.entries()) {
    const ratio = count / (draws / 10);
    assert.ok(ratio > 0.9 && ratio < 1.1, `bucket ${i} skewed: ${ratio.toFixed(3)}`);
  }
});

test('a snapshot restores the exact stream, which is what makes a save replay', () => {
  const g = new Rng(555);
  for (let i = 0; i < 137; i++) g.next();          // play for a while

  const saved = JSON.parse(JSON.stringify(g.snapshot()));   // as it would be stored
  const expected = Array.from({ length: 25 }, () => g.next());

  const loaded = new Rng(1);
  loaded.restore(saved);
  const replayed = Array.from({ length: 25 }, () => loaded.next());

  assert.deepEqual(replayed, expected);
});

test('restoring is O(1) rather than replaying the call count', () => {
  const g = new Rng(3);
  g.restore({ seed: 3, state: 99, calls: 50_000_000 });

  // If restore replayed 50 million draws this would take seconds. It does not,
  // because the state word is assigned directly.
  const started = process.hrtime.bigint();
  g.next();
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.ok(elapsedMs < 50, `restore looks like it replayed: ${elapsedMs}ms`);
});

test('a malformed snapshot is ignored rather than corrupting the generator', () => {
  const g = new Rng(42);
  const before = g.snapshot();

  for (const junk of [null, undefined, 'nonsense', 42, {}, { state: 'x' }, { state: NaN }]) {
    g.restore(junk);
  }

  assert.deepEqual(g.snapshot(), before);
});

test('reseeding resets the call count and the stream', () => {
  const g = new Rng(10);
  for (let i = 0; i < 5; i++) g.next();

  g.reseed(10);
  assert.equal(g.snapshot().calls, 0);
  assert.equal(g.next(), new Rng(10).next());
});
