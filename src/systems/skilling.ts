// Non-combat skill rolls.
//
// RuneScape's gathering skills work like combat: nothing is instant, everything
// resolves on the tick, and each tick is an independent random roll. That is why
// chopping a tree sometimes takes one tick and sometimes twelve -- there is no
// progress bar filling up underneath, just repeated dice.
//
// The interpolation is OSRS's:
//   chance = (low + (high - low) * (level - 1) / 98) / 256
//
// `low` is the roll weight at level 1 and `high` the weight at level 99, both
// on the engine's 0..255 scale. Keeping the /256 denominator means the numbers
// in resources.ts are directly comparable to values from the wiki.

import { clamp } from '../core/util';

/** Per-tick success probability for a gathering action, in [0, 1]. */
export function gatherChance(low: number, high: number, level: number): number {
  const l = clamp(level, 1, 99);
  return (low + ((high - low) * (l - 1)) / 98) / 256;
}

export function rollGather(low: number, high: number, level: number): boolean {
  return Math.random() < gatherChance(low, high, level);
}

/**
 * Burn probability when cooking, falling linearly to zero at `stopLevel`.
 *
 * The real game uses per-food tables rather than a straight line, but the shape
 * is what matters: burning is punishing early and disappears entirely once you
 * out-level the food.
 */
export function burnChance(level: number, stopLevel: number, maxBurn = 0.4): number {
  if (level >= stopLevel) return 0;
  const t = (stopLevel - level) / (stopLevel - 1);
  return clamp(t * maxBurn, 0, maxBurn);
}

export function rollBurn(level: number, stopLevel: number, maxBurn = 0.4): boolean {
  return Math.random() < burnChance(level, stopLevel, maxBurn);
}
