// Isometric renderer.
//
// Three passes per frame:
//   1. TERRAIN -- flat diamonds in row order; they tile perfectly, so ordering
//                 between them does not matter.
//   2. OBJECTS -- scenery, mobs and ground items collected into one list and
//                 sorted by isometric depth (tx + ty). This is the painter's
//                 algorithm, and it is the only correct way to make a tree
//                 overlap a character standing behind it.
//   3. OVERLAY -- hitsplats, health bars, name tags. Always on top and never
//                 depth-sorted, because feedback must not be occluded.
//
// Entity positions are interpolated with the tick alpha, so movement is smooth
// even though the simulation only advances every 600ms.

import type { Point, World } from '../types';
import type { Mob } from '../entities/mob';
import type { GroundItem } from '../systems/ground';
import type { Fire } from '../systems/objects';
import type { Scenery } from '../world/map';
import * as iso from '../world/iso';
import * as sprites from '../render/sprites';
import { getItem } from '../data/items';
import { getTree, getRock } from '../data/resources';
import { lerp } from '../core/util';
import { loop } from '../core/loop';

type ClickMarkerType = 'move' | 'attack';

interface ClickMarker {
  x: number;
  y: number;
  life: number;
  type: ClickMarkerType;
}

interface Bounds {
  minX: number; maxX: number;
  minY: number; maxY: number;
}

type DrawEntry =
  | { depth: number; kind: 'scenery'; tx: number; ty: number; obj: Scenery }
  | { depth: number; kind: 'item'; item: GroundItem }
  | { depth: number; kind: 'fire'; fire: Fire }
  | { depth: number; kind: 'mob'; mob: Mob; pos: Point };

