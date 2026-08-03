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

  override combatStats(): CombatStats {
    const style = STYLES[this.attackStyle];
    const bonus = this.inventory.bonuses();

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
