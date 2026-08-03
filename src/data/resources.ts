// Gatherable resources, fires, and crafting recipes -- data only.
//
// Adding a new tree, ore, log, bar, or cookable food should never require
// touching engine code: add an entry here and the existing skilling pipeline
// picks it up.

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

// --------------------------------------------------------------------------
// Mining
// --------------------------------------------------------------------------
export interface RockDef {
  readonly id: string;
  readonly name: string;
  /** Mining level required to swing at this rock. */
  readonly level: number;
  readonly xp: number;
  readonly oreId: string;
  /** Roll weights at level 1 and level 99, on the engine's 0..255 scale. */
  readonly low: number;
  readonly high: number;
  /** Ticks before the vein refills. Coal is slow on purpose. */
  readonly respawnTicks: number;
  /** Ore fleck colour, so copper reads differently from coal at a glance. */
  readonly colour: string;
}

// Unlike trees, a rock ALWAYS empties on a successful swing -- that is why
// mining is a walk between veins rather than a stand-still skill.
export const rocks = {
  copper: {
    id: 'copper', name: 'Copper rock',
    level: 1, xp: 17.5, oreId: 'copper_ore',
    low: 75, high: 220,
    respawnTicks: 8, colour: '#c06a3a'
  },
  tin: {
    id: 'tin', name: 'Tin rock',
    level: 1, xp: 17.5, oreId: 'tin_ore',
    low: 75, high: 220,
    respawnTicks: 8, colour: '#b6b6c2'
  },
  iron: {
    id: 'iron', name: 'Iron rock',
    level: 15, xp: 35, oreId: 'iron_ore',
    low: 40, high: 165,
    respawnTicks: 16, colour: '#8a5030'
  },
  coal: {
    id: 'coal', name: 'Coal rock',
    level: 30, xp: 50, oreId: 'coal',
    low: 18, high: 110,
    respawnTicks: 50, colour: '#2c2c31'
  }
} as const satisfies Record<string, RockDef>;

export type RockId = keyof typeof rocks;

export function getRock(id: string): RockDef | undefined {
  return (rocks as Record<string, RockDef>)[id];
}

/** Any one of these in the inventory or equipped lets you mine. */
export const PICKAXE_IDS: readonly string[] = ['bronze_pickaxe'];

/** Smithing at an anvil needs one of these to hand. */
export const HAMMER_IDS: readonly string[] = ['hammer'];

// --------------------------------------------------------------------------
// Smelting (Smithing, at a furnace)
// --------------------------------------------------------------------------
export interface Ingredient {
  readonly id: string;
  readonly qty: number;
}

export interface BarDef {
  /** Item id of the bar produced. */
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly xp: number;
  readonly ingredients: readonly Ingredient[];
  /**
   * Chance the pour succeeds. Iron is the odd one out: half of it comes out
   * too impure to use, and the ore is lost either way.
   */
  readonly successChance: number;
}

export const bars: readonly BarDef[] = [
  {
    id: 'bronze_bar', name: 'Bronze bar',
    level: 1, xp: 6.2, successChance: 1,
    ingredients: [{ id: 'copper_ore', qty: 1 }, { id: 'tin_ore', qty: 1 }]
  },
  {
    id: 'iron_bar', name: 'Iron bar',
    level: 15, xp: 12.5, successChance: 0.5,
    ingredients: [{ id: 'iron_ore', qty: 1 }]
  },
  {
    id: 'steel_bar', name: 'Steel bar',
    level: 30, xp: 17.5, successChance: 1,
    ingredients: [{ id: 'iron_ore', qty: 1 }, { id: 'coal', qty: 2 }]
  }
];

export function getBar(id: string): BarDef | undefined {
  return bars.find((b) => b.id === id);
}

// --------------------------------------------------------------------------
// Smithing (at an anvil)
// --------------------------------------------------------------------------
export interface SmithDef {
  /** Item id of the finished product. */
  readonly id: string;
  readonly barId: string;
  readonly bars: number;
  readonly level: number;
}

/**
 * Every hammered item is worth the same per bar, so a platebody is simply five
 * daggers' worth of experience. Keeping it a single constant means new products
 * only ever need a bar count.
 */
export const SMITH_XP_PER_BAR = 12.5;

// Level offsets follow RuneScape's ladder: each metal tier is the bronze
// requirement plus 15 (iron) or plus 30 (steel).
export const smithables: readonly SmithDef[] = [
  { id: 'bronze_dagger', barId: 'bronze_bar', bars: 1, level: 1 },
  { id: 'bronze_med_helm', barId: 'bronze_bar', bars: 1, level: 3 },
  { id: 'bronze_scimitar', barId: 'bronze_bar', bars: 2, level: 5 },
  { id: 'bronze_kiteshield', barId: 'bronze_bar', bars: 3, level: 12 },
  { id: 'bronze_platelegs', barId: 'bronze_bar', bars: 3, level: 16 },
  { id: 'bronze_platebody', barId: 'bronze_bar', bars: 5, level: 18 },

  { id: 'iron_dagger', barId: 'iron_bar', bars: 1, level: 15 },
  { id: 'iron_med_helm', barId: 'iron_bar', bars: 1, level: 18 },
  { id: 'iron_scimitar', barId: 'iron_bar', bars: 2, level: 20 },
  { id: 'iron_kiteshield', barId: 'iron_bar', bars: 3, level: 27 },
  { id: 'iron_platelegs', barId: 'iron_bar', bars: 3, level: 31 },
  { id: 'iron_platebody', barId: 'iron_bar', bars: 5, level: 33 },

  { id: 'steel_dagger', barId: 'steel_bar', bars: 1, level: 30 },
  { id: 'steel_med_helm', barId: 'steel_bar', bars: 1, level: 33 },
  { id: 'steel_scimitar', barId: 'steel_bar', bars: 2, level: 35 },
  { id: 'steel_kiteshield', barId: 'steel_bar', bars: 3, level: 42 },
  { id: 'steel_platelegs', barId: 'steel_bar', bars: 3, level: 46 },
  { id: 'steel_platebody', barId: 'steel_bar', bars: 5, level: 48 }
];

export function smithablesFor(barId: string): readonly SmithDef[] {
  return smithables.filter((s) => s.barId === barId);
}

export function getSmithable(id: string): SmithDef | undefined {
  return smithables.find((s) => s.id === id);
}

/** Skills these systems train, kept here so the wiring stays honest. */
export const WOODCUTTING: SkillId = 'woodcutting';
export const COOKING: SkillId = 'cooking';
export const MINING: SkillId = 'mining';
export const SMITHING: SkillId = 'smithing';
