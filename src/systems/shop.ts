// Shop stock and trading.
//
// Owns how much of what each shop currently holds, refills it on the tick, and
// resolves a purchase or a sale. Pure simulation: it touches an Inventory and
// its own counters, and never a DOM node -- the interface asks it questions and
// draws the answers.
//
// Prices come from `ItemDef.value` scaled by the shop's rates, never from a
// per-shop price list, so an item is worth the same thing everywhere.

import type { Inventory } from './inventory';
import type { ShopDef } from '../data/shops';
import { shops } from '../data/shops';
import { getItem } from '../data/items';

const COINS = 'coins';

/** What a trade did, or why it could not happen. */
export type TradeResult =
  | { readonly ok: true; readonly qty: number; readonly coins: number }
  | { readonly ok: false; readonly reason:
      'no-stock' | 'no-coins' | 'no-room' | 'not-wanted' | 'none-held' };

/** Stock levels per shop, and how far each line is through its restock timer. */
export interface ShopState {
  counts: Record<string, number>;
  timers: Record<string, number>;
}

export class Shops {
  /** Shop id -> live stock. Absent means "never traded with", i.e. full. */
  private readonly state: Record<string, ShopState> = {};

  /**
   * Price the shop charges, and the price it pays. Both round to at least 1
   * coin for anything with a value, so nothing tradeable is ever free.
   */
  priceToBuy(shop: ShopDef, itemId: string): number {
    const value = getItem(itemId)?.value ?? 0;
    return value <= 0 ? 0 : Math.max(1, Math.round(value * shop.buyRate));
  }

  priceToSell(shop: ShopDef, itemId: string): number {
    const value = getItem(itemId)?.value ?? 0;
    return value <= 0 ? 0 : Math.max(1, Math.round(value * shop.sellRate));
  }

  private stateOf(shop: ShopDef): ShopState {
    let s = this.state[shop.id];
    if (!s) {
      s = { counts: {}, timers: {} };
      for (const line of shop.stock) s.counts[line.id] = line.max;
      this.state[shop.id] = s;
    }
    return s;
  }

  countOf(shop: ShopDef, itemId: string): number {
    return this.stateOf(shop).counts[itemId] ?? 0;
  }

  /**
   * Everything the shop currently offers, including sold-out lines.
   *
   * Sold-out lines stay listed rather than disappearing: a shelf with a zero on
   * it tells the player to come back, where a vanished row just looks like the
   * shop never had one.
   */
  listing(shop: ShopDef): { id: string; qty: number; price: number }[] {
    return shop.stock.map((line) => ({
      id: line.id,
      qty: this.countOf(shop, line.id),
      price: this.priceToBuy(shop, line.id)
    }));
  }

  /** Refill anything below its ceiling. Called once per game tick. */
  tick(): void {
    for (const shop of shops) {
      const s = this.state[shop.id];
      if (!s) continue; // never visited, therefore already full

      for (const line of shop.stock) {
        const held = s.counts[line.id] ?? line.max;
        if (held >= line.max) { s.timers[line.id] = 0; continue; }

        const t = (s.timers[line.id] ?? 0) + 1;
        if (t >= line.restockTicks) {
          s.counts[line.id] = held + 1;
          s.timers[line.id] = 0;
        } else {
          s.timers[line.id] = t;
        }
      }
    }
  }

  buy(shop: ShopDef, itemId: string, inv: Inventory): TradeResult {
    const held = this.countOf(shop, itemId);
    if (held <= 0) return { ok: false, reason: 'no-stock' };

    const price = this.priceToBuy(shop, itemId);
    if (inv.count(COINS) < price) return { ok: false, reason: 'no-coins' };

    // Take the coins only once the item is known to fit, or a full pack would
    // charge the player for nothing.
    if (!inv.add(itemId, 1)) return { ok: false, reason: 'no-room' };
    this.takeCoins(inv, price);

    this.stateOf(shop).counts[itemId] = held - 1;
    return { ok: true, qty: 1, coins: price };
  }

  sell(shop: ShopDef, itemId: string, inv: Inventory): TradeResult {
    const price = this.priceToSell(shop, itemId);
    if (price <= 0) return { ok: false, reason: 'not-wanted' };

    const stocked = shop.stock.some((line) => line.id === itemId);
    if (!stocked && !shop.buysAnything) return { ok: false, reason: 'not-wanted' };

    const slot = inv.slots.findIndex((s) => s?.id === itemId);
    if (slot < 0) return { ok: false, reason: 'none-held' };

    inv.removeSlot(slot, 1);
    if (!inv.add(COINS, price)) {
      // Coins stack, so this only fails on a pack with no free slot and no
      // existing coin stack. Put the item back rather than eat it.
      inv.add(itemId, 1);
      return { ok: false, reason: 'no-room' };
    }

    // Sold goods join the shelf, but never push a line past its ceiling --
    // otherwise a player could inflate stock and then buy it back cheaply.
    if (stocked) {
      const line = shop.stock.find((l) => l.id === itemId);
      const s = this.stateOf(shop);
      if (line) s.counts[itemId] = Math.min(line.max, this.countOf(shop, itemId) + 1);
    }

    return { ok: true, qty: 1, coins: price };
  }

  /** Remove `amount` coins, which may be spread across several stacks. */
  private takeCoins(inv: Inventory, amount: number): void {
    let left = amount;
    for (let i = 0; i < inv.slots.length && left > 0; i++) {
      const slot = inv.slots[i];
      if (!slot || slot.id !== COINS) continue;
      const take = Math.min(slot.qty, left);
      inv.removeSlot(i, take);
      left -= take;
    }
  }

  // ------------------------------------------------------------------
  // Persistence
  // ------------------------------------------------------------------

  /** Stock as plain data for the save. */
  snapshot(): Record<string, ShopState> {
    return this.state;
  }

  /**
   * Restore saved stock, ignoring anything unrecognisable.
   *
   * A save written before shops existed has nothing here, and a shop absent
   * from the save is simply full -- which is why this needs no save version
   * bump. Counts are clamped to the current ceiling so that lowering a `max`
   * in data can never leave a shop holding more than it should.
   */
  restore(saved: unknown): void {
    if (typeof saved !== 'object' || saved === null) return;
    const record = saved as Record<string, Partial<ShopState>>;

    for (const shop of shops) {
      const entry = record[shop.id];
      if (!entry || typeof entry !== 'object') continue;

      const s = this.stateOf(shop);
      for (const line of shop.stock) {
        const qty = entry.counts?.[line.id];
        if (typeof qty === 'number' && Number.isFinite(qty)) {
          s.counts[line.id] = Math.max(0, Math.min(line.max, Math.floor(qty)));
        }
        const timer = entry.timers?.[line.id];
        if (typeof timer === 'number' && Number.isFinite(timer)) {
          s.timers[line.id] = Math.max(0, Math.floor(timer));
        }
      }
    }
  }
}
