/**
 * Class Configurations for Dueled
 * 
 * This file defines all character classes with their complete stat configurations,
 * weapons, and special abilities. Each class is designed with specific gameplay
 * roles and balanced mechanics.
 * 
 * Stat System:
 * - Health: Maximum health points
 * - Defense: Damage reduction (armor system)
 * - Speed: Base movement speed
 * - Stamina: Dash cooldown reduction (Q/E dash mechanics)
 * - Strength: Base damage multiplier
 * - Intelligence: Special ability cooldown reduction
 */

import type { ClassConfig, ClassStats, SpecialAbility, WeaponConfig } from '../types/index.js';
import { ClassType } from '../types/index.js';

/**
 * Berserker Class Configuration
 * Role: Tank/Melee DPS - High survivability with devastating close-range attacks
 */
export const BERSERKER_CONFIG: ClassConfig = {
  id: ClassType.BERSERKER,
  name: 'Berserker',
  description: 'A heavily armored warrior wielding a two-handed sword. Excels in close combat with high health and devastating melee attacks.',
  
  stats: {
    health: 150,      // Highest health for survivability
    defense: 50,      // High armor for damage reduction
    speed: 85,        // Slowest movement speed
    stamina: 60,      // Moderate dash cooldown (tanky but not agile)
    strength: 90,     // High damage output
    intelligence: 40  // Slowest special ability recharge
  },
  
  weapon: {
    id: 'berserker_sword',
    name: 'Two-Handed Greatsword',
    type: 'melee',
    damage: 85,           // High base damage
    range: 2.5,           // Short range (tiles)
    attackSpeed: 0.67,    // Slow attack rate (1.5s cooldown)
    areaOfEffect: 2.5,    // 120° arc AOE
    effects: [
      {
        type: 'piercing',
        value: 0,
        description: 'Melee AOE slash in 120° arc'
      }
    ]
  },
  
  specialAbility: {
    id: 'rage_mode',
    name: 'Rage Mode',
    description: 'Enter a berserker rage, increasing damage by 20% for 10 seconds. Recharges based on Intelligence.',
    baseCooldown: 25,     // 25 second base cooldown
    duration: 10,         // 10 second effect duration
    effects: [
      {
        type: 'damage_boost',
        value: 20,          // 20% damage increase
        target: 'self'
      }
    ]
  },
  
  inherentAbilities: []   // No passive abilities
};

/**
 * Mage Class Configuration
 * Role: Ranged Support/Control - Medium survivability with crowd control and area denial
 */
export const MAGE_CONFIG: ClassConfig = {
  id: ClassType.MAGE,
  name: 'Mage',
  description: 'A frost mage wielding ice magic. Specializes in ranged combat with slowing effects and area control.',
  
  stats: {
    health: 100,      // Medium health
    defense: 30,      // Low-medium armor
    speed: 95,        // Medium movement speed
    stamina: 80,      // Good dash cooldown for positioning
    strength: 70,     // Medium damage output
    intelligence: 90  // Fast special ability recharge
  },
  
  weapon: {
    id: 'ice_staff',
    name: 'Frost Staff',
    type: 'projectile',
    damage: 65,           // Medium damage
    range: 9,             // Long range
    attackSpeed: 1.0,     // Medium attack rate (1.0s cooldown)
    projectileSpeed: 300,
    effects: [
      {
        type: 'frost',
        value: 30,          // 30% movement speed reduction
        description: 'Ice projectiles slow enemies on hit for 2 seconds'
      }
    ]
  },
  
  specialAbility: {
    id: 'ice_age',
    name: 'Ice Age',
    description: 'Conjure a map-wide frost effect, slowing all enemies by 20% for 6 seconds.',
    baseCooldown: 30,     // 30 second base cooldown
    duration: 6,          // 6 second effect duration
    effects: [
      {
        type: 'movement_slow',
        value: 20,          // 20% movement speed reduction
        target: 'all_enemies'
      },
      {
        type: 'map_wide',
        value: 1,           // Map-wide effect
        target: 'all_enemies'
      }
    ]
  },
  
  inherentAbilities: ['frost_projectiles'] // Ice projectiles have inherent slow effect
};

/**
 * Bomber Class Configuration
 * Role: Area Denial/Burst DPS - Explosive specialist with armor-piercing capabilities
 */
