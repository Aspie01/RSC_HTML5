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
  | 'ore' | 'bar' | 'pickaxe' | 'hammer' | 'helm' | 'legs';

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

export type SkillId =
  | 'attack' | 'strength' | 'defence' | 'hitpoints'
  | 'ranged' | 'prayer' | 'magic' | 'cooking'
  | 'woodcutting' | 'firemaking' | 'fishing' | 'mining' | 'smithing';

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
  /** Chop the tree at this tile; repeats each tick until it falls or you stop. */
  | { type: 'chop'; x: number; y: number }
  /** Cook raw food on the fire at this tile, one item per successful tick. */
  | { type: 'cook'; x: number; y: number }
  /** Mine the rock at this tile; repeats each tick until the ore is out. */
  | { type: 'mine'; x: number; y: number }
  /**
   * Walk to a furnace or an anvil and open its interface on arrival. The
   * interface is what turns this into a `smelt` or `smith` action -- clicking
   * the station itself only ever means "go there and show me my options".
   */
  | { type: 'use-station'; x: number; y: number; station: StationKind }
  /** Smelt ore into `barId` at the furnace on this tile, repeating. */
  | { type: 'smelt'; x: number; y: number; barId: string }
  /** Hammer bars into `productId` at the anvil on this tile, repeating. */
  | { type: 'smith'; x: number; y: number; productId: string };

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
