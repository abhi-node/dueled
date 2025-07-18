/**
 * StateSynchronizer - Efficient client-server state synchronization
 * 
 * Handles delta updates, lag compensation, and state prediction
 * Designed for server-authoritative 1v1 arena combat
 */

import { GameStateManager, type ClientPlayer, type ClientProjectile, type MatchState } from './GameStateManager.js';

export interface ServerUpdate {
  timestamp: number;
  matchId: string;
  tick: number;
  
  // Delta updates (only changed data)
  players?: Array<Partial<ClientPlayer> & { id: string }>;
  projectiles?: Array<Partial<ClientProjectile> & { id: string }>;
  removedProjectiles?: string[];
  match?: Partial<MatchState>;
  
  // Game events
  events?: Array<{
    type: 'damage' | 'death' | 'respawn' | 'ability_used' | 'round_start' | 'round_end';
    playerId?: string;
    data?: any;
    timestamp: number;
  }>;
}

export interface ClientInput {
  type: 'move' | 'attack' | 'ability' | 'dash';
  data: any;
  timestamp: number;
  sequence: number;
}

export interface SyncConfig {
  // Network settings
  maxPing: number;                    // Max expected ping (ms)
  interpolationDelay: number;         // Client rendering delay (ms)
  extrapolationLimit: number;         // Max time to extrapolate (ms)
  
  // Delta compression
  enableDeltaCompression: boolean;    // Use delta updates
  deltaHistorySize: number;           // States to keep for delta calculation
  
  // Client prediction
  enableClientPrediction: boolean;    // Predict local player movement
  reconciliationEnabled: boolean;     // Fix prediction errors
  
  // Update rates
  sendRate: number;                   // Client input rate (Hz)
  tickRate: number;                   // Server tick rate (Hz)
}

export interface SyncStats {
  ping: number;
  packetLoss: number;
  updateRate: number;
  predictedInputs: number;
  reconciliations: number;
  deltaCompressionRatio: number;
}

/**
 * StateSynchronizer - Handles efficient state sync between client and server
 */
export class StateSynchronizer {
  private gameState: GameStateManager;
  private config: SyncConfig;
  
  // Network timing
  private serverTime: number = 0;
  private clientTime: number = 0;
  private timeOffset: number = 0;
  private lastPingTime: number = 0;
  private pingHistory: number[] = [];
  
  // Delta compression
  private lastServerState: ServerUpdate | null = null;
  private stateHistory: ServerUpdate[] = [];
  
  // Client prediction
  private inputSequence: number = 0;
  private predictedInputs: Map<number, ClientInput> = new Map();
  private lastAckedInput: number = 0;
  
  // Interpolation
  private interpolationBuffer: ServerUpdate[] = [];
  private renderTime: number = 0;
  
  // Statistics
  private stats: SyncStats = {
    ping: 0,
    packetLoss: 0,
    updateRate: 0,
    predictedInputs: 0,
    reconciliations: 0,
    deltaCompressionRatio: 1.0
  };
  
  // Update tracking
  private lastUpdateTime: number = 0;
  private updateCount: number = 0;
  private lastStatsUpdate: number = 0;
  
  constructor(gameState: GameStateManager, config?: Partial<SyncConfig>) {
    this.gameState = gameState;
    
    // Default configuration
    this.config = {
      maxPing: 200,
      interpolationDelay: 100,
      extrapolationLimit: 500,
      enableDeltaCompression: true,
      deltaHistorySize: 60,
      enableClientPrediction: true,
      reconciliationEnabled: true,
      sendRate: 20, // 20 Hz
      tickRate: 60, // 60 Hz
      ...config
    };
    
    this.clientTime = Date.now();
    this.renderTime = this.clientTime - this.config.interpolationDelay;
    
    console.log('StateSynchronizer initialized');
  }
  
