/**
 * Game Types - Client-side game state interfaces
 * 
 * These types represent the client's view of the game state,
 * derived from server delta updates.
 */

import type { ClassTypeValue } from '@dueled/shared';

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
// CLIENT PLAYER STATE
// ============================================================================

export interface ClientPlayerState {
  // Identity
  id: string;
  username: string;
  classType: ClassTypeValue;
  
  // Transform
  position: Position;
  angle: number;           // Facing direction in radians
  velocity: Velocity;      // For smooth interpolation
  
  // Health & Combat
  health: number;
  maxHealth: number;
  armor: number;
  
  // Weapon State
  weaponCooldown: number;  // Time until next shot (ms)
  
  // Status
  isAlive: boolean;
  isMoving: boolean;
  isDashing: boolean;
  
  // Client-specific
  isLocalPlayer: boolean;  // Is this the local player?
  lastUpdateTime: number;  // When we last received data
}

// ============================================================================
// CLIENT PROJECTILE STATE
// ============================================================================

export type ProjectileType = 'arrow' | 'fireball' | 'bomb';

export interface ClientProjectileState {
  id: string;
  type: ProjectileType;
  
  // Transform
  position: Position;
  velocity: Velocity;
  angle: number;
  
  // Properties
  damage: number;
  speed: number;
  
  // Lifecycle
  ownerId: string;
  timeToLive: number;     // Remaining time in seconds
  
  // Client-specific
  lastUpdateTime: number; // For interpolation
}

// ============================================================================
// CLIENT GAME STATE
// ============================================================================

export interface ClientGameState {
  // Match info
  matchId: string;
  currentRound: number;
  roundTimeLeft: number;
  score: { player1: number; player2: number };
  
  // Players
  localPlayerId: string;
  player1Id: string;
  player2Id: string;
  players: Map<string, ClientPlayerState>;
  
  // Projectiles
  projectiles: Map<string, ClientProjectileState>;
  
  // Map data
  mapData: ClientMapData;
  
  // Network state
  lastServerUpdate: number;
  serverTimeDelta: number; // Client-server time difference
}

// ============================================================================
// MAP DATA
// ============================================================================

export interface ClientMapData {
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  walls: WallDefinition[];
  spawnPoints: SpawnPoint[];
}

export interface WallDefinition {
  id: string;
  start: Position;
  end: Position;
  solid: boolean;
  textureId?: string;
}

export interface SpawnPoint {
  id: string;
  position: Position;
  angle: number;
  team?: 'player1' | 'player2';
}

// ============================================================================
// GAME EVENTS
// ============================================================================

export interface GameEvent {
  id: string;
  type: string;
  timestamp: number;
  data: Record<string, any>;
}

export interface PlayerHitEvent extends GameEvent {
  type: 'player_hit';
  data: {
    attackerId: string;
    victimId: string;
    damage: number;
    hitPosition: Position;
  };
}

export interface PlayerKilledEvent extends GameEvent {
  type: 'player_killed';
  data: {
    killerId: string;
    victimId: string;
    weaponType: string;
  };
}

export interface RoundEndEvent extends GameEvent {
  type: 'round_end';
  data: {
    winnerId: string;
    reason: 'elimination' | 'timeout' | 'forfeit';
    nextRoundIn: number;
  };
}

