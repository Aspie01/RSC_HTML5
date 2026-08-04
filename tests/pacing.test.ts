// Pacing.
//
// The design pillars put a satisfying finish at 40-60 hours. Nothing else in
// the suite can see that number, and it is the easiest thing in the project to
// break by accident: XP awards are data, the curve is data, and a plausible
// edit to either moves the whole game by hours without failing anything.
//
// This shipped broken once. Awards were set at RuneScape's values while the
// curve was deliberately made about 2.3x shallower than RuneScape's, and the
// two were never reconciled -- every gathering skill went 1 to 50 in half an
// hour and the whole skilling content of the game was about two hours.
//
// The model below is deliberately crude and deliberately optimistic: perfect
// play, always the best unlocked source, no mistakes. Real play is slower. It
// exists to catch order-of-magnitude drift, not to predict anyone's session.

import test from 'node:test';
import assert from 'node:assert/strict';

import { gatherChance } from '../src/systems/skilling.ts';
import { maxHitFor } from '../src/systems/combat.ts';
import { gatherables, bars, recipes, burnables } from '../src/data/resources.ts';
import { items } from '../src/data/items.ts';
import * as XP from '../src/data/xp.ts';
import { quests } from '../src/data/quests.ts';

const TICK = 0.6;          // seconds
const CAPACITY = 28;       // 30 slots less the tools you are holding
const TRIP_TICKS = 55;     // walking a full load somewhere useful; there is no bank

/** Best xp/hour available to a gathering skill at a level, trips included. */
function gatherRate(skill: string, level: number): number {
  let best = 0;
  for (const g of Object.values(gatherables)) {
    if (g.skill !== skill || g.level > level) continue;
    const p = gatherChance(g.low, g.high, level);
    const perLoad = (1 / p + g.depleteChance * 2) * CAPACITY + TRIP_TICKS;
    best = Math.max(best, ((g.xp * CAPACITY) / (perLoad * TICK)) * 3600);
  }
  return best;
}

function fixedRate(
  list: ReadonlyArray<{ level: number; xp: number }>, level: number, ticks: number
): number {
  let best = 0;
  for (const d of list) {
    if (d.level > level) continue;
    best = Math.max(best, (d.xp / (ticks * TICK)) * 3600);
  }
  return best;
}

function hoursTo(target: number, rateAt: (level: number) => number): number {
  let total = 0;
  for (let lvl = 1; lvl < target; lvl++) {
    const rate = rateAt(lvl);
    assert.ok(rate > 0, `nothing trains this skill at level ${lvl}`);
    total += (XP.forLevel(lvl + 1) - XP.forLevel(lvl)) / rate;
  }
  return total;
}

const GATHERING = ['woodcutting', 'mining', 'fishing', 'foraging'] as const;

test('no gathering skill reaches 40 in under two hours or over eight', () => {
  // Under two means the level gates are decoration. Over eight means one skill
  // is a wall the other three are not.
  for (const skill of GATHERING) {
    const h = hoursTo(40, (lvl) => gatherRate(skill, lvl));
    assert.ok(h >= 2, `${skill} reaches 40 in ${h.toFixed(1)}h, which is too fast to matter`);
    assert.ok(h <= 8, `${skill} reaches 40 in ${h.toFixed(1)}h, which is a wall`);
  }
});

test('the gathering skills are within a factor of two of each other', () => {
  // They are alternatives, not a sequence. If one is twice the cost of another
  // for the same tier of reward, nobody will ever pick the expensive one.
  const times = GATHERING.map((s) => hoursTo(40, (lvl) => gatherRate(s, lvl)));
  const fastest = Math.min(...times);
  const slowest = Math.max(...times);
  assert.ok(
    slowest / fastest <= 2,
    `gathering spread is ${slowest.toFixed(1)}h vs ${fastest.toFixed(1)}h`
  );
});

