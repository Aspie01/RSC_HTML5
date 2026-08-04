// The world: a tile grid of terrain, blocking scenery, and NPC spawn points.
//
// Generated procedurally from a FIXED seed, so the world is identical on every
// load without hand-authoring 2,304 tiles. When you move to a real map editor
// (Tiled exports JSON), you replace generate() and nothing else -- the rest of
// the game only talks to inBounds / isWalkable / terrainAt.

/**
 * Terrain kinds, as a frozen object rather than a `const enum`.
 *
 * An enum cannot be type-stripped, which would make this module -- and so the
 * whole world -- unimportable from a bare Node script. Rule 1 says the
 * simulation must be steppable there, and the tests rely on it, so the one
 * construct that breaks it is not worth the syntax sugar.
 */
export const Terrain = {
  Grass: 0,
  GrassDark: 1,
  Dirt: 2,
  Path: 3,
  Water: 4,
  Sand: 5,
  Stone: 6,
  /** Walkable, and it costs health every tick you stand in it. */
  Floodwater: 7
} as const;

export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export interface TerrainInfo {
  readonly top: string;
  readonly side: string;
  readonly walk: boolean;
  /**
   * Health lost per tick spent standing on it. Absent means none.
   *
   * A hazard is deliberately not a wall: the whole point of the Sunken Road is
   * that it can be crossed, at a price, by someone who brought food. Blocking
   * it would be a locked door wearing a costume.
   */
  readonly hazard?: number;
}

export type SceneryKind =
  | 'tree' | 'rock' | 'bush' | 'fence' | 'furnace' | 'anvil' | 'fishing_spot'
  | 'well' | 'rubble' | 'sand_bank' | 'thicket' | 'stone_box' | 'descent';

export interface Scenery {
  readonly kind: SceneryKind;
  readonly blocks: boolean;
  readonly variant?: number;
  /**
   * Id into `gatherables` in data/resources.ts when this scenery can be worked
   * for a resource. Absent means purely decorative, which is what separates an
   * ore vein from a boulder, or a fishing spot from open water.
   */
  readonly resource?: string;
}

export interface Spawn {
  readonly npcId: string;
  readonly x: number;
  readonly y: number;
}

// Muted, slightly desaturated, low contrast between neighbours -- the
// early-2000s RuneScape look.
export const TERRAIN_INFO: Record<Terrain, TerrainInfo> = {
  [Terrain.Grass]:     { top: '#4a7c3f', side: '#2f5228', walk: true },
  [Terrain.GrassDark]: { top: '#436f39', side: '#2b4a24', walk: true },
  [Terrain.Dirt]:      { top: '#7d6244', side: '#54412d', walk: true },
  [Terrain.Path]:      { top: '#9a8560', side: '#6b5c42', walk: true },
  [Terrain.Water]:     { top: '#2f5f8a', side: '#1e3f5e', walk: false },
  [Terrain.Sand]:      { top: '#c2ad78', side: '#8b7a54', walk: true },
  [Terrain.Stone]:     { top: '#8a8a8a', side: '#5e5e5e', walk: true },
  [Terrain.Floodwater]: { top: '#3f6f7a', side: '#26454e', walk: true, hazard: 1 }
};

