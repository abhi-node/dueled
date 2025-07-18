// Core game types
export interface Player {
  id: string;
  username?: string;
  email?: string;
  isAnonymous: boolean;
  rating: number;
  classType?: ClassType;
  position?: Vector2;
  health?: number;
  armor?: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

export enum ClassType {
  ARCHER = 'archer',
  BERSERKER = 'berserker'
  // MAGE = 'mage',       // Phase 4: Simplified to 2 active classes
  // BOMBER = 'bomber'    // Architecture ready for expansion to 4 classes
}

/**
 * Core stat system for all classes
 * Each stat has specific gameplay implications
 */
export interface ClassStats {
  // Core survivability
  health: number;        // Maximum health points
  defense: number;       // Damage reduction (armor)
  
  // Movement and agility
  speed: number;         // Base movement speed
  stamina: number;       // Dash cooldown reduction (higher = faster dash reset)
  
  // Combat effectiveness
  strength: number;      // Base damage multiplier
  intelligence: number;  // Special ability cooldown reduction (higher = faster recharge)
}

/**
 * Special ability configuration
 */
export interface SpecialAbility {
  id: string;
  name: string;
  description: string;
  baseCooldown: number;    // Base cooldown in seconds
  duration?: number;       // Effect duration in seconds (if applicable)
  manaCost?: number;       // Future mana system
  effects: AbilityEffect[];
}

export interface AbilityEffect {
  type: 'damage_boost' | 'movement_slow' | 'armor_bypass' | 'homing_projectile' | 'map_wide';
  value: number;           // Percentage or absolute value
  target: 'self' | 'enemy' | 'all_enemies' | 'target_area';
  radius?: number;         // For area effects
}

/**
 * Complete class configuration
 */
export interface ClassConfig {
  id: ClassType;
  name: string;
  description: string;
  stats: ClassStats;
  weapon: WeaponConfig;
  specialAbility: SpecialAbility;
  inherentAbilities: string[]; // Passive abilities
}

/**
 * Weapon configuration
 */
export interface WeaponConfig {
  id: string;
  name: string;
  type: 'melee' | 'ranged' | 'projectile' | 'explosive';
  damage: number;          // Base damage
  range: number;           // Attack range in tiles
  attackSpeed: number;     // Attacks per second
  areaOfEffect?: number;   // AOE radius for applicable weapons
  projectileSpeed?: number; // For ranged weapons
  effects: WeaponEffect[];
}

export interface WeaponEffect {
  type: 'piercing' | 'explosive' | 'frost' | 'armor_burn';
  value: number;
  description: string;
}

export enum DamageType {
  PHYSICAL = 'physical',
  FIRE = 'fire',
  ICE = 'ice',
  PIERCING = 'piercing'
}

// Authentication types
export interface AuthRequest {
  username?: string;
  email?: string;
  password?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  player?: Player;
  error?: string;
}

// Match types
export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Class: ClassType;
  player2Class: ClassType;
  status: MatchStatus;
  createdAt: Date;
  endedAt?: Date;
  winnerId?: string;
}

export enum MatchStatus {
  WAITING = 'waiting',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

// Matchmaking types
export interface QueueEntry {
  playerId: string;
  classType: ClassType;
  rating: number;
  timestamp: number;
}

export interface MatchmakingStatus {
  inQueue: boolean;
  estimatedWait: number;
  queuePosition?: number;
}

// WebSocket event types
export interface GameAction {
  type: ActionType;
  playerId: string;
  data: any;
  timestamp: number;
}

export enum ActionType {
  MOVE = 'move',
  ATTACK = 'attack',
  USE_ABILITY = 'use_ability',
  DISCONNECT = 'disconnect'
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  details?: any[];
  cached?: boolean;
}

// Game state types
export interface GameState {
  matchId: string;
  players: Map<string, Player>;
  arena: Arena;
  gameTime: number;
  status: MatchStatus;
}

export interface Arena {
  width: number;
  height: number;
  obstacles: Obstacle[];
  spawnPoints: Vector2[];
}

export interface Obstacle {
  id: string;
  position: Vector2;
  size: Vector2;
  type: ObstacleType;
}

export enum ObstacleType {
  WALL = 'wall',
  PILLAR = 'pillar',
  DESTRUCTIBLE = 'destructible'
}

// Projectile types for deterministic physics
export interface ProjectileState {
  id: string;
  position: Vector2;
  velocity: Vector2; // Unit direction ONLY (normalized vector)
  rotation: number;
  distanceTraveled: number;
  isActive: boolean;
  ownerId: string;
  targetId?: string; // For homing projectiles
  createdAt: number;
  lastUpdate: number;
}

export interface ProjectileConfig {
  id: string;
  type: 'arrow' | 'ice_shard' | 'fire_bomb' | 'magic_missile';
  damage: number;
  speed: number; // tiles per second
  range: number; // max distance in tiles
  size: { width: number; height: number }; // hitbox size
  piercing: boolean;
  homing: boolean;
  armorPenetration: number; // percentage (0-100)
  effects: WeaponEffect[];
  spriteSheet?: {
    path: string;
    frameWidth: number;
    frameHeight: number;
    totalFrames: number;
  };
}