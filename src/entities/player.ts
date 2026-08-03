// The player.
//
// Holds skills, inventory, and the queued action -- the thing the player
// clicked that should fire once they finish walking. RuneScape works this way:
// clicking an NPC does not attack, it records an intent that resolves when you
// are in range. Modelling it as an explicit action keeps click handling out of
// the combat code.

import type { AttackStyleId, CombatStats, MobAppearance, PlayerAction } from '../types';
import { Mob } from './mob';
import { Skills } from '../systems/skills';
import { Inventory } from '../systems/inventory';
import { STYLES } from '../systems/combat';
import { getItem } from '../data/items';

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

  /** True when the wielded weapon shoots rather than swings. */
  usingBow(): boolean {
    const w = this.inventory.equipment.weapon;
    return w ? (getItem(w.id)?.tags.includes('bow') ?? false) : false;
  }

  /** How far this character can attack from, in tiles. */
  attackRange(): number {
    const w = this.inventory.equipment.weapon;
    return w ? (getItem(w.id)?.range ?? 1) : 1;
  }

  override combatStats(): CombatStats {
    const style = STYLES[this.attackStyle];
    const bonus = this.inventory.bonuses();

    // A bow substitutes Archery for both halves of the melee pair, so the
    // accuracy and max-hit formulas need no separate ranged branch -- they get
    // the same shape of numbers and stay one implementation.
    //
    // Melee style bonuses do not apply to a shot. Aggressive stance does
    // nothing for a bowstring, and letting it would make the combat tab a
    // free damage boost that costs a player nothing to pick.
    if (this.usingBow()) {
      const archery = this.skills.level('archery');
      return {
        attack: archery,
        strength: archery,
        defence: this.skills.level('defence'),
        attackBonus: bonus.ranged,
        strengthBonus: bonus.rangedStrength,
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