/** Deterministic PRNG (mulberry32), so the generated world never shifts. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GameMap {
  readonly width: number;
  readonly height: number;
  readonly terrain: Uint8Array;
  readonly scenery: (Scenery | null)[];
  readonly spawns: Spawn[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.terrain = new Uint8Array(width * height);
    this.scenery = new Array<Scenery | null>(width * height).fill(null);
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  terrainAt(x: number, y: number): Terrain {
    return (this.terrain[this.idx(x, y)] ?? Terrain.Grass) as Terrain;
  }

  terrainInfo(x: number, y: number): TerrainInfo {
    return TERRAIN_INFO[this.terrainAt(x, y)];
  }

  sceneryAt(x: number, y: number): Scenery | null {
    if (!this.inBounds(x, y)) return null;
    return this.scenery[this.idx(x, y)] ?? null;
  }

  /**
   * Static walkability: terrain and scenery only. Entity occupancy is checked
   * separately during movement, so that pathfinding does not treat other mobs
   * as permanent walls -- they move out of the way on their own.
   */
  isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (!this.terrainInfo(x, y).walk) return false;
    const s = this.scenery[this.idx(x, y)];
    return !(s && s.blocks);
  }

  setTerrain(x: number, y: number, t: Terrain): void {
    if (this.inBounds(x, y)) this.terrain[this.idx(x, y)] = t;
  }

  fillRect(x0: number, y0: number, x1: number, y1: number, t: Terrain): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.setTerrain(x, y, t);
    }
  }

  setScenery(x: number, y: number, obj: Scenery): void {
    if (this.inBounds(x, y)) this.scenery[this.idx(x, y)] = obj;
  }
}

// --------------------------------------------------------------------------
// Generation
// --------------------------------------------------------------------------
function nearPath(x: number, y: number): boolean {
  return (y >= 21 && y <= 26) || (x >= 21 && x <= 26);
}

function fence(
  map: GameMap,
  x0: number, y0: number, x1: number, y1: number,
  gaps: ReadonlyArray<{ x: number; y: number }>
): void {
  const isGap = (x: number, y: number): boolean =>
    gaps.some((g) => g.x === x && g.y === y);

  const post: Scenery = { kind: 'fence', blocks: true };

  for (let x = x0; x <= x1; x++) {
    if (!isGap(x, y0)) map.setScenery(x, y0, post);
    if (!isGap(x, y1)) map.setScenery(x, y1, post);
  }
  for (let y = y0 + 1; y < y1; y++) {
    if (!isGap(x0, y)) map.setScenery(x0, y, post);
    if (!isGap(x1, y)) map.setScenery(x1, y, post);
  }
}

/**
 * The quarry's veins, hand-placed rather than scattered. Ore rocks are the one
 * thing worth authoring by hand: players learn a mining site by its shape, and
 * a random sprinkle never produces one you can remember.
 */
const ORE_VEINS: ReadonlyArray<{ x: number; y: number; rock: string }> = [
  { x: 6, y: 14, rock: 'copper' },
  { x: 5, y: 15, rock: 'copper' },
  { x: 4, y: 17, rock: 'copper' },
  { x: 5, y: 19, rock: 'copper' },
  { x: 4, y: 15, rock: 'tin' },
  { x: 7, y: 15, rock: 'tin' },
  { x: 6, y: 20, rock: 'tin' },
  { x: 9, y: 14, rock: 'iron' },
  { x: 10, y: 16, rock: 'iron' },
  { x: 11, y: 19, rock: 'iron' },
  { x: 8, y: 20, rock: 'iron' },
  // No coal at the surface. Coal is what Deepcut exists to unlock, and leaving
  // it lying about the open quarry would make the whole quest optional.
  { x: 11, y: 14, rock: 'iron' },
  { x: 12, y: 18, rock: 'tin' }
];

/**
 * The Cut: the sealed lower mine, south-west of the quarry.
 *
 * Everything here is coal or iron, and it is the only coal in the world. The
 * chamber is walled and its one entrance is buried until Deepcut is finished,
 * which is what makes the quest's reward a place rather than an item.
 */
const CUT_VEINS: ReadonlyArray<{ x: number; y: number; rock: string }> = [
  { x: 4, y: 28, rock: 'coal' },
  { x: 5, y: 30, rock: 'coal' },
  { x: 7, y: 29, rock: 'coal' },
  { x: 9, y: 28, rock: 'coal' },
  { x: 11, y: 30, rock: 'coal' },
  { x: 12, y: 28, rock: 'coal' },
  { x: 3, y: 30, rock: 'iron' },
  { x: 10, y: 27, rock: 'iron' }
];

