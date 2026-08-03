import { rng, Rng } from './rng.ts';

/**
 * Uniform integer in [0, max). The roll behind every combat calculation.
 *
 * Goes through the seeded generator, not Math.random(): this decides damage,
 * so it is gameplay and a save has to be able to replay it. Pass a generator
 * explicitly in tests; the default is the one the running game shares.
 */
export function rand(max: number, gen: Rng = rng): number {
  return gen.int(max);
}

/** Uniform integer in [min, max], inclusive at both ends. */
export function randRange(min: number, max: number, gen: Rng = rng): number {
  return gen.range(min, max);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Chebyshev distance -- a diagonal step counts as 1, which is how RuneScape
 * measures attack range on the tile grid.
 */
export function tileDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
