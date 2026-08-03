// Base class for anything that occupies a tile and can fight.
//
// The prev/current position pair is what makes tick-based movement look smooth.
// Each tick we copy current -> prev, then step current to the next tile; the
// renderer draws at lerp(prev, current, alpha). Nothing else needs to know that
// the game only actually moves once every 600ms.
//
// combatStats() and appearance() are abstract on purpose. Players and NPCs
// store their stats completely differently (derived skills + equipment vs. a
// flat stat block), but every consumer -- the combat maths, the renderer --
// only cares about the common shape. That is what stops `if (isPlayer)`
// branches from spreading through the codebase.

import type { CombatStats, Hitsplat, HitsplatType, MobAppearance, Tile, World } from '../types.ts';
import { tileDist } from '../core/util.ts';

/** 0 = N, 1 = NE, 2 = E, 3 = SE, 4 = S, 5 = SW, 6 = W, 7 = NW */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export abstract class Mob {
  x: number;
  y: number;
  /** Tile at the start of this tick. Render interpolation only. */
  prevX: number;
  prevY: number;
  facing: Facing = 2;

  path: Tile[] = [];
  /** Consecutive ticks spent waiting for somebody to step out of the way. */
  blockedTicks = 0;
  /** Two tiles per tick instead of one. */
  running = false;

  maxHp = 10;
  hp = 10;
  dead = false;

  target: Mob | null = null;
  /** Ticks until this mob may attack again. */
  attackCooldown = 0;
  /** Ticks between attacks. */
  attackSpeed = 4;
  /** Ticks since the last combat action. */
  inCombatTicks = 0;

  /** Render-only floating damage numbers. */
  readonly hitsplats: Hitsplat[] = [];

  abstract readonly name: string;
  abstract combatStats(): CombatStats;
  abstract appearance(): MobAppearance;

  /** Shown on hover. NPCs append their combat level. */
  get displayName(): string {
    return this.name;
  }

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
  }

  isAlive(): boolean {
    return !this.dead && this.hp > 0;
  }

  setPath(path: Tile[]): void {
    this.path = path;
  }

  clearPath(): void {
    this.path.length = 0;
  }

  isMoving(): boolean {
    return this.path.length > 0;
  }

  /** Called once per tick, before combat resolves. */
  stepMovement(world: World): void {
    this.prevX = this.x;
    this.prevY = this.y;

    if (!this.path.length) return;

    const steps = this.running ? 2 : 1;

    for (let i = 0; i < steps && this.path.length; i++) {
      const next = this.path[0]!;

      // Someone is standing there. Wait rather than stack on the same tile --
      // but count how long, because "they will move along shortly" is only
      // true of things that move. A quest giver never does, and waiting on one
      // forever is a stall with a valid path and no way out of it.
      if (world.isOccupied(next.x, next.y, this)) {
        this.blockedTicks++;
        return;
      }

      this.blockedTicks = 0;
      this.path.shift();
      this.faceTowards(next.x, next.y);
      this.x = next.x;
      this.y = next.y;
    }
  }

  faceTowards(tx: number, ty: number): void {
    const dx = Math.sign(tx - this.x);
    const dy = Math.sign(ty - this.y);
    if (dx === 0 && dy === 0) return;

    if (dx === 0 && dy < 0) this.facing = 0;
    else if (dx > 0 && dy < 0) this.facing = 1;
    else if (dx > 0 && dy === 0) this.facing = 2;
    else if (dx > 0 && dy > 0) this.facing = 3;
    else if (dx === 0 && dy > 0) this.facing = 4;
    else if (dx < 0 && dy > 0) this.facing = 5;
    else if (dx < 0 && dy === 0) this.facing = 6;
    else this.facing = 7;
  }

  distanceTo(other: Mob): number {
    return tileDist(this.x, this.y, other.x, other.y);
  }

  addHitsplat(damage: number, type?: HitsplatType): void {
    this.hitsplats.push({
      damage,
      type: type ?? (damage > 0 ? 'damage' : 'miss'),
      life: 1.0
    });
  }

  damage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.inCombatTicks = 0;
    if (this.hp === 0) this.dead = true;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
