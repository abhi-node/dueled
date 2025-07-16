import Phaser from 'phaser';
import type { Vector2, GameAction, MatchStatus } from '@dueled/shared';
import { Player } from '../entities/Player';

export interface GameStateSnapshot {
  timestamp: number;
  players: Map<string, PlayerState>;
  gameTime: number;
  matchStatus: MatchStatus;
  events: GameAction[];
}

export interface PlayerState {
  playerId: string;
  position: Vector2;
  velocity: Vector2;
  health: number;
  facing: 'left' | 'right';
  isMoving: boolean;
  lastActionTime: number;
  classType: string;
}

export class GameState {
  private scene: Phaser.Scene;
  private currentState: GameStateSnapshot;
  private stateHistory: GameStateSnapshot[] = [];
  private maxHistorySize: number = 60; // Keep 1 second of history at 60fps
  private players: Map<string, Player> = new Map();
  private gameTime: number = 0;
  private matchStatus: MatchStatus = 'waiting' as MatchStatus;
  private lastUpdateTime: number = 0;
  private reconciliationBuffer: GameAction[] = [];
  private predictedActions: Map<string, GameAction> = new Map();
  private serverTick: number = 0;
  private clientTick: number = 0;
  private tickRate: number = 60;
  private interpolationDelay: number = 100; // 100ms interpolation buffer
  private lastReconciliationTime: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.currentState = this.createEmptyState();
  }

  private createEmptyState(): GameStateSnapshot {
    return {
      timestamp: Date.now(),
      players: new Map(),
      gameTime: 0,
      matchStatus: 'waiting' as MatchStatus,
      events: [],
    };
  }

  public update(time: number, delta: number): void {
    this.gameTime += delta;
    this.clientTick++;
    
    // Update current state
    this.updatePlayerStates();
    
    // Process reconciliation buffer
    this.processReconciliation();
    
    // Update state history
    this.updateStateHistory();
    
    // Clean up old data
    this.cleanupOldData();
    
    this.lastUpdateTime = time;
  }

  private updatePlayerStates(): void {
    const playerStates = new Map<string, PlayerState>();
    
    this.players.forEach((player, playerId) => {
      const state: PlayerState = {
        playerId,
        position: player.getPosition(),
        velocity: player.getVelocity(),
        health: player.getCurrentHealth(),
        facing: player.sprite.flipX ? 'left' : 'right',
        isMoving: player.getVelocity().x !== 0 || player.getVelocity().y !== 0,
        lastActionTime: Date.now(),
        classType: player.getClassType(),
      };
      
      playerStates.set(playerId, state);
    });
    
    this.currentState.players = playerStates;
    this.currentState.timestamp = Date.now();
    this.currentState.gameTime = this.gameTime;
    this.currentState.matchStatus = this.matchStatus;
  }

  private processReconciliation(): void {
    const now = Date.now();
    
    // Only reconcile periodically to avoid performance issues
    if (now - this.lastReconciliationTime < 50) { // Every 50ms
      return;
    }
    
    // Process reconciliation buffer
    while (this.reconciliationBuffer.length > 0) {
      const action = this.reconciliationBuffer.shift();
      if (action) {
        this.applyServerAction(action);
      }
    }
    
    this.lastReconciliationTime = now;
  }

  private applyServerAction(action: GameAction): void {
    const player = this.players.get(action.playerId);
    if (!player) return;
    
    // Find the corresponding predicted action
    const predictedAction = this.predictedActions.get(action.playerId);
    
    if (predictedAction) {
      // Compare with prediction
      const isMatch = this.compareActions(action, predictedAction);
      
      if (!isMatch) {
        // Misprediction - need to correct
        console.log('Misprediction detected, correcting...');
        this.correctMisprediction(action, predictedAction);
      }
      
      // Remove from predicted actions
      this.predictedActions.delete(action.playerId);
    }
    
    // Apply the server action
    this.executeAction(action);
  }

  private compareActions(serverAction: GameAction, predictedAction: GameAction): boolean {
    // Compare action type and key data
    if (serverAction.type !== predictedAction.type) {
      return false;
    }
    
    // Compare position data for move actions
    if (serverAction.type === 'move' && predictedAction.type === 'move') {
      const serverPos = serverAction.data.position;
      const predictedPos = predictedAction.data.position;
      
      const distance = Phaser.Math.Distance.Between(
        serverPos.x, serverPos.y,
        predictedPos.x, predictedPos.y
      );
      
      return distance < 10; // Allow small discrepancies
    }
    
    return true;
  }

  private correctMisprediction(serverAction: GameAction, predictedAction: GameAction): void {
    const player = this.players.get(serverAction.playerId);
    if (!player) return;
    
    // Rollback to server state
    if (serverAction.type === 'move') {
      player.updatePosition(serverAction.data.position, serverAction.data.velocity);
    }
    
    // Re-apply any subsequent client actions
    this.reapplyClientActions(serverAction.playerId, serverAction.timestamp);
  }

  private reapplyClientActions(playerId: string, fromTimestamp: number): void {
    // Find and re-apply client actions that happened after the server action
    const clientActions = this.getClientActionsAfter(playerId, fromTimestamp);
    
    clientActions.forEach(action => {
      this.executeAction(action);
    });
  }

  private getClientActionsAfter(playerId: string, timestamp: number): GameAction[] {
    // This would retrieve client actions from a buffer
    // For now, return empty array as placeholder
    return [];
  }

  private executeAction(action: GameAction): void {
    const player = this.players.get(action.playerId);
    if (!player) return;
    
    switch (action.type) {
      case 'move':
        player.updatePosition(action.data.position, action.data.velocity);
        break;
      case 'attack':
        player.attack();
        break;
      case 'use_ability':
        player.useAbility();
        break;
    }
  }

  private updateStateHistory(): void {
    // Add current state to history
    const stateSnapshot: GameStateSnapshot = {
      timestamp: this.currentState.timestamp,
      players: new Map(this.currentState.players),
      gameTime: this.currentState.gameTime,
      matchStatus: this.currentState.matchStatus,
      events: [...this.currentState.events],
    };
    
    this.stateHistory.push(stateSnapshot);
    
    // Limit history size
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  private cleanupOldData(): void {
    const now = Date.now();
    const maxAge = 5000; // 5 seconds
    
    // Clean up old predicted actions
    this.predictedActions.forEach((action, playerId) => {
      if (now - action.timestamp > maxAge) {
        this.predictedActions.delete(playerId);
      }
    });
    
    // Clean up old reconciliation buffer
    this.reconciliationBuffer = this.reconciliationBuffer.filter(action => {
      return now - action.timestamp < maxAge;
    });
  }

  // Public methods
  public addPlayer(playerId: string, player: Player): void {
    this.players.set(playerId, player);
  }

  public removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.currentState.players.delete(playerId);
    this.predictedActions.delete(playerId);
  }

  public getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  public getAllPlayers(): Map<string, Player> {
    return new Map(this.players);
  }

  public getPlayerState(playerId: string): PlayerState | undefined {
    return this.currentState.players.get(playerId);
  }

  public getCurrentState(): GameStateSnapshot {
    return {
      ...this.currentState,
      players: new Map(this.currentState.players),
      events: [...this.currentState.events],
    };
  }

  public getStateAt(timestamp: number): GameStateSnapshot | null {
    // Find the closest state in history
    let closestState = null;
    let minDifference = Infinity;
    
    for (const state of this.stateHistory) {
      const difference = Math.abs(state.timestamp - timestamp);
      if (difference < minDifference) {
        minDifference = difference;
        closestState = state;
      }
    }
    
    return closestState;
  }

  public predictAction(action: GameAction): void {
    // Store predicted action for later reconciliation
    this.predictedActions.set(action.playerId, action);
    
    // Apply optimistically
    this.executeAction(action);
  }

  public reconcileWithServer(serverState: GameStateSnapshot): void {
    // Add server state to reconciliation buffer
    this.reconciliationBuffer.push(...serverState.events);
    
    // Update server tick
    this.serverTick++;
    
    // Interpolate player positions
    this.interpolatePlayerPositions(serverState);
  }

  private interpolatePlayerPositions(serverState: GameStateSnapshot): void {
    const interpolationTime = Date.now() - this.interpolationDelay;
    
    // Find two states to interpolate between
    const state1 = this.getStateAt(interpolationTime - 16); // 16ms ago
    const state2 = this.getStateAt(interpolationTime);
    
    if (!state1 || !state2) return;
    
    // Interpolate each player's position
    serverState.players.forEach((serverPlayerState, playerId) => {
      const player = this.players.get(playerId);
      if (!player) return;
      
      const state1Player = state1.players.get(playerId);
      const state2Player = state2.players.get(playerId);
      
      if (state1Player && state2Player) {
        const alpha = 0.5; // Interpolation factor
        const interpolatedPosition = {
          x: Phaser.Math.Interpolation.Linear([state1Player.position.x, state2Player.position.x], alpha),
          y: Phaser.Math.Interpolation.Linear([state1Player.position.y, state2Player.position.y], alpha),
        };
        
        player.updatePosition(interpolatedPosition);
      }
    });
  }

  public setMatchStatus(status: MatchStatus): void {
    this.matchStatus = status;
    this.currentState.matchStatus = status;
  }

  public getMatchStatus(): MatchStatus {
    return this.matchStatus;
  }

  public getGameTime(): number {
    return this.gameTime;
  }

  public getServerTick(): number {
    return this.serverTick;
  }

  public getClientTick(): number {
    return this.clientTick;
  }

  public getLatency(): number {
    // Calculate network latency based on tick difference
    const tickDifference = this.clientTick - this.serverTick;
    return (tickDifference / this.tickRate) * 1000; // Convert to milliseconds
  }

  public reset(): void {
    this.currentState = this.createEmptyState();
    this.stateHistory = [];
    this.players.clear();
    this.reconciliationBuffer = [];
    this.predictedActions.clear();
    this.gameTime = 0;
    this.matchStatus = 'waiting' as MatchStatus;
    this.serverTick = 0;
    this.clientTick = 0;
  }

  public getStats(): any {
    return {
      gameTime: this.gameTime,
      playerCount: this.players.size,
      historySize: this.stateHistory.length,
      pendingReconciliation: this.reconciliationBuffer.length,
      predictedActions: this.predictedActions.size,
      serverTick: this.serverTick,
      clientTick: this.clientTick,
      latency: this.getLatency(),
    };
  }
}