  /**
   * Process server update
   */
  processServerUpdate(update: ServerUpdate): void {
    const now = Date.now();
    this.updateCount++;
    
    // Update timing
    this.updateServerTime(update.timestamp, now);
    
    // Handle delta decompression if enabled
    const fullUpdate = this.config.enableDeltaCompression 
      ? this.decompressDeltaUpdate(update)
      : update;
    
    // Add to interpolation buffer
    this.addToInterpolationBuffer(fullUpdate);
    
    // Handle client prediction reconciliation
    if (this.config.reconciliationEnabled) {
      this.reconcilePrediction(fullUpdate);
    }
    
    // Store for delta compression
    if (this.config.enableDeltaCompression) {
      this.updateStateHistory(fullUpdate);
    }
    
    // Update statistics
    this.updateStatistics(now);
  }
  
  /**
   * Update server time and calculate offset
   */
  private updateServerTime(serverTimestamp: number, clientTimestamp: number): void {
    this.clientTime = clientTimestamp;
    this.serverTime = serverTimestamp;
    
    // Calculate round-trip time if this is a ping response
    if (this.lastPingTime > 0) {
      const rtt = clientTimestamp - this.lastPingTime;
      this.pingHistory.push(rtt);
      
      if (this.pingHistory.length > 10) {
        this.pingHistory.shift();
      }
      
      // Use median ping for stability
      const sortedPings = [...this.pingHistory].sort((a, b) => a - b);
      this.stats.ping = sortedPings[Math.floor(sortedPings.length / 2)];
      
      // Calculate time offset with half RTT compensation
      this.timeOffset = serverTimestamp - (clientTimestamp - this.stats.ping / 2);
    }
  }
  
  /**
   * Decompress delta update to full state
   */
  private decompressDeltaUpdate(deltaUpdate: ServerUpdate): ServerUpdate {
    if (!this.lastServerState) {
      this.lastServerState = deltaUpdate;
      return deltaUpdate;
    }
    
    // Merge delta with last complete state
    const fullUpdate: ServerUpdate = {
      ...this.lastServerState,
      ...deltaUpdate,
      timestamp: deltaUpdate.timestamp,
      tick: deltaUpdate.tick
    };
    
    // Merge players
    if (deltaUpdate.players) {
      const allPlayers = new Map<string, Partial<ClientPlayer> & { id: string }>();
      
      // Start with previous players
      if (this.lastServerState.players) {
        for (const player of this.lastServerState.players) {
          allPlayers.set(player.id, player);
        }
      }
      
      // Apply delta changes
      for (const playerDelta of deltaUpdate.players) {
        const existing = allPlayers.get(playerDelta.id);
        allPlayers.set(playerDelta.id, { ...existing, ...playerDelta });
      }
      
      fullUpdate.players = Array.from(allPlayers.values());
    }
    
    // Merge projectiles (projectiles are typically sent as complete snapshots)
    if (deltaUpdate.projectiles !== undefined) {
      fullUpdate.projectiles = deltaUpdate.projectiles;
    }
    
    this.lastServerState = fullUpdate;
    return fullUpdate;
  }
  
  /**
   * Add update to interpolation buffer
   */
  private addToInterpolationBuffer(update: ServerUpdate): void {
    this.interpolationBuffer.push(update);
    
    // Sort by timestamp and limit buffer size
    this.interpolationBuffer.sort((a, b) => a.timestamp - b.timestamp);
    
    if (this.interpolationBuffer.length > 10) {
      this.interpolationBuffer.shift();
    }
  }
  
