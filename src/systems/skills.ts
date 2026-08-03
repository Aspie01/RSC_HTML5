// Skills and experience.
//
// Each skill tracks experience only; the level is always derived via the XP
// table. Storing both invites them to drift out of sync -- derive, don't
// duplicate.

import type { SkillId } from '../types.ts';
import * as XP from '../data/xp.ts';

export interface SkillInfo {
  readonly id: SkillId;
  readonly name: string;
  /**
   * What the skills panel shows. Chosen rather than truncated, because
   * name.slice(0, 5) turns Attack into "Attac" and Mining into "Minin".
   */
  readonly abbr: string;
  readonly colour: string;
}

export const SKILL_LIST: readonly SkillInfo[] = [
  // Combat
  { id: 'attack', name: 'Attack', abbr: 'Attack', colour: '#9b2f2f' },
  { id: 'strength', name: 'Strength', abbr: 'Strength', colour: '#2f7a4f' },
  { id: 'defence', name: 'Defence', abbr: 'Defence', colour: '#3a5f9b' },
  { id: 'vitality', name: 'Vitality', abbr: 'Vitality', colour: '#a8452a' },
  { id: 'archery', name: 'Archery', abbr: 'Archery', colour: '#5d7a2f' },
  { id: 'magic', name: 'Magic', abbr: 'Magic', colour: '#2f5f8a' },
  // Gathering
  { id: 'woodcutting', name: 'Woodcutting', abbr: 'Woodcut', colour: '#4a6b2f' },
  { id: 'mining', name: 'Mining', abbr: 'Mining', colour: '#6b6b6b' },
  { id: 'fishing', name: 'Fishing', abbr: 'Fishing', colour: '#4a6f8a' },
  { id: 'foraging', name: 'Foraging', abbr: 'Forage', colour: '#7a8a3a' },
  // Production
  { id: 'firemaking', name: 'Firemaking', abbr: 'Firemake', colour: '#b5561f' },
  { id: 'cooking', name: 'Cooking', abbr: 'Cooking', colour: '#6b3f8a' },
  { id: 'smithing', name: 'Smithing', abbr: 'Smithing', colour: '#5a4a3a' },
  { id: 'crafting', name: 'Crafting', abbr: 'Crafting', colour: '#8a6a4a' }
];

export type SkillXp = Record<SkillId, number>;

export class Skills {
  xp: SkillXp;

  constructor() {
    this.xp = Object.fromEntries(
      SKILL_LIST.map((s) => [s.id, 0])
    ) as SkillXp;

    // Vitality is the one skill that does not start at level 1.
    this.xp.vitality = XP.forLevel(10);
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
    this.xp[id] = Math.min(this.xp[id] + amount, XP.forLevel(XP.MAX_LEVEL));
    return this.level(id) - before;
  }

  /**
   * Combat level: RuneScape's formula minus its Prayer term, since there is no
   * Prayer skill here. Your best of the three branches decides the number, so
   * training melee and magic in parallel does not inflate it.
   */
  combatLevel(): number {
    const base = 0.25 * (this.level('defence') + this.level('vitality'));

    const melee = 0.325 * (this.level('attack') + this.level('strength'));
    const archery = this.level('archery');
    const magic = this.level('magic');
    const ranged = 0.325 * (Math.floor(archery / 2) + archery);
    const mage = 0.325 * (Math.floor(magic / 2) + magic);

    return Math.floor(base + Math.max(melee, ranged, mage));
  }

  totalLevel(): number {
    return SKILL_LIST.reduce((sum, s) => sum + this.level(s.id), 0);
  }
}
