/**
 * DeltaProcessor - Client-side delta compression handler
 * 
 * Processes incremental state updates from server, reconstructs full state,
 * handles out-of-order packets, and manages fallback to full sync.
 */

import type {
  GameStateDelta,
  FullGameState,
  ClientGameState,
  ClientPlayerState,
  ClientProjectileState,
  PlayerDelta,
  ProjectileDelta,
  RoundInfoDelta
} from '../../types/DeltaTypes.js';

export interface DeltaProcessorConfig {
  maxPendingDeltas: number;    // 10 - Max out-of-order deltas to buffer
  packetTimeoutMs: number;     // 2000ms - Request resync if packet missing this long
  maxMissingSequences: number; // 5 - Max missing sequences before full resync
  debugLogging: boolean;       // Enable debug logging
}

export interface DeltaProcessorCallbacks {
  onStateUpdate?: (players: ClientPlayerState[], projectiles: ClientProjectileState[], roundInfo: any) => void;
  onFullSyncNeeded?: (reason: string) => void;
  onSequenceGap?: (missing: number[]) => void;
}

const DEFAULT_CONFIG: DeltaProcessorConfig = {
  maxPendingDeltas: 3,     // OPTIMIZED: Reduced buffering for lower latency
  packetTimeoutMs: 100,    // OPTIMIZED: Faster timeout for quicker resync
  maxMissingSequences: 3,  // OPTIMIZED: Quicker fallback to full sync
  debugLogging: false
};

export class DeltaProcessor {
  private config: DeltaProcessorConfig;
  private callbacks: DeltaProcessorCallbacks = {};
  
  private gameState: ClientGameState = {
    sequence: 0,
    timestamp: 0,
    lastFullSync: 0,
    players: new Map(),
    projectiles: new Map(),
    roundInfo: {
      currentRound: 1,
      timeLeft: 60,
      status: 'waiting',
      score: { player1: 0, player2: 0 }
    },
    pendingDeltas: new Map(),
    missingSequences: new Set(),
    lastProcessedSequence: 0
  };
  
  private missingPacketTimers: Map<number, NodeJS.Timeout> = new Map();
  