  /**
   * Reconcile client prediction with server state
   */
  private reconcilePrediction(serverUpdate: ServerUpdate): void {
    if (!this.config.enableClientPrediction || !serverUpdate.players) return;
    
    const localPlayer = this.gameState.getLocalPlayer();
    if (!localPlayer) return;
    
    // Find local player in server update
    const serverPlayer = serverUpdate.players.find(p => p.id === localPlayer.id);
    if (!serverPlayer || !serverPlayer.position) return;
    
    // Check if prediction differs significantly from server
    const positionError = Math.sqrt(
      Math.pow(localPlayer.position.x - serverPlayer.position.x, 2) +
      Math.pow(localPlayer.position.y - serverPlayer.position.y, 2)
    );
    
    const errorThreshold = 2.0; // 2 units tolerance
    
    if (positionError > errorThreshold) {
      this.stats.reconciliations++;
      
      // Correct local player position
      this.gameState.updatePlayer({
        ...localPlayer,
        position: serverPlayer.position,
        rotation: serverPlayer.rotation || localPlayer.rotation
      });
      
      // Re-apply unacknowledged inputs
      this.reapplyPredictedInputs(serverUpdate.tick);
    }
  }
  
  /**
   * Re-apply predicted inputs after reconciliation
   */
  private reapplyPredictedInputs(serverTick: number): void {
    // Remove acknowledged inputs
    for (const [sequence, input] of this.predictedInputs.entries()) {
      if (sequence <= this.lastAckedInput) {
        this.predictedInputs.delete(sequence);
      }
    }
    
    // Re-apply remaining inputs in order
    const sortedInputs = Array.from(this.predictedInputs.entries())
      .sort(([a], [b]) => a - b);
    
    for (const [_, input] of sortedInputs) {
      this.applyInputPrediction(input);
    }
  }
  
  /**
   * Apply client-side input prediction
   */
  applyInputPrediction(input: ClientInput): void {
    if (!this.config.enableClientPrediction) return;
    
    const localPlayer = this.gameState.getLocalPlayer();
    if (!localPlayer) return;
    
    // Store input for reconciliation
    this.predictedInputs.set(input.sequence, input);
    this.stats.predictedInputs++;
    
    // Apply prediction based on input type
    switch (input.type) {
      case 'move':
        this.predictMovement(localPlayer, input.data);
        break;
      // Add other input predictions as needed
    }
  }
  
  /**
   * Predict local player movement
   */
  private predictMovement(player: ClientPlayer, moveData: { x: number; y: number; rotation?: number }): void {
    const newPosition = {
      x: player.position.x + moveData.x,
      y: player.position.y + moveData.y
    };
    
    this.gameState.updatePlayer({
      ...player,
      position: newPosition,
      rotation: moveData.rotation !== undefined ? moveData.rotation : player.rotation,
      isMoving: moveData.x !== 0 || moveData.y !== 0
    });
  }
  
  /**
   * Get interpolated state for rendering
   */
  updateRenderState(): void {
    if (this.interpolationBuffer.length < 2) return;
    
    this.renderTime = this.clientTime - this.config.interpolationDelay;
    
    // Find two states to interpolate between
    let beforeState: ServerUpdate | null = null;
    let afterState: ServerUpdate | null = null;
    
    for (let i = 0; i < this.interpolationBuffer.length - 1; i++) {
      const current = this.interpolationBuffer[i];
      const next = this.interpolationBuffer[i + 1];
      
      if (current.timestamp <= this.renderTime && next.timestamp >= this.renderTime) {
        beforeState = current;
        afterState = next;
        break;
      }
    }
    
    if (!beforeState || !afterState) {
      // Use latest state if no interpolation possible
      const latestState = this.interpolationBuffer[this.interpolationBuffer.length - 1];
      this.applyStateToGame(latestState);
      return;
    }
    
    // Interpolate between states
    const interpolatedState = this.interpolateStates(beforeState, afterState, this.renderTime);
    this.applyStateToGame(interpolatedState);
  }
  
