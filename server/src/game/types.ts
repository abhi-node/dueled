/**
 * Core Game Types - Compact, scalable data structures for server-authoritative gameplay
 */

import type { ClassType } from '@dueled/shared';

// ============================================================================
// BASIC TYPES
// ============================================================================

export interface Vector2 {
  x: number;
  y: number;
}

export interface Position extends Vector2 {}
export interface Velocity extends Vector2 {}

// ============================================================================
// PLAYER STATE
// ============================================================================

export interface PlayerState {
  // Identity
  id: string;
  username: string;
  classType: ClassType;
  
  // Transform
  position: Position;
  angle: number;           // Facing direction in radians
  velocity: Velocity;      // Current velocity for smooth interpolation
  
  // Health & Combat
  health: number;
  maxHealth: number;
  armor: number;
  
  // Weapon State
  weaponCooldown: number;  // Time until next shot (ms)
  lastAttackTime: number;  // Anti-spam protection
  
  // Network/Anti-cheat
  lastInputTime: number;   // Last processed input timestamp
  inputSequence: number;   // Last processed input sequence
  
  // Status
  isAlive: boolean;
  isMoving: boolean;
  isDashing: boolean;
  dashCooldown: number;
  
  // Round Stats
  roundKills: number;
  roundDamageDealt: number;
}

// ============================================================================
// PROJECTILE STATE
// ============================================================================

export type ProjectileType = 'bullet' | 'grenade' | 'pellet';

export interface ProjectileState {
  id: string;
  type: ProjectileType;
  
  // Transform
  position: Position;
  velocity: Velocity;
  angle: number;
  
  // Properties
  damage: number;
  speed: number;
  range: number;
  
  // Lifecycle
  ownerId: string;        // Who fired it
  spawnTime: number;      // When created
  timeToLive: number;     // How long until it expires
  
  // Physics
  hasGravity: boolean;    // For arced projectiles
  piercing: boolean;      // Can hit multiple targets
  explosive: boolean;     // AOE damage on impact
  explosionRadius?: number;
}

// ============================================================================
// MATCH STATE
// ============================================================================

export interface MatchState {
  // Match Identity
  matchId: string;
  
  // Round System (Best of 5)
  currentRound: number;   // 1-5
  maxRounds: number;      // Always 5
  roundsToWin: number;    // Always 3
  
  // Timing
  roundTimeLeft: number;  // Seconds remaining in round
  roundDuration: number;  // Total round time (60s)
  intermissionTime: number; // Break between rounds (10s)
  
  // Scoring
  score: {
    player1: number;      // Rounds won
    player2: number;
  };
  
  // Players
  player1Id: string;
  player2Id: string;
  
  // Status
  status: 'waiting' | 'active' | 'intermission' | 'completed';
  winnerId?: string;      // Set when match ends
  
  // Match Stats
  startTime: number;
  endTime?: number;
  totalDuration?: number;
}

// ============================================================================
// GAME STATE (AUTHORITATIVE)
// ============================================================================

export interface GameState {
  // Match Info
  matchId: string;
  timestamp: number;      // Server timestamp for this state
  
  // Players
  players: Map<string, PlayerState>;
  
  // Projectiles
  projectiles: Map<string, ProjectileState>;
  
  // Match Progress
  match: MatchState;
  
  // Map Data
  mapData: MapData;
  
  // Events (for this tick)
  events: GameEvent[];
}

// ============================================================================
// WORLD/MAP DATA
// ============================================================================

export interface WallDefinition {
  id: string;
  start: Position;
  end: Position;
  textureId?: string;
  solid: boolean;         // Can projectiles pass through?
}

export interface SpawnPoint {
  id: string;
  position: Position;
  angle: number;          // Default facing direction
  team?: 'player1' | 'player2';
}

export interface MapData {
  id: string;
  name: string;
  bounds: {
    minX: number; maxX: number;
    minY: number; maxY: number;
  };
  walls: WallDefinition[];
  spawnPoints: SpawnPoint[];
}

// ============================================================================
// GAME EVENTS
// ============================================================================

export type GameEventType = 
  | 'player_hit' 
  | 'player_killed' 
  | 'projectile_fired'
  | 'projectile_impact'
  | 'round_start'
  | 'round_end'
  | 'match_end';

export interface GameEvent {
  id: string;
  type: GameEventType;
  timestamp: number;
  data: Record<string, any>;
}

// Specific event data types
export interface PlayerHitEvent extends GameEvent {
  type: 'player_hit';
  data: {
    attackerId: string;
    victimId: string;
    damage: number;
    projectileType?: ProjectileType;
    hitPosition: Position;
  };
}

export interface PlayerKilledEvent extends GameEvent {
  type: 'player_killed';
  data: {
    killerId: string;
    victimId: string;
    weaponType: string;
    finalDamage: number;
  };
}

