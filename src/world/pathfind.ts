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
 * Shortest path from start to goal, EXCLUDING the start tile.
 * Returns [] if unreachable. `maxNodes` bounds the search so that clicking an
 * unreachable island cannot stall the tick.
 */
export function find(
  map: GameMap,
  startX: number, startY: number,
  goalX: number, goalY: number,
  maxNodes = 4096
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
  goalX: number, goalY: number
): Tile[] {
  let best: Tile[] | null = null;
  let bestLen = Infinity;

  for (const [dx, dy] of DIRS) {
    const ax = goalX + dx;
    const ay = goalY + dy;

    if (!map.inBounds(ax, ay) || !map.isWalkable(ax, ay)) continue;
    if (ax === startX && ay === startY) return []; // already adjacent

    const p = find(map, startX, startY, ax, ay);
    if (p.length && p.length < bestLen) {
      bestLen = p.length;
      best = p;
    }
  }

  return best ?? [];
}
