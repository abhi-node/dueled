/**
 * GameState - Client-side game state management
 * 
 * Manages the client's view of the game state, handles prediction,
 * and provides access to game data for rendering and UI.
 */

import type {
  ClientGameState,
  ClientPlayerState,
  ClientProjectileState,
  Position,
  Velocity
} from '../types/GameTypes.js';
import type { InputCommand } from '../types/InputTypes.js';
import { GAME_CONSTANTS } from '../types/GameConstants.js';

export class ClientGameStateManager {
  private gameState: ClientGameState | null = null;
  private predictedState: ClientGameState | null = null;
  private pendingInputs: InputCommand[] = [];
  
  // Interpolation buffers for smooth rendering
  private playerPositionHistory = new Map<string, Array<{ position: Position; timestamp: number }>>();
  private projectilePositionHistory = new Map<string, Array<{ position: Position; timestamp: number }>>();
  
  // State tracking
  private isInMatch = false;
  private isPredictionEnabled = true;
  
  constructor() {
    // Initialize with null state
    this.gameState = null;
    this.predictedState = null;
  }
  
  // ============================================================================
  // STATE INITIALIZATION
  // ============================================================================
  
  /**
   * Initialize game state for a new match
   */
  initializeState(initialState: ClientGameState): void {
    console.log('Initializing client game state for match:', initialState.matchId);
    
    this.gameState = { ...initialState };
    this.predictedState = this.cloneGameState(initialState);
    this.isInMatch = true;
    
    // Clear histories
    this.clearHistories();
    
    // Clear pending inputs
    this.pendingInputs = [];
  }
  
  /**
   * Clear game state (on match end)
   */
  clearState(): void {
    console.log('Clearing client game state');
    
    this.gameState = null;
    this.predictedState = null;
    this.isInMatch = false;
    
    this.clearHistories();
    this.pendingInputs = [];
  }
  
  // ============================================================================
  // STATE ACCESS
  // ============================================================================
  
  /**
   * Get current game state (predicted if available, otherwise server state)
   */
  getCurrentState(): ClientGameState | null {
    if (this.isPredictionEnabled && this.predictedState) {
      return this.predictedState;
    }
    return this.gameState;
  }
  
  /**
   * Get server-authoritative state
   */
  getServerState(): ClientGameState | null {
    return this.gameState;
  }
  
  /**
   * Get predicted state
   */
  getPredictedState(): ClientGameState | null {
    return this.predictedState;
  }
  
  /**
   * Get local player from current state
   */
  getLocalPlayer(): ClientPlayerState | null {
    const state = this.getCurrentState();
    if (!state) return null;
    
    return state.players.get(state.localPlayerId) || null;
  }
  
  /**
   * Get all players from current state
   */
  getAllPlayers(): ClientPlayerState[] {
    const state = this.getCurrentState();
    if (!state) return [];
    
    const players: ClientPlayerState[] = [];
    state.players.forEach(player => players.push(player));
    return players;
  }
  
  /**
   * Get all projectiles from current state
   */
  getAllProjectiles(): ClientProjectileState[] {
    const state = this.getCurrentState();
    if (!state) return [];
    
    const projectiles: ClientProjectileState[] = [];
    state.projectiles.forEach(projectile => projectiles.push(projectile));
    return projectiles;
  }
  
  // ============================================================================
  // SERVER STATE UPDATES
  // ============================================================================
  
  /**
   * Update from server delta
   */
  updateFromServer(newState: ClientGameState): void {
    if (!this.gameState) {
      console.warn('Cannot update: no game state initialized');
      return;
    }
    
    // Store previous state for history
    this.recordStateHistory();
    
    // Update server state
    this.gameState = { ...newState };
    
    // Update predicted state if prediction is enabled
    if (this.isPredictionEnabled) {
      this.updatePredictedState();
    }
  }
  
  /**
   * Update specific player from server
   */
  updatePlayer(playerId: string, playerUpdate: Partial<ClientPlayerState>): void {
    if (!this.gameState) return;
    
    const player = this.gameState.players.get(playerId);
    if (player) {
      // Update server state
      Object.assign(player, playerUpdate);
      player.lastUpdateTime = Date.now();
      
      // Update predicted state if this is not the local player
      if (this.predictedState && playerId !== this.gameState.localPlayerId) {
        const predictedPlayer = this.predictedState.players.get(playerId);
        if (predictedPlayer) {
          Object.assign(predictedPlayer, playerUpdate);
          predictedPlayer.lastUpdateTime = Date.now();
        }
      }
      
      // Record position history for interpolation
      if (playerUpdate.position) {
        this.recordPlayerPosition(playerId, playerUpdate.position);
      }
    }
  }
  