/** The tile that seals The Cut. Cleared when Deepcut completes. */
export const CUT_ENTRANCE = { x: 7, y: 26 } as const;

/**
 * Wrackwood: old forest, south down the road. The grove inside it is walled by
 * thicket and its one gap is grown over until The Quiet Grove is finished.
 *
 * The ironbark is inside. Level alone would not have been a reward -- a player
 * who reaches Woodcutting 20 would simply find the trees waiting -- so the
 * quest opens the place instead, the same trade Deepcut makes for coal.
 */
const GROVE_TREES: ReadonlyArray<{ x: number; y: number; tree: string }> = [
  { x: 19, y: 41, tree: 'ironbark' },
  { x: 21, y: 43, tree: 'ironbark' },
  { x: 23, y: 41, tree: 'ironbark' },
  { x: 25, y: 43, tree: 'ironbark' },
  { x: 27, y: 41, tree: 'ironbark' },
  { x: 20, y: 44, tree: 'oak' },
  { x: 26, y: 44, tree: 'oak' }
];

/** The tile that seals the grove. Cleared when The Quiet Grove completes. */
export const GROVE_ENTRANCE = { x: 23, y: 39 } as const;

/**
 * The Sallows: low ground in the south-east that has no business being wet.
 *
 * Standing water sits in it in pools that do not drain, well above the lake
 * and nowhere near the river. The way in is choked with dead reed until The
 * Cartographer's Error is finished.
 */
const SALLOW_POOLS: ReadonlyArray<readonly [number, number]> = [
  [35, 42], [36, 42], [36, 43], [39, 41], [40, 41], [40, 42],
  [37, 45], [38, 45], [42, 44], [43, 44], [34, 45], [41, 46]
];

/**
 * The tile that seals the Sallows. Cleared when The Cartographer's Error
 * completes. It sits ON the reed wall, not inside it -- a gap one tile in from
 * the edge is not a gap, it is a cupboard.
 */
export const SALLOWS_ENTRANCE = { x: 32, y: 44 } as const;

/**
 * The Sunken Road: a causeway running east out of the fen and under the lake.
 *
 * Every tile of it is floodwater, so crossing costs health the whole way. It is
 * short on purpose -- a long hazard is not more interesting than a short one,
 * it is only more food -- and it ends at a descent that goes down rather than
 * on, which is where the Drowned Interior will be.
 */
const SUNKEN_ROAD: ReadonlyArray<readonly [number, number]> = [
  [45, 43], [46, 43], [46, 44], [47, 44]
];

/** The tile that seals the road. Cleared when The Sunken Road completes. */
export const ROAD_ENTRANCE = { x: 45, y: 43 } as const;

/** Where the road stops going east and starts going down. */
export const ROAD_DESCENT = { x: 47, y: 44 } as const;

/**
 * The Drowned Interior: what is at the bottom of the stair.
 *
 * Physically it is a walled block in the south-west, because the map is one
 * flat grid with no levels -- the descent at the pier head is a seam that puts
 * you here, and the stair at (8,44) puts you back. Nothing connects the two
 * areas on the grid, so a player can only ever arrive by the passage.
 *
 * It is mostly floodwater. The Sunken Road charged a hitpoint a tick to cross
 * four tiles; this is the same price over a whole region, which is what makes
 * it the last place in the game rather than the next one.
 */
const INTERIOR_DRY: ReadonlyArray<readonly [number, number]> = [
  // The stair, and a spit of standing ground around it.
  [8, 44], [8, 43], [7, 44], [9, 44], [8, 45],
  // Islands, so the region is crossed in hops rather than one long wade.
  [4, 42], [5, 42], [4, 43],
  [12, 42], [13, 42], [13, 43],
  [5, 46], [6, 46],
  [11, 46], [12, 46],
  [15, 44], [15, 45]
];

/** Where the stair back up stands. */
export const INTERIOR_STAIR = { x: 8, y: 44 } as const;