export interface RoundEndEvent extends GameEvent {
  type: 'round_end';
  data: {
    roundNumber: number;
    winnerId: string;
    reason: 'elimination' | 'timeout' | 'forfeit';
    duration: number;
    finalScore: { player1: number; player2: number };
  };
}

// ============================================================================
// INPUT COMMANDS (Client → Server)
// ============================================================================

export type InputCommandType = 'movement' | 'look' | 'attack' | 'ability';

export interface InputCommand {
  type: InputCommandType;
  timestamp: number;      // Client timestamp
  sequenceId: number;     // For acknowledgment/rollback
  data: InputCommandData;
}

export interface InputCommandData {
  // Movement commands
  forward?: number;       // -1 to 1
  strafe?: number;        // -1 to 1  
  sprint?: boolean;
  
  // Look commands
  angleDelta?: number;    // Radians per frame
  
  // Action commands
  action?: 'primary_attack' | 'secondary_attack' | 'dash';
  targetPosition?: Position; // For aimed attacks
}

// ============================================================================
// DELTA UPDATES (Server → Client)
// ============================================================================

export interface DeltaUpdate {
  timestamp: number;
  lastProcessedInput: number; // Last sequence ID processed
  
  // Only include changed data
  players?: PlayerDelta[];
  projectiles?: ProjectileDelta[];
  match?: MatchDelta;
  events?: GameEvent[];
}

export interface MatchDelta {
  currentRound?: number;
  roundTimeLeft?: number;
  score?: { player1: number; player2: number };
}

export interface PlayerDelta {
  id: string;
  position?: Position;
  angle?: number;
  velocity?: Velocity;
  health?: number;
  maxHealth?: number;
  armor?: number;
  weaponCooldown?: number;
  isAlive?: boolean;
  isMoving?: boolean;
  isDashing?: boolean;
}

export interface ProjectileDelta {
  id: string;
  position?: Position;
  velocity?: Velocity;
  angle?: number;
  timeToLive?: number;
  // For new projectiles, include full data
  type?: ProjectileType;
  ownerId?: string;
  damage?: number;
}

// ============================================================================
// WEAPON DEFINITIONS
// ============================================================================

export interface WeaponConfig {
  type: string;
  damage: number;
  range: number;
  cooldown: number;       // Milliseconds between shots
  projectileSpeed: number;
  projectileType: ProjectileType;
  piercing: boolean;
  explosive: boolean;
  explosionRadius?: number;
}

// Default weapon configs
export const WEAPON_CONFIGS: Record<ClassType, WeaponConfig> = {
  gunslinger: {
    type: 'six-shooter',
    damage: 37,           // Adjusted for new armor formula: 37 - 15 = 22 actual damage (3.6 shots)
    range: 85,            // Full diagonal range (60 * √2 = 84.85, rounded up)
    cooldown: 800,        // 0.8 seconds
    projectileSpeed: 0,   // Hitscan = instant
    projectileType: 'bullet',
    piercing: true,       // Can penetrate one target
    explosive: false
  },
  demolitionist: {
    type: 'grenade-launcher',
    damage: 70,
    range: 32,            // Doubled from 16 to 32 tiles for larger map
    cooldown: 2000,       // 2 seconds
    projectileSpeed: 8,   // Slow grenade arc
    projectileType: 'grenade',
    piercing: false,
    explosive: true,
    explosionRadius: 3
  },
  buckshot: {
    type: 'combat-shotgun',
    damage: 25,           // Per pellet
    range: 6,             // Kept short-range as intended
    cooldown: 1200,       // 1.2 seconds
    projectileSpeed: 12,
    projectileType: 'pellet',
    piercing: false,
    explosive: false
  }
};

// ============================================================================
// CONSTANTS
// ============================================================================

export const GAME_CONSTANTS = {
  // Physics
  PLAYER_SPEED: 5.0,      // Units per second
  SPRINT_MULTIPLIER: 1.5,
  DASH_SPEED: 12.0,
  DASH_DURATION: 200,     // Milliseconds
  DASH_COOLDOWN: 3000,    // 3 seconds
  
  // Player Stats
  BASE_HEALTH: 100,
  BASE_ARMOR: 50,
  
  // Round System
  ROUND_DURATION: 60,     // Seconds
  INTERMISSION_TIME: 10,  // Seconds
  ROUNDS_TO_WIN: 3,
  MAX_ROUNDS: 5,
  
  // Network
  TICK_RATE: 30,          // Server ticks per second
  INPUT_RATE: 30,         // Client input sends per second
  MAX_INPUT_AGE: 1000,    // Max ms old input to process
  
  // Anti-cheat
  MAX_SPEED: 10.0,        // Max units per second
  MAX_ANGLE_DELTA: Math.PI, // Max radians per input
  
  // Map bounds (updated for scaled 60x60 tactical arena)
  MAP_BOUNDS: {
    minX: 0, maxX: 60,
    minY: 0, maxY: 60
  }
} as const;