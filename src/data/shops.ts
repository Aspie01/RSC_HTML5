// Shops -- data only.
//
// There is no player market in a single-player game, so scarcity has to come
// from somewhere else: finite stock that refills slowly, and a spread between
// what a shop charges and what it pays. Both live here, so a new shop or a new
// line of stock never touches engine code.
//
// Prices are derived from each item's `value` rather than written per shop.
// That way a rebalance is one number in items.ts, and a shop can never quote a
// price that contradicts what the item is worth everywhere else.

export interface StockDef {
  readonly id: string;
  /** Stock held when full. Also the ceiling restocking climbs back to. */
  readonly max: number;
  /** Ticks per unit restocked. Higher means scarcer. */
  readonly restockTicks: number;
}

export interface ShopDef {
  readonly id: string;
  readonly name: string;
  /** NPC whose dialogue opens this shop. */
  readonly npc: string;
  /**
   * Multiplier on an item's value when the shop sells TO the player, and when
   * it buys FROM them. The gap between the two is the whole economy: buying
   * something back always costs more than it fetched, so churning goods
   * through a shop drains coins instead of printing them.
   */
  readonly buyRate: number;
  readonly sellRate: number;
  /**
   * Whether the shop will take items it does not stock. A general store buys
   * anything with a value; a specialist would not.
   */
  readonly buysAnything: boolean;
  readonly stock: readonly StockDef[];
}

export const shops: readonly ShopDef[] = [
  {
    id: 'vayles_cart',
    name: "Vayle's Cart",
    npc: 'corbin',
    buyRate: 1.3,
    sellRate: 0.4,
    buysAnything: true,
    // Deliberately the full set of starting tools. A player who drops or loses
    // their axe has no other way to get one back, and a soft-locked skill is
    // worse than a cheap safety net -- the coins are the cost of the lesson.
    stock: [
      { id: 'bronze_axe', max: 3, restockTicks: 120 },
      { id: 'bronze_pickaxe', max: 3, restockTicks: 120 },
      { id: 'tinderbox', max: 5, restockTicks: 80 },
      { id: 'hammer', max: 3, restockTicks: 120 },
      { id: 'fishing_rod', max: 3, restockTicks: 120 },
      { id: 'cooked_sprat', max: 10, restockTicks: 40 },
      { id: 'logs', max: 15, restockTicks: 25 }
    ]
  }
];

export function getShop(id: string): ShopDef | undefined {
  return shops.find((s) => s.id === id);
}

export function shopForNpc(npcId: string): ShopDef | undefined {
  return shops.find((s) => s.npc === npcId);
}
