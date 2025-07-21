// Core game types
export interface Player {
  id: string;
  username?: string;
  email?: string;
  isAnonymous: boolean;
  rating: number;
  classType?: ClassTypeValue;
  position?: Vector2;
  health?: number;
  armor?: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

export const ClassType = {
  GUNSLINGER: 'gunslinger',
  DEMOLITIONIST: 'demolitionist',
  BUCKSHOT: 'buckshot'
} as const;

export type ClassTypeValue = typeof ClassType[keyof typeof ClassType];

// Class-related interfaces are now exported from ClassConfigurations.js

export const DamageType = {
  PHYSICAL: 'physical',
  EXPLOSIVE: 'explosive',
  PIERCING: 'piercing'
} as const;

export type DamageTypeValue = typeof DamageType[keyof typeof DamageType];

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
  player1Class: ClassTypeValue;
  player2Class: ClassTypeValue;
  status: MatchStatusValue;
  createdAt: Date;
  endedAt?: Date;
  winnerId?: string;
}

export const MatchStatus = {
  WAITING: 'waiting',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ENDED: 'ended'
} as const;

export type MatchStatusValue = typeof MatchStatus[keyof typeof MatchStatus];

// Matchmaking types
export interface QueueEntry {
  playerId: string;
  classType: ClassTypeValue;
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
  type: ActionTypeValue;
  playerId: string;
  data: any;
  timestamp: number;
  movement?: {
    x: number;
    y: number;
    angle?: number;
  };
  attack?: {
    direction: Vector2;
    target?: Vector2;
  };
  ability?: {
    direction?: Vector2;
    target?: Vector2;
  };
}

export const ActionType = {
  MOVE: 'move',
  ATTACK: 'attack',
  USE_ABILITY: 'use_ability',
  DISCONNECT: 'disconnect'
} as const;

export type ActionTypeValue = typeof ActionType[keyof typeof ActionType];

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
  status: MatchStatusValue;
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
  type: ObstacleTypeValue;
}

export const ObstacleType = {
  WALL: 'wall',
  PILLAR: 'pillar',
  DESTRUCTIBLE: 'destructible'
} as const;

export type ObstacleTypeValue = typeof ObstacleType[keyof typeof ObstacleType];

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
  type: 'bullet' | 'grenade' | 'pellet' | 'hitscan';
  damage: number;
  speed: number; // tiles per second
  range: number; // max distance in tiles
  size: { width: number; height: number }; // hitbox size
  piercing: boolean;
  homing: boolean;
  armorPenetration: number; // percentage (0-100)
  effects: string[]; // Effect IDs for now
  spriteSheet?: {
    path: string;
    frameWidth: number;
    frameHeight: number;
    totalFrames: number;
  };
}

// Hitscan event types
export interface HitscanFiredEvent {
  id: string;
  type: 'hitscan_fired';
  timestamp: number;
  data: {
    shooterId: string;
    startPosition: Vector2;
    endPosition: Vector2;
    hitType: 'wall' | 'player' | 'none';
    damage: number;
    hitPlayerId?: string;
  };
}