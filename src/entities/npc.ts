// NPCs: wander, aggression, death, and respawn.
//
// Each NPC remembers the spawn tile it was created at. On death it goes
// invisible for `respawnTicks`, then reappears there at full health -- the same
// persistent-spawn model RuneScape uses, which is what makes specific spots
// worth camping.

import type { CombatStats, MobAppearance, NpcDef, World } from '../types.ts';
import { Mob } from './mob.ts';
import { getNpc } from '../data/npcs.ts';
import type { BossPhase } from '../data/bosses.ts';
import { getBoss } from '../data/bosses.ts';
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

  /**
   * Index into this NPC's boss phases, or -1 when it is not a boss.
   *
   * It lives on the entity rather than in the save because a boss fight is
   * not something you log out in the middle of -- leaving resets it, which
   * is both simpler and the behaviour a player expects.
   */
  phase = -1;

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

    if (getBoss(def.id)) {
      this.phase = 0;
      this.attackSpeed = this.activePhase()?.speed ?? def.speed;
    }
  }

  /** The phase currently in force, or null for anything that is not a boss. */
  activePhase(): BossPhase | null {
    if (this.phase < 0) return null;
    return getBoss(this.def.id)?.phases[this.phase] ?? null;
  }

  /**
   * Move to the deepest phase this NPC's health has fallen into, and return
   * it if that is a change. Callers announce the returned line.
   *
   * It skips forward rather than stepping, so a single large hit that crosses
   * two thresholds lands in the right phase instead of leaving one queued up
   * to trigger on the next scratch.
   */
  advancePhase(): BossPhase | null {
    const boss = getBoss(this.def.id);
    if (!boss || this.phase < 0) return null;

    const frac = this.hp / this.maxHp;
    let next = this.phase;
    for (let i = this.phase + 1; i < boss.phases.length; i++) {
      if (frac <= (boss.phases[i]?.at ?? 0)) next = i;
    }
    if (next === this.phase) return null;

    this.phase = next;
    const entered = boss.phases[next] ?? null;
    if (entered?.speed !== undefined) this.attackSpeed = entered.speed;
    return entered;
  }

  override get displayName(): string {
    return `${this.name} (level-${this.def.level})`;
  }

  override combatStats(): CombatStats {
    // A boss phase layers over the definition rather than replacing it, so a
    // phase only has to name what it changes.
    const p = this.activePhase();
    return {
      attack: p?.attack ?? this.def.attack,
      strength: p?.strength ?? this.def.strength,
      defence: p?.defence ?? this.def.defence,
      attackBonus: p?.attackBonus ?? this.def.attackBonus,
      strengthBonus: p?.strengthBonus ?? this.def.strengthBonus,
      defenceBonus: p?.defenceBonus ?? this.def.defenceBonus,
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

    // A boss comes back at phase one. Respawning mid-phase would mean the
    // second attempt is a different, easier fight than the first.
    if (this.phase >= 0) {
      this.phase = 0;
      this.attackSpeed = this.activePhase()?.speed ?? this.def.speed;
    }
  }
}
