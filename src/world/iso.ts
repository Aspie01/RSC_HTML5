// Isometric projection maths.
//
// The whole game THINKS in tile coordinates on a square grid -- pathfinding,
// combat range, collision. Only the renderer cares that we draw it at an angle.
// Keep it that way: if gameplay code starts doing screen-space maths, the
// design has sprung a leak.
//
// Standard 2:1 isometric diamond, 64x32 pixels:
//
//        (0,0)
//       /     \
//   (0,1)     (1,0)
//       \     /
//        (1,1)

import type { Point } from '../types.ts';

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/** Tile space -> world pixel space, before the camera offset is applied. */
export function toScreen(tx: number, ty: number): Point {
  return {
    x: (tx - ty) * HALF_W,
    y: (tx + ty) * HALF_H
  };
}

/**
 * World pixel space -> fractional tile space.
 *
 * IMPORTANT: integer results land on tile CENTRES, not corners, because
 * toScreen() returns the centre of the diamond. Tile (5,5) therefore covers the
 * fractional range 4.5 .. 5.5 on both axes.
 *
 * Do not floor this result to pick a tile -- use pickTile() below, or you will
 * select the tile half a step up and to the left of the one under the cursor.
 */
export function toTile(sx: number, sy: number): Point {
  const a = sx / HALF_W;
  const b = sy / HALF_H;
  return {
    x: (a + b) / 2,
    y: (b - a) / 2
  };
}

/**
 * World pixel space -> the integer tile whose diamond contains the point.
 *
 * Rounding (not flooring) is what makes this the true inverse of toScreen():
 * the four half-tile offsets (+-0.5, +-0.5) map exactly onto the diamond's
 * top/right/bottom/left vertices, which are the same four points the renderer
 * draws. Round therefore selects precisely the diamond that was drawn.
 */
export function pickTile(sx: number, sy: number): Point {
  const t = toTile(sx, sy);
  return { x: Math.round(t.x), y: Math.round(t.y) };
}

/** Painter's-algorithm sort key. Larger = drawn later = appears in front. */
export function depth(tx: number, ty: number): number {
  return tx + ty;
}