/**
 * Fishing spots, all placed so that a pier or shore tile sits beside them.
 * Shallows hug the sand; the deep water is out at the pier head, which is what
 * makes walking to the end of it worth doing at Fishing 10.
 */
const FISHING_SPOTS: ReadonlyArray<{ x: number; y: number; spot: string }> = [
  { x: 45, y: 22, spot: 'sprat' },
  { x: 45, y: 23, spot: 'sprat' },
  { x: 45, y: 25, spot: 'sprat' },
  { x: 45, y: 26, spot: 'sprat' },
  { x: 46, y: 23, spot: 'sprat' },
  { x: 46, y: 25, spot: 'bream' },
  { x: 47, y: 24, spot: 'bream' }
];

/**
 * Where the quest givers stand. Fixed tiles, chosen so each one is found at
 * the place their quest is about: Maren on the crossroads you spawn at, Tobin
 * among the trees, Garrow inside the smithy, Iselle at the pier.
 */
const QUEST_GIVERS: ReadonlyArray<{ npcId: string; x: number; y: number }> = [
  { npcId: 'maren', x: 26, y: 22 },
  { npcId: 'tobin', x: 19, y: 28 },
  { npcId: 'garrow', x: 17, y: 20 },
  // Beside the pier mouth, never on it. A quest giver never wanders, and the
  // pathfinder walks through NPCs while movement refuses to enter their tile,
  // so anyone standing on a one-tile chokepoint seals it permanently. (44,24)
  // is that chokepoint here -- it is the only way onto the boards.
  { npcId: 'iselle', x: 44, y: 23 },
  // On the crossroads verge, beside the path but never on it -- see the note
  // above about stationary NPCs and chokepoints.
  { npcId: 'corbin', x: 27, y: 25 },
  // On the sand, between the banks and the furnace road.
  { npcId: 'sella', x: 42, y: 21 },
  // South-east, on the road out towards the guards -- where the fighting is.
  { npcId: 'hesk', x: 30, y: 31 },
  // On the south road, in sight of the reeds he cannot account for.
  { npcId: 'alder', x: 30, y: 38 },
  // Just inside the fen mouth, where the saltwort is.
  { npcId: 'ivo', x: 34, y: 44 }
];

function spawnCluster(
  map: GameMap, npcId: string,
  x0: number, y0: number, x1: number, y1: number,
  count: number, rng: () => number
): void {
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < 400) {
    attempts++;
    const x = x0 + Math.floor(rng() * (x1 - x0 + 1));
    const y = y0 + Math.floor(rng() * (y1 - y0 + 1));

    if (!map.isWalkable(x, y)) continue;
    if (map.spawns.some((s) => s.x === x && s.y === y)) continue;

    map.spawns.push({ npcId, x, y });
    placed++;
  }
}

