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
  /**
   * Stock held when full, and the ceiling restocking climbs back to.
   *
   * **Zero means the shop buys this but never sells it.** The count is clamped
   * to the ceiling on every sale, so a zero ceiling swallows what it is given
   * and restocking skips the line entirely. That is how a specialist declares
   * a trade it deals in without putting it on the shelf: Garrow takes ore off
   * a miner who does not smith, and has none to sell back.
   */
  readonly max: number;
  /** Ticks per unit restocked. Higher means scarcer. Ignored when max is 0. */
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
    buyRate: 1.4,
    // Deliberately poor. A general store that pays 40% of value for anything
    // is the whole economy, because gathering out-earns every other activity
    // by an order of magnitude and this is where that income is realised.
    // Twelve percent makes the cart what it should be -- somewhere to dump
    // surplus, not somewhere to work. Sell to a specialist who wants the
    // thing, or make something out of it.
    sellRate: 0.12,
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
  },

  // ------------------------------------------------------------------------
  // Specialists.
  //
  // Each pays properly for its own trade and refuses everything else, which is
  // what makes selling a decision rather than a reflex: walk your fish to the
  // fishmonger, or take twelve percent at the cart. It also stops the general
  // store's poor rate from being a flat tax on the whole game.
  //
  // What they SELL is the point of coins existing. Everything stocked below is
  // either consumed in use (arrows, reagents, food) or a shortcut past a grind
  // somebody may not want (gear a tier behind what you could smith), and all
  // of it is finite and slow to restock, so a shop supplements a skill rather
  // than replacing it.
  // ------------------------------------------------------------------------
  {
    id: 'iselles_table',
    name: "Iselle's Table",
    npc: 'iselle',
    buyRate: 1.5,
    sellRate: 0.5,
    buysAnything: false,
    stock: [
      { id: 'cooked_sprat', max: 20, restockTicks: 30 },
      { id: 'cooked_bream', max: 12, restockTicks: 90 },
      { id: 'roasted_marshroot', max: 10, restockTicks: 60 },
      // She buys the raw catch too, which is what makes Fishing pay.
      { id: 'raw_sprat', max: 0, restockTicks: 999 },
      { id: 'raw_bream', max: 0, restockTicks: 999 }
    ]
  },

  {
    id: 'hesks_rack',
    name: "Hesk's Rack",
    npc: 'hesk',
    buyRate: 1.5,
    sellRate: 0.5,
    buysAnything: false,
    // Archery's running cost. An arrow is spent whether or not it lands, so
    // this is the one shop a player comes back to for the rest of the game.
    stock: [
      { id: 'bronze_arrow', max: 250, restockTicks: 3 },
      { id: 'iron_arrow', max: 150, restockTicks: 8 },
      { id: 'arrow_shaft', max: 200, restockTicks: 2 },
      { id: 'feather', max: 200, restockTicks: 2 },
      { id: 'shortbow', max: 2, restockTicks: 400 },
      { id: 'oak_shortbow', max: 1, restockTicks: 900 }
    ]
  },

  {
    id: 'garrows_bench',
    name: "Garrow's Bench",
    npc: 'garrow',
    buyRate: 1.6,
    // Low on purpose, and the lowest of the specialists. Ore is the densest
    // thing a player can carry -- twenty-eight adamantine a load -- so paying
    // near its value here would make mining out-earn everything else in the
    // game several times over, which is exactly what it used to do. A miner
    // who does not smith gets a fair-ish outlet, not a wage.
    sellRate: 0.22,
    buysAnything: false,
    // A tier behind what the player could forge themselves, in ones and twos,
    // restocking over most of an hour. Somebody who never took up Smithing can
    // stay equipped; somebody who did will always be ahead of the shelf.
    stock: [
      { id: 'steel_scimitar', max: 2, restockTicks: 500 },
      { id: 'steel_kiteshield', max: 1, restockTicks: 700 },
      { id: 'steel_med_helm', max: 2, restockTicks: 500 },
      { id: 'blackiron_scimitar', max: 1, restockTicks: 1200 },
      { id: 'hammer', max: 5, restockTicks: 60 },
      { id: 'bronze_sickle', max: 3, restockTicks: 150 },
      // He is the one person who will take ore and bars off you at a fair
      // price, which is Mining's outbound arrow when you are not smithing.
      { id: 'iron_ore', max: 0, restockTicks: 999 },
      { id: 'coal', max: 0, restockTicks: 999 },
      { id: 'adamantine_ore', max: 0, restockTicks: 999 }
    ]
  },

  {
    id: 'sellas_shelf',
    name: "Sella's Shelf",
    npc: 'sella',
    buyRate: 1.5,
    sellRate: 0.5,
    buysAnything: false,
    // Magic's running cost, and the gem counter. Gems are the one thing in the
    // game whose entire purpose is to be sold, so somebody has to want them.
    stock: [
      { id: 'emberleaf', max: 120, restockTicks: 6 },
      { id: 'glass_vial', max: 30, restockTicks: 40 },
      { id: 'sand', max: 100, restockTicks: 4 },
      { id: 'clouded_quartz', max: 0, restockTicks: 999 },
      { id: 'river_garnet', max: 0, restockTicks: 999 },
      { id: 'drowned_opal', max: 0, restockTicks: 999 }
    ]
  }
];

export function getShop(id: string): ShopDef | undefined {
  return shops.find((s) => s.id === id);
}

export function shopForNpc(npcId: string): ShopDef | undefined {
  return shops.find((s) => s.npc === npcId);
}
