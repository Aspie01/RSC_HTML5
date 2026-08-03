// Gatherable resources, fires, and crafting recipes -- data only.
//
// Adding a new tree, ore, log, bar, or cookable food should never require
// touching engine code: add an entry here and the existing skilling pipeline
// picks it up.

import type { SkillId } from '../types';

// --------------------------------------------------------------------------
// Gathering
// --------------------------------------------------------------------------

/**
 * One shape for every "stand next to a thing and roll for it" skill.
 *
 * Woodcutting, Mining and Fishing are the same action wearing three costumes:
 * check a level, check a tool, roll once per tick, hand over an item, maybe
 * exhaust the source. They had two near-identical definitions and two
 * near-identical resolvers before Fishing arrived to make it three, which is
 * the point at which the duplication stops being cheaper than the abstraction.
 *
 * Everything that differs between them is a field here, so a new resource --
 * or a whole new gathering skill -- is a row in this file and nothing else.
 */
export interface GatherDef {
  readonly id: string;
  readonly name: string;
  readonly skill: SkillId;
  /** Skill level required to attempt this at all. */
  readonly level: number;
  readonly xp: number;
  /** Item handed over on a successful roll. */
  readonly outputId: string;
  /** Roll weights at level 1 and at the level cap, on the engine's 0..255 scale. */
  readonly low: number;
  readonly high: number;
  /**
   * Item TAG the player must be carrying, never an item id -- so a steel axe
   * works the day it is added, without this file knowing it exists.
   */
  readonly tool?: string;
  /**
   * Chance the source is exhausted after a success. Rocks and fishing spots
   * differ sharply here and it is most of how each skill *feels*: a rock
   * always empties, so mining is a walk between veins; a shoal usually stays,
   * so fishing is somewhere to stand.
   */
  readonly depleteChance: number;
  /** Ticks before an exhausted source comes back. */
  readonly respawnTicks: number;
  /** Sound cue played on a success. */
  readonly cue: 'chop' | 'mine' | 'fish';
  /** `{item}` is replaced with the output's lowercase name. */
  readonly success: string;
  /** Shown when the source is currently exhausted. */
  readonly depleted: string;
  /** Shown when the pack is full. */
  readonly full: string;
  /** Shown when the required tool is missing. */
  readonly noTool: string;

  /** Tint, so an oak reads differently from a tree and copper from coal. */
  readonly colour: string;
  /** Size multiplier, for trees that should tower over their neighbours. */
  readonly scale?: number;
}

