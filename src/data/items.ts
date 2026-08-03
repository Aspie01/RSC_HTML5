// Item definitions -- pure data, no behaviour.
//
// Everything about an item lives here so adding content never means touching
// engine code. New sword = new entry, done.

import type { ItemDef, EquipSlot, ItemShape, Bonuses } from '../types.ts';

interface ItemOpts {
  examine?: string;
  stackable?: boolean;
  slot?: EquipSlot;
  speed?: number;
  colour?: string;
  shape?: ItemShape;
  bonuses?: Partial<Bonuses>;
  combatSkill?: import('../types.ts').SkillId;
  ammoTag?: string;
  heals?: number;
  tags?: readonly string[];
  value?: number;
  range?: number;
}

function item(id: string, name: string, opts: ItemOpts = {}): ItemDef {
  return {
    id,
    name,
    examine: opts.examine ?? `It's a ${name.toLowerCase()}.`,
    stackable: opts.stackable ?? false,
    slot: opts.slot ?? null,
    speed: opts.speed ?? 4,
    colour: opts.colour ?? '#b9a06a',
    shape: opts.shape ?? 'blob',
    bonuses: {
      attack: 0, strength: 0, defence: 0,
      ranged: 0, rangedStrength: 0, magic: 0, magicStrength: 0,
      ...opts.bonuses
    },
    range: opts.range ?? 1,
    ...(opts.combatSkill ? { combatSkill: opts.combatSkill } : {}),
    ...(opts.ammoTag ? { ammoTag: opts.ammoTag } : {}),
    heals: opts.heals ?? 0,
    tags: opts.tags ?? [],
    value: opts.value ?? 0
  };
}

