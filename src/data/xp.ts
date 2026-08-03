// The experience curve.
//
// RuneScape's formula, retuned for a single-player game:
//   xp(L) = floor( sum(n = 1..L-1) floor(n + 300 * 2^(n/9)) / 4 )
//
// The shape is unchanged -- the only edit is the doubling period, 9 levels
// instead of 7. That matters more than it looks. RSC's exponent is calibrated
// for an MMO: 99 is meant to take years, because retention was the point. None
// of that applies here, so the same curve would read as padding.
//
// Nine levels per doubling, capped at 50, gives the same milestone feel in a
// fraction of the time:
//   level 2 = 81, level 10 = 1,022, level 20 = 3,404,
//   level 30 = 8,535, level 40 = 19,575, level 50 = 43,347.
//
// Early levels are near-identical to the ones players know (2 is 81 here
// against RuneScape's 83); the divergence compounds later, which is exactly
// where the grind used to live.

export const MAX_LEVEL = 50;

/** Levels at which a new equipment tier unlocks. See CLAUDE.md. */
export const TIER_LEVELS: readonly number[] = [1, 10, 20, 30, 40, 50];

function buildTable(maxLevel: number, doubling: number): number[] {
  const t = [0, 0];
  let points = 0;

  for (let lvl = 1; lvl < maxLevel; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / doubling));
    t[lvl + 1] = Math.floor(points / 4);
  }

  return t;
}

/** table[level] = experience required to reach that level. */
const table = buildTable(MAX_LEVEL, 9);

export function forLevel(level: number): number {
  const lvl = Math.max(1, Math.min(level, MAX_LEVEL));
  return table[lvl] ?? 0;
}

export function levelFor(experience: number): number {
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (experience >= (table[lvl] ?? 0)) return lvl;
  }
  return 1;
}

/** Progress toward the next level, in [0, 1]. Fills the skill-tab bars. */
export function progress(experience: number): number {
  const lvl = levelFor(experience);
  if (lvl >= MAX_LEVEL) return 1;
  const cur = forLevel(lvl);
  const next = forLevel(lvl + 1);
  return (experience - cur) / (next - cur);
}

// --------------------------------------------------------------------------
// Legacy curve
// --------------------------------------------------------------------------
// The original 99-cap RuneScape table, kept for one purpose: reading saves
// written before the cap changed. A stored experience total is meaningless
// without the curve it was earned on, so the migration converts through
// LEVELS -- what the player achieved -- rather than through raw numbers.
//
// Delete this once no save in the wild predates version 2.

const legacyTable = buildTable(99, 7);

export function legacyLevelFor(experience: number): number {
  for (let lvl = 99; lvl >= 1; lvl--) {
    if (experience >= (legacyTable[lvl] ?? 0)) return lvl;
  }
  return 1;
}