  /**
   * Update specific projectile from server
   */
  updateProjectile(projectileId: string, projectileUpdate: Partial<ClientProjectileState>): void {
    if (!this.gameState) return;
    
    const projectile = this.gameState.projectiles.get(projectileId);
    if (projectile) {
      // Update server state
      Object.assign(projectile, projectileUpdate);
      projectile.lastUpdateTime = Date.now();
      
      // Update predicted state
      if (this.predictedState) {
        const predictedProjectile = this.predictedState.projectiles.get(projectileId);
        if (predictedProjectile) {
          Object.assign(predictedProjectile, projectileUpdate);
          predictedProjectile.lastUpdateTime = Date.now();
        }
      }
      
      // Record position history
      if (projectileUpdate.position) {
        this.recordProjectilePosition(projectileId, projectileUpdate.position);
      }
    }
  }
  
  // ============================================================================
  // CLIENT PREDICTION
  // ============================================================================
  
  /**
   * Add input to prediction queue
   */
  addPendingInput(input: InputCommand): void {
    if (!this.isPredictionEnabled || !this.predictedState) {
      return;
    }
    
    this.pendingInputs.push(input);
    this.applyInputToPredictedState(input);
  }
  
  /**
   * Remove acknowledged inputs from prediction queue
   */
  acknowledgeInputs(lastProcessedSequence: number): void {
    this.pendingInputs = this.pendingInputs.filter(
      input => input.sequenceId > lastProcessedSequence
    );
    
    // Re-apply remaining inputs to server state
    if (this.isPredictionEnabled) {
      this.updatePredictedState();
    }
  }
  
  private updatePredictedState(): void {
    if (!this.gameState || !this.isPredictionEnabled) {
      return;
    }
    
    // Start with server state
    this.predictedState = this.cloneGameState(this.gameState);
    
    // Re-apply pending inputs
    for (const input of this.pendingInputs) {
      this.applyInputToPredictedState(input);
    }
  }
  
  private applyInputToPredictedState(input: InputCommand): void {
    if (!this.predictedState) return;
    
    const localPlayer = this.predictedState.players.get(this.predictedState.localPlayerId);
    if (!localPlayer) return;
    
    // Apply input based on type
    switch (input.type) {
      case 'movement':
        this.applyMovementPrediction(localPlayer, input);
        break;
        
      case 'look':
        this.applyLookPrediction(localPlayer, input);
        break;
        
      // Attack and ability predictions would be more complex
      // For now, just update timestamp
      case 'attack':
      case 'ability':
        localPlayer.lastUpdateTime = Date.now();
        break;
    }
  }
  
  private applyMovementPrediction(player: ClientPlayerState, input: InputCommand): void {
    const { forward = 0, strafe = 0, sprint = false } = input.data;
    
    // Simple movement prediction (matches server logic exactly)
    const speed = GAME_CONSTANTS.PLAYER_SPEED;
    const sprintMultiplier = sprint ? GAME_CONSTANTS.SPRINT_MULTIPLIER : 1;
    const deltaTime = 1 / 60; // Assume 60 FPS
    
    // Calculate movement in player's facing direction
    const moveDistance = speed * sprintMultiplier * deltaTime;
    const forwardX = Math.cos(player.angle) * forward * moveDistance;
    const forwardY = Math.sin(player.angle) * forward * moveDistance;
    const strafeX = Math.cos(player.angle + Math.PI/2) * strafe * moveDistance;
    const strafeY = Math.sin(player.angle + Math.PI/2) * strafe * moveDistance;
    
    // Update position
    player.position.x += forwardX + strafeX;
    player.position.y += forwardY + strafeY;
    
    // Update velocity for rendering
    player.velocity.x = (forwardX + strafeX) / deltaTime;
    player.velocity.y = (forwardY + strafeY) / deltaTime;
    
    // Update movement state
    player.isMoving = Math.abs(forward) > 0.01 || Math.abs(strafe) > 0.01;
    player.lastUpdateTime = Date.now();
  }
  