  /**
   * Interpolate between two server states
   */
  private interpolateStates(before: ServerUpdate, after: ServerUpdate, renderTime: number): ServerUpdate {
    const timeDiff = after.timestamp - before.timestamp;
    const factor = timeDiff > 0 ? (renderTime - before.timestamp) / timeDiff : 0;
    
    const interpolated: ServerUpdate = {
      ...after,
      timestamp: renderTime
    };
    
    // Interpolate player positions
    if (before.players && after.players) {
      interpolated.players = after.players.map(afterPlayer => {
        const beforePlayer = before.players!.find(p => p.id === afterPlayer.id);
        
        if (!beforePlayer || !beforePlayer.position || !afterPlayer.position) {
          return afterPlayer;
        }
        
        return {
          ...afterPlayer,
          position: {
            x: beforePlayer.position.x + (afterPlayer.position.x - beforePlayer.position.x) * factor,
            y: beforePlayer.position.y + (afterPlayer.position.y - beforePlayer.position.y) * factor
          }
        };
      });
    }
    
    return interpolated;
  }
  
  /**
   * Apply server state to game state manager
   */
  private applyStateToGame(update: ServerUpdate): void {
    // Update match state
    if (update.match) {
      this.gameState.updateMatch(update.match);
    }
    
    // Update players (skip local player if prediction is enabled)
    if (update.players) {
      for (const playerData of update.players) {
        const isLocalPlayer = playerData.id === this.gameState.getState().localPlayerId;
        
        if (!isLocalPlayer || !this.config.enableClientPrediction) {
          this.gameState.updatePlayer(playerData);
        }
      }
    }
    
    // Update projectiles
    if (update.projectiles) {
      // Remove old projectiles not in update
      const currentProjectiles = this.gameState.getState().projectiles;
      const updateProjectileIds = new Set(update.projectiles.map(p => p.id));
      
      for (const id of currentProjectiles.keys()) {
        if (!updateProjectileIds.has(id)) {
          this.gameState.removeProjectile(id);
        }
      }
      
      // Update/add projectiles
      for (const projectileData of update.projectiles) {
        this.gameState.updateProjectile(projectileData);
      }
    }
    
    // Handle removed projectiles
    if (update.removedProjectiles) {
      for (const projectileId of update.removedProjectiles) {
        this.gameState.removeProjectile(projectileId);
      }
    }
    
    // Update timing
    this.gameState.updateTiming(update.timestamp, this.stats.ping);
  }
  
  /**
   * Create input with sequence number
   */
  createInput(type: ClientInput['type'], data: any): ClientInput {
    return {
      type,
      data,
      timestamp: Date.now(),
      sequence: ++this.inputSequence
    };
  }
  
  /**
   * Update state history for delta compression
   */
  private updateStateHistory(update: ServerUpdate): void {
    this.stateHistory.push(update);
    
    if (this.stateHistory.length > this.config.deltaHistorySize) {
      this.stateHistory.shift();
    }
  }
  
  /**
   * Update statistics
   */
  private updateStatistics(now: number): void {
    if (now - this.lastStatsUpdate > 1000) { // Update every second
      const timeDelta = now - this.lastStatsUpdate;
      this.stats.updateRate = (this.updateCount * 1000) / timeDelta;
      
      this.updateCount = 0;
      this.lastStatsUpdate = now;
    }
  }
  
  /**
   * Send ping to measure latency
   */
  sendPing(): void {
    this.lastPingTime = Date.now();
    // The actual ping sending would be handled by NetworkManager
  }
  
  /**
   * Get current statistics
   */
  getStats(): SyncStats {
    return { ...this.stats };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): SyncConfig {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * Reset synchronizer state
   */
  reset(): void {
    this.serverTime = 0;
    this.clientTime = Date.now();
    this.timeOffset = 0;
    this.lastPingTime = 0;
    this.pingHistory = [];
    this.lastServerState = null;
    this.stateHistory = [];
    this.inputSequence = 0;
    this.predictedInputs.clear();
    this.lastAckedInput = 0;
    this.interpolationBuffer = [];
    this.renderTime = this.clientTime - this.config.interpolationDelay;
    
    this.stats = {
      ping: 0,
      packetLoss: 0,
      updateRate: 0,
      predictedInputs: 0,
      reconciliations: 0,
      deltaCompressionRatio: 1.0
    };
    
    console.log('StateSynchronizer reset');
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.reset();
    console.log('StateSynchronizer destroyed');
  }
}