  constructor(config?: Partial<DeltaProcessorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('DeltaProcessor initialized', { config: this.config });
  }
  
  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: DeltaProcessorCallbacks): void {
    this.callbacks = { ...callbacks };
  }
  
  /**
   * Process delta update from server
   */
  processDelta(delta: GameStateDelta): boolean {
    const { sequence, timestamp, deltaType } = delta.header;
    
    if (this.config.debugLogging) {
      console.log('📥 Processing delta', { sequence, deltaType, currentSequence: this.gameState.sequence });
    }
    
    // Handle full sync deltas
    if (deltaType === 'full') {
      return this.processFullSyncDelta(delta);
    }
    
    // Check if this is the next expected sequence
    const expectedSequence = this.gameState.lastProcessedSequence + 1;
    
    if (sequence === expectedSequence) {
      // In-order delta - process immediately
      return this.applyDelta(delta);
    } else if (sequence > expectedSequence) {
      // Out-of-order delta - buffer and check for missing sequences
      return this.handleOutOfOrderDelta(delta);
    } else {
      // Old/duplicate delta - ignore
      if (this.config.debugLogging) {
        console.warn('⚠️ Ignoring old/duplicate delta', { sequence, expected: expectedSequence });
      }
      return false;
    }
  }
  
  /**
   * Process full sync from server
   */
  processFullSync(fullState: FullGameState): boolean {
    const { sequence, timestamp } = fullState.header;
    
    console.log('🔄 Processing full sync', { sequence, players: fullState.players.length });
    
    // Clear existing state
    this.gameState.players.clear();
    this.gameState.projectiles.clear();
    this.gameState.pendingDeltas.clear();
    this.gameState.missingSequences.clear();
    this.clearMissingPacketTimers();
    
    // Rebuild state from full sync
    for (const player of fullState.players) {
      this.gameState.players.set(player.id, {
        ...player,
        lastUpdate: timestamp
      });
    }
    
    for (const projectile of fullState.projectiles) {
      this.gameState.projectiles.set(projectile.id, {
        ...projectile,
        lastUpdate: timestamp
      });
    }
    
    this.gameState.roundInfo = { ...fullState.roundInfo };
    this.gameState.sequence = sequence;
    this.gameState.timestamp = timestamp;
    this.gameState.lastFullSync = timestamp;
    this.gameState.lastProcessedSequence = sequence;
    
    // Notify callbacks
    this.notifyStateUpdate();
    
    return true;
  }
  
  /**
   * Handle out-of-order delta
   */
  private handleOutOfOrderDelta(delta: GameStateDelta): boolean {
    const { sequence } = delta.header;
    const expectedSequence = this.gameState.lastProcessedSequence + 1;
    
    // Check if we have too many pending deltas
    if (this.gameState.pendingDeltas.size >= this.config.maxPendingDeltas) {
      console.warn('⚠️ Too many pending deltas, requesting full sync');
      this.requestFullSync('pending_overflow');
      return false;
    }
    
    // Buffer the delta
    this.gameState.pendingDeltas.set(sequence, delta);
    
    // Mark missing sequences
    for (let seq = expectedSequence; seq < sequence; seq++) {
      if (!this.gameState.missingSequences.has(seq)) {
        this.gameState.missingSequences.add(seq);
        this.startMissingPacketTimer(seq);
      }
    }
    
    // Check if we have too many missing sequences
    if (this.gameState.missingSequences.size > this.config.maxMissingSequences) {
      console.warn('⚠️ Too many missing sequences, requesting full sync');
      this.requestFullSync('too_many_missing');
      return false;
    }
    
    if (this.config.debugLogging) {
      console.log('📦 Buffered out-of-order delta', { 
        sequence, 
        expected: expectedSequence,
        pending: this.gameState.pendingDeltas.size,
        missing: Array.from(this.gameState.missingSequences)
      });
    }
    
    return true;
  }
  
  /**
   * Apply delta to current state
   */
  private applyDelta(delta: GameStateDelta): boolean {
    try {
      const { sequence, timestamp } = delta.header;
      
      // Apply player deltas
      if (delta.players) {
        for (const playerDelta of delta.players) {
          this.applyPlayerDelta(playerDelta, timestamp);
        }
      }
      
      // Apply projectile deltas
      if (delta.projectiles) {
        for (const projectileDelta of delta.projectiles) {
          this.applyProjectileDelta(projectileDelta, timestamp);
        }
      }
      
      // Apply round info delta
      if (delta.roundInfo) {
        this.applyRoundInfoDelta(delta.roundInfo);
      }
      
      // Update state metadata
      this.gameState.sequence = sequence;
      this.gameState.timestamp = timestamp;
      this.gameState.lastProcessedSequence = sequence;
      
      // Remove from missing sequences if it was missing
      this.gameState.missingSequences.delete(sequence);
      this.clearMissingPacketTimer(sequence);
      
      // Try to process any pending deltas that are now in order
      this.processPendingDeltas();
      
      // Notify callbacks
      this.notifyStateUpdate();
      
      if (this.config.debugLogging) {
        console.log('✅ Applied delta', { sequence, players: this.gameState.players.size });
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error applying delta', error);
      this.requestFullSync('delta_apply_error');
      return false;
    }
  }
  
  /**
   * Apply player delta
   */
  private applyPlayerDelta(delta: PlayerDelta, timestamp: number): void {
    let player = this.gameState.players.get(delta.id);
    
    if (!player) {
      // New player - create with delta data
      player = {
        id: delta.id,
        username: delta.username || 'Unknown',
        x: delta.x || 0,
        y: delta.y || 0,
        rotation: delta.rotation || 0,
        health: delta.health || 100,
        maxHealth: delta.maxHealth || 100,
        classType: delta.classType || 'archer',
        isAlive: delta.isAlive !== undefined ? delta.isAlive : true,
        isMoving: delta.isMoving !== undefined ? delta.isMoving : false,
        lastUpdate: timestamp
      };
      this.gameState.players.set(delta.id, player);
      return;
    }
    
    // Update existing player with delta changes
    if (delta.x !== undefined) player.x = delta.x;
    if (delta.y !== undefined) player.y = delta.y;
    if (delta.rotation !== undefined) player.rotation = delta.rotation;
    if (delta.health !== undefined) player.health = delta.health;
    if (delta.isAlive !== undefined) player.isAlive = delta.isAlive;
    if (delta.isMoving !== undefined) player.isMoving = delta.isMoving;
    if (delta.username !== undefined) player.username = delta.username;
    if (delta.classType !== undefined) player.classType = delta.classType;
    if (delta.maxHealth !== undefined) player.maxHealth = delta.maxHealth;
    
    player.lastUpdate = timestamp;
  }
  
  /**
   * Apply projectile delta
   */
  private applyProjectileDelta(delta: ProjectileDelta, timestamp: number): void {
    switch (delta.action) {
      case 'create': {
        const projectile: ClientProjectileState = {
          id: delta.id,
          x: delta.x || 0,
          y: delta.y || 0,
          rotation: delta.rotation || 0,
          type: delta.type || 'arrow',
          ownerId: delta.ownerId || 'unknown',
          velocity: delta.velocity || { x: 0, y: 0 },
          lastUpdate: timestamp
        };
        this.gameState.projectiles.set(delta.id, projectile);
        break;
      }
      
      case 'update': {
        const projectile = this.gameState.projectiles.get(delta.id);
        if (projectile) {
          if (delta.x !== undefined) projectile.x = delta.x;
          if (delta.y !== undefined) projectile.y = delta.y;
          if (delta.rotation !== undefined) projectile.rotation = delta.rotation;
          projectile.lastUpdate = timestamp;
        }
        break;
      }
      
      case 'destroy': {
        this.gameState.projectiles.delete(delta.id);
        break;
      }
    }
  }
  
  /**
   * Apply round info delta
   */
  private applyRoundInfoDelta(delta: RoundInfoDelta): void {
    if (delta.currentRound !== undefined) {
      this.gameState.roundInfo.currentRound = delta.currentRound;
    }
    if (delta.timeLeft !== undefined) {
      this.gameState.roundInfo.timeLeft = delta.timeLeft;
    }
    if (delta.status !== undefined) {
      this.gameState.roundInfo.status = delta.status;
    }
    if (delta.score) {
      if (delta.score.player1 !== undefined) {
        this.gameState.roundInfo.score.player1 = delta.score.player1;
      }
      if (delta.score.player2 !== undefined) {
        this.gameState.roundInfo.score.player2 = delta.score.player2;
      }
    }
  }
  
  /**
   * Process full sync as delta
   */
  private processFullSyncDelta(delta: GameStateDelta): boolean {
    console.log('🔄 Processing full sync delta');
    
    // Clear existing state
    this.gameState.players.clear();
    this.gameState.projectiles.clear();
    this.gameState.pendingDeltas.clear();
    this.gameState.missingSequences.clear();
    this.clearMissingPacketTimers();
    
    // Apply all deltas as if they were complete state
    const timestamp = delta.header.timestamp;
    
    if (delta.players) {
      for (const playerDelta of delta.players) {
        this.applyPlayerDelta(playerDelta, timestamp);
      }
    }
    
    if (delta.projectiles) {
      for (const projectileDelta of delta.projectiles) {
        this.applyProjectileDelta(projectileDelta, timestamp);
      }
    }
    
    if (delta.roundInfo) {
      this.applyRoundInfoDelta(delta.roundInfo);
    }
    
    this.gameState.sequence = delta.header.sequence;
    this.gameState.timestamp = timestamp;
    this.gameState.lastFullSync = timestamp;
    this.gameState.lastProcessedSequence = delta.header.sequence;
    
    this.notifyStateUpdate();
    return true;
  }
  
  /**
   * Process pending deltas that are now in order
   */
  private processPendingDeltas(): void {
    let processed = 0;
    let nextSequence = this.gameState.lastProcessedSequence + 1;
    
    while (this.gameState.pendingDeltas.has(nextSequence)) {
      const delta = this.gameState.pendingDeltas.get(nextSequence)!;
      this.gameState.pendingDeltas.delete(nextSequence);
      
      this.applyDelta(delta);
      processed++;
      nextSequence++;
    }
    
    if (processed > 0 && this.config.debugLogging) {
      console.log(`📦 Processed ${processed} pending deltas`);
    }
  }
  
  /**
   * Start timer for missing packet
   */
  private startMissingPacketTimer(sequence: number): void {
    const timer = setTimeout(() => {
      console.warn(`⏰ Missing packet timeout for sequence ${sequence}`);
      this.requestFullSync('missing_packet_timeout');
    }, this.config.packetTimeoutMs);
    
    this.missingPacketTimers.set(sequence, timer);
  }
  
  /**
   * Clear missing packet timer
   */
  private clearMissingPacketTimer(sequence: number): void {
    const timer = this.missingPacketTimers.get(sequence);
    if (timer) {
      clearTimeout(timer);
      this.missingPacketTimers.delete(sequence);
    }
  }
  
  /**
   * Clear all missing packet timers
   */
  private clearMissingPacketTimers(): void {
    for (const timer of this.missingPacketTimers.values()) {
      clearTimeout(timer);
    }
    this.missingPacketTimers.clear();
  }
  
  /**
   * Request full sync from server
   */
  private requestFullSync(reason: string): void {
    console.log(`🔄 Requesting full sync: ${reason}`);
    
    if (this.callbacks.onFullSyncNeeded) {
      this.callbacks.onFullSyncNeeded(reason);
    }
  }
  
  /**
   * Notify callbacks of state update
   */
  private notifyStateUpdate(): void {
    if (this.callbacks.onStateUpdate) {
      const players = Array.from(this.gameState.players.values());
      const projectiles = Array.from(this.gameState.projectiles.values());
      
      this.callbacks.onStateUpdate(players, projectiles, this.gameState.roundInfo);
    }
  }
  
  /**
   * Get current state
   */
  getCurrentState(): ClientGameState {
    return { ...this.gameState };
  }
  
  /**
   * Get missing sequences for debugging
   */
  getMissingSequences(): number[] {
    return Array.from(this.gameState.missingSequences).sort((a, b) => a - b);
  }
  
  /**
   * Get statistics
   */
  getStats(): {
    currentSequence: number;
    pendingDeltas: number;
    missingSequences: number;
    players: number;
    projectiles: number;
    lastFullSync: number;
  } {
    return {
      currentSequence: this.gameState.sequence,
      pendingDeltas: this.gameState.pendingDeltas.size,
      missingSequences: this.gameState.missingSequences.size,
      players: this.gameState.players.size,
      projectiles: this.gameState.projectiles.size,
      lastFullSync: this.gameState.lastFullSync
    };
  }
  
  /**
   * Reset state (for reconnection)
   */
  reset(): void {
    this.gameState.players.clear();
    this.gameState.projectiles.clear();
    this.gameState.pendingDeltas.clear();
    this.gameState.missingSequences.clear();
    this.clearMissingPacketTimers();
    
    this.gameState.sequence = 0;
    this.gameState.lastProcessedSequence = 0;
    this.gameState.timestamp = 0;
    this.gameState.lastFullSync = 0;
    
    console.log('🔄 Delta processor reset');
  }
}