// --------------------------------------------------------------------------
// Woodcutting
// --------------------------------------------------------------------------
export const gatherables = {
  // Trees. A normal tree always falls, so a new player learns that a source
  // runs out; an oak usually survives, which is what makes it worth walking to.
  tree: {
    id: 'tree', name: 'Tree', skill: 'woodcutting',
    level: 1, xp: 25, outputId: 'logs',
    low: 64, high: 200,
    tool: 'axe',
    depleteChance: 1.0, respawnTicks: 20,
    cue: 'chop',
    success: 'You get some {item}.',
    depleted: 'This tree has already been cut down.',
    full: 'Your inventory is too full to hold any more logs.',
    noTool: 'You need an axe to chop this tree.',
    colour: '#2f5c2a', scale: 1.0
  },
  oak: {
    id: 'oak', name: 'Oak tree', skill: 'woodcutting',
    level: 10, xp: 37.5, outputId: 'oak_logs',
    low: 32, high: 120,
    tool: 'axe',
    depleteChance: 0.35, respawnTicks: 25,
    cue: 'chop',
    success: 'You get some {item}.',
    depleted: 'This tree has already been cut down.',
    full: 'Your inventory is too full to hold any more logs.',
    noTool: 'You need an axe to chop this tree.',
    colour: '#4a6b22', scale: 1.22
  },

  // Foraging. Hedges and undergrowth, worked with a sickle. Both outputs leave
  // the skill immediately: marshroot is food once cooked, emberleaf is what a
  // spell burns. Neither is any use raw, which is the point.
  marshroot: {
    id: 'marshroot', name: 'Marshroot', skill: 'foraging',
    level: 1, xp: 15, outputId: 'marshroot',
    low: 90, high: 230,
    tool: 'sickle',
    depleteChance: 0.5, respawnTicks: 18,
    cue: 'chop',
    success: 'You cut a {item} free.',
    depleted: 'This has been picked clean.',
    full: 'Your inventory is too full to hold any more.',
    noTool: 'You need a sickle to cut this.',
    colour: '#6f8a4a'
  },
  emberleaf: {
    id: 'emberleaf', name: 'Emberleaf bush', skill: 'foraging',
    level: 15, xp: 42, outputId: 'emberleaf',
    low: 35, high: 145,
    tool: 'sickle',
    depleteChance: 0.6, respawnTicks: 40,
    cue: 'chop',
    success: 'You cut a handful of {item}.',
    depleted: 'This has been picked clean.',
    full: 'Your inventory is too full to hold any more.',
    noTool: 'You need a sickle to cut this.',
    colour: '#a8532c'
  },

  // Hardwood. The third Woodcutting tier, and the one that teaches respawn:
  // it almost never falls, but when it does it is gone for a very long time,
  // so a grove is worked by rotating between trees rather than camping one.
  ironbark: {
    id: 'ironbark', name: 'Ironbark tree', skill: 'woodcutting',
    level: 20, xp: 62.5, outputId: 'ironbark_logs',
    low: 20, high: 95,
    tool: 'axe',
    depleteChance: 0.2, respawnTicks: 120,
    cue: 'chop',
    success: 'You lever off a length of {item}.',
    depleted: 'This one is cut out. It will be a long while coming back.',
    full: 'Your inventory is too full to hold any more logs.',
    noTool: 'You need an axe to chop this tree.',
    colour: '#3d4a30', scale: 1.45
  },

  // Rocks. Always empty on a success -- that is why mining is a walk between
  // veins rather than a stand-still skill.
  copper: {
    id: 'copper', name: 'Copper rock', skill: 'mining',
    level: 1, xp: 17.5, outputId: 'copper_ore',
    low: 75, high: 220,
    tool: 'pickaxe',
    depleteChance: 1.0, respawnTicks: 8,
    cue: 'mine',
    success: 'You manage to mine some {item}.',
    depleted: 'There is no ore left in this rock.',
    full: 'Your inventory is too full to hold any more ore.',
    noTool: 'You need a pickaxe to mine this rock.',
    colour: '#c06a3a'
  },
  tin: {
    id: 'tin', name: 'Tin rock', skill: 'mining',
    level: 1, xp: 17.5, outputId: 'tin_ore',
    low: 75, high: 220,
    tool: 'pickaxe',
    depleteChance: 1.0, respawnTicks: 8,
    cue: 'mine',
    success: 'You manage to mine some {item}.',
    depleted: 'There is no ore left in this rock.',
    full: 'Your inventory is too full to hold any more ore.',
    noTool: 'You need a pickaxe to mine this rock.',
    colour: '#b6b6c2'
  },
  iron: {
    id: 'iron', name: 'Iron rock', skill: 'mining',
    level: 10, xp: 35, outputId: 'iron_ore',
    low: 40, high: 165,
    tool: 'pickaxe',
    depleteChance: 1.0, respawnTicks: 16,
    cue: 'mine',
    success: 'You manage to mine some {item}.',
    depleted: 'There is no ore left in this rock.',
    full: 'Your inventory is too full to hold any more ore.',
    noTool: 'You need a pickaxe to mine this rock.',
    colour: '#8a5030'
  },
  coal: {
    id: 'coal', name: 'Coal rock', skill: 'mining',
    level: 20, xp: 50, outputId: 'coal',
    low: 18, high: 110,
    tool: 'pickaxe',
    depleteChance: 1.0, respawnTicks: 50,
    cue: 'mine',
    success: 'You manage to mine some {item}.',
    depleted: 'There is no ore left in this rock.',
    full: 'Your inventory is too full to hold any more ore.',
    noTool: 'You need a pickaxe to mine this rock.',
    colour: '#2c2c31'
  },

  // Fishing spots. The shoal rarely moves on, so unlike mining this is a place
  // to stand -- which is the whole reason the docks are worth walking to.
  sprat: {
    id: 'sprat', name: 'Shallows', skill: 'fishing',
    level: 1, xp: 20, outputId: 'raw_sprat',
    low: 70, high: 210,
    tool: 'rod',
    depleteChance: 0.06, respawnTicks: 12,
    cue: 'fish',
    success: 'You catch a {item}.',
    depleted: 'The shoal here has moved on.',
    full: 'Your inventory is too full to hold any more fish.',
    noTool: 'You need a fishing rod to fish here.',
    colour: '#6f97b5'
  },
  // Sand off the shore. No tool and no level, because it is the first half of
  // a chain the player meets before they have any Crafting at all -- the gate
  // on glass is Firemaking, which is the other half.
  sand: {
    id: 'sand', name: 'Sand bank', skill: 'crafting',
    level: 1, xp: 5, outputId: 'sand',
    low: 120, high: 240,
    depleteChance: 0.15, respawnTicks: 10,
    cue: 'mine',
    success: 'You scoop up some {item}.',
    depleted: 'You have picked this bank over. Try another.',
    full: 'Your inventory is too full to hold any more sand.',
    noTool: '',
    colour: '#c2ad78'
  },

  bream: {
    id: 'bream', name: 'Deep water', skill: 'fishing',
    level: 10, xp: 40, outputId: 'raw_bream',
    low: 30, high: 150,
    tool: 'rod',
    depleteChance: 0.1, respawnTicks: 20,
    cue: 'fish',
    success: 'You catch a {item}.',
    depleted: 'The shoal here has moved on.',
    full: 'Your inventory is too full to hold any more fish.',
    noTool: 'You need a fishing rod to fish here.',
    colour: '#3f6f96'
  }
} as const satisfies Record<string, GatherDef>;

