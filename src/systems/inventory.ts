// 28-slot inventory plus equipment, following RuneScape's rules:
//   - stackable items merge into one slot with a quantity
//   - non-stackables take one slot each
//   - equipping moves the item out of the inventory into its slot

import type { Bonuses, EquipSlot, ItemStack } from '../types';
import { getItem } from '../data/items';

export const INVENTORY_CAPACITY = 28;

export const EQUIP_SLOTS: readonly EquipSlot[] = [
  'head', 'cape', 'body', 'legs', 'weapon', 'shield'
];

export type EquipmentMap = Record<EquipSlot, ItemStack | null>;

/** Distinguishable failure reasons, rather than overloading a string return. */
export type EquipResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'not-equippable' | 'inventory-full' };

export class Inventory {
  slots: (ItemStack | null)[] = new Array<ItemStack | null>(INVENTORY_CAPACITY).fill(null);

  equipment: EquipmentMap = Object.fromEntries(
    EQUIP_SLOTS.map((s) => [s, null])
  ) as EquipmentMap;

  freeSlots(): number {
    return this.slots.reduce<number>((n, s) => (s ? n : n + 1), 0);
  }

  isFull(): boolean {
    return this.freeSlots() === 0;
  }

  count(id: string): number {
    return this.slots.reduce<number>(
      (n, s) => (s && s.id === id ? n + s.qty : n),
      0
    );
  }

  firstFree(): number {
    return this.slots.findIndex((s) => s === null);
  }

  /** Returns true only if the WHOLE quantity fit. */
  add(id: string, qty = 1): boolean {
    const def = getItem(id);
    if (!def) return false;

    if (def.stackable) {
      const existing = this.slots.find((s) => s !== null && s.id === id);
      if (existing) {
        existing.qty += qty;
        return true;
      }
      const free = this.firstFree();
      if (free === -1) return false;
      this.slots[free] = { id, qty };
      return true;
    }

    // Non-stackable: one slot per unit.
    for (let n = 0; n < qty; n++) {
      const s = this.firstFree();
      if (s === -1) return false;
      this.slots[s] = { id, qty: 1 };
    }
    return true;
  }

  removeSlot(index: number, qty?: number): ItemStack | null {
    const slot = this.slots[index];
    if (!slot) return null;

    const take = qty === undefined ? slot.qty : Math.min(qty, slot.qty);
    const taken: ItemStack = { id: slot.id, qty: take };

    slot.qty -= take;
    if (slot.qty <= 0) this.slots[index] = null;

    return taken;
  }

  /** Equip the item at `index`. Anything already worn swaps back into it. */
  equip(index: number): EquipResult {
    const slot = this.slots[index];
    if (!slot) return { ok: false, reason: 'empty' };

    const def = getItem(slot.id);
    if (!def || !def.slot) return { ok: false, reason: 'not-equippable' };

    const previous = this.equipment[def.slot];

    this.slots[index] = null;
    this.equipment[def.slot] = { id: slot.id, qty: 1 };

    // Guaranteed to fit: we just vacated this slot.
    if (previous) this.slots[index] = { id: previous.id, qty: 1 };

    return { ok: true, name: def.name };
  }

  unequip(slotName: EquipSlot): EquipResult {
    const equipped = this.equipment[slotName];
    if (!equipped) return { ok: false, reason: 'empty' };
    if (this.isFull()) return { ok: false, reason: 'inventory-full' };

    this.equipment[slotName] = null;
    this.add(equipped.id, 1);

    return { ok: true, name: getItem(equipped.id)?.name ?? equipped.id };
  }

  /** Summed equipment bonuses, fed straight into the combat formulas. */
  bonuses(): Bonuses {
    const total: Bonuses = { attack: 0, strength: 0, defence: 0 };

    for (const slotName of EQUIP_SLOTS) {
      const eq = this.equipment[slotName];
      if (!eq) continue;
      const def = getItem(eq.id);
      if (!def) continue;
      total.attack += def.bonuses.attack;
      total.strength += def.bonuses.strength;
      total.defence += def.bonuses.defence;
    }

    return total;
  }

  /** Attack speed comes from the equipped weapon; unarmed is 4 ticks. */
  attackSpeed(): number {
    const w = this.equipment.weapon;
    if (!w) return 4;
    return getItem(w.id)?.speed ?? 4;
  }
}
