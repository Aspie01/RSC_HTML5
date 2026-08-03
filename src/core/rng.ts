// The seeded random number generator every gameplay roll goes through.
//
// CLAUDE.md's second hard rule: gameplay randomness is seeded, never
// Math.random(). The reason is not purity, it is testability -- a fixed seed
// makes "chop 100 trees and assert the exact experience" a test that can be
// written at all, and a save that carries its generator state replays
// identically instead of merely resembling itself.
//
// The line between gameplay and decoration is whether the outcome can change
// state. A flame's flicker phase and the jitter on a dropped item are drawn
// and forgotten, so they stay on Math.random(); a woodcutting roll, a damage
// roll and a drop table are all state, so they come through here.
//
// mulberry32: one 32-bit word of state, good statistical quality for this
// purpose, and -- the part that matters -- the whole generator can be saved
// and restored exactly, which a crypto RNG or Math.random() cannot be.

export interface RngState {
  /** The seed this generator started from. Kept for display and debugging. */
  seed: number;
  /** Current internal state. Restoring this is what makes a save replay. */
  state: number;
  /** How many numbers have been drawn. Not needed to restore -- see below. */
  calls: number;
}

export class Rng {
  private seed: number;
  private state: number;
  private calls = 0;

  constructor(seed = 1) {
    this.seed = seed | 0;
    this.state = seed | 0;
  }

  /** Next value in [0, 1). */
  next(): number {
    this.calls++;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, max). */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Integer in [min, max], inclusive at both ends. */
  range(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /**
   * Reseed from scratch. Used when a new character is created, so two players
   * do not share a stream of luck.
   */
  reseed(seed: number): void {
    this.seed = seed | 0;
    this.state = seed | 0;
    this.calls = 0;
  }

  snapshot(): RngState {
    return { seed: this.seed, state: this.state, calls: this.calls };
  }

  /**
   * Restore a saved generator.
   *
   * The state word is restored directly rather than by replaying `calls`
   * draws from the seed. Replaying would be O(calls) on every load and a long
   * character would take measurably longer to open than a new one, for a
   * result identical to assigning one integer.
   */
  restore(saved: unknown): void {
    if (typeof saved !== 'object' || saved === null) return;
    const s = saved as Partial<RngState>;
    if (typeof s.state !== 'number' || !Number.isFinite(s.state)) return;

    this.state = s.state | 0;
    if (typeof s.seed === 'number' && Number.isFinite(s.seed)) this.seed = s.seed | 0;
    if (typeof s.calls === 'number' && Number.isFinite(s.calls)) this.calls = Math.max(0, s.calls);
  }
}

/**
 * The generator the running game uses.
 *
 * A singleton for the same reason audio is one: threading a handle through
 * every call site that needs a die roll would touch far more of the game than
 * the feature is worth. Tests construct their own `Rng` instead, which is why
 * every function that rolls takes an optional generator argument.
 *
 * Seeded with a constant, deliberately. A fresh character is given a real seed
 * by the boot code, because the clock is a browser concern and rule 1 keeps
 * `Date` out of simulation code -- this module has to be importable and
 * steppable from a bare Node script, which is exactly what the tests do.
 */
export const rng = new Rng(1);
