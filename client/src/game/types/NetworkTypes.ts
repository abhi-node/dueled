/**
 * Network Types - Client-server communication interfaces
 * 
 * Defines all message types exchanged between client and server
 */

import type { InputBatch } from './InputTypes.js';
import type { 
  ClientMapData,
  GameEvent,
  Position,
  Velocity
} from './GameTypes.js';

// ============================================================================
// CLIENT → SERVER MESSAGES
// ============================================================================

export interface ClientToServerEvents {
  // Input handling
  'input_batch': (data: InputBatch) => void;
  
  // Match lifecycle
  'player_ready': (data: { playerId: string }) => void;
  'exit_match': (data: { playerId: string }) => void;
  'player_disconnect': (data: { reason: string }) => void;
  'explicit_disconnect': (data: { reason: string }) => void;
  
  // Debug/testing
  'ping': (data: { timestamp: number }) => void;
}

// ============================================================================
// SERVER → CLIENT MESSAGES
// ============================================================================

export interface ServerToClientEvents {
  // Game state updates
  'game_state_delta': (data: DeltaUpdate) => void;
  
  // Match lifecycle
  'match_start': (data: MatchStartData) => void;
  'match_end': (data: MatchEndData) => void;
  'round_start': (data: RoundStartData) => void;
  'round_end': (data: RoundEndData) => void;
  
  // Round system events
  'countdown_tick': (data: { roundNumber: number; countdown: number }) => void;
  'countdown_complete': (data: { roundNumber: number }) => void;
  'return_to_lobby': (data: { matchId: string }) => void;
  
  // Connection/error handling
  'connection_confirmed': (data: { playerId: string; serverTime: number }) => void;
  'player_temporarily_disconnected': (data: { playerId: string; gracePeriodMs: number; reason: string }) => void;
  'player_reconnected': (data: { playerId: string; gracePeriodRemaining: number }) => void;
  'error': (data: { message: string; code?: string }) => void;
  
  // Debug/testing
  'pong': (data: { timestamp: number; serverTime: number }) => void;
}

// ============================================================================
// DELTA UPDATES (Server → Client)
// ============================================================================

export interface DeltaUpdate {
  timestamp: number;                    // Server timestamp
  lastProcessedInput: number;           // Last client input sequence processed
  
  // Only include changed data to minimize bandwidth
  players?: PlayerDelta[];
  projectiles?: ProjectileDelta[];
  match?: MatchDelta;
  events?: GameEvent[];
}

export interface PlayerDelta {
  id: string;
  
  // Transform updates
  position?: Position;
  angle?: number;
  velocity?: Velocity;
  
  // State updates
  health?: number;
  armor?: number;
  weaponCooldown?: number;
  isAlive?: boolean;
  isMoving?: boolean;
  isDashing?: boolean;
}

export interface ProjectileDelta {
  id: string;
  
  // Transform updates
  position?: Position;
  velocity?: Velocity;
  angle?: number;
  timeToLive?: number;
  
  // For new projectiles, include full data
  type?: string;
  ownerId?: string;
  damage?: number;
  speed?: number;
}

export interface MatchDelta {
  currentRound?: number;
  roundTimeLeft?: number;
  score?: { player1: number; player2: number };
}

// ============================================================================
// MATCH LIFECYCLE MESSAGES
// ============================================================================

export interface MatchStartData {
  matchId: string;
  mapData: ClientMapData;
  yourPlayerId: string;
  opponentId: string;
  roundDuration: number;
  maxRounds: number;
  players: {
    [playerId: string]: {
      username: string;
      classType: string;
    };
  };
}

export interface MatchEndData {
  winnerId: string;
  winnerUsername?: string;
  reason: 'victory' | 'forfeit' | 'disconnect';
  finalScore: { player1: number; player2: number };
  matchDuration: number;
}

export interface RoundStartData {
  roundNumber: number;
  roundDuration: number;
  spawnPositions: {
    [playerId: string]: { position: Position; angle: number };
  };
}

export interface RoundEndData {
  winnerId: string;
  winnerUsername?: string;
  reason: 'elimination' | 'timeout' | 'forfeit';
  roundDuration: number;
  nextRoundIn: number; // Intermission time in ms
  currentScore: { player1: number; player2: number };
}

// ============================================================================
// CONNECTION STATE
// ============================================================================

export type ConnectionState = 
  | 'disconnected'
  | 'connecting' 
  | 'connected'
  | 'authenticated'
  | 'in_match'
  | 'error';

export interface ConnectionInfo {
  state: ConnectionState;
  playerId?: string;
  matchId?: string;
  ping?: number;
  lastHeartbeat?: number;
  serverTimeDelta?: number;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export interface NetworkError {
  code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

export const ERROR_CODES = {
  CONNECTION_LOST: 'CONNECTION_LOST',
  AUTH_FAILED: 'AUTH_FAILED',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR'
} as const;

// ============================================================================
// NETWORK CONSTANTS
// ============================================================================

export const NETWORK_CONSTANTS = {
  // Timing
  HEARTBEAT_INTERVAL: 1000,           // 1s heartbeat
  RECONNECT_ATTEMPTS: 3,              // Max reconnection attempts
  RECONNECT_DELAY: 2000,              // 2s between attempts
  
  // Timeouts
  CONNECTION_TIMEOUT: 10000,          // 10s connection timeout
  RESPONSE_TIMEOUT: 5000,             // 5s response timeout
  
  // Rate limiting
  MAX_INPUTS_PER_SECOND: 100,         // Input rate limit
  MAX_BATCH_SIZE: 10,                 // Max commands per batch
  
  // Buffer sizes
  INPUT_BUFFER_SIZE: 60,              // 1 second at 60 FPS
  DELTA_BUFFER_SIZE: 30,              // 1 second at 30 Hz
} as const;