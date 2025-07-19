/**
 * Client-side Delta Types - Shared delta compression structures
 * 
 * Client-side types for processing server delta updates
 * and maintaining local state reconstruction.
 */

// Re-export server types for client use
export interface DeltaHeader {
  sequence: number;
  timestamp: number;
  matchId: string;
  deltaType: 'incremental' | 'full';
  basedOn?: number;
}

export interface PlayerDelta {
  id: string;
  x?: number;
  y?: number;
  rotation?: number;
  health?: number;
  isAlive?: boolean;
  isMoving?: boolean;
  username?: string;
  classType?: string;
  maxHealth?: number;
}

export interface ProjectileDelta {
  id: string;
  action: 'create' | 'update' | 'destroy';
  x?: number;
  y?: number;
  rotation?: number;
  type?: string;
  ownerId?: string;
  velocity?: { x: number; y: number };
}

export interface RoundInfoDelta {
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
  players?: PlayerDelta[];
  projectiles?: ProjectileDelta[];
  roundInfo?: RoundInfoDelta;
  mapData?: {
    arenaType: string;
    size: { x: number; y: number };
    walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    spawnPoints: Array<{ position: { x: number; y: number }; rotation: number }>;
  };
}

export interface FullGameState {
  header: DeltaHeader;
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

// Client-specific state structures
export interface ClientPlayerState {
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
  lastUpdate: number;
}

export interface ClientProjectileState {
  id: string;
  x: number;
  y: number;
  rotation: number;
  type: string;
  ownerId: string;
  velocity: { x: number; y: number };
  lastUpdate: number;
}

export interface ClientGameState {
  sequence: number;
  timestamp: number;
  lastFullSync: number;
  
  players: Map<string, ClientPlayerState>;
  projectiles: Map<string, ClientProjectileState>;
  roundInfo: {
    currentRound: number;
    timeLeft: number;
    status: string;
    score: { player1: number; player2: number };
  };
  
  // Out-of-order packet handling
  pendingDeltas: Map<number, GameStateDelta>;
  missingSequences: Set<number>;
  lastProcessedSequence: number;
}