export type GatherId = keyof typeof gatherables;

export function getGatherable(id: string): GatherDef | undefined {
  return (gatherables as Record<string, GatherDef>)[id];
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
  oak_logs: { logId: 'oak_logs', level: 10, xp: 60, burnTicks: 200 },
  // Burns a long time, which matters now that a dead fire leaves ash: one
  // ironbark is a cooking fire that outlasts a whole inventory of fish.
  ironbark_logs: { logId: 'ironbark_logs', level: 20, xp: 95, burnTicks: 340 }
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
    level: 1, xp: 30, stopBurnLevel: 15
  },
  // Fishing's outbound arrow. A sprat is worse than chicken on purpose -- the
  // reason to fish at level 1 is that the shoal never runs out, not that the
  // food is better. Bream is where it overtakes.
  raw_sprat: {
    rawId: 'raw_sprat', cookedId: 'cooked_sprat', burntId: 'burnt_sprat',
    level: 1, xp: 25, stopBurnLevel: 12
  },
  raw_bream: {
    rawId: 'raw_bream', cookedId: 'cooked_bream', burntId: 'burnt_bream',
    level: 10, xp: 50, stopBurnLevel: 28
  },
  // Foraging's outbound arrow into Cooking. Raw marshroot is inedible, so the
  // forage is worth nothing until it has been through a fire.
  marshroot: {
    rawId: 'marshroot', cookedId: 'roasted_marshroot', burntId: 'burnt_marshroot',
    level: 5, xp: 35, stopBurnLevel: 20
  }
};

export function recipeFor(itemId: string): RecipeDef | undefined {
  return recipes[itemId];
}


/**
 * Smithing at an anvil needs one of these to hand, and a better hammer works
 * the metal faster. Keeping the pace here rather than in the engine means a
 * new hammer is a data edit, not a special case at the anvil.
 */
export const HAMMER_SPEED: Readonly<Record<string, number>> = {
  hammer: 3,
  smiths_hammer: 2
};

export const HAMMER_IDS: readonly string[] = Object.keys(HAMMER_SPEED);

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
  /**
   * Which skill the furnace is being used for. A furnace is a hot box, not a
   * smithy: glass is made in the same one, and saying so here is what stops
   * the engine assuming everything poured out of it is Smithing.
   */
  readonly skill: SkillId;
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
    id: 'bronze_bar', name: 'Bronze bar', skill: 'smithing',
    level: 1, xp: 6.2, successChance: 1,
    ingredients: [{ id: 'copper_ore', qty: 1 }, { id: 'tin_ore', qty: 1 }]
  },
  {
    id: 'iron_bar', name: 'Iron bar', skill: 'smithing',
    level: 10, xp: 12.5, successChance: 0.5,
    ingredients: [{ id: 'iron_ore', qty: 1 }]
  },
  {
    id: 'steel_bar', name: 'Steel bar', skill: 'smithing',
    level: 20, xp: 17.5, successChance: 1,
    ingredients: [{ id: 'iron_ore', qty: 1 }, { id: 'coal', qty: 2 }]
  },

  // Glass. Sand off the shore and ash out of a dead fire, which is why the
  // quest that teaches this is gated on Firemaking: you cannot make glass
  // without having burnt something first.
  {
    id: 'molten_glass', name: 'Molten glass', skill: 'crafting',
    level: 1, xp: 12, successChance: 1,
    ingredients: [{ id: 'sand', qty: 1 }, { id: 'ash', qty: 1 }]
  },
  {
    id: 'glass_vial', name: 'Glass vial', skill: 'crafting',
    level: 5, xp: 20, successChance: 1,
    ingredients: [{ id: 'molten_glass', qty: 1 }]
  },
  // Crafting's outbound arrow into Magic. A leaf sealed in glass while the
  // glass is still soft -- which is why it takes both skills and why the
  // focus cannot be bought.
  {
    id: 'emberglass_focus', name: 'Emberglass focus', skill: 'crafting',
    level: 15, xp: 90, successChance: 1,
    ingredients: [{ id: 'molten_glass', qty: 2 }, { id: 'emberleaf', qty: 1 }]
  }
];

