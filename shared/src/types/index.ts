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
  GUNSLINGER = 'gunslinger',
  DEMOLITIONIST = 'demolitionist',
  BUCKSHOT = 'buckshot'
}

// Class-related interfaces are now exported from ClassConfigurations.js

export enum DamageType {
  PHYSICAL = 'physical',
  EXPLOSIVE = 'explosive',
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
  CANCELLED = 'cancelled',
  ENDED = 'ended'
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