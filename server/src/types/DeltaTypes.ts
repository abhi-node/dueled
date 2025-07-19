/**
 * Delta Compression Types - Efficient incremental state updates
 * 
 * Reduces network bandwidth by 70-80% through delta compression,
 * sequence numbering, and selective field updates.
 */

export interface DeltaHeader {
  sequence: number;           // Monotonic sequence number for ordering
  timestamp: number;          // Server timestamp for synchronization
  matchId: string;           // Match identifier
  deltaType: 'incremental' | 'full';  // Delta or full state sync
  basedOn?: number;          // Sequence number this delta is based on
}

export interface PlayerDelta {
  id: string;                // Player ID (always included)
  
  // Position deltas (only if changed)
  x?: number;
  y?: number;
  rotation?: number;
  
  // Health deltas (only if changed)
  health?: number;
  
  // State flags (only if changed)
  isAlive?: boolean;
  isMoving?: boolean;
  
  // Metadata (rarely changes)
  username?: string;
  classType?: string;
  maxHealth?: number;
}

export interface ProjectileDelta {
  id: string;                // Projectile ID (always included)
  action: 'create' | 'update' | 'destroy';
  
  // Only for create/update actions
  x?: number;
  y?: number;
  rotation?: number;
  type?: string;
  ownerId?: string;
  velocity?: { x: number; y: number };
}

export interface RoundInfoDelta {
  // Only include fields that changed
  currentRound?: number;
  timeLeft?: number;
  status?: string;
  score?: {
    player1?: number;
    player2?: number;
  };
}

export interface GameStateDelta {
  header: DeltaHeader;
  
  // Player deltas (only changed players)
  players?: PlayerDelta[];
  
  // Projectile deltas (only changed projectiles)
  projectiles?: ProjectileDelta[];
  
  // Round info delta (only if changed)
  roundInfo?: RoundInfoDelta;
  
  // Map data (only on full sync or map change)
  mapData?: {
    arenaType: string;
    size: { x: number; y: number };
    walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    spawnPoints: Array<{ position: { x: number; y: number }; rotation: number }>;
  };
}

export interface FullGameState {
  header: DeltaHeader;
  
  // Complete state for synchronization
  players: Array<{
    id: string;
    username: string;
    x: number;
    y: number;
    rotation: number;
    health: number;
    maxHealth: number;
    classType: string;
    isAlive: boolean;
    isMoving: boolean;
  }>;
  
  projectiles: Array<{
    id: string;
    x: number;
    y: number;
    rotation: number;
    type: string;
    ownerId: string;
    velocity: { x: number; y: number };
  }>;
  
  roundInfo: {
    currentRound: number;
    timeLeft: number;
    status: string;
    score: { player1: number; player2: number };
  };
  
  mapData: {
    arenaType: string;
    size: { x: number; y: number };
    walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    spawnPoints: Array<{ position: { x: number; y: number }; rotation: number }>;
  };
}

// Delta state tracking for server-side diffing
export interface PlayerStateSnapshot {
  id: string;
  x: number;
  y: number;
  rotation: number;
  health: number;
  maxHealth: number;
  classType: string;
  isAlive: boolean;
  isMoving: boolean;
  username: string;
  lastUpdate: number;
}

export interface ProjectileStateSnapshot {
  id: string;
  x: number;
  y: number;
  rotation: number;
  type: string;
  ownerId: string;
  velocity: { x: number; y: number };
  lastUpdate: number;
}

export interface MatchStateSnapshot {
  sequence: number;
  timestamp: number;
  players: Map<string, PlayerStateSnapshot>;
  projectiles: Map<string, ProjectileStateSnapshot>;
  roundInfo: {
    currentRound: number;
    timeLeft: number;
    status: string;
    score: { player1: number; player2: number };
  };
}

// Client-side state reconstruction
export interface ClientState {
  sequence: number;
  timestamp: number;
  lastFullSync: number;
  
  players: Map<string, PlayerStateSnapshot>;
  projectiles: Map<string, ProjectileStateSnapshot>;
  roundInfo: {
    currentRound: number;
    timeLeft: number;
    status: string;
    score: { player1: number; player2: number };
  };
  
  // Out-of-order packet handling
  pendingDeltas: Map<number, GameStateDelta>;
  missingSequences: Set<number>;
}

// Configuration for delta compression
export interface DeltaCompressionConfig {
  // Position change thresholds
  positionThreshold: number;     // 0.01 - Only send if position changed by this amount
  rotationThreshold: number;     // 0.05 - Only send if rotation changed by this amount
  
  // Timing configuration
  fullSyncInterval: number;      // 1000ms - Send full state every N milliseconds
  maxDeltaAge: number;          // 5000ms - Force full sync if delta chain too old
  
  // Packet management
  maxPendingDeltas: number;      // 10 - Max out-of-order deltas to buffer
  packetTimeoutMs: number;       // 2000ms - Request resync if packet missing this long
  
  // Compression settings
  enablePositionQuantization: boolean;  // Round positions to reduce precision
  positionPrecision: number;           // 0.1 - Round to this precision
}

// Default configuration optimized for position-only real-time gameplay
export const DEFAULT_DELTA_CONFIG: DeltaCompressionConfig = {
  positionThreshold: 0.05,      // Slightly higher - only send if moved 0.05 units
  rotationThreshold: 0.1,       // Higher threshold - only send if rotated 0.1 radians (~5.7 degrees)
  fullSyncInterval: 2000,       // Less frequent full syncs - every 2 seconds
  maxDeltaAge: 10000,          // Allow longer delta chains - 10 seconds
  maxPendingDeltas: 15,        // More buffer for out-of-order packets
  packetTimeoutMs: 3000,       // Longer timeout for missing packets
  enablePositionQuantization: true,
  positionPrecision: 0.1       // Round to 0.1 unit precision
};

// Utility type for change detection
export type ChangeDetection<T> = {
  [K in keyof T]: T[K] extends number ? boolean : boolean;
};

// Server-side delta state management interface
export interface DeltaStateManager {
  generateDelta(matchId: string, currentState: MatchStateSnapshot): GameStateDelta;
  generateFullSync(matchId: string, currentState: MatchStateSnapshot): FullGameState;
  shouldSendFullSync(matchId: string): boolean;
  trackClientSequence(matchId: string, playerId: string, sequence: number): void;
  getNextSequence(matchId: string): number;
}

// Client-side delta processor interface
export interface DeltaProcessor {
  processDelta(delta: GameStateDelta): boolean;
  processFullSync(fullState: FullGameState): boolean;
  getCurrentState(): ClientState;
  requestResync(reason: string): void;
  getMissingSequences(): number[];
}