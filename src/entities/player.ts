// The player.
//
// Holds skills, inventory, and the queued action -- the thing the player
// clicked that should fire once they finish walking. RuneScape works this way:
// clicking an NPC does not attack, it records an intent that resolves when you
// are in range. Modelling it as an explicit action keeps click handling out of
// the combat code.

import type { AttackStyleId, CombatStats, MobAppearance, PlayerAction } from '../types.ts';
import { Mob } from './mob.ts';
import { Skills } from '../systems/skills.ts';
import { Inventory } from '../systems/inventory.ts';
import { STYLES } from '../systems/combat.ts';
import { getItem } from '../data/items.ts';
import type { Bonuses, ItemDef, SkillId } from '../types.ts';

/**
 * Which pair of equipment bonuses each non-melee combat skill reads.
 *
 * Data rather than a branch, so adding a skill that fights means adding its
 * two bonus fields and a row here, not another arm in combatStats.
 */
const BONUS_PAIRS: Readonly<Partial<Record<SkillId, {
  accuracy: keyof Bonuses; damage: keyof Bonuses;
}>>> = {
  archery: { accuracy: 'ranged', damage: 'rangedStrength' },
  magic: { accuracy: 'magic', damage: 'magicStrength' }
};

/** 100 ticks = 60 seconds, roughly RuneScape's passive regeneration rate. */
const REGEN_INTERVAL_TICKS = 100;

export class Player extends Mob {
  override readonly name = 'Player';

  readonly skills = new Skills();
  readonly inventory = new Inventory();

  attackStyle: AttackStyleId = 'accurate';
  action: PlayerAction | null = null;

  /**
   * Ticks left before a repeating production action yields again. Gathering
   * rolls the dice every tick, but smelting and smithing are paced: you stand
   * at the furnace for a beat between bars, as in RuneScape.
   */
  actionDelay = 0;

  readonly respawnPoint: { x: number; y: number };
  private hpRegenCounter = 0;

  constructor(x: number, y: number) {
    super(x, y);

    this.maxHp = this.skills.level('vitality');
    this.hp = this.maxHp;
    this.running = true;
    this.respawnPoint = { x, y };
  }

  /** The wielded weapon, or undefined when fighting bare-handed. */
  private weapon(): ItemDef | undefined {
    const w = this.inventory.equipment.weapon;
    return w ? getItem(w.id) : undefined;
  }

  /**
   * Which skill the wielded weapon fights with, or null for melee.
   *
   * The engine never asks "is this a bow" -- it asks the weapon what it is, so
   * a focus, a sling or anything else added later needs no change here.
   */
  combatSkill(): SkillId | null {
    return this.weapon()?.combatSkill ?? null;
  }

  /** What the wielded weapon spends per attack, if anything. */
  ammoTag(): string | null {
    return this.weapon()?.ammoTag ?? null;
  }

  /** How far this character can attack from, in tiles. */
  attackRange(): number {
    return this.weapon()?.range ?? 1;
  }

  override combatStats(): CombatStats {
    const style = STYLES[this.attackStyle];
    const bonus = this.inventory.bonuses();

    // A bow or a focus substitutes its own skill for both halves of the melee
    // pair, so the accuracy and max-hit formulas need no separate branch per
    // armament -- they get the same shape of numbers and stay one
    // implementation, whatever is being swung or thrown.
    //
    // Melee style bonuses do not apply. An aggressive stance does nothing for
    // a bowstring or a spell, and letting it would make the combat tab a free
    // damage boost that costs a player nothing to pick.
    const mode = this.combatSkill();
    if (mode) {
      const level = this.skills.level(mode);
      const pair = BONUS_PAIRS[mode];
      return {
        attack: level,
        strength: level,
        defence: this.skills.level('defence'),
        attackBonus: pair ? bonus[pair.accuracy] : 0,
        strengthBonus: pair ? bonus[pair.damage] : 0,
        defenceBonus: bonus.defence,
        styleAttack: 0,
        styleStrength: 0,
        styleDefence: style.defence
      };
    }

    return {
      attack: this.skills.level('attack'),
      strength: this.skills.level('strength'),
      defence: this.skills.level('defence'),
      attackBonus: bonus.attack,
      strengthBonus: bonus.strength,
      defenceBonus: bonus.defence,
      styleAttack: style.attack,
      styleStrength: style.strength,
      styleDefence: style.defence
    };
  }

  override appearance(): MobAppearance {
    return { colour: '#8c5a3c', accent: '#e8c39e', size: 1.05 };
  }

  setAction(action: PlayerAction): void {
    this.action = action;
    this.actionDelay = 0;
  }

  clearAction(): void {
    this.action = null;
    this.actionDelay = 0;
    this.target = null;
  }

  /** Slow passive regeneration, about one hitpoint per minute. */
  regenTick(): void {
    if (this.dead) return;

    this.hpRegenCounter++;
    if (this.hpRegenCounter >= REGEN_INTERVAL_TICKS) {
      this.hpRegenCounter = 0;
      if (this.hp < this.maxHp) this.hp++;
    }
  }

  respawn(): void {
    this.dead = false;
    this.maxHp = this.skills.level('vitality');
    this.hp = this.maxHp;
    this.x = this.prevX = this.respawnPoint.x;
    this.y = this.prevY = this.respawnPoint.y;
    this.clearPath();
    this.clearAction();
    this.attackCooldown = 0;
    this.hitsplats.length = 0;
  }
}
