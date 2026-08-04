// The economy.
//
// There is no player market, so every price in the game is a decision someone
// made in data, and the relationships between them are what stop coins being
// either worthless or the only thing that matters. None of that is visible
// from any single file, which is why it needs a test.
//
// It shipped broken once: the only shop sold seven starter tools, the dearest
// 26 coins, while an hour of mining earned 36,000 and the endgame boss dropped
// 632. Coins existed and had nothing to do.

import test from 'node:test';
import assert from 'node:assert/strict';

import { gatherChance } from '../src/systems/skilling.ts';
import { gatherables } from '../src/data/resources.ts';
import { getItem } from '../src/data/items.ts';
import { shops, getShop } from '../src/data/shops.ts';

const TICK = 0.6;
const CAPACITY = 28;
const TRIP_TICKS = 55;

const cart = getShop('vayles_cart');

/** The best rate anyone pays for this item. */
function bestSellRate(id: string): number {
  let rate = cart?.sellRate ?? 0;
  for (const shop of shops) {
    if (shop.stock.some((l) => l.id === id)) rate = Math.max(rate, shop.sellRate);
  }
  return rate;
}

/** Coins an hour from working a source at the level it is meant for. */
function coinsPerHour(g: typeof gatherables[keyof typeof gatherables]): number {
  const level = Math.max(g.level, 40);
  const p = gatherChance(g.low, g.high, level);
  const perLoad = (1 / p + g.depleteChance * 2) * CAPACITY + TRIP_TICKS;

  let perItem = (getItem(g.outputId)?.value ?? 0) * bestSellRate(g.outputId);
  if (g.bonus) {
    perItem += g.bonus.chance * (getItem(g.bonus.id)?.value ?? 0) * bestSellRate(g.bonus.id);
  }
  return ((perItem * CAPACITY) / (perLoad * TICK)) * 3600;
}

test('no shop can be churned for a profit', () => {
  for (const shop of shops) {
    assert.ok(shop.buyRate > shop.sellRate,
      `${shop.id} pays more than it charges, which prints coins`);
  }
});

test('the general store is the worst place to sell anything', () => {
  // It buys anything, so if it ever paid competitively nobody would walk to a
  // specialist and the specialists would be decoration.
  assert.ok(cart);
  for (const shop of shops) {
    if (shop.id === cart.id) continue;
    assert.ok(shop.sellRate > cart.sellRate,
      `${shop.id} pays no better than the general store`);
  }
});

test('only the general store buys things nobody deals in', () => {
  // Otherwise "walk it to the right buyer" stops being a decision.
  const anywhere = shops.filter((s) => s.buysAnything);
  assert.deepEqual(anywhere.map((s) => s.id), [cart?.id],
    'more than one shop buys anything at all');
});

test('there is something worth saving up for', () => {
  // The design pillar asks that a 500-coin purchase feel like a decision.
  // That needs a 500-coin purchase to exist.
  const prices = shops.flatMap((shop) =>
    shop.stock.filter((l) => l.max > 0)
      .map((l) => (getItem(l.id)?.value ?? 0) * shop.buyRate));

  assert.ok(Math.max(...prices) >= 500,
    `the dearest thing in the game costs ${Math.round(Math.max(...prices))}`);
});

test('the skills that consume ammunition can buy it', () => {
  // Archery and Magic spend something per action, which is what gives coins a
  // permanent job. If neither is purchasable the sink closes.
  const stocked = new Set(
    shops.flatMap((s) => s.stock.filter((l) => l.max > 0).map((l) => l.id)));

  assert.ok([...stocked].some((id) => getItem(id)?.tags.includes('arrow')),
    'no shop sells arrows');
  assert.ok([...stocked].some((id) => getItem(id)?.tags.includes('reagent')),
    'no shop sells spell reagents');
});

test('a buy-only line is never restocked into stock', () => {
  // max 0 means the shop swallows what it is given. A restock ceiling above
  // zero would quietly put it on the shelf.
  for (const shop of shops) {
    for (const line of shop.stock) {
      if (line.max !== 0) continue;
      assert.equal(shop.buysAnything, false,
        `${shop.id} declares a buy-only line but already buys anything`);
    }
  }
});

test('gems are the scaling gold source, and worth more than the ore', () => {
  // Coins on a drop table are fixed the day the NPC is written. Gems ride on
  // the rock, so mining income follows the player up the tiers.
  const withGems = Object.values(gatherables).filter((g) => g.bonus);
  assert.ok(withGems.length >= 3, 'gems are not spread across the mining tiers');

  for (const g of withGems) {
    const gem = getItem(g.bonus!.id);
    const ore = getItem(g.outputId);
    assert.ok(gem, `${g.id} drops an unknown gem`);
    assert.ok(gem.tags.includes('gem'), `${gem.id} is not tagged as a gem`);
    assert.ok(gem.value > (ore?.value ?? 0),
      `${gem.id} is worth less than the ore it comes with`);
    assert.ok(g.bonus!.chance > 0 && g.bonus!.chance < 0.05,
      `${g.id} drops gems at ${g.bonus!.chance}, which is a rate rather than an event`);
    assert.ok(shops.some((s) => s.stock.some((l) => l.id === gem.id)),
      `nobody buys ${gem.id}, so it is worthless`);
  }
});

test('no single source out-earns the rest of the game', () => {
  // Mining used to pay 36,000 an hour against a boss at 11,800. One activity
  // being the answer to money makes every other activity a hobby.
  const rates = Object.values(gatherables).map(coinsPerHour).sort((a, b) => b - a);
  const best = rates[0] ?? 0;
  const median = rates[Math.floor(rates.length / 2)] ?? 1;

  assert.ok(best / median <= 12,
    `the best source earns ${(best / median).toFixed(1)}x the median one`);
});

test('an hour of Magic costs about an hour of gathering', () => {
  // The economy's whole shape: gathering earns, the ranged skills spend. If
  // reagents were cheap relative to income the sink would stop mattering.
  const shelf = getShop('sellas_shelf');
  const emberleaf = getItem('emberleaf');
  assert.ok(shelf && emberleaf);

  const perHourOfCasting = emberleaf.value * shelf.buyRate * 600;   // ~1 a tick
  const bestGathering = Math.max(...Object.values(gatherables).map(coinsPerHour));

  assert.ok(perHourOfCasting > bestGathering * 0.3,
    'reagents are too cheap to be a sink');
  assert.ok(perHourOfCasting < bestGathering * 3,
    'reagents cost so much that Magic is unfundable');
});
