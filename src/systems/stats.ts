// Lifetime counters, for the statistics screen Wayfarer unlocks.
//
// A flat bag of named numbers rather than fields, for one reason: every
// counter here is written from inside the tick loop, and a bag means adding
// one is a call to bump() and a row in STAT_ROWS. Fields would mean touching
// this file, the save codec, and the migration for every new number somebody
// wants to see, which is how counters stop getting added.
//
// Nothing in the simulation ever READS these. They are write-only from the
// game's point of view, which is what keeps them from quietly becoming state
// that gameplay depends on -- a counter that can change an outcome is not a
// statistic, it is a variable, and it would need the seeded-RNG treatment.

/** A counter that is displayed. The order here is the order on screen. */
export interface StatRow {
  readonly key: string;
  readonly label: string;
  /** Section heading this row sits under. */
  readonly group: 'Journey' | 'Gathering' | 'Making' | 'Combat';
}

export const STAT_ROWS: readonly StatRow[] = [
  { key: 'steps', label: 'Tiles walked', group: 'Journey' },
  { key: 'deaths', label: 'Times died', group: 'Journey' },

  { key: 'felled', label: 'Trees felled', group: 'Gathering' },
  { key: 'mined', label: 'Rocks mined', group: 'Gathering' },
  { key: 'caught', label: 'Fish caught', group: 'Gathering' },
  { key: 'foraged', label: 'Herbs cut', group: 'Gathering' },

  { key: 'fires', label: 'Fires lit', group: 'Making' },
  { key: 'cooked', label: 'Meals cooked', group: 'Making' },
  { key: 'burnt', label: 'Meals burnt', group: 'Making' },
  { key: 'smelted', label: 'Bars smelted', group: 'Making' },
  { key: 'smithed', label: 'Items forged', group: 'Making' },

  { key: 'slain', label: 'Enemies slain', group: 'Combat' },
  { key: 'damageDealt', label: 'Damage dealt', group: 'Combat' },
  { key: 'damageTaken', label: 'Damage taken', group: 'Combat' }
];

export class Stats {
  /** Elapsed ticks. Separate because it is the one counter the UI formats. */
  ticks = 0;

  private counts: Record<string, number> = {};

  bump(key: string, by = 1): void {
    this.counts[key] = (this.counts[key] ?? 0) + by;
  }

  get(key: string): number {
    return this.counts[key] ?? 0;
  }

  /** For the save. A plain object, and ticks rides along inside it. */
  toJSON(): Record<string, number> {
    return { ...this.counts, ticks: this.ticks };
  }

  /**
   * Restore from a save, tolerating keys this build has never heard of.
   *
   * An old save missing a counter reads zero, and a save from a LATER build
   * carrying counters this one does not display keeps them rather than
   * dropping them -- exporting a save from a newer build and importing it
   * into an older one should not silently erase numbers.
   */
  restore(data: Record<string, number> | undefined): void {
    if (!data) return;
    const { ticks, ...rest } = data;
    this.ticks = ticks ?? 0;
    this.counts = { ...rest };
  }
}

/** Ticks as "14h 01m", since 600ms per tick is not a number anybody reads. */
export function formatPlaytime(ticks: number): string {
  const totalMinutes = Math.floor((ticks * 600) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}
