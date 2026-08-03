// The RuneScape experience curve.
//
// The real formula, not an approximation:
//   xp(L) = floor( sum(n = 1..L-1) floor(n + 300 * 2^(n/7)) / 4 )
//
// It produces the numbers every RuneScape player knows by heart:
//   level 2 = 83, level 10 = 1,154, level 50 = 101,333,
//   level 92 = 6,517,253 (half of 99), level 99 = 13,034,431.

export const MAX_LEVEL = 99;

/** table[level] = experience required to reach that level. */
const table: number[] = ((): number[] => {
  const t = [0, 0];
  let points = 0;
  for (let lvl = 1; lvl < MAX_LEVEL; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t[lvl + 1] = Math.floor(points / 4);
  }
  return t;
})();

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
