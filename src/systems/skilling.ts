// Non-combat skill rolls.
//
// RuneScape's gathering skills work like combat: nothing is instant, everything
// resolves on the tick, and each tick is an independent random roll. That is why
// chopping a tree sometimes takes one tick and sometimes twelve -- there is no
// progress bar filling up underneath, just repeated dice.
//
// The interpolation is OSRS's, stretched to whatever the level cap is:
//   chance = (low + (high - low) * (level - 1) / (MAX_LEVEL - 1)) / 256
//
// `low` is the roll weight at level 1 and `high` the weight at the cap, both on
// the engine's 0..255 scale. Keeping the /256 denominator means the numbers in
// resources.ts stay directly comparable to values from the wiki.
//
// Deriving the span from MAX_LEVEL rather than hardcoding 98 is what keeps a
// capped skill actually reaching its `high` weight -- with the divisor pinned
// at 98, a level-50 cap would top out halfway up every curve in the game.

import { clamp } from '../core/util.ts';
import { rng, Rng } from '../core/rng.ts';
import { MAX_LEVEL } from '../data/xp.ts';

/** Per-tick success probability for a gathering action, in [0, 1]. */
export function gatherChance(low: number, high: number, level: number): number {
  const l = clamp(level, 1, MAX_LEVEL);
  return (low + ((high - low) * (l - 1)) / (MAX_LEVEL - 1)) / 256;
}

export function rollGather(
  low: number, high: number, level: number, gen: Rng = rng
): boolean {
  return gen.chance(gatherChance(low, high, level));
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

export function rollBurn(
  level: number, stopLevel: number, maxBurn = 0.4, gen: Rng = rng
): boolean {
  return gen.chance(burnChance(level, stopLevel, maxBurn));
}
