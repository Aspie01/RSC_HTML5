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

export function rock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
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
 * Lookup for the renderer's scenery pass. Trees are deliberately absent: they
 * take extra arguments (resource tint, scale, stump state) and are drawn by a
 * dedicated branch, so this table can stay uniformly (ctx, x, y).
 */
export const scenerySprites = { rock, bush, fence } as const;

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
