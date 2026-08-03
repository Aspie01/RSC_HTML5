// Shared type vocabulary.
//
// Only interfaces and type aliases live here -- no runtime values. That keeps
// this module importable from anywhere without creating an import cycle, since
// `import type` is erased entirely at build time.

import type { GameMap } from './world/map';
import type { Player } from './entities/player';
import type { Npc } from './entities/npc';
import type { GroundItems, GroundItem } from './systems/ground';
import type { WorldObjects } from './systems/objects';

// --------------------------------------------------------------------------
// Geometry
// --------------------------------------------------------------------------
export interface Tile {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

// --------------------------------------------------------------------------
// Items
// --------------------------------------------------------------------------
export type EquipSlot = 'head' | 'cape' | 'body' | 'legs' | 'weapon' | 'shield';

export type ItemShape =
  | 'blob' | 'coin' | 'bone' | 'feather'
  | 'meat' | 'blade' | 'shield' | 'plate'
  | 'log' | 'axe' | 'tinderbox'
  | 'ore' | 'bar' | 'pickaxe' | 'hammer' | 'helm' | 'legs' | 'fish';

export interface Bonuses {
  attack: number;
  strength: number;
  defence: number;
}

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly examine: string;
  readonly stackable: boolean;
  readonly slot: EquipSlot | null;
  /** Attack speed in game ticks. 4 = scimitar, 5 = longsword, 6 = two-hander. */
  readonly speed: number;
  readonly colour: string;
  readonly shape: ItemShape;
  readonly bonuses: Bonuses;
  /** Hitpoints restored when eaten. 0 means not edible. */
  readonly heals: number;
  /**
   * What this item *is*, for engine code that must not name it.
   *
   * A gathering action asks for the tag `axe`, never for `bronze_axe`, so a
   * new metal tier is a row in this file and nothing else. Every tool check in
   * the game resolves through these: `axe`, `pickaxe`, `hammer`, `tinderbox`,
   * `rod`, `raw_food`.
   */
  readonly tags: readonly string[];
  /**
   * Base worth in coins. Shops price against this: they sell above it and buy
   * below it, so the spread is what makes trading a cost rather than a loop.
   *
   * 0 means the item has no market -- quest rewards and burnt food, which
   * should never be a source of coins.
   */
  readonly value: number;
}

/** A quantity of an item, as held in an inventory or equipment slot. */
export interface ItemStack {
  id: string;
  qty: number;
}

// --------------------------------------------------------------------------
// NPCs
// --------------------------------------------------------------------------
export interface DropEntry {
  /** null means "this roll produces nothing". */
  readonly id: string | null;
  /** A fixed quantity, or an inclusive [min, max] range. */
  readonly qty?: number | readonly [number, number];
  readonly weight: number;
}

export interface NpcDef {
  readonly id: string;
  readonly name: string;
  /**
   * Quest-givers and shopkeepers are talked to, not fought. Keeping these two
   * flags separate leaves room for the guard who will both answer a question
   * and hit you for asking it.
   */
  readonly talkable: boolean;
  readonly attackable: boolean;
  readonly level: number;
  readonly hitpoints: number;
  readonly attack: number;
  readonly strength: number;
  readonly defence: number;
  readonly attackBonus: number;
  readonly strengthBonus: number;
  readonly defenceBonus: number;
  readonly speed: number;
  readonly aggressive: boolean;
  readonly respawnTicks: number;
  readonly wanderRadius: number;
  readonly colour: string;
  readonly accent: string;
  readonly size: number;
  readonly drops: readonly DropEntry[];
}

// --------------------------------------------------------------------------
// Combat
// --------------------------------------------------------------------------
/** Everything the combat formulas need, however the mob happens to store it. */
export interface CombatStats {
  attack: number;
  strength: number;
  defence: number;
  attackBonus: number;
  strengthBonus: number;
  defenceBonus: number;
  styleAttack: number;
  styleStrength: number;
  styleDefence: number;
}

export type AttackStyleId = 'accurate' | 'aggressive' | 'defensive' | 'controlled';

/**
 * The 14 skills of v1. Note the naming: Vitality rather than Hitpoints and
 * Archery rather than Ranged, both to stay clear of RuneScape's distinctive
 * vocabulary. There is deliberately no Prayer skill.
 *
 * These ids are written into save files. Renaming one needs a migration.
 */
export type SkillId =
  // Combat
  | 'attack' | 'strength' | 'defence' | 'vitality' | 'archery' | 'magic'
  // Gathering
  | 'woodcutting' | 'mining' | 'fishing' | 'foraging'
  // Production
  | 'firemaking' | 'cooking' | 'smithing' | 'crafting';

export interface AttackStyle {
  readonly name: string;
  readonly attack: number;
  readonly strength: number;
  readonly defence: number;
  /** Skills that receive the experience from this style. */
  readonly xp: readonly SkillId[];
}

export interface HitResult {
  hit: boolean;
  damage: number;
  maxHit: number;
}

// --------------------------------------------------------------------------
// Rendering
// --------------------------------------------------------------------------
export interface MobAppearance {
  colour: string;
  accent: string;
  size: number;
}

export type HitsplatType = 'damage' | 'miss';

export interface Hitsplat {
  damage: number;
  type: HitsplatType;
  /** Counts down 1 -> 0; the splat is removed when it reaches zero. */
  life: number;
}

// --------------------------------------------------------------------------
// Player intent
// --------------------------------------------------------------------------
/**
 * A queued action, resolved once the player is in position. Clicking an NPC
 * does not attack immediately -- it records intent that the tick pipeline
 * carries out when range allows.
 */
export type PlayerAction =
  | { type: 'attack'; target: Npc }
  | { type: 'pickup'; item: GroundItem }
  /**
   * Work the gatherable at this tile -- a tree, a rock or a fishing spot --
   * repeating each tick until it is exhausted or you stop. One action rather
   * than three because chopping, mining and fishing differ only in their data.
   */
  | { type: 'gather'; x: number; y: number }
  /** Cook raw food on the fire at this tile, one item per successful tick. */
  | { type: 'cook'; x: number; y: number }
  /**
   * Walk to a furnace or an anvil and open its interface on arrival. The
   * interface is what turns this into a `smelt` or `smith` action -- clicking
   * the station itself only ever means "go there and show me my options".
   */
  | { type: 'use-station'; x: number; y: number; station: StationKind }
  /** Smelt ore into `barId` at the furnace on this tile, repeating. */
  | { type: 'smelt'; x: number; y: number; barId: string }
  /** Hammer bars into `productId` at the anvil on this tile, repeating. */
  | { type: 'smith'; x: number; y: number; productId: string }
  /** Walk to this NPC and open the conversation. */
  | { type: 'talk'; target: Npc };

/** Scenery you interact with through an interface rather than a single verb. */
export type StationKind = 'furnace' | 'anvil';

// --------------------------------------------------------------------------
// World
// --------------------------------------------------------------------------
/**
 * The slice of the game that entity AI is allowed to see. Narrowing it to this
 * interface (rather than passing the whole Game) keeps NPCs from reaching into
 * the UI or the renderer, and breaks what would otherwise be an import cycle.
 */
export interface World {
  readonly map: GameMap;
  readonly player: Player;
  readonly npcs: Npc[];
  readonly ground: GroundItems;
  readonly objects: WorldObjects;
  isOccupied(x: number, y: number, exclude?: unknown): boolean;
}
