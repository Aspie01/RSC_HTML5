// NPCs: wander, aggression, death, and respawn.
//
// Each NPC remembers the spawn tile it was created at. On death it goes
// invisible for `respawnTicks`, then reappears there at full health -- the same
// persistent-spawn model RuneScape uses, which is what makes specific spots
// worth camping.

import type { CombatStats, MobAppearance, NpcDef, World } from '../types.ts';
import { Mob } from './mob.ts';
import { getNpc } from '../data/npcs.ts';
import { randRange, tileDist } from '../core/util.ts';
import * as pathfind from '../world/pathfind.ts';

/** Tiles at which an aggressive NPC notices the player. */
export const AGGRO_RANGE = 4;
/** Tiles from spawn before an NPC gives up the chase and walks home. */
export const LEASH_RANGE = 9;

export class Npc extends Mob {
  readonly def: NpcDef;
  override readonly name: string;

  readonly spawnX: number;
  readonly spawnY: number;

  respawnTimer = 0;
  visible = true;

  private wanderCooldown = randRange(4, 14);

  constructor(defId: string, x: number, y: number) {
    super(x, y);

    const def = getNpc(defId);
    if (!def) throw new Error(`Cannot create NPC with unknown id: ${defId}`);

    this.def = def;
    this.name = def.name;
    this.maxHp = def.hitpoints;
    this.hp = def.hitpoints;
    this.attackSpeed = def.speed;
    this.spawnX = x;
    this.spawnY = y;
  }

  override get displayName(): string {
    return `${this.name} (level-${this.def.level})`;
  }

  override combatStats(): CombatStats {
    return {
      attack: this.def.attack,
      strength: this.def.strength,
      defence: this.def.defence,
      attackBonus: this.def.attackBonus,
      strengthBonus: this.def.strengthBonus,
      defenceBonus: this.def.defenceBonus,
      styleAttack: 0,
      styleStrength: 0,
      styleDefence: 0
    };
  }

  override appearance(): MobAppearance {
    return { colour: this.def.colour, accent: this.def.accent, size: this.def.size };
  }

  distFromSpawn(): number {
    return tileDist(this.x, this.y, this.spawnX, this.spawnY);
  }

  /** One tick of decision-making, run before movement. */
  think(world: World): void {
    if (this.dead) {
      this.respawnTimer--;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    // Drop a target that died or that we have leashed away from.
    if (this.target && (!this.target.isAlive() || this.distFromSpawn() > LEASH_RANGE)) {
      this.target = null;
      this.clearPath();
    }

    // Aggression: pick up a nearby player.
    if (!this.target && this.def.aggressive) {
      const p = world.player;
      if (p.isAlive() && tileDist(this.x, this.y, p.x, p.y) <= AGGRO_RANGE) {
        this.target = p;
      }
    }

    if (this.target) this.pursue(world);
    else this.wander(world);
  }

  private pursue(world: World): void {
    const target = this.target;
    if (!target) return;

    if (this.distanceTo(target) <= 1) {
      // In range: stand still and let the combat step swing.
      this.clearPath();
      this.faceTowards(target.x, target.y);
      return;
    }

    // Recalculate only once the current path is exhausted, to save tick budget.
    if (!this.path.length) {
      this.setPath(
        pathfind.findAdjacent(world.map, this.x, this.y, target.x, target.y)
      );
    }
  }

  private wander(world: World): void {
    if (this.path.length) return;

    if (--this.wanderCooldown > 0) return;
    this.wanderCooldown = randRange(6, 20);

    if (this.def.wanderRadius <= 0) return;

    // Head home if we have drifted, otherwise pick a random nearby tile.
    let tx: number;
    let ty: number;

    if (this.distFromSpawn() > this.def.wanderRadius) {
      tx = this.spawnX;
      ty = this.spawnY;
    } else {
      const r = this.def.wanderRadius;
      tx = this.spawnX + randRange(-r, r);
      ty = this.spawnY + randRange(-r, r);
    }

    if (!world.map.isWalkable(tx, ty)) return;
    this.setPath(pathfind.find(world.map, this.x, this.y, tx, ty, 600));
  }

  die(): void {
    this.dead = true;
    this.visible = false;
    this.target = null;
    this.clearPath();
    this.respawnTimer = this.def.respawnTicks;
  }

  respawn(): void {
    this.dead = false;
    this.visible = true;
    this.hp = this.maxHp;
    this.x = this.prevX = this.spawnX;
    this.y = this.prevY = this.spawnY;
    this.attackCooldown = 0;
    this.hitsplats.length = 0;
  }
}
