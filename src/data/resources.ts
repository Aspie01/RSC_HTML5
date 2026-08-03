// Gatherable resources, fires, and cooking recipes -- data only.
//
// Adding a new tree, log, or cookable food should never require touching engine
// code: add an entry here and the existing skilling pipeline picks it up.

import type { SkillId } from '../types';

// --------------------------------------------------------------------------
// Woodcutting
// --------------------------------------------------------------------------
export interface TreeDef {
  readonly id: string;
  readonly name: string;
  /** Woodcutting level required to attempt this tree. */
  readonly level: number;
  readonly xp: number;
  readonly logId: string;
  /** Roll weights at level 1 and level 99, on the engine's 0..255 scale. */
  readonly low: number;
  readonly high: number;
  /**
   * Chance the tree falls after yielding a log. Normal trees always fall
   * (1.0); bigger trees keep giving, which is why oaks are worth camping.
   */
  readonly depleteChance: number;
  /** Ticks before the stump grows back. */
  readonly respawnTicks: number;
  /** Canopy tint, so oaks read as visually distinct in the world. */
  readonly colour: string;
  readonly scale: number;
}

export const trees = {
  tree: {
    id: 'tree', name: 'Tree',
    level: 1, xp: 25, logId: 'logs',
    low: 64, high: 200,
    depleteChance: 1.0,
    respawnTicks: 20,
    colour: '#2f5c2a', scale: 1.0
  },
  oak: {
    id: 'oak', name: 'Oak tree',
    level: 15, xp: 37.5, logId: 'oak_logs',
    low: 32, high: 120,
    depleteChance: 0.35,
    respawnTicks: 25,
    colour: '#4a6b22', scale: 1.22
  }
} as const satisfies Record<string, TreeDef>;

export type TreeId = keyof typeof trees;

export function getTree(id: string): TreeDef | undefined {
  return (trees as Record<string, TreeDef>)[id];
}

// --------------------------------------------------------------------------
// Firemaking
// --------------------------------------------------------------------------
export interface BurnableDef {
  readonly logId: string;
  readonly level: number;
  readonly xp: number;
  /** Ticks the resulting fire stays lit. */
  readonly burnTicks: number;
}

export const burnables: Record<string, BurnableDef> = {
  logs: { logId: 'logs', level: 1, xp: 40, burnTicks: 120 },
  oak_logs: { logId: 'oak_logs', level: 15, xp: 60, burnTicks: 200 }
};

// --------------------------------------------------------------------------
// Cooking
// --------------------------------------------------------------------------
export interface RecipeDef {
  readonly rawId: string;
  readonly cookedId: string;
  readonly burntId: string;
  readonly level: number;
  readonly xp: number;
  /** Cooking level at which this food stops burning entirely. */
  readonly stopBurnLevel: number;
}

export const recipes: Record<string, RecipeDef> = {
  raw_chicken: {
    rawId: 'raw_chicken', cookedId: 'cooked_chicken', burntId: 'burnt_chicken',
    level: 1, xp: 30, stopBurnLevel: 30
  }
};

export function recipeFor(itemId: string): RecipeDef | undefined {
  return recipes[itemId];
}

/** Skills these systems train, kept here so the wiring stays honest. */
export const WOODCUTTING: SkillId = 'woodcutting';
export const COOKING: SkillId = 'cooking';
