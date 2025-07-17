/**
 * Transport Layer Definitions for Dueled
 * 
 * Centralized constants and payload types for client-server communication.
 * This ensures consistency and prevents event name drift between client and server.
 */

import type { Vector2, ClassType } from './types';

/**
 * WebSocket event constants - use these instead of string literals
 */
export const WSEvents = {
  // Player Actions
  PLAYER_MOVE: 'player:move',
  PLAYER_ROTATE: 'player:rotate', 
  PLAYER_ATTACK: 'player:attack',
  PLAYER_DASH: 'player:dash',
  PLAYER_USE_SPECIAL: 'player:special',
  
  // Game Updates (Server → Client)
  GAME_UPDATE: 'game:update',
  PLAYER_MOVED: 'player:moved',
  PLAYER_ROTATED: 'player:rotated',
  PLAYER_ATTACKED: 'player:attacked',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  
  // Match Events
  MATCH_START: 'match:start',
  MATCH_END: 'match:end',
  MATCH_COUNTDOWN: 'match:countdown',
  
  // Connection Events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error'
} as const;

/**
 * Player movement payload - always includes current facing direction
 */
export interface MovePayload {
  position: Vector2;    // Tile coordinates (not pixels)
  angle: number;        // Facing direction in radians (0 = +X east, counter-clockwise)
  isMoving: boolean;    // Whether the player is actively moving
  classType?: ClassType;
  timestamp: number;    // Client timestamp for lag compensation
}

/**
 * Player rotation payload - standalone rotation updates
 */
export interface RotatePayload {
  angle: number;        // Facing direction in radians (0 = +X east, counter-clockwise)
  classType?: ClassType;
  timestamp: number;    // Client timestamp for lag compensation
}

/**
 * Player attack payload - includes direction and target information
 */
export interface AttackPayload {
  direction?: Vector2;        // Normalized direction vector (calculated from angle)
  targetPosition?: Vector2;   // World coordinates in tiles where player clicked/aimed
  attackType: 'basic' | 'special';
  timestamp: number;          // Client timestamp for lag compensation
}

/**
 * Player dash payload - special movement ability
 */
export interface DashPayload {
  direction: Vector2;   // Normalized direction vector
  timestamp: number;
}

/**
 * Server response payloads for player actions
 */
export interface PlayerMovedPayload {
  playerId: string;
  position: Vector2;
  angle: number;
  isMoving: boolean;    // Whether the player is actively moving
  velocity?: Vector2;
  timestamp: number;
}

export interface PlayerRotatedPayload {
  playerId: string;
  angle: number;
  timestamp: number;
}

export interface PlayerAttackedPayload {
  playerId: string;
  attackType: 'basic' | 'special';
  direction: Vector2;
  targetPosition?: Vector2;
  timestamp: number;
}

/**
 * Complete game state update payload
 */
export interface GameUpdatePayload {
  timestamp: number;
  tick: number;
  players: Array<{
    id: string;
    position: Vector2;
    velocity: Vector2;
    rotation: number;     // Authoritative facing direction
    classType: ClassType;
    health: number;
    isAlive: boolean;
  }>;
  projectiles: Array<{
    id: string;
    type: string;
    position: Vector2;
    velocity: Vector2;
    rotation: number;
    isActive: boolean;
    ownerId: string;
  }>;
  effects?: Array<{
    id: string;
    type: string;
    position: Vector2;
    duration: number;
  }>;
}

/**
 * Type-safe event emission helpers
 */
export type WSEventMap = {
  [WSEvents.PLAYER_MOVE]: MovePayload;
  [WSEvents.PLAYER_ROTATE]: RotatePayload;
  [WSEvents.PLAYER_ATTACK]: AttackPayload;
  [WSEvents.PLAYER_DASH]: DashPayload;
  [WSEvents.GAME_UPDATE]: GameUpdatePayload;
  [WSEvents.PLAYER_MOVED]: PlayerMovedPayload;
  [WSEvents.PLAYER_ROTATED]: PlayerRotatedPayload;
  [WSEvents.PLAYER_ATTACKED]: PlayerAttackedPayload;
};

/**
 * Angular utilities for consistent angle handling
 */
export class AngleUtils {
  /**
   * Normalize angle to [0, 2π) range
   */
  static normalize(angle: number): number {
    angle = angle % (2 * Math.PI);
    return angle < 0 ? angle + 2 * Math.PI : angle;
  }
  
  /**
   * Get shortest angular difference between two angles
   */
  static difference(a: number, b: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }
  
  /**
   * Convert angle to normalized direction vector
   */
  static toVector(angle: number): Vector2 {
    return {
      x: Math.cos(angle),
      y: Math.sin(angle)
    };
  }
  
  /**
   * Convert direction vector to angle
   */
  static fromVector(vector: Vector2): number {
    return Math.atan2(vector.y, vector.x);
  }
}

/**
 * Coordinate utilities for consistent position handling
 */
export class CoordUtils {
  /**
   * Convert pixel coordinates to tile coordinates
   */
  static pixelsToTiles(pixels: Vector2, tileSize: number = 32): Vector2 {
    return {
      x: pixels.x / tileSize,
      y: pixels.y / tileSize
    };
  }
  
  /**
   * Convert tile coordinates to pixel coordinates
   */
  static tilesToPixels(tiles: Vector2, tileSize: number = 32): Vector2 {
    return {
      x: tiles.x * tileSize,
      y: tiles.y * tileSize
    };
  }
}