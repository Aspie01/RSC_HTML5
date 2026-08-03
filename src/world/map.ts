// The world: a tile grid of terrain, blocking scenery, and NPC spawn points.
//
// Generated procedurally from a FIXED seed, so the world is identical on every
// load without hand-authoring 2,304 tiles. When you move to a real map editor
// (Tiled exports JSON), you replace generate() and nothing else -- the rest of
// the game only talks to inBounds / isWalkable / terrainAt.

export const enum Terrain {
  Grass = 0,
  GrassDark = 1,
  Dirt = 2,
  Path = 3,
  Water = 4,
  Sand = 5,
  Stone = 6
}

export interface TerrainInfo {
  readonly top: string;
  readonly side: string;
  readonly walk: boolean;
}

export type SceneryKind = 'tree' | 'rock' | 'bush' | 'fence' | 'furnace' | 'anvil';

export interface Scenery {
  readonly kind: SceneryKind;
  readonly blocks: boolean;
  readonly variant?: number;
  /**
   * Id into the matching table in data/resources.ts -- trees for `tree`, rocks
   * for `rock` -- when this scenery can be gathered from. Absent means purely
   * decorative, which is what separates an ore vein from a boulder.
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
  [Terrain.Stone]:     { top: '#8a8a8a', side: '#5e5e5e', walk: true }
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
  { x: 11, y: 14, rock: 'coal' },
  { x: 12, y: 16, rock: 'coal' },
  { x: 12, y: 18, rock: 'coal' },
  { x: 10, y: 20, rock: 'coal' }
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
        map.setScenery(x, y, { kind: 'bush', blocks: false });
      }
    }
  }

  // Landmark trees flanking the crossroads -- the first thing a new player
  // sees, so one of each type.
  map.setScenery(21, 21, { kind: 'tree', blocks: true, variant: 0, resource: 'tree' });
  map.setScenery(26, 26, { kind: 'tree', blocks: true, variant: 1, resource: 'oak' });

  // Persistent spawn points: each becomes one NPC that respawns at this exact
  // tile after its timer, exactly like RuneScape.
  spawnCluster(map, 'chicken', 6, 6, 13, 12, 7, rng);
  spawnCluster(map, 'cow', 31, 6, 39, 13, 5, rng);
  spawnCluster(map, 'goblin', 6, 31, 14, 39, 6, rng);
  spawnCluster(map, 'guard', 32, 32, 38, 38, 3, rng);
  spawnCluster(map, 'rat', 15, 26, 21, 31, 3, rng);
  spawnCluster(map, 'rat', 26, 28, 32, 34, 3, rng);

  return map;
}