/** Interpolated tile position of a mob, in fractional tile units. */
function lerpPos(mob: Mob, alpha: number): Point {
  return {
    x: lerp(mob.prevX, mob.x, alpha),
    y: lerp(mob.prevY, mob.y, alpha)
  };
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly minimap: HTMLCanvasElement;
  private readonly mctx: CanvasRenderingContext2D;

  private camX = 0;
  private camY = 0;

  private viewW = 800;
  private viewH = 600;
  private mmW = 160;
  private mmH = 160;

  private time = 0;
  private visibleBounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  hoverTile: Point | null = null;
  hoverMob: Mob | null = null;
  private clickMarker: ClickMarker | null = null;

  constructor(canvas: HTMLCanvasElement, minimap: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    const mctx = minimap.getContext('2d');
    if (!ctx || !mctx) throw new Error('2D canvas context is unavailable.');

    this.canvas = canvas;
    this.ctx = ctx;
    this.minimap = minimap;
    this.mctx = mctx;

    this.resize();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;

    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.viewW = w;
    this.viewH = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const mw = this.minimap.clientWidth || 160;
    const mh = this.minimap.clientHeight || 160;
    this.minimap.width = Math.floor(mw * dpr);
    this.minimap.height = Math.floor(mh * dpr);
    this.mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.mmW = mw;
    this.mmH = mh;
  }

  worldToScreen(tx: number, ty: number): Point {
    const p = iso.toScreen(tx, ty);
    return {
      x: p.x - this.camX + this.viewW / 2,
      y: p.y - this.camY + this.viewH / 2
    };
  }

  screenToWorldTile(sx: number, sy: number): Point {
    const wx = sx - this.viewW / 2 + this.camX;
    const wy = sy - this.viewH / 2 + this.camY;
    return iso.pickTile(wx, wy);
  }

  /**
   * Canvas-space point -> viewport coordinates. Needed because the DOM context
   * menu is positioned in client space, but anything anchored to the world
   * (a furnace, an anvil) is only known in canvas space.
   */
  canvasToClient(p: Point): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top };
  }

  private centerOn(tx: number, ty: number): void {
    const p = iso.toScreen(tx, ty);
    this.camX = p.x;
    this.camY = p.y;
  }

  setClickMarker(tx: number, ty: number, type: ClickMarkerType = 'move'): void {
    this.clickMarker = { x: tx, y: ty, life: 1, type };
  }

  render(world: World, alpha: number, dt: number): void {
    this.time += dt;

    // The camera is rigidly locked to the player, as in RuneScape. Smoothing
    // here makes clicking feel imprecise.
    const pp = lerpPos(world.player, alpha);
    this.centerOn(pp.x, pp.y);

    this.ctx.fillStyle = '#0b0d0a';
    this.ctx.fillRect(0, 0, this.viewW, this.viewH);

    this.drawTerrain(world);
    this.drawClickMarker();
    this.drawObjects(world, alpha);
    this.drawOverlays(world, alpha);
    this.drawMinimap(world, alpha);
  }

  // ----------------------------------------------------------------------
  // Pass 1: terrain
  // ----------------------------------------------------------------------
  private drawTerrain(world: World): void {
    const ctx = this.ctx;
    const map = world.map;
    const margin = 3;

    // Cull by converting the screen corners into tile space.
    const corners = [
      this.screenToWorldTile(0, 0),
      this.screenToWorldTile(this.viewW, 0),
      this.screenToWorldTile(0, this.viewH),
      this.screenToWorldTile(this.viewW, this.viewH)
    ];

    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);

    const bounds: Bounds = {
      minX: Math.max(0, Math.min(...xs) - margin),
      maxX: Math.min(map.width - 1, Math.max(...xs) + margin),
      minY: Math.max(0, Math.min(...ys) - margin),
      maxY: Math.min(map.height - 1, Math.max(...ys) + margin)
    };
    this.visibleBounds = bounds;

    const { HALF_W: HW, HALF_H: HH } = iso;

    for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
      for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        const info = map.terrainInfo(tx, ty);
        const s = this.worldToScreen(tx, ty);

        let colour = info.top;
        if (!info.walk) {
          // Gentle animated shimmer on water.
          const wave = Math.sin(tx * 0.7 + ty * 0.5 + this.time * 0.0016) * 10;
          colour = sprites.shade(info.top, Math.round(wave));
        }

        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - HH);
        ctx.lineTo(s.x + HW, s.y);
        ctx.lineTo(s.x, s.y + HH);
        ctx.lineTo(s.x - HW, s.y);
        ctx.closePath();
        ctx.fill();

        // Hairline seam: grid definition without a debug-overlay look.
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    if (this.hoverTile && map.inBounds(this.hoverTile.x, this.hoverTile.y)) {
      const h = this.worldToScreen(this.hoverTile.x, this.hoverTile.y);
      ctx.strokeStyle = map.isWalkable(this.hoverTile.x, this.hoverTile.y)
        ? 'rgba(255,255,255,0.55)'
        : 'rgba(255,90,70,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y - HH);
      ctx.lineTo(h.x + HW, h.y);
      ctx.lineTo(h.x, h.y + HH);
      ctx.lineTo(h.x - HW, h.y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  /** RuneScape's yellow/red X. */
  private drawClickMarker(): void {
    const m = this.clickMarker;
    if (!m) return;

    m.life -= 0.045;
    if (m.life <= 0) { this.clickMarker = null; return; }

    const s = this.worldToScreen(m.x, m.y);
    const size = 5 + (1 - m.life) * 5;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = Math.min(1, m.life * 1.6);
    ctx.strokeStyle = m.type === 'attack' ? '#e03a2a' : '#f2d33c';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x - size, s.y - size * 0.6);
    ctx.lineTo(s.x + size, s.y + size * 0.6);
    ctx.moveTo(s.x + size, s.y - size * 0.6);
    ctx.lineTo(s.x - size, s.y + size * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  // ----------------------------------------------------------------------
  // Pass 2: depth-sorted objects
  // ----------------------------------------------------------------------
  private drawObjects(world: World, alpha: number): void {
    const ctx = this.ctx;
    const b = this.visibleBounds;
    const list: DrawEntry[] = [];

    for (let ty = b.minY; ty <= b.maxY; ty++) {
      for (let tx = b.minX; tx <= b.maxX; tx++) {
        const obj = world.map.sceneryAt(tx, ty);
        if (obj) list.push({ depth: iso.depth(tx, ty), kind: 'scenery', tx, ty, obj });
      }
    }

    for (const gi of world.ground.items) {
      if (gi.x < b.minX || gi.x > b.maxX || gi.y < b.minY || gi.y > b.maxY) continue;
      list.push({ depth: iso.depth(gi.x, gi.y) - 0.1, kind: 'item', item: gi });
    }

    for (const f of world.objects.fires) {
      if (f.x < b.minX || f.x > b.maxX || f.y < b.minY || f.y > b.maxY) continue;
      list.push({ depth: iso.depth(f.x, f.y), kind: 'fire', fire: f });
    }

    for (const mob of [world.player, ...world.npcs]) {
      if (mob.dead) continue;
      const pos = lerpPos(mob, alpha);
      if (pos.x < b.minX - 2 || pos.x > b.maxX + 2) continue;
      if (pos.y < b.minY - 2 || pos.y > b.maxY + 2) continue;
      list.push({ depth: iso.depth(pos.x, pos.y), kind: 'mob', mob, pos });
    }

    list.sort((a, c) => a.depth - c.depth);

    for (const e of list) {
      if (e.kind === 'scenery') {
        const s = this.worldToScreen(e.tx, e.ty);

        if (e.obj.kind === 'tree') {
          // A chopped tree shows a stump until its respawn timer elapses.
          if (world.objects.isDepleted(world.map.idx(e.tx, e.ty))) {
            sprites.stump(ctx, s.x, s.y);
          } else {
            const def = e.obj.resource ? getTree(e.obj.resource) : undefined;
            sprites.tree(ctx, s.x, s.y, e.obj.variant ?? 0, def?.colour, def?.scale ?? 1);
          }

        } else if (e.obj.kind === 'rock') {
          const def = e.obj.resource ? getRock(e.obj.resource) : undefined;
          if (def && world.objects.isDepleted(world.map.idx(e.tx, e.ty))) {
            sprites.minedRock(ctx, s.x, s.y);
          } else {
            sprites.rock(ctx, s.x, s.y, def?.colour);
          }

        } else {
          sprites.scenerySprites[e.obj.kind](ctx, s.x, s.y);
        }

      } else if (e.kind === 'fire') {
        const s = this.worldToScreen(e.fire.x, e.fire.y);
        sprites.fire(ctx, s.x, s.y, this.time, e.fire.phase);

      } else if (e.kind === 'item') {
        const def = getItem(e.item.id);
        if (!def) continue;
        const s = this.worldToScreen(e.item.x, e.item.y);
        ctx.save();
        // Blink out over the last 20 ticks before despawning.
        if (e.item.ticks < 20) {
          ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 0.01));
        }
        sprites.item(ctx, s.x + e.item.jitterX, s.y + e.item.jitterY - 4, 26, def);
        ctx.restore();

      } else {
        this.drawMob(e.mob, e.pos, alpha);
      }
    }
  }

  private drawMob(mob: Mob, pos: Point, alpha: number): void {
    const s = this.worldToScreen(pos.x, pos.y);
    const look = mob.appearance();

    sprites.mob(this.ctx, s.x, s.y, {
      colour: look.colour,
      accent: look.accent,
      size: look.size,
      facing: mob.facing,
      moving: mob.isMoving(),
      bob: (loop.tickCount + alpha) * 0.5,
      swinging: mob.target !== null && mob.attackCooldown >= mob.attackSpeed - 1
    });
  }

  // ----------------------------------------------------------------------
  // Pass 3: overlays
  // ----------------------------------------------------------------------
  private drawOverlays(world: World, alpha: number): void {
    const ctx = this.ctx;

    for (const mob of [world.player, ...world.npcs]) {
      if (mob.dead) continue;

      const pos = lerpPos(mob, alpha);
      const s = this.worldToScreen(pos.x, pos.y);
      const headY = s.y - 40 * mob.appearance().size;

      const isPlayer = mob === world.player;
      const showBar = mob.target !== null || mob.hp < mob.maxHp || mob.inCombatTicks < 12;

      if (showBar && !isPlayer) {
        const bw = 30;
        const bh = 4;
        ctx.fillStyle = '#7a1414';
        ctx.fillRect(s.x - bw / 2, headY - 6, bw, bh);
        ctx.fillStyle = '#31c04a';
        ctx.fillRect(s.x - bw / 2, headY - 6, bw * (mob.hp / mob.maxHp), bh);
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x - bw / 2 + 0.5, headY - 6 + 0.5, bw - 1, bh - 1);
      }

      if (this.hoverMob === mob) {
        ctx.font = '12px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(mob.displayName, s.x, headY - 12);
        ctx.fillStyle = '#f5e6a8';
        ctx.fillText(mob.displayName, s.x, headY - 12);
      }

      this.drawHitsplats(mob, s);
    }
  }

  private drawHitsplats(mob: Mob, s: Point): void {
    const ctx = this.ctx;

    for (let i = mob.hitsplats.length - 1; i >= 0; i--) {
      const h = mob.hitsplats[i]!;
      h.life -= 0.016;
      if (h.life <= 0) { mob.hitsplats.splice(i, 1); continue; }

      const rise = (1 - h.life) * 22;
      const x = s.x + (i - (mob.hitsplats.length - 1) / 2) * 22;
      const y = s.y - 30 - rise;

      ctx.save();
      ctx.globalAlpha = Math.min(1, h.life * 2.2);

      // RuneScape hitsplat: red for damage, blue for a zero.
      ctx.fillStyle = h.damage === 0 ? '#2c5f9e' : '#9e2020';
      ctx.beginPath();
      ctx.ellipse(x, y, 11, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(h.damage), x, y + 0.5);
      ctx.restore();
    }

    ctx.textBaseline = 'alphabetic';
  }

  // ----------------------------------------------------------------------
  // Minimap
  // ----------------------------------------------------------------------
  private drawMinimap(world: World, alpha: number): void {
    const ctx = this.mctx;
    const W = this.mmW;
    const H = this.mmH;
    const map = world.map;
    const scale = 2.2; // pixels per tile
    const span = W / scale;

    const p = lerpPos(world.player, alpha);
    const ox = p.x - span / 2;
    const oy = p.y - span / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // Circular mask, like RuneScape's minimap.
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 1, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const x0 = Math.max(0, Math.floor(ox));
    const y0 = Math.max(0, Math.floor(oy));
    const x1 = Math.min(map.width - 1, Math.ceil(ox + span));
    const y1 = Math.min(map.height - 1, Math.ceil(oy + span));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        ctx.fillStyle = map.terrainInfo(tx, ty).top;
        ctx.fillRect((tx - ox) * scale, (ty - oy) * scale, scale + 0.5, scale + 0.5);

        // Landmarks worth navigating by: trees, ore veins, and the smithy.
        const sc = map.sceneryAt(tx, ty);
        const marker =
          sc?.kind === 'tree' ? '#1e3d1a'
          : sc?.kind === 'rock' && sc.resource ? '#d0c0a0'
          : sc?.kind === 'furnace' ? '#e2521c'
          : sc?.kind === 'anvil' ? '#55555c'
          : null;

        if (marker) {
          ctx.fillStyle = marker;
          ctx.fillRect((tx - ox) * scale, (ty - oy) * scale, scale, scale);
        }
      }
    }

    ctx.fillStyle = '#f2d33c';
    for (const n of world.npcs) {
      if (n.dead) continue;
      ctx.fillRect((n.x - ox) * scale - 1, (n.y - oy) * scale - 1, 3, 3);
    }

    ctx.fillStyle = '#e04b3a';
    for (const it of world.ground.items) {
      ctx.fillRect((it.x - ox) * scale - 1, (it.y - oy) * scale - 1, 2.5, 2.5);
    }

    ctx.fillStyle = '#ff9a3c';
    for (const f of world.objects.fires) {
      ctx.fillRect((f.x - ox) * scale - 1, (f.y - oy) * scale - 1, 3, 3);
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.strokeStyle = '#3b3227';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
}