export const BOMBER_CONFIG: ClassConfig = {
  id: ClassType.BOMBER,
  name: 'Bomber',
  description: 'An explosive specialist with fire bombs. Excels at area damage and armor penetration through explosive attacks.',
  
  stats: {
    health: 120,      // Medium-high health
    defense: 40,      // Medium armor
    speed: 88,        // Medium-slow movement speed
    stamina: 70,      // Medium dash cooldown
    strength: 85,     // High damage output
    intelligence: 65  // Medium special ability recharge
  },
  
  weapon: {
    id: 'fire_bombs',
    name: 'Incendiary Grenades',
    type: 'explosive',
    damage: 75,           // High direct damage
    range: 6,             // Medium range
    attackSpeed: 0.83,    // Medium attack rate (1.2s cooldown)
    areaOfEffect: 3,      // 3-tile explosion radius
    projectileSpeed: 250,
    effects: [
      {
        type: 'explosive',
        value: 50,          // AOE damage (reduced from direct hit)
        description: 'Explosive AOE damage in 3-tile radius'
      },
      {
        type: 'armor_burn',
        value: 25,          // AOE bypasses 25% armor
        description: 'Fire damage bypasses 25% of target armor'
      }
    ]
  },
  
  specialAbility: {
    id: 'enhanced_explosives',
    name: 'Enhanced Explosives',
    description: 'Next 3 bombs have increased damage and larger explosion radius for 15 seconds.',
    baseCooldown: 35,     // 35 second base cooldown
    duration: 15,         // 15 second effect duration
    effects: [
      {
        type: 'damage_boost',
        value: 30,          // 30% damage increase for bombs
        target: 'self'
      }
    ]
  },
  
  inherentAbilities: ['armor_burn'] // Fire damage bypasses 25% armor on AOE
};

/**
 * Archer Class Configuration
 * Role: Precision DPS/Sniper - High mobility with long-range precision attacks
 */
export const ARCHER_CONFIG: ClassConfig = {
  id: ClassType.ARCHER,
  name: 'Archer',
  description: 'A skilled marksman with a longbow. Specializes in long-range precision attacks with armor-piercing arrows.',
  
  stats: {
    health: 80,       // Lowest health (glass cannon)
    defense: 20,      // Lowest armor
    speed: 105,       // Fastest movement speed
    stamina: 95,      // Fastest dash cooldown (high mobility)
    strength: 80,     // High damage output
    intelligence: 75  // Good special ability recharge
  },
  
  weapon: {
    id: 'longbow',
    name: 'Elven Longbow',
    type: 'projectile',
    damage: 80,           // High precision damage
    range: 13,            // Longest range
    attackSpeed: 1.25,    // Fast attack rate (0.8s cooldown)
    projectileSpeed: 500, // Fastest projectile
    effects: [
      {
        type: 'piercing',
        value: 50,          // Ignores 50% armor
        description: 'Arrows pierce through 50% of target armor'
      }
    ]
  },
  
  specialAbility: {
    id: 'dispatcher',
    name: 'Dispatcher',
    description: 'Fire a homing arrow that tracks the nearest enemy. Damage scales with Intelligence.',
    baseCooldown: 20,     // 20 second base cooldown
    duration: 0,          // Instant effect
    effects: [
      {
        type: 'homing_projectile',
        value: 120,         // 120% of normal arrow damage
        target: 'enemy'
      }
    ]
  },
  
  inherentAbilities: ['piercing_shot'] // Arrows naturally pierce 50% armor
};

/**
 * All class configurations mapped by ClassType
 */
export const CLASS_CONFIGURATIONS: Record<ClassType, ClassConfig> = {
  [ClassType.BERSERKER]: BERSERKER_CONFIG,
  [ClassType.MAGE]: MAGE_CONFIG,
  [ClassType.BOMBER]: BOMBER_CONFIG,
  [ClassType.ARCHER]: ARCHER_CONFIG
};

/**
 * Helper function to get class configuration by type
 */
export function getClassConfig(classType: ClassType): ClassConfig {
  return CLASS_CONFIGURATIONS[classType];
}

/**
 * Helper function to calculate effective cooldown based on intelligence
 */
export function calculateEffectiveCooldown(baseCooldown: number, intelligence: number): number {
  // Intelligence reduces cooldown: each point reduces cooldown by 0.5%
  const reduction = intelligence * 0.005;
  return baseCooldown * (1 - Math.min(reduction, 0.5)); // Max 50% reduction
}

/**
 * Helper function to calculate dash cooldown based on stamina
 */
export function calculateDashCooldown(baseStamina: number): number {
  // Base dash cooldown is 3 seconds, stamina reduces it
  // Each stamina point reduces cooldown by 1%
  const baseCooldown = 3.0;
  const reduction = baseStamina * 0.01;
  return baseCooldown * (1 - Math.min(reduction, 0.7)); // Max 70% reduction
}

/**
 * Helper function to calculate damage with strength modifier
 */
export function calculateEffectiveDamage(baseDamage: number, strength: number): number {
  // Each strength point increases damage by 0.8%
  const multiplier = 1 + (strength * 0.008);
  return baseDamage * multiplier;
} 