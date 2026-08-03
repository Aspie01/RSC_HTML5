// Procedural placeholder art.
//
// Everything here is drawn with canvas primitives -- no image files, nothing to
// load, nothing to go missing. That is deliberate: it lets you build and test
// every gameplay system before committing to an art style. When you have real
// sprites, replace these function bodies and nothing else changes.
//
// Three tricks make flat shapes read as 3D:
//   1. an elliptical ground shadow under everything
//   2. a darker shaded side beneath the main body colour
//   3. a hard dark outline, as in early RuneScape's low-poly models

import type { Facing } from '../entities/mob';
import type { ItemDef } from '../types';
import { clamp } from '../core/util';

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amount, 0, 255);
  const g = clamp(((n >> 8) & 255) + amount, 0, 255);
  const b = clamp((n & 255) + amount, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// --------------------------------------------------------------------------
// Scenery
// --------------------------------------------------------------------------
export function tree(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  variant = 0,
  colour?: string,
  scale = 1
): void {
  shadow(ctx, x, y, 20 * scale, 9 * scale);

  ctx.fillStyle = '#5a4028';
  ctx.strokeStyle = '#33230f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 5 * scale, y);
  ctx.lineTo(x - 3 * scale, y - 34 * scale);
  ctx.lineTo(x + 3 * scale, y - 34 * scale);
  ctx.lineTo(x + 5 * scale, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Canopy: overlapping blobs, darkest at the bottom.
  const base = colour ?? (variant === 0 ? '#2f5c2a' : '#3a6b30');
  const blobs = [
    { dx: 0, dy: -44, r: 22, c: shade(base, -18) },
    { dx: -12, dy: -52, r: 17, c: base },
    { dx: 12, dy: -54, r: 16, c: shade(base, 14) },
    { dx: 0, dy: -62, r: 15, c: shade(base, 26) }
  ];

  ctx.strokeStyle = 'rgba(20,35,18,0.9)';
  for (const b of blobs) {
    ctx.fillStyle = b.c;
    ctx.beginPath();
    ctx.arc(x + b.dx * scale, y + b.dy * scale, b.r * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** What is left after a tree is chopped, until it regrows. */
export function stump(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  shadow(ctx, x, y, 13, 6);

  ctx.fillStyle = '#5a4028';
  ctx.strokeStyle = '#33230f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x - 7, y - 10);
  ctx.lineTo(x + 7, y - 10);
  ctx.lineTo(x + 8, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cut face with rings.
  ctx.fillStyle = '#8a6844';
  ctx.beginPath();
  ctx.ellipse(x, y - 10, 7.5, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(70,45,20,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(x, y - 10, 4, 1.7, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** A lit fire. `t` is elapsed milliseconds, used to flicker the flames. */
export function fire(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, phase = 0): void {
  shadow(ctx, x, y, 15, 7);

  // Logs at the base.
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 2); ctx.lineTo(x + 9, y - 5);
  ctx.moveTo(x - 9, y - 5); ctx.lineTo(x + 9, y - 2);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Three nested flames, each flickering at its own rate.
  const flames = [
    { h: 30, w: 11, c: '#e2521c', speed: 0.009 },
    { h: 22, w: 8, c: '#f2913a', speed: 0.013 },
    { h: 13, w: 5, c: '#ffd766', speed: 0.017 }
  ];

  for (const f of flames) {
    const flicker = 1 + Math.sin(t * f.speed + phase) * 0.12;
    const h = f.h * flicker;

    ctx.fillStyle = f.c;
    ctx.beginPath();
    ctx.moveTo(x, y - 4 - h);
    ctx.quadraticCurveTo(x + f.w, y - 4 - h * 0.45, x + f.w * 0.55, y - 4);
    ctx.lineTo(x - f.w * 0.55, y - 4);
    ctx.quadraticCurveTo(x - f.w, y - 4 - h * 0.45, x, y - 4 - h);
    ctx.closePath();
    ctx.fill();
  }

  // Warm glow on the ground.
  ctx.save();
  ctx.globalAlpha = 0.18 + Math.sin(t * 0.006 + phase) * 0.04;
  ctx.fillStyle = '#ff9a3c';
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 30, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A boulder. Pass `ore` to salt it with coloured flecks, which is the only
 * thing distinguishing a copper vein from a coal one at this zoom level.
 */
export function rock(ctx: CanvasRenderingContext2D, x: number, y: number, ore?: string): void {
  shadow(ctx, x, y, 16, 7);

  ctx.fillStyle = '#7c7c7c';
  ctx.strokeStyle = '#3f3f3f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 15, y + 2);
  ctx.lineTo(x - 10, y - 14);
  ctx.lineTo(x + 2, y - 19);
  ctx.lineTo(x + 13, y - 10);
  ctx.lineTo(x + 15, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#9a9a9a';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 12);
  ctx.lineTo(x + 1, y - 16);
  ctx.lineTo(x + 4, y - 8);
  ctx.closePath();
  ctx.fill();

  if (!ore) return;

  // Fixed fleck positions: a random scatter would crawl every frame, since
  // scenery is redrawn from scratch rather than cached.
  const flecks = [
    { dx: -9, dy: -6, r: 2.6 },
    { dx: -2, dy: -11, r: 3.1 },
    { dx: 6, dy: -13, r: 2.3 },
    { dx: 8, dy: -4, r: 2.8 },
    { dx: 0, dy: -2, r: 2.1 }
  ];

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.8;
  for (const f of flecks) {
    ctx.fillStyle = ore;
    ctx.beginPath();
    ctx.arc(x + f.dx, y + f.dy, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = shade(ore, 40);
    ctx.beginPath();
    ctx.arc(x + f.dx - f.r * 0.3, y + f.dy - f.r * 0.35, f.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** What is left after a vein is mined out, until the ore reforms. */
export function minedRock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  shadow(ctx, x, y, 13, 6);

  ctx.fillStyle = '#5f5f5f';
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 12, y + 2);
  ctx.lineTo(x - 8, y - 7);
  ctx.lineTo(x + 3, y - 9);
  ctx.lineTo(x + 11, y - 4);
  ctx.lineTo(x + 12, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rubble where the ore came out.
  ctx.fillStyle = '#4a4a4a';
  ctx.beginPath();
  ctx.ellipse(x - 1, y - 5, 5, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The smelting furnace: a stone stack with a glowing mouth. */
export function furnace(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  shadow(ctx, x, y, 21, 9);

  ctx.fillStyle = '#6e6357';
  ctx.strokeStyle = '#3a332b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 18, y + 2);
  ctx.lineTo(x - 15, y - 30);
  ctx.lineTo(x + 15, y - 30);
  ctx.lineTo(x + 18, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Chimney.
  ctx.fillStyle = '#5d5349';
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 30);
  ctx.lineTo(x - 7, y - 44);
  ctx.lineTo(x + 7, y - 44);
  ctx.lineTo(x + 9, y - 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Lit mouth.
  ctx.fillStyle = '#1c1410';
  ctx.beginPath();
  ctx.roundRect(x - 9, y - 20, 18, 15, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#e2521c';
  ctx.beginPath();
  ctx.roundRect(x - 7, y - 15, 14, 9, 2);
  ctx.fill();

  ctx.fillStyle = '#ffd766';
  ctx.beginPath();
  ctx.ellipse(x, y - 9, 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The smithing anvil: a block on a stump. */
export function anvil(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  shadow(ctx, x, y, 16, 7);

  ctx.fillStyle = '#5a4028';
  ctx.strokeStyle = '#2e2620';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - 8, y - 12, 16, 12, 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#55555c';
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 14);
  ctx.lineTo(x - 5, y - 20);
  ctx.lineTo(x + 5, y - 20);
  ctx.lineTo(x + 7, y - 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Face, with the horn sticking out to the east.
  ctx.fillStyle = '#6d6d76';
  ctx.beginPath();
  ctx.moveTo(x - 12, y - 26);
  ctx.lineTo(x + 10, y - 26);
  ctx.lineTo(x + 17, y - 23);
  ctx.lineTo(x + 10, y - 20);
  ctx.lineTo(x - 12, y - 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.roundRect(x - 11, y - 25.5, 20, 2, 1);
  ctx.fill();
}

export function bush(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  shadow(ctx, x, y, 13, 6);

  ctx.fillStyle = '#3d6b33';
  ctx.strokeStyle = '#24421d';
  ctx.lineWidth = 1.2;

  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x - 7 + i * 7, y - 7 - (i === 1 ? 4 : 0), 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export function fence(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 16, y - 2); ctx.lineTo(x - 16, y - 20);
  ctx.moveTo(x + 16, y - 2); ctx.lineTo(x + 16, y - 20);
  ctx.stroke();

  ctx.strokeStyle = '#6b4d2e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 18, y - 10); ctx.lineTo(x + 18, y - 10);
  ctx.moveTo(x - 18, y - 18); ctx.lineTo(x + 18, y - 18);
  ctx.stroke();
}

/**
 * Lookup for the renderer's scenery pass. Trees and rocks are deliberately
 * absent: they take extra arguments (resource tint, scale, depleted state) and
 * are drawn by dedicated branches, so this table can stay uniformly
 * (ctx, x, y).
 */
/**
 * A fishing spot: expanding rings on the water, with the odd fin breaking the
 * surface. There is no object to draw here -- the tile is water and the shoal
 * is invisible -- so the motion IS the sprite. Pass `time = 0` for a spent
 * spot and the rings freeze, which is how a player reads it as empty.
 */
export function fishingSpot(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  time: number, colour = '#6f97b5'
): void {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;

  if (time === 0) {
    // Still water: one flat ring, so the spot stays clickable but reads as dead.
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Three rings, offset in phase, each fading as it grows.
  for (let i = 0; i < 3; i++) {
    const t = ((time * 0.0007) + i / 3) % 1;
    ctx.globalAlpha = 0.55 * (1 - t);
    const rx = 3 + t * 11;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, rx, rx * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // A fin surfacing on a slow cycle. Render-only jitter -- nothing in the
  // simulation can see this, so Math.random() is fine here.
  const fin = Math.sin(time * 0.0012);
  if (fin > 0.86) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 3);
    ctx.lineTo(x + 6, y - 8);
    ctx.lineTo(x + 8, y - 3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/** A low stone ring with a roof on two posts. */
export function well(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  shadow(ctx, x, y, 15, 7);

  // Stone ring.
  ctx.fillStyle = '#7d7776';
  ctx.strokeStyle = '#4a4640';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 13, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // The dark of the shaft, which is the whole point of the object.
  ctx.fillStyle = '#14100c';
  ctx.beginPath();
  ctx.ellipse(x, y - 5, 9, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Posts and roof.
  ctx.strokeStyle = '#5a4028';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 7); ctx.lineTo(x - 10, y - 24);
  ctx.moveTo(x + 10, y - 7); ctx.lineTo(x + 10, y - 24);
  ctx.stroke();

  ctx.fillStyle = '#6b4a24';
  ctx.strokeStyle = '#3d2a14';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 23);
  ctx.lineTo(x, y - 32);
  ctx.lineTo(x + 14, y - 23);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** A heap of broken stone filling a gap. Reads as "was a way through". */
export function rubble(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  shadow(ctx, x, y, 16, 7);

  const lumps: ReadonlyArray<readonly [number, number, number]> = [
    [-9, -3, 7], [0, -7, 9], [9, -3, 7], [-4, 1, 6], [5, 1, 6]
  ];

  ctx.strokeStyle = '#2f2b26';
  ctx.lineWidth = 1.5;
  for (const [dx, dy, r] of lumps) {
    ctx.fillStyle = dy < -5 ? '#6d675f' : '#57524b';
    ctx.beginPath();
    ctx.ellipse(x + dx, y + dy, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** A low drift of sand. Flattens once picked over, so a spent bank reads as spent. */
export function sandBank(
  ctx: CanvasRenderingContext2D, x: number, y: number, spent: boolean
): void {
  const h = spent ? 3 : 7;
  ctx.fillStyle = spent ? '#b3a071' : '#d8c48b';
  ctx.strokeStyle = '#8b7a54';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.ellipse(x, y - h * 0.4, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (!spent) {
    ctx.fillStyle = '#e6d4a2';
    ctx.beginPath();
    ctx.ellipse(x - 2, y - h * 0.9, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Dense, thorny undergrowth. Taller and darker than a bush, and impassable. */
export function thicket(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  shadow(ctx, x, y, 15, 7);

  const clumps: ReadonlyArray<readonly [number, number, number, string]> = [
    [-8, -6, 9, '#243b1e'], [8, -6, 9, '#243b1e'],
    [0, -13, 11, '#2f4a26'], [-4, -3, 8, '#1d3018'], [5, -3, 8, '#1d3018']
  ];

  ctx.strokeStyle = '#14210f';
  ctx.lineWidth = 1.5;
  for (const [dx, dy, r, fill] of clumps) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x + dx, y + dy, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // A few thorns, so it reads as hostile rather than merely leafy.
  ctx.strokeStyle = '#5c6b3a';
  ctx.lineWidth = 1;
  for (const [dx, dy] of [[-10, -14], [-2, -20], [7, -15], [12, -8]] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx + 3, y + dy - 4);
    ctx.stroke();
  }
}

export const scenerySprites = {
  bush, fence, furnace, anvil, well, rubble, thicket
} as const;

// --------------------------------------------------------------------------
// Creatures
// --------------------------------------------------------------------------
export interface MobDrawOpts {
  colour: string;
  accent: string;
  size: number;
  facing: Facing;
  moving: boolean;
  /** Walk-cycle phase, used to bounce the body while moving. */
  bob: number;
  swinging: boolean;
}

const FACE_DX: readonly number[] = [0, 0.6, 1, 0.6, 0, -0.6, -1, -0.6];

export function mob(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  opts: MobDrawOpts
): void {
  const size = opts.size;
  const bob = opts.moving ? Math.sin(opts.bob * Math.PI * 2) * 2 : 0;

  const bodyW = 11 * size;
  const bodyH = 18 * size;
  const headR = 6.5 * size;

  shadow(ctx, x, y, 13 * size, 6 * size);

  const topY = y - bodyH + bob;

  ctx.fillStyle = opts.colour;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - bodyW / 2, y);
  ctx.lineTo(x - bodyW / 2 - 1, topY + 4);
  ctx.quadraticCurveTo(x, topY - 2, x + bodyW / 2 + 1, topY + 4);
  ctx.lineTo(x + bodyW / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shaded left side, for volume.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(x - bodyW / 2, y);
  ctx.lineTo(x - bodyW / 2 - 1, topY + 4);
  ctx.quadraticCurveTo(x - bodyW / 4, topY, x - bodyW / 6, topY + 2);
  ctx.lineTo(x - bodyW / 6, y);
  ctx.closePath();
  ctx.fill();

  const headY = topY - headR + 1;
  ctx.fillStyle = opts.accent;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath();
  ctx.arc(x, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes offset by facing, so it reads as looking somewhere.
  const faceDx = FACE_DX[opts.facing] ?? 0;
  const eyeOff = 2.4 * size;
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(x + faceDx * 2 - eyeOff, headY - 0.5, 1.1 * size, 0, Math.PI * 2);
  ctx.arc(x + faceDx * 2 + eyeOff, headY - 0.5, 1.1 * size, 0, Math.PI * 2);
  ctx.fill();

  // Weapon stub while attacking, so swings are legible.
  if (opts.swinging) {
    ctx.strokeStyle = '#d8d8dd';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x + bodyW / 2, y - bodyH * 0.6);
    ctx.lineTo(x + bodyW / 2 + 12 * size, y - bodyH * 0.95);
    ctx.stroke();
  }
}

// --------------------------------------------------------------------------
// Item icons -- shared by ground drops and the inventory grid.
// --------------------------------------------------------------------------
export function item(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  s: number,
  def: ItemDef
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.fillStyle = def.colour;

  switch (def.shape) {
    case 'coin':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-3 + i * 3, 3 - i * 3, s * 0.32, s * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;

    case 'bone':
      ctx.beginPath();
      ctx.moveTo(-s * 0.32, s * 0.28);
      ctx.lineTo(s * 0.28, -s * 0.24);
      ctx.lineWidth = s * 0.16;
      ctx.strokeStyle = def.colour;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-s * 0.34, s * 0.3, s * 0.13, 0, Math.PI * 2);
      ctx.arc(s * 0.3, -s * 0.26, s * 0.13, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'feather':
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.14, s * 0.36, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    case 'meat':
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.34, s * 0.25, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-s * 0.1, -s * 0.07, s * 0.1, s * 0.06, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;

    // Body plus a triangular tail. The eye is what stops it reading as a leaf.
    case 'fish':
      ctx.beginPath();
      ctx.ellipse(s * 0.04, 0, s * 0.28, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, 0);
      ctx.lineTo(-s * 0.36, -s * 0.16);
      ctx.lineTo(-s * 0.36, s * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.arc(s * 0.18, -s * 0.03, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
      break;

    // Stave and string. The gap between them is what reads as "bow" at 34px.
    case 'bow':
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(s * 0.1, 0, s * 0.32, Math.PI * 0.62, Math.PI * 1.38);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(240,236,220,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s * 0.09, -s * 0.3);
      ctx.lineTo(-s * 0.09, s * 0.3);
      ctx.stroke();
      break;

    case 'arrow':
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, s * 0.26);
      ctx.lineTo(s * 0.2, -s * 0.2);
      ctx.stroke();
      // Head.
      ctx.beginPath();
      ctx.moveTo(s * 0.3, -s * 0.3);
      ctx.lineTo(s * 0.12, -s * 0.24);
      ctx.lineTo(s * 0.24, -s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Fletching.
      ctx.strokeStyle = 'rgba(240,236,220,0.8)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, s * 0.26);
      ctx.lineTo(-s * 0.12, s * 0.28);
      ctx.moveTo(-s * 0.28, s * 0.26);
      ctx.lineTo(-s * 0.3, s * 0.1);
      ctx.stroke();
      break;

    case 'vial':
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, -s * 0.3);
      ctx.lineTo(-s * 0.12, -s * 0.12);
      ctx.lineTo(-s * 0.2, s * 0.1);
      ctx.lineTo(-s * 0.2, s * 0.28);
      ctx.lineTo(s * 0.2, s * 0.28);
      ctx.lineTo(s * 0.2, s * 0.1);
      ctx.lineTo(s * 0.12, -s * 0.12);
      ctx.lineTo(s * 0.12, -s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Stopper.
      ctx.fillStyle = '#8a6a3a';
      ctx.fillRect(-s * 0.15, -s * 0.36, s * 0.3, s * 0.09);
      break;

    case 'blade':
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, s * 0.3);
      ctx.lineTo(s * 0.26, -s * 0.32);
      ctx.lineTo(s * 0.34, -s * 0.2);
      ctx.lineTo(-s * 0.18, s * 0.36);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#4a3520';
      ctx.lineWidth = s * 0.1;
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, s * 0.33);
      ctx.lineTo(-s * 0.36, s * 0.42);
      ctx.stroke();
      break;

    case 'shield':
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.34);
      ctx.lineTo(s * 0.26, -s * 0.18);
      ctx.lineTo(s * 0.2, s * 0.22);
      ctx.lineTo(0, s * 0.36);
      ctx.lineTo(-s * 0.2, s * 0.22);
      ctx.lineTo(-s * 0.26, -s * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'plate':
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.22);
      ctx.lineTo(-s * 0.14, -s * 0.3);
      ctx.lineTo(s * 0.14, -s * 0.3);
      ctx.lineTo(s * 0.3, -s * 0.22);
      ctx.lineTo(s * 0.22, s * 0.3);
      ctx.lineTo(-s * 0.22, s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'log': {
      // Three stacked logs, end-on, so they read at inventory size.
      const positions = [[-s * 0.1, s * 0.12], [s * 0.12, s * 0.04], [0, -s * 0.14]];
      for (const [lx, ly] of positions) {
        ctx.fillStyle = def.colour;
        ctx.beginPath();
        ctx.ellipse(lx!, ly!, s * 0.22, s * 0.11, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = shade(def.colour, 34);
        ctx.beginPath();
        ctx.ellipse(lx! + s * 0.16, ly! - s * 0.06, s * 0.07, s * 0.055, 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'axe':
      // Handle
      ctx.strokeStyle = '#5a4028';
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, s * 0.36);
      ctx.lineTo(s * 0.1, -s * 0.24);
      ctx.stroke();
      // Head
      ctx.fillStyle = def.colour;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s * 0.02, -s * 0.18);
      ctx.lineTo(s * 0.3, -s * 0.34);
      ctx.lineTo(s * 0.36, -s * 0.1);
      ctx.lineTo(s * 0.14, -s * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'tinderbox':
      ctx.fillStyle = def.colour;
      ctx.beginPath();
      ctx.roundRect(-s * 0.24, -s * 0.16, s * 0.48, s * 0.32, s * 0.05);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, -s * 0.02);
      ctx.lineTo(s * 0.24, -s * 0.02);
      ctx.stroke();
      // Spark
      ctx.fillStyle = '#ffd766';
      ctx.beginPath();
      ctx.arc(s * 0.18, -s * 0.22, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'ore': {
      // Grey stone with coloured ore showing through, matching the vein art.
      ctx.fillStyle = '#7c7c7c';
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, s * 0.18);
      ctx.lineTo(-s * 0.2, -s * 0.24);
      ctx.lineTo(s * 0.12, -s * 0.3);
      ctx.lineTo(s * 0.3, -s * 0.02);
      ctx.lineTo(s * 0.18, s * 0.24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const spots = [[-s * 0.1, -s * 0.06], [s * 0.11, -s * 0.14], [s * 0.06, s * 0.1]];
      for (const [ox, oy] of spots) {
        ctx.fillStyle = def.colour;
        ctx.beginPath();
        ctx.arc(ox!, oy!, s * 0.075, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'bar':
      // An ingot drawn as a shallow prism: top face, then the front edge.
      ctx.fillStyle = shade(def.colour, 26);
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, -s * 0.1);
      ctx.lineTo(s * 0.08, -s * 0.22);
      ctx.lineTo(s * 0.3, -s * 0.06);
      ctx.lineTo(-s * 0.02, s * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = shade(def.colour, -28);
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, -s * 0.1);
      ctx.lineTo(-s * 0.02, s * 0.06);
      ctx.lineTo(-s * 0.02, s * 0.2);
      ctx.lineTo(-s * 0.24, s * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = def.colour;
      ctx.beginPath();
      ctx.moveTo(-s * 0.02, s * 0.06);
      ctx.lineTo(s * 0.3, -s * 0.06);
      ctx.lineTo(s * 0.3, s * 0.08);
      ctx.lineTo(-s * 0.02, s * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'pickaxe':
      ctx.strokeStyle = '#5a4028';
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, s * 0.36);
      ctx.lineTo(s * 0.14, -s * 0.26);
      ctx.stroke();

      ctx.strokeStyle = def.colour;
      ctx.lineWidth = s * 0.11;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.16, -s * 0.14);
      ctx.quadraticCurveTo(s * 0.12, -s * 0.4, s * 0.36, -s * 0.16);
      ctx.stroke();
      ctx.lineCap = 'butt';
      break;

    case 'hammer':
      ctx.strokeStyle = '#5a4028';
      ctx.lineWidth = s * 0.1;
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, s * 0.34);
      ctx.lineTo(s * 0.1, -s * 0.12);
      ctx.stroke();

      ctx.fillStyle = def.colour;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1.2;
      ctx.save();
      ctx.translate(s * 0.14, -s * 0.2);
      ctx.rotate(-1.03);
      ctx.beginPath();
      ctx.roundRect(-s * 0.09, -s * 0.22, s * 0.18, s * 0.44, s * 0.04);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;

    case 'helm':
      // Dome with a nose guard.
      ctx.beginPath();
      ctx.arc(0, s * 0.04, s * 0.3, Math.PI, 0);
      ctx.lineTo(s * 0.3, s * 0.16);
      ctx.lineTo(-s * 0.3, s * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = shade(def.colour, -40);
      ctx.beginPath();
      ctx.roundRect(-s * 0.05, s * 0.02, s * 0.1, s * 0.26, s * 0.03);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = shade(def.colour, 40);
      ctx.beginPath();
      ctx.ellipse(-s * 0.11, -s * 0.1, s * 0.07, s * 0.05, -0.5, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'legs':
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, -s * 0.3);
      ctx.lineTo(s * 0.24, -s * 0.3);
      ctx.lineTo(s * 0.24, s * 0.34);
      ctx.lineTo(s * 0.06, s * 0.34);
      ctx.lineTo(s * 0.06, s * 0.02);
      ctx.lineTo(-s * 0.06, s * 0.02);
      ctx.lineTo(-s * 0.06, s * 0.34);
      ctx.lineTo(-s * 0.24, s * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = shade(def.colour, -34);
      ctx.beginPath();
      ctx.roundRect(-s * 0.26, -s * 0.32, s * 0.52, s * 0.1, s * 0.03);
      ctx.fill();
      ctx.stroke();
      break;

    case 'blob':
    default:
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.3, s * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
  }

  ctx.restore();
}
