// NPC definitions -- data only, matching early-game OSRS stat blocks.

import type { NpcDef, DropEntry, ItemStack } from '../types.ts';
import { rand, randRange } from '../core/util.ts';

interface NpcOpts {
  level?: number;
  hitpoints?: number;
  talkable?: boolean;
  attackable?: boolean;
  attack?: number;
  strength?: number;
  defence?: number;
  attackBonus?: number;
  strengthBonus?: number;
  defenceBonus?: number;
  speed?: number;
  aggressive?: boolean;
  respawnTicks?: number;
  wanderRadius?: number;
  colour: string;
  accent?: string;
  size?: number;
  drops?: readonly DropEntry[];
}

function npc(id: string, name: string, opts: NpcOpts): NpcDef {
  return {
    id,
    name,
    talkable: opts.talkable ?? false,
    attackable: opts.attackable ?? true,
    level: opts.level ?? 1,
    hitpoints: opts.hitpoints ?? 10,
    attack: opts.attack ?? 1,
    strength: opts.strength ?? 1,
    defence: opts.defence ?? 1,
    attackBonus: opts.attackBonus ?? 0,
    strengthBonus: opts.strengthBonus ?? 0,
    defenceBonus: opts.defenceBonus ?? 0,
    speed: opts.speed ?? 4,
    aggressive: opts.aggressive ?? false,
    respawnTicks: opts.respawnTicks ?? 25, // 25 ticks = 15 seconds
    wanderRadius: opts.wanderRadius ?? 4,
    colour: opts.colour,
    accent: opts.accent ?? '#ffffff',
    size: opts.size ?? 1.0,
    drops: opts.drops ?? []
  };
}

export const npcs = {
  chicken: npc('chicken', 'Chicken', {
    level: 1, hitpoints: 3,
    colour: '#f2f2ea', accent: '#e04b3a', size: 0.7,
    drops: [
      { id: 'bones', qty: 1, weight: 100 },
      { id: 'feather', qty: [5, 15], weight: 100 },
      { id: 'raw_chicken', qty: 1, weight: 100 }
    ]
  }),

  rat: npc('rat', 'Giant rat', {
    level: 3, hitpoints: 5, strength: 2,
    colour: '#7a6a58', accent: '#d0b8a0', size: 0.75,
    drops: [
      { id: 'bones', qty: 1, weight: 100 },
      { id: 'coins', qty: [1, 8], weight: 60 },
      { id: null, weight: 40 }
    ]
  }),

  cow: npc('cow', 'Cow', {
    level: 2, hitpoints: 8,
    colour: '#efe7d8', accent: '#3a332c', size: 1.15,
    drops: [
      { id: 'bones', qty: 1, weight: 100 },
      { id: 'cowhide', qty: 1, weight: 100 }
    ]
  }),

  goblin: npc('goblin', 'Goblin', {
    level: 2, hitpoints: 5,
    attackBonus: 2, strengthBonus: 2, defenceBonus: 3,
    aggressive: true, colour: '#5f8a3c', accent: '#c05a2e',
    drops: [
      { id: 'bones', qty: 1, weight: 100 },
      { id: 'coins', qty: [2, 24], weight: 50 },
      { id: 'bronze_dagger', qty: 1, weight: 12 },
      { id: null, weight: 38 }
    ]
  }),

  guard: npc('guard', 'Guard', {
    level: 21, hitpoints: 22,
    attack: 19, strength: 18, defence: 17,
    attackBonus: 10, strengthBonus: 12, defenceBonus: 22,
    speed: 5, aggressive: true, colour: '#5a6b8c', accent: '#c9c9d4',
    size: 1.1, respawnTicks: 50,
    drops: [
      { id: 'bones', qty: 1, weight: 100 },
      { id: 'coins', qty: [20, 120], weight: 55 },
      { id: 'iron_scimitar', qty: 1, weight: 10 },
      { id: 'steel_scimitar', qty: 1, weight: 3 },
      { id: null, weight: 32 }
    ]
  }),

  // ------------------------------------------------------------------------
  // Quest givers. Rooted to their tile, unarmed, and not to be swung at.
  // ------------------------------------------------------------------------
  maren: npc('maren', 'Maren Ashfall', {
    talkable: true, attackable: false, wanderRadius: 0,
    colour: '#6b4a6b', accent: '#e8c39e', size: 1.0
  }),

  tobin: npc('tobin', 'Tobin Reeve', {
    talkable: true, attackable: false, wanderRadius: 0,
    colour: '#4a5f3a', accent: '#d8b48c', size: 1.05
  }),

  garrow: npc('garrow', 'Garrow Blackfen', {
    talkable: true, attackable: false, wanderRadius: 0,
    colour: '#3f3a36', accent: '#c9a184', size: 1.1
  }),

  iselle: npc('iselle', 'Iselle Marrow', {
    talkable: true, attackable: false, wanderRadius: 0,
    colour: '#3c5a63', accent: '#e0c9a6', size: 1.0
  }),

  // Not aggressive, deliberately. The grove is a Woodcutting reward gated on
  // Woodcutting, so what lives there must be a choice rather than a toll --
  // the same correction the goblins in the Cut needed.
  boar: npc('boar', 'Thornback boar', {
    level: 9, hitpoints: 22,
    attack: 8, strength: 9, defence: 7,
    attackBonus: 4, strengthBonus: 6, defenceBonus: 5,
    speed: 5, wanderRadius: 3,
    colour: '#4a3b2c', accent: '#2a2119', size: 1.15,
    drops: [
      { id: 'bones', qty: 1, weight: 100 },
      { id: 'cowhide', qty: 1, weight: 45 },
      { id: 'coins', qty: [8, 40], weight: 40 },
      { id: null, weight: 30 }
    ]
  }),

  hesk: npc('hesk', 'Hesk Ardley', {
    talkable: true, attackable: false, wanderRadius: 0,
    colour: '#5a4630', accent: '#cbb489', size: 1.08
  }),

  sella: npc('sella', 'Sella Quist', {
    talkable: true, attackable: false, wanderRadius: 0,
    colour: '#4a3f5a', accent: '#d8c9a0', size: 1.0
  }),

  corbin: npc('corbin', 'Corbin Vayle', {
    talkable: true, attackable: false, wanderRadius: 0,
    colour: '#6b4a2f', accent: '#d8c08a', size: 1.05
  })
} as const satisfies Record<string, NpcDef>;

export type NpcId = keyof typeof npcs;

export function getNpc(id: string): NpcDef | undefined {
  const def = (npcs as Record<string, NpcDef>)[id];
  if (!def) console.warn('Unknown npc id:', id);
  return def;
}

/** Roll a drop table once. Bones always drop alongside, as in RuneScape. */
export function rollDrops(def: NpcDef): ItemStack[] {
  const total = def.drops.reduce((sum, d) => sum + d.weight, 0);
  let roll = rand(total);
  const out: ItemStack[] = [];

  for (const entry of def.drops) {
    roll -= entry.weight;
    if (roll < 0) {
      if (entry.id) {
        const qty = Array.isArray(entry.qty)
          ? randRange(entry.qty[0], entry.qty[1])
          : ((entry.qty as number | undefined) ?? 1);
        out.push({ id: entry.id, qty });
      }
      break;
    }
  }

  if (!out.some((o) => o.id === 'bones')) {
    out.push({ id: 'bones', qty: 1 });
  }

  return out;
}
