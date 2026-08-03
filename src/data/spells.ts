// Spells -- data only.
//
// A spell sets its own damage cap rather than deriving one from a Strength-like
// level, which is how RuneScape's magic has always worked and why choosing a
// spell is a real decision: the caster's level decides whether a spell can be
// cast and how often it lands, never how hard it hits.
//
// That also gives Magic a cost curve nothing else has. Melee costs nothing per
// swing and Archery costs one arrow; a spell costs reagents that had to be
// foraged out of a quest-locked grove, and the better spells cost more of them.
//
// There are no runes. §8 of the content roadmap defers Inscription until Magic
// is deep enough to need a rune economy, so emberleaf is the whole supply chain
// for now: Foraging -> reagent -> cast.

import type { SkillId } from '../types.ts';

export interface SpellDef {
  readonly id: string;
  readonly name: string;
  /** Magic level required to cast it at all. */
  readonly level: number;
  /** Experience per cast, awarded whether or not it lands. */
  readonly xp: number;
  /** Fixed damage cap. Damage rolls uniformly in [0, maxHit], as melee does. */
  readonly maxHit: number;
  /** Reagents burnt per cast. */
  readonly reagents: number;
  readonly describe: string;
}

export const MAGIC: SkillId = 'magic';

export const spells: readonly SpellDef[] = [
  {
    id: 'ember_spark',
    name: 'Ember spark',
    level: 1, xp: 10, maxHit: 4, reagents: 1,
    describe: 'The first thing anyone learns, and the last thing anyone respects.'
  },
  {
    id: 'emberbolt',
    name: 'Emberbolt',
    level: 10, xp: 22, maxHit: 8, reagents: 1,
    describe: 'The leaf goes out all at once instead of slowly.'
  },
  {
    id: 'hollowlight',
    name: 'Hollowlight',
    level: 20, xp: 45, maxHit: 13, reagents: 2,
    describe: 'Cold, and it casts no shadow. The Wardens wrote it down and did not say why.'
  }
];

export function getSpell(id: string): SpellDef | undefined {
  return spells.find((s) => s.id === id);
}

/** Everything castable at this level, cheapest first. */
export function spellsUpTo(level: number): readonly SpellDef[] {
  return spells.filter((s) => s.level <= level);
}
