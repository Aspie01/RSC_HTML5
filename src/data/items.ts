// Item definitions -- pure data, no behaviour.
//
// Everything about an item lives here so adding content never means touching
// engine code. New sword = new entry, done.

import type { ItemDef, EquipSlot, ItemShape, Bonuses } from '../types';

interface ItemOpts {
  examine?: string;
  stackable?: boolean;
  slot?: EquipSlot;
  speed?: number;
  colour?: string;
  shape?: ItemShape;
  bonuses?: Partial<Bonuses>;
  heals?: number;
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
    bonuses: { attack: 0, strength: 0, defence: 0, ...opts.bonuses },
    heals: opts.heals ?? 0
  };
}

export const items = {
  coins: item('coins', 'Coins', {
    stackable: true, colour: '#f0c419', shape: 'coin', examine: 'Lovely money!'
  }),

  bones: item('bones', 'Bones', {
    colour: '#e8e2d0', shape: 'bone', examine: 'Ew, ancient remains.'
  }),

  feather: item('feather', 'Feather', {
    stackable: true, colour: '#f4f4f4', shape: 'feather'
  }),

  raw_chicken: item('raw_chicken', 'Raw chicken', {
    colour: '#f2c4b8', shape: 'meat', examine: 'I need to cook this first.'
  }),

  cooked_chicken: item('cooked_chicken', 'Cooked chicken', {
    colour: '#c98a4b', shape: 'meat', heals: 3, examine: 'Mmm, this looks tasty.'
  }),

  burnt_chicken: item('burnt_chicken', 'Burnt chicken', {
    colour: '#3a3028', shape: 'meat', examine: 'Oops.'
  }),

  cowhide: item('cowhide', 'Cowhide', { colour: '#8d6440', shape: 'blob' }),

  logs: item('logs', 'Logs', {
    colour: '#7a5230', shape: 'log',
    examine: 'A number of wooden logs.'
  }),

  oak_logs: item('oak_logs', 'Oak logs', {
    colour: '#6b4a24', shape: 'log',
    examine: 'Logs cut from an oak tree.'
  }),

  bronze_axe: item('bronze_axe', 'Bronze axe', {
    slot: 'weapon', speed: 5, colour: '#a97142', shape: 'axe',
    bonuses: { attack: 3, strength: 4 },
    examine: 'A woodcutter\'s axe.'
  }),

  tinderbox: item('tinderbox', 'Tinderbox', {
    colour: '#8a7050', shape: 'tinderbox',
    examine: 'Useful for lighting a fire.'
  }),

  bronze_pickaxe: item('bronze_pickaxe', 'Bronze pickaxe', {
    slot: 'weapon', speed: 5, colour: '#a97142', shape: 'pickaxe',
    bonuses: { attack: 2, strength: 3 },
    examine: 'Used for mining rocks.'
  }),

  hammer: item('hammer', 'Hammer', {
    colour: '#6f6f78', shape: 'hammer',
    examine: 'Good for hitting things. Or smithing.'
  }),

  // Quest rewards. Not obtainable any other way, which is the point of them.
  woodsmans_axe: item('woodsmans_axe', "Woodsman's axe", {
    slot: 'weapon', speed: 5, colour: '#8f8f96', shape: 'axe',
    bonuses: { attack: 7, strength: 9 },
    examine: 'Tobin kept a better edge on this than he let on.'
  }),

  smiths_hammer: item('smiths_hammer', "Smith's hammer", {
    colour: '#b0782f', shape: 'hammer',
    examine: 'Heavier than it looks, and better balanced than it has any right to be.'
  }),

  // ------------------------------------------------------------------------
  // Ores and bars
  // ------------------------------------------------------------------------
  copper_ore: item('copper_ore', 'Copper ore', {
    colour: '#c06a3a', shape: 'ore', examine: 'This needs refining.'
  }),

  tin_ore: item('tin_ore', 'Tin ore', {
    colour: '#b6b6c2', shape: 'ore', examine: 'This needs refining.'
  }),

  iron_ore: item('iron_ore', 'Iron ore', {
    colour: '#8a5030', shape: 'ore', examine: 'This needs refining.'
  }),

  coal: item('coal', 'Coal', {
    colour: '#2c2c31', shape: 'ore', examine: 'Hot stuff.'
  }),

  bronze_bar: item('bronze_bar', 'Bronze bar', {
    colour: '#a97142', shape: 'bar', examine: 'It\'s a bar of bronze.'
  }),

  iron_bar: item('iron_bar', 'Iron bar', {
    colour: '#8f8f96', shape: 'bar', examine: 'It\'s a bar of iron.'
  }),

  steel_bar: item('steel_bar', 'Steel bar', {
    colour: '#c3c8cf', shape: 'bar', examine: 'It\'s a bar of steel.'
  }),

  // ------------------------------------------------------------------------
  // Weapons
  // ------------------------------------------------------------------------
  bronze_dagger: item('bronze_dagger', 'Bronze dagger', {
    slot: 'weapon', speed: 4, colour: '#a97142', shape: 'blade',
    bonuses: { attack: 4, strength: 3 }
  }),

  iron_dagger: item('iron_dagger', 'Iron dagger', {
    slot: 'weapon', speed: 4, colour: '#8f8f96', shape: 'blade',
    bonuses: { attack: 6, strength: 5 }
  }),

  steel_dagger: item('steel_dagger', 'Steel dagger', {
    slot: 'weapon', speed: 4, colour: '#c3c8cf', shape: 'blade',
    bonuses: { attack: 9, strength: 8 }
  }),

  bronze_scimitar: item('bronze_scimitar', 'Bronze scimitar', {
    slot: 'weapon', speed: 4, colour: '#a97142', shape: 'blade',
    bonuses: { attack: 7, strength: 6 }
  }),

  iron_scimitar: item('iron_scimitar', 'Iron scimitar', {
    slot: 'weapon', speed: 4, colour: '#8f8f96', shape: 'blade',
    bonuses: { attack: 10, strength: 9 }
  }),

  steel_scimitar: item('steel_scimitar', 'Steel scimitar', {
    slot: 'weapon', speed: 4, colour: '#c3c8cf', shape: 'blade',
    bonuses: { attack: 15, strength: 14 }
  }),

  // ------------------------------------------------------------------------
  // Armour
  // ------------------------------------------------------------------------
  wooden_shield: item('wooden_shield', 'Wooden shield', {
    slot: 'shield', colour: '#7a5230', shape: 'shield',
    bonuses: { defence: 4 }
  }),

  bronze_kiteshield: item('bronze_kiteshield', 'Bronze kiteshield', {
    slot: 'shield', colour: '#a97142', shape: 'shield',
    bonuses: { defence: 8 }
  }),

  iron_kiteshield: item('iron_kiteshield', 'Iron kiteshield', {
    slot: 'shield', colour: '#8f8f96', shape: 'shield',
    bonuses: { defence: 12 }
  }),

  steel_kiteshield: item('steel_kiteshield', 'Steel kiteshield', {
    slot: 'shield', colour: '#c3c8cf', shape: 'shield',
    bonuses: { defence: 18 }
  }),

  bronze_med_helm: item('bronze_med_helm', 'Bronze med helm', {
    slot: 'head', colour: '#a97142', shape: 'helm',
    bonuses: { defence: 3 }
  }),

  iron_med_helm: item('iron_med_helm', 'Iron med helm', {
    slot: 'head', colour: '#8f8f96', shape: 'helm',
    bonuses: { defence: 5 }
  }),

  steel_med_helm: item('steel_med_helm', 'Steel med helm', {
    slot: 'head', colour: '#c3c8cf', shape: 'helm',
    bonuses: { defence: 8 }
  }),

  bronze_platelegs: item('bronze_platelegs', 'Bronze platelegs', {
    slot: 'legs', colour: '#a97142', shape: 'legs',
    bonuses: { defence: 7 }
  }),

  iron_platelegs: item('iron_platelegs', 'Iron platelegs', {
    slot: 'legs', colour: '#8f8f96', shape: 'legs',
    bonuses: { defence: 11 }
  }),

  steel_platelegs: item('steel_platelegs', 'Steel platelegs', {
    slot: 'legs', colour: '#c3c8cf', shape: 'legs',
    bonuses: { defence: 16 }
  }),

  bronze_platebody: item('bronze_platebody', 'Bronze platebody', {
    slot: 'body', colour: '#a97142', shape: 'plate',
    bonuses: { defence: 10 }
  }),

  iron_platebody: item('iron_platebody', 'Iron platebody', {
    slot: 'body', colour: '#8f8f96', shape: 'plate',
    bonuses: { defence: 15 }
  }),

  steel_platebody: item('steel_platebody', 'Steel platebody', {
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