test('Smithing to the cap is the longest single skill, but not absurd', () => {
  // Smithing 50 is the only level-cap gate in the game, guarding tier 6, so it
  // should be the biggest single commitment -- and still finishable.
  const smithing = hoursTo(50, (lvl) =>
    fixedRate(bars.filter((b) => b.skill === 'smithing'), lvl, 3));

  assert.ok(smithing >= 4, `Smithing reaches 50 in ${smithing.toFixed(1)}h, too fast for a cap gate`);
  assert.ok(smithing <= 12, `Smithing reaches 50 in ${smithing.toFixed(1)}h, which is a second game`);

  for (const skill of GATHERING) {
    assert.ok(
      smithing > hoursTo(40, (lvl) => gatherRate(skill, lvl)),
      `${skill} to 40 costs more than Smithing to 50`
    );
  }
});

test('a whole run lands in the 40-60 hour band the pillars ask for', () => {
  let total = 0;
  for (const skill of GATHERING) total += hoursTo(40, (lvl) => gatherRate(skill, lvl));

  total += hoursTo(50, (lvl) => fixedRate(bars.filter((b) => b.skill === 'smithing'), lvl, 3));
  total += hoursTo(40, (lvl) => fixedRate(bars.filter((b) => b.skill === 'crafting'), lvl, 3));
  total += hoursTo(40, (lvl) => fixedRate(
    Object.values(recipes).map((r) => ({ level: r.level, xp: r.xp })), lvl, 3));
  total += hoursTo(40, (lvl) => fixedRate(Object.values(burnables), lvl, 4));

  // Melee, using the weapon tier the player would actually be holding. The
  // controlled style splits one kill's xp three ways, so all three cost triple.
  const tiers = [
    [1, 'bronze_scimitar'], [10, 'iron_scimitar'], [20, 'steel_scimitar'],
    [30, 'blackiron_scimitar'], [40, 'adamantine_scimitar']
  ] as const;
  const weaponAt = (level: number) => {
    let pick = tiers[0];
    for (const t of tiers) if (t[0] <= level) pick = t;
    return items[pick[1]];
  };
  const melee = hoursTo(40, (lvl) => {
    const w = weaponAt(lvl);
    const maxHit = maxHitFor(lvl, 3, w.bonuses.strength);
    return ((4 * (((maxHit / 2) * 0.6) / (w.speed || 4))) / TICK) * 3600;
  });
  total += melee * 3 + melee;      // the melee trio, plus Archery

  assert.ok(total >= 30, `a full run is ${total.toFixed(0)}h before quests, which is short of the 40-60 target`);
  assert.ok(total <= 60, `a full run is ${total.toFixed(0)}h before quests, which overshoots the 40-60 target`);
});

test('the first level-up is under five minutes', () => {
  // The other end of the same problem. A curve tuned for the late game can
  // make the opening unplayable, and the opening is what anybody actually sees.
  const tree = gatherables.tree;
  const perTree = (1 / gatherChance(tree.low, tree.high, 1) + tree.depleteChance * 2) * TICK;
  const seconds = Math.ceil(XP.forLevel(2) / tree.xp) * perTree;

  assert.ok(seconds <= 300, `level 2 Woodcutting takes ${Math.round(seconds)}s`);
});

test('quest rewards are visible in every skill they touch', () => {
  // A reward nobody notices is a failed reward. Doing every quest should be
  // worth at least a few levels in any skill the quests bother to name.
  const totals: Record<string, number> = {};
  for (const q of quests) {
    for (const [skill, amount] of Object.entries(q.reward.xp ?? {})) {
      totals[skill] = (totals[skill] ?? 0) + (amount ?? 0);
    }
  }

  for (const [skill, amount] of Object.entries(totals)) {
    let level = 1;
    while (level < 50 && XP.forLevel(level + 1) <= amount) level++;
    assert.ok(level >= 5, `every quest together is only level ${level} of ${skill}`);
    assert.ok(level <= 35, `quests alone reach level ${level} of ${skill}, most of the way to the cap`);
  }
});
