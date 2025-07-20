/**
 * Class Configurations - Complete class system definitions
 * 
 * Defines stats, weapons, and abilities for all 3 classes in the game.
 * Used by both client and server for consistent gameplay mechanics.
 */

import { ClassType } from '../types/index.js';

// Base interfaces
export interface ClassStats {
  health: number;        // Base health points
  defense: number;       // Armor/damage reduction
  speed: number;         // Movement speed
  stamina: number;       // Dash cooldown
  strength: number;      // Damage multiplier
  intelligence: number;  // Special ability recharge rate
}

export interface WeaponConfig {
  id: string;
  name: string;
  type: 'hitscan' | 'ballistic' | 'spread';
  damage: number;
  range: number;         // Max effective range in tiles
  attackSpeed: number;   // Attacks per second
  effects: Array<{
    type: string;
    value: number;
    duration?: number;
  }>;
  
  // Hitscan specific
  accuracy?: number;     // 0-1 accuracy rating
  penetration?: number;  // Number of targets it can pierce
  
  // Ballistic specific
  projectileSpeed?: number;
  explosive?: boolean;
  explosionRadius?: number;
  
  // Spread specific
  pelletCount?: number;  // Number of pellets per shot
  spreadAngle?: number;  // Spread in degrees
}

export interface ClassConfig {
  id: ClassType;
  name: string;
  description: string;
  stats: ClassStats;
  weapon: WeaponConfig;
  abilities: {
    primary: {
      name: string;
      description: string;
      cooldown: number;
    };
    ultimate: {
      name: string;
      description: string;
      cooldown: number;
    };
  };
}

/**
 * Gunslinger Class Configuration
 * Role: Precision marksman with hitscan weapons
 */
export const GUNSLINGER_CONFIG: ClassConfig = {
  id: ClassType.GUNSLINGER,
  name: 'Gunslinger',
  description: 'A precision marksman with instant-hit weapons. Excels at long-range combat with high accuracy and mobility.',
  
  stats: {
    health: 80,       // Glass cannon - low health
    defense: 20,      // Light armor
    speed: 120,       // Fast movement
    stamina: 90,      // Good mobility
    strength: 85,     // High damage output
    intelligence: 75  // Good ability recharge
  },
  
  weapon: {
    id: 'six_shooter',
    name: 'Six-Shooter',
    type: 'hitscan',
    damage: 45,
    range: 15,        // Long range
    attackSpeed: 1.25, // 0.8s cooldown
    accuracy: 0.95,   // Very accurate
    penetration: 1,   // Can hit through one target
    effects: []
  },
  
  abilities: {
    primary: {
      name: 'Quick Draw',
      description: 'Next shot fires instantly with increased damage',
      cooldown: 8000    // 8 seconds
    },
    ultimate: {
      name: 'Fan the Hammer',
      description: 'Rapid burst of 6 shots with no reload',
      cooldown: 25000   // 25 seconds
    }
  }
};

/**
 * Demolitionist Class Configuration  
 * Role: Explosive specialist with area denial
 */
export const DEMOLITIONIST_CONFIG: ClassConfig = {
  id: ClassType.DEMOLITIONIST,
  name: 'Demolitionist',
  description: 'An explosive specialist with area-of-effect weapons. Excels at area denial and dealing with multiple targets.',
  
  stats: {
    health: 150,      // Tank-like health
    defense: 50,      // Heavy armor
    speed: 80,        // Slow movement
    stamina: 60,      // Limited mobility  
    strength: 95,     // Very high damage
    intelligence: 65  // Moderate ability recharge
  },
  
  weapon: {
    id: 'grenade_launcher',
    name: 'Grenade Launcher',
    type: 'ballistic',
    damage: 70,
    range: 8,         // Medium range
    attackSpeed: 0.5, // 2s cooldown - slow fire rate
    projectileSpeed: 8,
    explosive: true,
    explosionRadius: 3,
    effects: [
      {
        type: 'area_damage',
        value: 50,      // AOE damage
        duration: 0
      }
    ]
  },
  
  abilities: {
    primary: {
      name: 'Sticky Bombs',
      description: 'Deploy bombs that explode after a delay',
      cooldown: 12000   // 12 seconds
    },
    ultimate: {
      name: 'Carpet Bomb',
      description: 'Rain of explosives across a large area',
      cooldown: 30000   // 30 seconds
    }
  }
};

/**
 * Buckshot Class Configuration
 * Role: Close-range specialist with spread weapons
 */
export const BUCKSHOT_CONFIG: ClassConfig = {
  id: ClassType.BUCKSHOT,
  name: 'Buckshot',
  description: 'A close-range specialist with devastating spread weapons. Excels in confined spaces and close-quarters combat.',
  
  stats: {
    health: 120,      // Moderate health
    defense: 40,      // Medium armor
    speed: 100,       // Good movement speed
    stamina: 80,      // Good mobility
    strength: 80,     // Good damage per pellet
    intelligence: 70  // Good ability recharge
  },
  
  weapon: {
    id: 'combat_shotgun',
    name: 'Combat Shotgun',
    type: 'spread',
    damage: 25,       // Per pellet
    range: 6,         // Short range
    attackSpeed: 0.83, // 1.2s cooldown
    pelletCount: 4,   // 4 pellets per shot
    spreadAngle: 30,  // 30-degree spread
    effects: [
      {
        type: 'knockback',
        value: 2,       // Pushback effect
        duration: 0
      }
    ]
  },
  
  abilities: {
    primary: {
      name: 'Shell Shock',
      description: 'Powerful blast with increased knockback',
      cooldown: 10000   // 10 seconds
    },
    ultimate: {
      name: 'Dragon Breath',
      description: 'Fire damage over time in a cone',
      cooldown: 20000   // 20 seconds
    }
  }
};

/**
 * Master configuration record for all classes
 */
export const CLASS_CONFIGURATIONS: Record<ClassType, ClassConfig> = {
  [ClassType.GUNSLINGER]: GUNSLINGER_CONFIG,
  [ClassType.DEMOLITIONIST]: DEMOLITIONIST_CONFIG,
  [ClassType.BUCKSHOT]: BUCKSHOT_CONFIG
};

/**
 * Helper function to get class configuration by type
 */
export function getClassConfig(classType: ClassType): ClassConfig {
  return CLASS_CONFIGURATIONS[classType];
}

/**
 * Get all available class types
 */
export function getAvailableClasses(): ClassType[] {
  return Object.values(ClassType);
}

/**
 * Validate if a class type is valid
 */
export function isValidClassType(classType: string): classType is ClassType {
  return Object.values(ClassType).includes(classType as ClassType);
}