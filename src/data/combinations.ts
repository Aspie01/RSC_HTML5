// Using one item on another -- data only.
//
// The engine had exactly one of these and it was hardcoded: a tinderbox on
// logs. That was fine while it was the only one, and stops being fine the
// moment a quest needs a second, so combinations are a table like everything
// else and a new one never touches engine code.
//
// Order does not matter. Using pages on covers and covers on pages are the
// same act, and asking a player to guess which way round is not a puzzle.

import type { SkillId } from '../types.ts';

export interface CombineDef {
  /** The two items consumed. Matched in either order. */
  readonly inputs: readonly [string, string];
  readonly output: string;
  readonly outputQty: number;
  /** Optional skill requirement, for combinations that are a craft. */
  readonly skill?: SkillId;
  readonly level?: number;
  readonly xp?: number;
  /** Said on success. */
  readonly message: string;
  /** Said when the level is too low. Only needed if `skill` is set. */
  readonly tooLow?: string;
  /**
   * Quest that teaches this, if any -- the same gate the furnace recipes use.
   * A level says "not yet"; a quest says "nobody has shown you how", and an
   * unheard-of method should not quietly work the first time it is tried.
   */
  readonly quest?: string;
}

export const combinations: readonly CombineDef[] = [
  {
    inputs: ['glass_vial', 'saltwort'],
    output: 'saltwort_draught',
    outputQty: 1,
    skill: 'foraging',
    level: 30,
    xp: 7.5,
    quest: 'alchemists_third_mistake',
    message: 'The stem goes in whole and the vial goes cloudy around it.',
    tooLow: 'You do not know how to steep this yet.'
  },
  {
    inputs: ['ledger_covers', 'sodden_pages'],
    output: 'wardens_ledger',
    outputQty: 1,
    message: 'The pages sit into the covers as though they had never left.'
  }
];

/** The combination these two items make, in either order. */
export function combinationFor(a: string, b: string): CombineDef | undefined {
  return combinations.find(
    (c) => (c.inputs[0] === a && c.inputs[1] === b) ||
           (c.inputs[0] === b && c.inputs[1] === a)
  );
}

/** True if this item is half of any combination -- used to offer "Use". */
export function combinable(id: string): boolean {
  return combinations.some((c) => c.inputs[0] === id || c.inputs[1] === id);
}
