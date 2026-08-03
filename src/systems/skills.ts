// Skills and experience.
//
// Each skill tracks experience only; the level is always derived via the XP
// table. Storing both invites them to drift out of sync -- derive, don't
// duplicate.

import type { SkillId } from '../types';
import * as XP from '../data/xp';

export interface SkillInfo {
  readonly id: SkillId;
  readonly name: string;
  readonly colour: string;
}

export const SKILL_LIST: readonly SkillInfo[] = [
  { id: 'attack', name: 'Attack', colour: '#9b2f2f' },
  { id: 'strength', name: 'Strength', colour: '#2f7a4f' },
  { id: 'defence', name: 'Defence', colour: '#3a5f9b' },
  { id: 'hitpoints', name: 'Hitpoints', colour: '#a8452a' },
  { id: 'ranged', name: 'Ranged', colour: '#5d7a2f' },
  { id: 'prayer', name: 'Prayer', colour: '#8a8ab0' },
  { id: 'magic', name: 'Magic', colour: '#2f5f8a' },
  { id: 'cooking', name: 'Cooking', colour: '#6b3f8a' },
  { id: 'woodcutting', name: 'Woodcutting', colour: '#4a6b2f' },
  { id: 'firemaking', name: 'Firemaking', colour: '#b5561f' },
  { id: 'fishing', name: 'Fishing', colour: '#4a6f8a' },
  { id: 'mining', name: 'Mining', colour: '#6b6b6b' },
  { id: 'smithing', name: 'Smithing', colour: '#5a4a3a' }
];

export type SkillXp = Record<SkillId, number>;

export class Skills {
  xp: SkillXp;

  constructor() {
    this.xp = Object.fromEntries(
      SKILL_LIST.map((s) => [s.id, 0])
    ) as SkillXp;

    // Hitpoints is the one skill that does not start at level 1.
    this.xp.hitpoints = XP.forLevel(10);
  }

  level(id: SkillId): number {
    return XP.levelFor(this.xp[id] ?? 0);
  }

  experience(id: SkillId): number {
    return this.xp[id] ?? 0;
  }

  /** Returns the number of levels gained, so the caller can announce them. */
  addXp(id: SkillId, amount: number): number {
    if (!(id in this.xp)) return 0;
    const before = this.level(id);
    this.xp[id] = Math.min(this.xp[id] + amount, XP.forLevel(99));
    return this.level(id) - before;
  }

  /** RuneScape combat level, including the ranged and magic branches. */
  combatLevel(): number {
    const base = 0.25 * (
      this.level('defence') +
      this.level('hitpoints') +
      Math.floor(this.level('prayer') / 2)
    );

    const melee = 0.325 * (this.level('attack') + this.level('strength'));
    const ranged = this.level('ranged');
    const magic = this.level('magic');
    const range = 0.325 * (Math.floor(ranged / 2) + ranged);
    const mage = 0.325 * (Math.floor(magic / 2) + magic);

    return Math.floor(base + Math.max(melee, range, mage));
  }

  totalLevel(): number {
    return SKILL_LIST.reduce((sum, s) => sum + this.level(s.id), 0);
  }
}