  private applyLookPrediction(player: ClientPlayerState, input: InputCommand): void {
    const { angleDelta = 0 } = input.data;
    
    const oldAngle = player.angle;
    
    // Update facing angle
    player.angle += angleDelta;
    
    // Normalize angle to 0-2π range
    while (player.angle < 0) player.angle += Math.PI * 2;
    while (player.angle >= Math.PI * 2) player.angle -= Math.PI * 2;
    
    
    player.lastUpdateTime = Date.now();
  }
  
  // ============================================================================
  // INTERPOLATION HISTORY
  // ============================================================================
  
  private recordStateHistory(): void {
    if (!this.gameState) return;
    
    const timestamp = Date.now();
    
    // Record player positions
    this.gameState.players.forEach((player, playerId) => {
      this.recordPlayerPosition(playerId, player.position, timestamp);
    });
    
    // Record projectile positions
    this.gameState.projectiles.forEach((projectile, projectileId) => {
      this.recordProjectilePosition(projectileId, projectile.position, timestamp);
    });
  }
  
  private recordPlayerPosition(playerId: string, position: Position, timestamp = Date.now()): void {
    let history = this.playerPositionHistory.get(playerId);
    if (!history) {
      history = [];
      this.playerPositionHistory.set(playerId, history);
    }
    
    history.push({ position: { ...position }, timestamp });
    
    // Keep only recent history (last 1 second)
    const cutoff = timestamp - 1000;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }
  }
  
  private recordProjectilePosition(projectileId: string, position: Position, timestamp = Date.now()): void {
    let history = this.projectilePositionHistory.get(projectileId);
    if (!history) {
      history = [];
      this.projectilePositionHistory.set(projectileId, history);
    }
    
    history.push({ position: { ...position }, timestamp });
    
    // Keep only recent history
    const cutoff = timestamp - 1000;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }
  }
  
  private clearHistories(): void {
    this.playerPositionHistory.clear();
    this.projectilePositionHistory.clear();
  }
  
  // ============================================================================
  // INTERPOLATION
  // ============================================================================
  
  /**
   * Get interpolated position for smooth rendering
   */
  getInterpolatedPlayerPosition(playerId: string, renderTime: number): Position | null {
    const history = this.playerPositionHistory.get(playerId);
    if (!history || history.length < 2) {
      // Fallback to current position
      const player = this.getCurrentState()?.players.get(playerId);
      return player ? { ...player.position } : null;
    }
    
    // Find two points to interpolate between
    let older = history[0];
    let newer = history[history.length - 1];
    
    for (let i = 1; i < history.length; i++) {
      if (history[i].timestamp >= renderTime) {
        newer = history[i];
        older = history[i - 1];
        break;
      }
      older = history[i];
    }
    
    // Interpolate between older and newer
    const timeDiff = newer.timestamp - older.timestamp;
    if (timeDiff === 0) {
      return { ...newer.position };
    }
    
    const factor = (renderTime - older.timestamp) / timeDiff;
    const clampedFactor = Math.max(0, Math.min(1, factor));
    
    return {
      x: older.position.x + (newer.position.x - older.position.x) * clampedFactor,
      y: older.position.y + (newer.position.y - older.position.y) * clampedFactor
    };
  }
  
  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  /**
   * Enable/disable client-side prediction
   */
  setPredictionEnabled(enabled: boolean): void {
    this.isPredictionEnabled = enabled;
    
    if (!enabled) {
      this.predictedState = null;
      this.pendingInputs = [];
    } else if (this.gameState) {
      this.updatePredictedState();
    }
  }
  
  /**
   * Check if in match
   */
  isInActiveMatch(): boolean {
    return this.isInMatch && this.gameState !== null;
  }
  
  // ============================================================================
  // UTILITY
  // ============================================================================
  
  private cloneGameState(state: ClientGameState): ClientGameState {
    const clonedPlayers = new Map<string, ClientPlayerState>();
    state.players.forEach((player, id) => {
      clonedPlayers.set(id, { ...player });
    });
    
    const clonedProjectiles = new Map<string, ClientProjectileState>();
    state.projectiles.forEach((projectile, id) => {
      clonedProjectiles.set(id, { ...projectile });
    });
    
    return {
      ...state,
      players: clonedPlayers,
      projectiles: clonedProjectiles,
      mapData: { ...state.mapData },
      score: { ...state.score }
    };
  }
}