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

  bronze_dagger: item('bronze_dagger', 'Bronze dagger', {
    slot: 'weapon', speed: 4, colour: '#a97142', shape: 'blade',
    bonuses: { attack: 4, strength: 3 }
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

  wooden_shield: item('wooden_shield', 'Wooden shield', {
    slot: 'shield', colour: '#7a5230', shape: 'shield',
    bonuses: { defence: 4 }
  }),

  bronze_platebody: item('bronze_platebody', 'Bronze platebody', {
    slot: 'body', colour: '#a97142', shape: 'plate',
    bonuses: { defence: 10 }
  })
} as const satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof items;

/** Look up an item by id. Returns undefined for unknown ids rather than throwing. */
export function getItem(id: string): ItemDef | undefined {
  const def = (items as Record<string, ItemDef>)[id];
  if (!def) console.warn('Unknown item id:', id);
  return def;
}
