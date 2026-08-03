/** Uniform integer in [0, max). The roll behind every combat calculation. */
export function rand(max: number): number {
  return Math.floor(Math.random() * max);
}

/** Uniform integer in [min, max], inclusive at both ends. */
export function randRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
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