// --------------------------------------------------------------------------
// Fletching (Crafting, done anywhere)
// --------------------------------------------------------------------------

/**
 * Turning wood and feathers into ammunition.
 *
 * Fletching is folded into Crafting for v1 rather than being its own skill,
 * per the content roadmap. It needs no station: this is knife work, done
 * wherever you are standing, which is also what makes it the thing an archer
 * does between fights rather than a trip back to town.
 *
 * It is the join between three skills that had nothing to do with each other:
 * Woodcutting supplies the shafts, killing things supplies the feathers, and
 * Smithing supplies the heads. All three feed Archery.
 */
export interface FletchDef {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly xp: number;
  readonly inputs: readonly Ingredient[];
  readonly outputId: string;
  readonly outputQty: number;
}

export const fletchables: readonly FletchDef[] = [
  {
    id: 'arrow_shafts', name: 'Arrow shafts',
    level: 1, xp: 5,
    inputs: [{ id: 'logs', qty: 1 }],
    outputId: 'arrow_shaft', outputQty: 8
  },
  {
    id: 'bronze_arrows', name: 'Bronze arrows',
    level: 5, xp: 20,
    inputs: [
      { id: 'arrow_shaft', qty: 8 },
      { id: 'feather', qty: 8 },
      { id: 'bronze_bar', qty: 1 }
    ],
    outputId: 'bronze_arrow', outputQty: 8
  },
  {
    id: 'iron_arrows', name: 'Iron arrows',
    level: 20, xp: 38,
    inputs: [
      { id: 'arrow_shaft', qty: 8 },
      { id: 'feather', qty: 8 },
      { id: 'iron_bar', qty: 1 }
    ],
    outputId: 'iron_arrow', outputQty: 8
  }
];

/** Every recipe whose FIRST input is this item, for the right-click menu. */
export function fletchablesFrom(itemId: string): readonly FletchDef[] {
  return fletchables.filter((f) => f.inputs[0]?.id === itemId);
}

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

// Each tier occupies a nine-level band starting at its unlock level (1, 10,
// 20), with the same shape inside every band: dagger first, platebody last.
// Compressing the bands this way is what keeps 30, 40 and 50 free for the
// three tiers still to come, under a cap of 50 rather than 99.
const SMITH_OFFSETS = {
  dagger: 0, med_helm: 1, scimitar: 2, kiteshield: 4, platelegs: 6, platebody: 8
} as const;

function tier(metal: string, base: number): SmithDef[] {
  const barId = `${metal}_bar`;
  const barsFor: Record<keyof typeof SMITH_OFFSETS, number> = {
    dagger: 1, med_helm: 1, scimitar: 2, kiteshield: 3, platelegs: 3, platebody: 5
  };

  return (Object.keys(SMITH_OFFSETS) as (keyof typeof SMITH_OFFSETS)[]).map(
    (piece) => ({
      id: `${metal}_${piece}`,
      barId,
      bars: barsFor[piece],
      level: base + SMITH_OFFSETS[piece]
    })
  );
}

export const smithables: readonly SmithDef[] = [
  ...tier('bronze', 1),
  ...tier('iron', 10),
  ...tier('steel', 20),
  // Foraging's inbound arrow. Nothing can be cut from a hedge without one, so
  // the skill that produces reagents starts at a forge, and no skill in the
  // game stands entirely on its own.
  { id: 'bronze_sickle', barId: 'bronze_bar', bars: 1, level: 5 }
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
export const CRAFTING: SkillId = 'crafting';