export const items = {
  coins: item('coins', 'Coins', {
    stackable: true, colour: '#f0c419', shape: 'coin', examine: 'Lovely money!'
  }),

  bones: item('bones', 'Bones', { value: 1,
    colour: '#e8e2d0', shape: 'bone', examine: 'Ew, ancient remains.'
  }),

  feather: item('feather', 'Feather', { value: 2,
    stackable: true, colour: '#f4f4f4', shape: 'feather'
  }),

  raw_chicken: item('raw_chicken', 'Raw chicken', { value: 4,
    colour: '#f2c4b8', shape: 'meat', tags: ['raw_food'], examine: 'I need to cook this first.'
  }),

  cooked_chicken: item('cooked_chicken', 'Cooked chicken', { value: 9,
    colour: '#c98a4b', shape: 'meat', heals: 3, examine: 'Mmm, this looks tasty.'
  }),

  burnt_chicken: item('burnt_chicken', 'Burnt chicken', {
    colour: '#3a3028', shape: 'meat', examine: 'Oops.'
  }),

  cowhide: item('cowhide', 'Cowhide', { value: 6, colour: '#8d6440', shape: 'blob' }),

  logs: item('logs', 'Logs', { value: 4,
    colour: '#7a5230', shape: 'log',
    examine: 'A number of wooden logs.'
  }),

  oak_logs: item('oak_logs', 'Oak logs', { value: 12,
    colour: '#6b4a24', shape: 'log',
    examine: 'Logs cut from an oak tree.'
  }),

  ironbark_logs: item('ironbark_logs', 'Ironbark logs', { value: 38,
    colour: '#4a4a32', shape: 'log',
    examine: 'Dense, dark, and heavier than wood has any right to be.'
  }),

  bronze_axe: item('bronze_axe', 'Bronze axe', { value: 16,
    slot: 'weapon', speed: 5, colour: '#a97142', shape: 'axe', tags: ['axe'],
    bonuses: { attack: 3, strength: 4 },
    examine: 'A woodcutter\'s axe.'
  }),

  tinderbox: item('tinderbox', 'Tinderbox', { value: 8,
    colour: '#8a7050', shape: 'tinderbox', tags: ['tinderbox'],
    examine: 'Useful for lighting a fire.'
  }),

  bronze_pickaxe: item('bronze_pickaxe', 'Bronze pickaxe', { value: 20,
    slot: 'weapon', speed: 5, colour: '#a97142', shape: 'pickaxe', tags: ['pickaxe'],
    bonuses: { attack: 2, strength: 3 },
    examine: 'Used for mining rocks.'
  }),

  hammer: item('hammer', 'Hammer', { value: 6,
    colour: '#6f6f78', shape: 'hammer', tags: ['hammer'],
    examine: 'Good for hitting things. Or smithing.'
  }),

  // Quest rewards. Not obtainable any other way, which is the point of them.
  woodsmans_axe: item('woodsmans_axe', "Woodsman's axe", {
    slot: 'weapon', speed: 5, colour: '#8f8f96', shape: 'axe', tags: ['axe'],
    bonuses: { attack: 7, strength: 9 },
    examine: 'Tobin kept a better edge on this than he let on.'
  }),

  // Fishing. The rod is the quest reward that opens the skill; bait is not a
  // separate item on purpose -- a second consumable to manage would add
  // inventory bookkeeping without adding a decision.
  fishing_rod: item('fishing_rod', 'Fishing rod', { value: 12,
    colour: '#8a6a3a', shape: 'log', tags: ['rod'],
    examine: 'A long rod with a line and hook.'
  }),

  raw_sprat: item('raw_sprat', 'Raw sprat', { value: 5,
    colour: '#9fb4c2', shape: 'fish', tags: ['raw_food'],
    examine: 'A small silver fish. Better cooked.'
  }),

  cooked_sprat: item('cooked_sprat', 'Cooked sprat', { value: 11,
    colour: '#c9a86b', shape: 'fish', heals: 3,
    examine: 'Small, but it will keep you going.'
  }),

  burnt_sprat: item('burnt_sprat', 'Burnt sprat', {
    colour: '#3a3028', shape: 'fish', examine: 'Charcoal with fins.'
  }),

  raw_bream: item('raw_bream', 'Raw bream', { value: 16,
    colour: '#7f9ab0', shape: 'fish', tags: ['raw_food'],
    examine: 'A good size. Someone will want this cooked.'
  }),

  cooked_bream: item('cooked_bream', 'Cooked bream', { value: 34,
    colour: '#c08a4a', shape: 'fish', heals: 7,
    examine: 'A proper meal.'
  }),

  burnt_bream: item('burnt_bream', 'Burnt bream', {
    colour: '#3a3028', shape: 'fish', examine: 'You left it on too long.'
  }),

  // ------------------------------------------------------------------------
  // Archery
  //
  // A bow reaches seven tiles, which is the whole point of the skill: it trades
  // the damage a scimitar does for the right to start the fight. Arrows sit in
  // their own slot and are spent one per shot, so ranged combat costs something
  // per swing where melee costs nothing.
  // ------------------------------------------------------------------------
  shortbow: item('shortbow', 'Shortbow', { value: 40,
    slot: 'weapon', speed: 4, range: 7, colour: '#7a5230', shape: 'bow',
    tags: ['bow'], combatSkill: 'archery', ammoTag: 'arrow', bonuses: { ranged: 8 },
    examine: 'A short bow of green wood. Needs arrows.'
  }),

  oak_shortbow: item('oak_shortbow', 'Oak shortbow', { value: 110,
    slot: 'weapon', speed: 4, range: 7, colour: '#6b4a24', shape: 'bow',
    tags: ['bow'], combatSkill: 'archery', ammoTag: 'arrow', bonuses: { ranged: 16 },
    examine: 'Heavier draw, and it tells at a distance.'
  }),

  arrow_shaft: item('arrow_shaft', 'Arrow shaft', { value: 1,
    stackable: true, colour: '#8a6a3a', shape: 'arrow',
    examine: 'Straight, trimmed, and no use without a head or a feather.'
  }),

  bronze_arrow: item('bronze_arrow', 'Bronze arrow', { value: 2,
    stackable: true, slot: 'ammo', colour: '#a97142', shape: 'arrow',
    tags: ['arrow'], bonuses: { rangedStrength: 7 },
    examine: 'Bronze-tipped. It will do.'
  }),

  iron_arrow: item('iron_arrow', 'Iron arrow', { value: 5,
    stackable: true, slot: 'ammo', colour: '#8f8f96', shape: 'arrow',
    tags: ['arrow'], bonuses: { rangedStrength: 14 },
    examine: 'Iron-tipped, and noticeably heavier.'
  }),

  // Quest key items. Valueless because no shop should ever take them.
  survey_chain: item('survey_chain', 'Surveyor\'s chain', {
    colour: '#9a9a86', shape: 'bar',
    examine: 'Sixty-six feet of it, and it does not lie.'
  }),

  ledger_covers: item('ledger_covers', 'Empty ledger covers', {
    colour: '#5a3f2a', shape: 'blob',
    examine: 'Board and hide, and the stitching where a book used to be.'
  }),

  sodden_pages: item('sodden_pages', 'Salt-stiffened pages', {
    colour: '#c9bfa0', shape: 'blob',
    examine: 'Stiff as board and perfectly legible. Salt kept them.'
  }),

  wardens_ledger: item('wardens_ledger', "Warden's ledger", {
    colour: '#7a5a3a', shape: 'blob',
    examine: 'Two hundred years of dates, depths, and one instruction.'
  }),

  sallows_chart: item('sallows_chart', 'Corrected chart', {
    colour: '#d8c9a0', shape: 'blob',
    examine: 'The old lines in ink, the new ones in pencil. They do not agree.'
  }),

  // ------------------------------------------------------------------------
  // Magic
  //
  // Cast through a focus rather than from a spellbook. The focus IS the spell
  // for now -- a better one throws harder -- which keeps Magic to the shape
  // Archery already proved: the weapon decides the skill, and every cast
  // spends something. Choosing between spells arrives with the Wardens, when
  // there is a reason to have more than one.
  //
  // No runes. §8 defers Inscription until Magic is deep enough to need a rune
  // economy, and a second consumable before then would be bookkeeping.
  // ------------------------------------------------------------------------
  emberglass_focus: item('emberglass_focus', 'Emberglass focus', { value: 240,
    slot: 'weapon', speed: 5, range: 6, colour: '#c9704a', shape: 'vial',
    tags: ['focus'], combatSkill: 'magic', ammoTag: 'reagent',
    bonuses: { magic: 12, defence: 2 },
    examine: 'The leaf is still in there, and still warm.'
  }),

  // ------------------------------------------------------------------------
  // Foraging
  // ------------------------------------------------------------------------
  bronze_sickle: item('bronze_sickle', 'Bronze sickle', { value: 22,
    slot: 'weapon', speed: 4, colour: '#a97142', shape: 'blade', tags: ['sickle'],
    bonuses: { attack: 2, strength: 2 },
    examine: 'Curved, and sharper on the inside of the curve.'
  }),

  marshroot: item('marshroot', 'Marshroot', { value: 7,
    colour: '#7d8a4a', shape: 'blob', tags: ['raw_food'],
    examine: 'Bitter and fibrous. Fire fixes both.'
  }),

  roasted_marshroot: item('roasted_marshroot', 'Roasted marshroot', { value: 20,
    colour: '#a8763a', shape: 'blob', heals: 5,
    examine: 'Sweet once the fire has had it.'
  }),

  burnt_marshroot: item('burnt_marshroot', 'Burnt marshroot', {
    colour: '#3a3028', shape: 'blob', examine: 'Now it is just bitter.'
  }),

  emberleaf: item('emberleaf', 'Emberleaf', { value: 26,
    stackable: true, slot: 'ammo', colour: '#c25a2c', shape: 'feather',
    tags: ['reagent'], bonuses: { magicStrength: 9 },
    examine: 'Warm to hold, and it has not been anywhere near a fire.'
  }),

  // ------------------------------------------------------------------------
  // Crafting: glass
  // ------------------------------------------------------------------------
  sand: item('sand', 'Sand', { value: 2,
    stackable: true, colour: '#c2ad78', shape: 'ore',
    examine: 'Fine, pale, and everywhere along the shore.'
  }),

  ash: item('ash', 'Ash', { value: 3,
    stackable: true, colour: '#54504a', shape: 'ore',
    examine: 'What a fire leaves once it has finished with the wood.'
  }),

  molten_glass: item('molten_glass', 'Molten glass', { value: 18,
    colour: '#9fd8d0', shape: 'blob',
    examine: 'Still glowing. Best worked before it sets.'
  }),

  glass_vial: item('glass_vial', 'Glass vial', { value: 30,
    colour: '#bfe6e0', shape: 'vial',
    examine: 'Empty, stoppered, and worth more than the sand it came from.'
  }),

  smiths_hammer: item('smiths_hammer', "Smith's hammer", {
    colour: '#b0782f', shape: 'hammer',
    examine: 'Heavier than it looks, and better balanced than it has any right to be.'
  }),

  // ------------------------------------------------------------------------
  // Ores and bars
  // ------------------------------------------------------------------------
  copper_ore: item('copper_ore', 'Copper ore', { value: 9,
    colour: '#c06a3a', shape: 'ore', examine: 'This needs refining.'
  }),

  tin_ore: item('tin_ore', 'Tin ore', { value: 9,
    colour: '#b6b6c2', shape: 'ore', examine: 'This needs refining.'
  }),

  iron_ore: item('iron_ore', 'Iron ore', { value: 22,
    colour: '#8a5030', shape: 'ore', examine: 'This needs refining.'
  }),

  coal: item('coal', 'Coal', { value: 45,
    colour: '#2c2c31', shape: 'ore', examine: 'Hot stuff.'
  }),

  bronze_bar: item('bronze_bar', 'Bronze bar', { value: 20,
    colour: '#a97142', shape: 'bar', examine: 'It\'s a bar of bronze.'
  }),

  iron_bar: item('iron_bar', 'Iron bar', { value: 52,
    colour: '#8f8f96', shape: 'bar', examine: 'It\'s a bar of iron.'
  }),

  steel_bar: item('steel_bar', 'Steel bar', { value: 120,
    colour: '#c3c8cf', shape: 'bar', examine: 'It\'s a bar of steel.'
  }),

  // ------------------------------------------------------------------------
  // Weapons
  // ------------------------------------------------------------------------
  bronze_dagger: item('bronze_dagger', 'Bronze dagger', { value: 14,
    slot: 'weapon', speed: 4, colour: '#a97142', shape: 'blade',
    bonuses: { attack: 4, strength: 3 }
  }),

  iron_dagger: item('iron_dagger', 'Iron dagger', { value: 36,
    slot: 'weapon', speed: 4, colour: '#8f8f96', shape: 'blade',
    bonuses: { attack: 6, strength: 5 }
  }),

  steel_dagger: item('steel_dagger', 'Steel dagger', { value: 90,
    slot: 'weapon', speed: 4, colour: '#c3c8cf', shape: 'blade',
    bonuses: { attack: 9, strength: 8 }
  }),

  bronze_scimitar: item('bronze_scimitar', 'Bronze scimitar', { value: 32,
    slot: 'weapon', speed: 4, colour: '#a97142', shape: 'blade',
    bonuses: { attack: 7, strength: 6 }
  }),

  iron_scimitar: item('iron_scimitar', 'Iron scimitar', { value: 84,
    slot: 'weapon', speed: 4, colour: '#8f8f96', shape: 'blade',
    bonuses: { attack: 10, strength: 9 }
  }),

  steel_scimitar: item('steel_scimitar', 'Steel scimitar', { value: 210,
    slot: 'weapon', speed: 4, colour: '#c3c8cf', shape: 'blade',
    bonuses: { attack: 15, strength: 14 }
  }),

  // ------------------------------------------------------------------------
  // Armour
  // ------------------------------------------------------------------------
  wooden_shield: item('wooden_shield', 'Wooden shield', { value: 12,
    slot: 'shield', colour: '#7a5230', shape: 'shield',
    bonuses: { defence: 4 }
  }),

  bronze_kiteshield: item('bronze_kiteshield', 'Bronze kiteshield', { value: 44,
    slot: 'shield', colour: '#a97142', shape: 'shield',
    bonuses: { defence: 8 }
  }),

  iron_kiteshield: item('iron_kiteshield', 'Iron kiteshield', { value: 112,
    slot: 'shield', colour: '#8f8f96', shape: 'shield',
    bonuses: { defence: 12 }
  }),

  steel_kiteshield: item('steel_kiteshield', 'Steel kiteshield', { value: 280,
    slot: 'shield', colour: '#c3c8cf', shape: 'shield',
    bonuses: { defence: 18 }
  }),

  bronze_med_helm: item('bronze_med_helm', 'Bronze med helm', { value: 24,
    slot: 'head', colour: '#a97142', shape: 'helm',
    bonuses: { defence: 3 }
  }),

  iron_med_helm: item('iron_med_helm', 'Iron med helm', { value: 62,
    slot: 'head', colour: '#8f8f96', shape: 'helm',
    bonuses: { defence: 5 }
  }),

  steel_med_helm: item('steel_med_helm', 'Steel med helm', { value: 155,
    slot: 'head', colour: '#c3c8cf', shape: 'helm',
    bonuses: { defence: 8 }
  }),

  bronze_platelegs: item('bronze_platelegs', 'Bronze platelegs', { value: 48,
    slot: 'legs', colour: '#a97142', shape: 'legs',
    bonuses: { defence: 7 }
  }),

  iron_platelegs: item('iron_platelegs', 'Iron platelegs', { value: 124,
    slot: 'legs', colour: '#8f8f96', shape: 'legs',
    bonuses: { defence: 11 }
  }),

  steel_platelegs: item('steel_platelegs', 'Steel platelegs', { value: 310,
    slot: 'legs', colour: '#c3c8cf', shape: 'legs',
    bonuses: { defence: 16 }
  }),

  bronze_platebody: item('bronze_platebody', 'Bronze platebody', { value: 64,
    slot: 'body', colour: '#a97142', shape: 'plate',
    bonuses: { defence: 10 }
  }),

  iron_platebody: item('iron_platebody', 'Iron platebody', { value: 166,
    slot: 'body', colour: '#8f8f96', shape: 'plate',
    bonuses: { defence: 15 }
  }),

  steel_platebody: item('steel_platebody', 'Steel platebody', { value: 415,
    slot: 'body', colour: '#c3c8cf', shape: 'plate',
    bonuses: { defence: 22 }
  })
} as const satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof items;

/** Look up an item by id. Returns undefined for unknown ids rather than throwing. */
export function getItem(id: string): ItemDef | undefined {
  const def = (items as Record<string, ItemDef>)[id];
  if (!def) console.warn('Unknown item id:', id);
  return def;
}
