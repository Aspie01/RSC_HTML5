// Melee combat, using OSRS's real accuracy and max-hit formulas.
//
// Two independent rolls happen on every attack:
//   1. ACCURACY -- attack roll vs defence roll decides hit or splash.
//   2. DAMAGE   -- on a hit, damage is uniform in [0, maxHit] INCLUSIVE.
//
// That second point is why RuneScape feels the way it does: a 0 is a "hit" that
// happened to roll zero damage. Keeping this faithful matters more than any
// sprite you will ever draw.
//
//   effectiveAttack  = attackLevel + styleBonus + 8
//   attackRoll       = effectiveAttack * (equipmentAttackBonus + 64)
//   effectiveDefence = defenceLevel + styleBonus + 8
//   defenceRoll      = effectiveDefence * (equipmentDefenceBonus + 64)
//   hitChance        = attRoll > defRoll
//                        ? 1 - (defRoll + 2) / (2 * (attRoll + 1))
//                        : attRoll / (2 * (defRoll + 1))
//   maxHit           = floor(0.5 + effectiveStrength * (strBonus + 64) / 640)

import type { AttackStyle, AttackStyleId, HitResult, SkillId } from '../types.ts';
import type { Mob } from '../entities/mob.ts';
import type { Player } from '../entities/player.ts';
import { rand } from '../core/util.ts';
import { rng, Rng } from '../core/rng.ts';

/** Attack styles mirror the RuneScape combat tab. */
export const STYLES: Record<AttackStyleId, AttackStyle> = {
  accurate:   { name: 'Accurate',   attack: 3, strength: 0, defence: 0, xp: ['attack'] },
  aggressive: { name: 'Aggressive', attack: 0, strength: 3, defence: 0, xp: ['strength'] },
  defensive:  { name: 'Defensive',  attack: 0, strength: 0, defence: 3, xp: ['defence'] },
  controlled: { name: 'Controlled', attack: 1, strength: 1, defence: 1, xp: ['attack', 'strength', 'defence'] }
};

function effective(level: number, styleBonus: number): number {
  return level + styleBonus + 8;
}

export function maxHitFor(
  strengthLevel: number,
  styleBonus: number,
  strengthEquip: number
): number {
  const effStr = effective(strengthLevel, styleBonus);
  return Math.floor(0.5 + (effStr * (strengthEquip + 64)) / 640);
}

export function hitChance(attackRoll: number, defenceRoll: number): number {
  if (attackRoll > defenceRoll) {
    return 1 - (defenceRoll + 2) / (2 * (attackRoll + 1));
  }
  return attackRoll / (2 * (defenceRoll + 1));
}

/** Read-only preview for the combat tab. */
export function previewMaxHit(player: Player): number {
  const s = player.combatStats();
  return maxHitFor(s.strength, s.styleStrength, s.strengthBonus);
}

export function previewAccuracy(attacker: Mob, defender: Mob): number {
  const a = attacker.combatStats();
  const d = defender.combatStats();
  const attRoll = effective(a.attack, a.styleAttack) * (a.attackBonus + 64);
  const defRoll = effective(d.defence, d.styleDefence) * (d.defenceBonus + 64);
  return hitChance(attRoll, defRoll);
}

/**
 * Resolve a single attack. Note that each mob supplies its own CombatStats,
 * so this function never needs to know whether it is looking at a player or
 * an NPC -- that polymorphism is the whole point of the interface.
 */
export function resolve(attacker: Mob, defender: Mob, gen: Rng = rng): HitResult {
  const a = attacker.combatStats();
  const d = defender.combatStats();

  const attackRoll = effective(a.attack, a.styleAttack) * (a.attackBonus + 64);
  const defenceRoll = effective(d.defence, d.styleDefence) * (d.defenceBonus + 64);

  const chance = hitChance(attackRoll, defenceRoll);
  // A spell brings its own cap; everything else derives one from Strength.
  const maxHit = a.maxHit ?? maxHitFor(a.strength, a.styleStrength, a.strengthBonus);

  if (gen.next() >= chance) {
    return { hit: false, damage: 0, maxHit };
  }

  // Inclusive of both 0 and maxHit -- hence maxHit + 1 outcomes.
  return { hit: true, damage: rand(maxHit + 1, gen), maxHit };
}

/**
 * RuneScape awards 4 xp per damage to the style skill, plus 1.33 to the health
 * skill -- which is why Vitality rises without ever being trained directly.
 * Returns the skills that gained a level, so the caller can announce them.
 */
export function awardXp(player: Player, damage: number): SkillId[] {
  if (damage <= 0) return [];

  const gained: SkillId[] = [];

  // A shot or a cast trains its own skill and nothing else. The melee styles
  // are a melee concept, and splitting a bow's experience across Attack and
  // Strength would let a player level the wrong skills by shooting things.
  const mode = player.combatSkill();
  if (mode) {
    if (player.skills.addXp(mode, 4 * damage) > 0) gained.push(mode);
  } else {
    const style = STYLES[player.attackStyle];
    const share = (4 * damage) / style.xp.length;
    for (const skill of style.xp) {
      if (player.skills.addXp(skill, share) > 0) gained.push(skill);
    }
  }

  if (player.skills.addXp('vitality', 1.33 * damage) > 0) {
    gained.push('vitality');
  }

  // Vitality level-ups raise max health immediately.
  player.maxHp = player.skills.level('vitality');

  return gained;
}