export function generateMap(): GameMap {
  const W = 48;
  const H = 48;
  const map = new GameMap(W, H);
  const rng = seeded(20260803);

  // Base grass with subtle two-tone variation.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      map.setTerrain(x, y, rng() < 0.22 ? Terrain.GrassDark : Terrain.Grass);
    }
  }

  // Lake along the eastern edge, with a sandy shore.
  map.fillRect(45, 0, W - 1, H - 1, Terrain.Water);
  map.fillRect(43, 0, 44, H - 1, Terrain.Sand);

  // A short pier at the end of the east road. Without it the only reachable
  // water would be the single column touching the sand: every tile further out
  // has nothing walkable beside it, so no fishing spot out there could ever be
  // approached. The pier is what makes the lake a place rather than a wall.
  map.fillRect(45, 24, 46, 24, Terrain.Stone);

  // Crossroads: the main path through the world.
  map.fillRect(2, 23, 42, 24, Terrain.Path);
  map.fillRect(23, 2, 24, 42, Terrain.Path);

  // Chicken coop (north-west), fenced with a gap on the south side.
  map.fillRect(5, 5, 14, 13, Terrain.Dirt);
  fence(map, 5, 5, 14, 13, [{ x: 9, y: 13 }, { x: 10, y: 13 }]);

  map.fillRect(30, 5, 40, 14, Terrain.GrassDark);  // cow field
  map.fillRect(5, 30, 15, 40, Terrain.Dirt);       // goblin camp
  map.fillRect(30, 30, 40, 40, Terrain.Stone);     // guard post

  // Quarry and smithy, west of the crossroads. They sit next to each other on
  // purpose: mine, smelt, smith and equip should be one short walk, so the
  // whole production chain is visible from the moment you find it.
  map.fillRect(4, 14, 12, 20, Terrain.Stone);
  map.fillRect(15, 16, 19, 20, Terrain.Path);

  for (const vein of ORE_VEINS) {
    map.setScenery(vein.x, vein.y, {
      kind: 'rock', blocks: true, resource: vein.rock
    });
  }

  map.setScenery(16, 17, { kind: 'furnace', blocks: true });
  map.setScenery(18, 17, { kind: 'anvil', blocks: true });
  map.setScenery(18, 19, { kind: 'anvil', blocks: true });

  // Fishing spots do not block: the water under them already refuses to be
  // walked on, and marking them blocking as well would stop the pathfinder
  // considering the pier tiles beside them.
  for (const spot of FISHING_SPOTS) {
    map.setScenery(spot.x, spot.y, {
      kind: 'fishing_spot', blocks: false, resource: spot.spot
    });
  }

  // Sand banks along the shore, either side of the pier. Non-blocking, because
  // they are a feature of the beach rather than an object standing on it.
  for (const y of [19, 20, 21, 28, 29, 30]) {
    map.setScenery(43, y, { kind: 'sand_bank', blocks: false, resource: 'sand' });
  }

  // Scatter trees and rocks on open grass, keeping the paths clear.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const t = map.terrainAt(x, y);
      if (t !== Terrain.Grass && t !== Terrain.GrassDark) continue;
      if (nearPath(x, y)) continue;
      if (map.sceneryAt(x, y)) continue;

      const r = rng();
      if (r < 0.055) {
        // Roughly one tree in five is an oak, so there is something to grow
        // into once Woodcutting 15 is reached.
        const isOak = rng() < 0.2;
        map.setScenery(x, y, {
          kind: 'tree',
          blocks: true,
          variant: rng() < 0.5 ? 0 : 1,
          resource: isOak ? 'oak' : 'tree'
        });
      } else if (r < 0.072) {
        map.setScenery(x, y, { kind: 'rock', blocks: true });
      } else if (r < 0.10) {
        // Roughly a third of the hedgerow is worth cutting. The rest stays
        // decorative, so finding a marshroot is a small piece of luck rather
        // than a guarantee attached to every bush in the world.
        const forageable = rng() < 0.34;
        map.setScenery(x, y, {
          kind: 'bush', blocks: false,
          ...(forageable ? { resource: 'marshroot' } : {})
        });
      }
    }
  }

  // Landmark trees flanking the crossroads -- the first thing a new player
  // sees, so one of each type.
  map.setScenery(21, 21, { kind: 'tree', blocks: true, variant: 0, resource: 'tree' });
  map.setScenery(26, 26, { kind: 'tree', blocks: true, variant: 1, resource: 'oak' });

  // The Cut. A stone chamber walled in on every side, with coal inside and one
  // buried way in. Carved after the scatter pass so nothing has grown through
  // the walls, and dug out of the map rather than placed on top of it.
  map.fillRect(2, 26, 13, 30, Terrain.Stone);
  for (let y = 25; y <= 31; y++) {
    for (let x = 1; x <= 14; x++) {
      const edge = x === 1 || x === 14 || y === 25 || y === 31;
      if (!edge) { if (y >= 26 && y <= 30 && x >= 2 && x <= 13) map.scenery[map.idx(x, y)] = null; continue; }
      // The entrance is the one gap, and it starts blocked.
      if (x === CUT_ENTRANCE.x && y === CUT_ENTRANCE.y - 1) continue;
      map.setScenery(x, y, { kind: 'rock', blocks: true });
    }
  }
  map.setScenery(CUT_ENTRANCE.x, CUT_ENTRANCE.y, { kind: 'rubble', blocks: true });

  for (const vein of CUT_VEINS) {
    map.setScenery(vein.x, vein.y, {
      kind: 'rock', blocks: true, resource: vein.rock
    });
  }

  // Something lives down there -- the roadmap wants The Cut to serve Mining
  // and Combat both, and an empty mine is just a longer walk to the same rocks.
  //
  // Two, and confined to the far end. Goblins are aggressive, Deepcut gates on
  // Mining rather than on any combat skill, and this is the only coal in the
  // world: a swarm at the entrance would wall miners out of steel entirely
  // rather than making them decide anything. Down here the near seams can be
  // worked in peace and the far ones have to be earned.
  spawnCluster(map, 'goblin', 9, 29, 12, 30, 2, rng);

  // Wrackwood's grove. Walled with thicket on every side but the road, and
  // that gap grown over until a quest clears it.
  for (let y = 39; y <= 45; y++) {
    for (let x = 17; x <= 29; x++) {
      const edge = x === 17 || x === 29 || y === 39 || y === 45;
      if (!edge) { map.scenery[map.idx(x, y)] = null; continue; }
      if (x === GROVE_ENTRANCE.x && y === GROVE_ENTRANCE.y) continue;
      map.setScenery(x, y, { kind: 'thicket', blocks: true });
    }
  }
  map.setScenery(GROVE_ENTRANCE.x, GROVE_ENTRANCE.y, { kind: 'thicket', blocks: true });

  // Emberleaf grows in the grove and nowhere else, which gives Wrackwood a
  // reason to be returned to once the ironbark has been cut.
  for (const [ex, ey] of [[18, 42], [22, 44], [26, 40], [28, 43]] as const) {
    map.setScenery(ex, ey, { kind: 'bush', blocks: false, resource: 'emberleaf' });
  }

  for (const t of GROVE_TREES) {
    map.setScenery(t.x, t.y, {
      kind: 'tree', blocks: true, variant: 1, resource: t.tree
    });
  }

  // Something has been living in here undisturbed -- but boars, which do not
  // start fights. The grove is a Woodcutting reward gated on Woodcutting, so
  // anything in it has to be a choice rather than a toll. Aggressive spawns
  // here killed a test woodcutter mid-chop, which is precisely the failure the
  // goblins in the Cut already taught.
  spawnCluster(map, 'boar', 24, 42, 28, 44, 3, rng);

  // The Drowned Interior. Flooded throughout except for the islands, and
  // walled on every side -- the only way in or out is the stair, which is the
  // point: a player cannot wander in early and a player cannot wander out
  // when they are three hitpoints from the surface.
  map.fillRect(2, 41, 16, 47, Terrain.Floodwater);
  for (const [dx, dy] of INTERIOR_DRY) map.setTerrain(dx, dy, Terrain.Stone);

  for (let y = 40; y <= 47; y++) {
    for (let x = 1; x <= 17; x++) {
      const edge = x === 1 || x === 17 || y === 40;
      if (edge && map.inBounds(x, y)) map.setScenery(x, y, { kind: 'rock', blocks: true });
      else if (y >= 41 && x >= 2 && x <= 16) map.scenery[map.idx(x, y)] = null;
    }
  }
  map.setScenery(INTERIOR_STAIR.x, INTERIOR_STAIR.y, { kind: 'descent', blocks: false });

  // The Sallows. Reached along the south road, then east through the reeds.
  map.fillRect(33, 40, 44, 46, Terrain.Dirt);
  for (const [px, py] of SALLOW_POOLS) map.setTerrain(px, py, Terrain.Water);

  // Reed wall around it, with one gap. The pools inside are not scenery -- they
  // are terrain, so the fen has to be picked across rather than walked through,
  // which is the traversal the Sunken Road will ask for in earnest.
  for (let y = 39; y <= 47; y++) {
    for (let x = 32; x <= 45; x++) {
      const edge = x === 32 || x === 45 || y === 39 || y === 47;
      if (!edge) continue;
      if (x === SALLOWS_ENTRANCE.x && y === SALLOWS_ENTRANCE.y) continue;
      if (map.inBounds(x, y)) map.setScenery(x, y, { kind: 'thicket', blocks: true });
    }
  }
  map.setScenery(SALLOWS_ENTRANCE.x, SALLOWS_ENTRANCE.y, { kind: 'thicket', blocks: true });

  // The causeway east. Laid after the reed wall so it cuts through it, and the
  // wall tile it passes through is put back as thicket -- that is the gate the
  // quest opens, and until then the road is visible and unreachable.
  for (const [rx, ry] of SUNKEN_ROAD) map.setTerrain(rx, ry, Terrain.Floodwater);
  map.setScenery(ROAD_ENTRANCE.x, ROAD_ENTRANCE.y, { kind: 'thicket', blocks: true });
  map.setScenery(ROAD_DESCENT.x, ROAD_DESCENT.y, { kind: 'descent', blocks: false });

  // Somebody put the ledger pages where nothing rots. The box does not block:
  // the pool under it already does, and it has to stay clickable from the bank.
  map.setScenery(36, 43, { kind: 'stone_box', blocks: false });

  // Saltwort, deeper in and only here. It is what quest 18 is about and what
  // makes the Drowned Interior survivable, so it is worth the walk.
  for (const [sx, sy] of [[39, 45], [43, 42], [35, 46], [41, 43]] as const) {
    map.setScenery(sx, sy, { kind: 'bush', blocks: false, resource: 'saltwort' });
  }

  // Marshroot likes the wet. A reason to come back that is not the quest.
  for (const [bx, by] of [[34, 41], [38, 43], [42, 41], [37, 46]] as const) {
    map.setScenery(bx, by, { kind: 'bush', blocks: false, resource: 'marshroot' });
  }

  // The village well. Placed after the scatter pass, and its surroundings
  // cleared, because a tree dropped against it would leave the one thing a
  // quest sends you to look at awkward to walk up to.
  for (let y = 26; y <= 28; y++) {
    for (let x = 20; x <= 22; x++) map.scenery[map.idx(x, y)] = null;
  }
  map.setTerrain(21, 27, Terrain.Stone);
  map.setScenery(21, 27, { kind: 'well', blocks: true });

  // Persistent spawn points: each becomes one NPC that respawns at this exact
  // tile after its timer, exactly like RuneScape.
  spawnCluster(map, 'chicken', 6, 6, 13, 12, 7, rng);
  spawnCluster(map, 'cow', 31, 6, 39, 13, 5, rng);
  spawnCluster(map, 'goblin', 6, 31, 14, 39, 6, rng);
  spawnCluster(map, 'guard', 32, 32, 38, 38, 3, rng);
  spawnCluster(map, 'rat', 15, 26, 21, 31, 3, rng);
  spawnCluster(map, 'rat', 26, 28, 32, 34, 3, rng);

  // Quest givers stand on fixed tiles rather than being scattered, because a
  // player has to be able to find them again. Maren sits on the crossroads
  // where you spawn; the other two stand at the places their quests are about.
  for (const q of QUEST_GIVERS) {
    // Clear whatever the scatter pass left here; a quest giver standing inside
    // a tree is unreachable, and these tiles are not negotiable.
    map.scenery[map.idx(q.x, q.y)] = null;
    map.spawns.push({ npcId: q.npcId, x: q.x, y: q.y });
  }

  return map;
}
