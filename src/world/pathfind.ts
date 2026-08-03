// Breadth-first pathfinding on the tile grid.
//
// RuneScape's own pathfinder is BFS with a bounded search area, not A*, and BFS
// is the right call here: the map is small and movement cost is uniform, so BFS
// gives the shortest path with far less code. Reach for A* only if profiling
// says you need it.
//
// Diagonal movement is allowed, but only when BOTH adjacent cardinal tiles are
// walkable -- otherwise entities clip through the corners of walls.

import type { Tile } from '../types';
import type { GameMap } from './map';

/** Cardinals first, so ties resolve to straight lines. Looks better. */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1]
];

/**
 * Tiles that are walkable terrain but currently have somebody standing on them.
 *
 * The map cannot answer this: it describes where a wall is, not where a person
 * is. Passing it in keeps the pathfinder ignorant of mobs while still letting
 * callers route around them.
 */
export type Occupied = (x: number, y: number) => boolean;

/**
 * Shortest path from start to goal, EXCLUDING the start tile.
 * Returns [] if unreachable. `maxNodes` bounds the search so that clicking an
 * unreachable island cannot stall the tick.
 *
 * `occupied` is advisory: a tile someone is standing on is avoided if there is
 * any other way round, because a stationary NPC would otherwise stall anyone
 * whose route crosses them. It is not treated as a wall -- see findAvoiding.
 */
export function find(
  map: GameMap,
  startX: number, startY: number,
  goalX: number, goalY: number,
  maxNodes = 4096,
  occupied?: Occupied
): Tile[] {
  if (startX === goalX && startY === goalY) return [];
  if (!map.inBounds(goalX, goalY)) return [];

  const w = map.width;
  const cameFrom = new Int32Array(w * map.height).fill(-1);
  const startIdx = startY * w + startX;
  const goalIdx = goalY * w + goalX;

  cameFrom[startIdx] = startIdx;

  const queue: number[] = [startIdx];
  let head = 0;
  let visited = 0;
  let found = false;

  while (head < queue.length && visited < maxNodes) {
    const cur = queue[head++]!;
    visited++;

    if (cur === goalIdx) { found = true; break; }

    const cx = cur % w;
    const cy = (cur - cx) / w;

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;

      if (!map.inBounds(nx, ny)) continue;
      if (!map.isWalkable(nx, ny)) continue;

      // Somebody is standing here. Route around them -- but never around the
      // goal itself, or walking up to a person would become impossible the
      // moment you tried it.
      if (occupied && (nx !== goalX || ny !== goalY) && occupied(nx, ny)) continue;

      // Corner-cutting guard for diagonals.
      if (dx !== 0 && dy !== 0) {
        if (!map.isWalkable(cx + dx, cy)) continue;
        if (!map.isWalkable(cx, cy + dy)) continue;
      }

      const nIdx = ny * w + nx;
      if (cameFrom[nIdx] !== -1) continue;

      cameFrom[nIdx] = cur;
      queue.push(nIdx);
    }
  }

  if (!found) return [];

  // Walk the parent chain back, then reverse.
  const path: Tile[] = [];
  let node = goalIdx;
  while (node !== startIdx) {
    const px = node % w;
    path.push({ x: px, y: (node - px) / w });
    node = cameFrom[node]!;
  }
  path.reverse();
  return path;
}

/**
 * Path to a tile ADJACENT to the goal rather than onto it -- what you want when
 * walking up to an NPC or an object you cannot stand on.
 */
export function findAdjacent(
  map: GameMap,
  startX: number, startY: number,
  goalX: number, goalY: number,
  occupied?: Occupied
): Tile[] {
  let best: Tile[] | null = null;
  let bestLen = Infinity;

  for (const [dx, dy] of DIRS) {
    const ax = goalX + dx;
    const ay = goalY + dy;

    if (!map.inBounds(ax, ay) || !map.isWalkable(ax, ay)) continue;
    if (ax === startX && ay === startY) return []; // already adjacent
    // Standing room only: no use routing to a tile somebody else is on.
    if (occupied && occupied(ax, ay)) continue;

    const p = find(map, startX, startY, ax, ay, 4096, occupied);
    if (p.length && p.length < bestLen) {
      bestLen = p.length;
      best = p;
    }
  }

  return best ?? [];
}

/**
 * Route around whoever is standing about, falling back to ignoring them.
 *
 * The fallback matters: if the only way through is past a person, a path that
 * goes through them and waits is better than no path at all. What must never
 * happen is the third case -- a path that exists, cannot be walked, and is
 * never reconsidered, which is what a stationary NPC used to cause.
 */
export function findAvoiding(
  map: GameMap,
  startX: number, startY: number,
  goalX: number, goalY: number,
  occupied: Occupied,
  adjacent: boolean
): Tile[] {
  const around = adjacent
    ? findAdjacent(map, startX, startY, goalX, goalY, occupied)
    : find(map, startX, startY, goalX, goalY, 4096, occupied);

  if (around.length) return around;

  return adjacent
    ? findAdjacent(map, startX, startY, goalX, goalY)
    : find(map, startX, startY, goalX, goalY);
}
