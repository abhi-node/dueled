/**
 * GameStateManager - Single source of truth for client game state
 * 
 * Replaces fragmented state management with unified system
 * Designed for server-authoritative 1v1 arena combat
 */

import type { ClassType } from '@dueled/shared';

export interface ClientPlayer {
  id: string;
  username: string;
  classType: ClassType;
  position: { x: number; y: number };
  rotation: number;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  isAlive: boolean;
  isMoving: boolean;
  isLocal: boolean;
  lastUpdate: number;
}

export interface ClientProjectile {
  id: string;
  type: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  rotation: number;
  ownerId: string;
  damage: number;
  createdAt: number;
  lastUpdate: number;
}

export interface MatchState {
  matchId: string;
  status: 'waiting' | 'starting' | 'in_progress' | 'ended';
  roundNumber: number;
  roundTimeLeft: number;
  maxRounds: number;
  score: { player1: number; player2: number };
  startTime?: number;
  endTime?: number;
}

export interface GameState {
  // Connection state
  connected: boolean;
  localPlayerId: string;
  
  // Match state
  match: MatchState | null;
  
  // Game entities
  players: Map<string, ClientPlayer>;
  projectiles: Map<string, ClientProjectile>;
  
  // Game timing
  serverTime: number;
  clientTime: number;
  timeOffset: number;
  lastUpdate: number;
  
  // Performance metrics
  fps: number;
  ping: number;
  packetLoss: number;
}

export interface GameStateEvents {
  onPlayerUpdate?: (player: ClientPlayer) => void;
  onPlayerJoined?: (player: ClientPlayer) => void;
  onPlayerLeft?: (playerId: string) => void;
  onProjectileAdded?: (projectile: ClientProjectile) => void;
  onProjectileRemoved?: (projectileId: string) => void;
  onMatchUpdate?: (match: MatchState) => void;
  onGameEvent?: (event: { type: string; data: any }) => void;
  onStateChange?: (state: GameState) => void;
}

/**
 * GameStateManager - Unified client state management
 */
export class GameStateManager {
  private state: GameState;
  private events: GameStateEvents = {};
  
  // State update throttling
  private lastStateEmit: number = 0;
  private stateEmitInterval: number = 16; // ~60 FPS state updates
  
  // Entity cleanup
  private cleanupInterval: number = 5000; // 5 seconds
  private lastCleanup: number = 0;
  
  constructor() {
    this.state = this.createInitialState();
    console.log('GameStateManager initialized');
  }
  
  /**
   * Create initial empty state
   */
  private createInitialState(): GameState {
    return {
      connected: false,
      localPlayerId: '',
      match: null,
      players: new Map(),
      projectiles: new Map(),
      serverTime: 0,
      clientTime: Date.now(),
      timeOffset: 0,
      lastUpdate: 0,
      fps: 60,
      ping: 0,
      packetLoss: 0
    };
  }
  
  /**
   * Set event callbacks
   */
  setEventCallbacks(events: GameStateEvents): void {
    this.events = { ...events };
  }
  
  /**
   * Get current game state (read-only)
   */
  getState(): Readonly<GameState> {
    return { ...this.state };
  }
  
  /**
   * Get local player
   */
  getLocalPlayer(): ClientPlayer | null {
    return this.state.players.get(this.state.localPlayerId) || null;
  }
  
  /**
   * Get enemy player
   */
  getEnemyPlayer(): ClientPlayer | null {
    for (const player of this.state.players.values()) {
      if (player.id !== this.state.localPlayerId) {
        return player;
      }
    }
    return null;
  }
  
  /**
   * Initialize connection
   */
  setConnectionState(connected: boolean, localPlayerId?: string): void {
    this.state.connected = connected;
    
    if (localPlayerId) {
      this.state.localPlayerId = localPlayerId;
    }
    
    if (!connected) {
      // Clear state on disconnect
      this.state.match = null;
      this.state.players.clear();
      this.state.projectiles.clear();
    }
    
    this.emitStateChange();
  }
  
  /**
   * Update match state
   */
  updateMatch(matchData: Partial<MatchState>): void {
    if (!this.state.match) {
      this.state.match = {
        matchId: '',
        status: 'waiting',
        roundNumber: 1,
        roundTimeLeft: 180,
        maxRounds: 3,
        score: { player1: 0, player2: 0 },
        ...matchData
      };
    } else {
      Object.assign(this.state.match, matchData);
    }
    
    if (this.events.onMatchUpdate) {
      this.events.onMatchUpdate(this.state.match);
    }
    
    this.emitStateChange();
  }
  
  /**
   * Update or add player
   */
  updatePlayer(playerData: Partial<ClientPlayer> & { id: string }): void {
    const existingPlayer = this.state.players.get(playerData.id);
    const isNewPlayer = !existingPlayer;
    
    const player: ClientPlayer = {
      id: playerData.id,
      username: playerData.username || 'Unknown',
      classType: playerData.classType || 'archer',
      position: playerData.position || { x: 0, y: 0 },
      rotation: playerData.rotation || 0,
      health: playerData.health || 100,
      maxHealth: playerData.maxHealth || 100,
      armor: playerData.armor || 50,
      maxArmor: playerData.maxArmor || 50,
      isAlive: playerData.isAlive !== undefined ? playerData.isAlive : true,
      isMoving: playerData.isMoving || false,
      isLocal: playerData.id === this.state.localPlayerId,
      lastUpdate: Date.now(),
      ...existingPlayer,
      ...playerData
    };
    
    this.state.players.set(player.id, player);
    
    if (isNewPlayer && this.events.onPlayerJoined) {
      this.events.onPlayerJoined(player);
    } else if (this.events.onPlayerUpdate) {
      this.events.onPlayerUpdate(player);
    }
    
    this.emitStateChange();
  }
  
  /**
   * Remove player
   */
  removePlayer(playerId: string): void {
    const removed = this.state.players.delete(playerId);
    
    if (removed && this.events.onPlayerLeft) {
      this.events.onPlayerLeft(playerId);
    }
    
    this.emitStateChange();
  }
  
  /**
   * Update or add projectile
   */
  updateProjectile(projectileData: Partial<ClientProjectile> & { id: string }): void {
    const existingProjectile = this.state.projectiles.get(projectileData.id);
    const isNewProjectile = !existingProjectile;
    
    const projectile: ClientProjectile = {
      id: projectileData.id,
      type: projectileData.type || 'arrow',
      position: projectileData.position || { x: 0, y: 0 },
      velocity: projectileData.velocity || { x: 0, y: 0 },
      rotation: projectileData.rotation || 0,
      ownerId: projectileData.ownerId || '',
      damage: projectileData.damage || 25,
      createdAt: projectileData.createdAt || Date.now(),
      lastUpdate: Date.now(),
      ...existingProjectile,
      ...projectileData
    };
    
    this.state.projectiles.set(projectile.id, projectile);
    
    if (isNewProjectile && this.events.onProjectileAdded) {
      this.events.onProjectileAdded(projectile);
    }
    
    this.emitStateChange();
  }
  
  /**
   * Remove projectile
   */
  removeProjectile(projectileId: string): void {
    const removed = this.state.projectiles.delete(projectileId);
    
    if (removed && this.events.onProjectileRemoved) {
      this.events.onProjectileRemoved(projectileId);
    }
    
    this.emitStateChange();
  }
  
  /**
   * Update timing and synchronization
   */
  updateTiming(serverTime: number, ping: number = 0): void {
    this.state.clientTime = Date.now();
    this.state.serverTime = serverTime;
    this.state.timeOffset = this.state.clientTime - serverTime;
    this.state.ping = ping;
    this.state.lastUpdate = this.state.clientTime;
  }
  
  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(metrics: Partial<{ fps: number; ping: number; packetLoss: number }>): void {
    if (metrics.fps !== undefined) this.state.fps = metrics.fps;
    if (metrics.ping !== undefined) this.state.ping = metrics.ping;
    if (metrics.packetLoss !== undefined) this.state.packetLoss = metrics.packetLoss;
  }
  
  /**
   * Get interpolated position for smooth rendering
   */
  getInterpolatedPosition(playerId: string, deltaTime: number): { x: number; y: number } | null {
    const player = this.state.players.get(playerId);
    if (!player || !player.isMoving) {
      return player ? player.position : null;
    }
    
    // Simple linear interpolation for smooth movement
    // In a real implementation, this would use velocity from server
    const timeSinceUpdate = Date.now() - player.lastUpdate;
    const interpolationFactor = Math.min(timeSinceUpdate / 100, 1); // 100ms interpolation window
    
    return {
      x: player.position.x,
      y: player.position.y
    };
  }
  
  /**
   * Process server update batch
   */
  processServerUpdate(update: {
    players?: Array<Partial<ClientPlayer> & { id: string }>;
    projectiles?: Array<Partial<ClientProjectile> & { id: string }>;
    match?: Partial<MatchState>;
    events?: Array<{ type: string; data: any }>;
    timestamp?: number;
  }): void {
    // Update timing if provided
    if (update.timestamp) {
      this.updateTiming(update.timestamp);
    }
    
    // Update match state
    if (update.match) {
      this.updateMatch(update.match);
    }
    
    // Update players
    if (update.players) {
      for (const playerData of update.players) {
        this.updatePlayer(playerData);
      }
    }
    
    // Update projectiles
    if (update.projectiles) {
      // Remove projectiles not in update (they've been destroyed)
      const updateProjectileIds = new Set(update.projectiles.map(p => p.id));
      for (const existingId of this.state.projectiles.keys()) {
        if (!updateProjectileIds.has(existingId)) {
          this.removeProjectile(existingId);
        }
      }
      
      // Update/add projectiles from server
      for (const projectileData of update.projectiles) {
        this.updateProjectile(projectileData);
      }
    }
    
    // Process game events
    if (update.events && this.events.onGameEvent) {
      for (const event of update.events) {
        this.events.onGameEvent(event);
      }
    }
    
    // Cleanup old entities
    this.performCleanup();
  }
  
  /**
   * Clean up stale entities
   */
  private performCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) return;
    
    this.lastCleanup = now;
    const maxAge = 10000; // 10 seconds
    
    // Clean up old projectiles
    for (const [id, projectile] of this.state.projectiles.entries()) {
      if (now - projectile.lastUpdate > maxAge) {
        this.removeProjectile(id);
      }
    }
    
    // Clean up disconnected players (except local player)
    for (const [id, player] of this.state.players.entries()) {
      if (id !== this.state.localPlayerId && now - player.lastUpdate > maxAge) {
        this.removePlayer(id);
      }
    }
  }
  
  /**
   * Emit state change event (throttled)
   */
  private emitStateChange(): void {
    const now = Date.now();
    if (now - this.lastStateEmit < this.stateEmitInterval) return;
    
    this.lastStateEmit = now;
    
    if (this.events.onStateChange) {
      this.events.onStateChange(this.state);
    }
  }
  
  /**
   * Get state statistics for debugging
   */
  getStats(): {
    connected: boolean;
    players: number;
    projectiles: number;
    ping: number;
    fps: number;
    timeOffset: number;
    lastUpdate: number;
  } {
    return {
      connected: this.state.connected,
      players: this.state.players.size,
      projectiles: this.state.projectiles.size,
      ping: this.state.ping,
      fps: this.state.fps,
      timeOffset: this.state.timeOffset,
      lastUpdate: this.state.lastUpdate
    };
  }
  
  /**
   * Reset to initial state
   */
  reset(): void {
    this.state = this.createInitialState();
    this.emitStateChange();
    console.log('GameStateManager reset');
  }
  
  /**
   * Update game state from server data
   */
  updateFromServer(gameUpdate: any): void {
    try {
      // Update players
      if (gameUpdate.players) {
        for (const [playerId, playerData] of Object.entries(gameUpdate.players as any)) {
          this.updatePlayer({ ...playerData as any, id: playerId });
        }
      }
      
      // Update projectiles
      if (gameUpdate.projectiles) {
        this.state.projectiles.clear();
        for (const [projectileId, projectileData] of Object.entries(gameUpdate.projectiles as any)) {
          this.state.projectiles.set(projectileId, projectileData as ClientProjectile);
        }
      }
      
      // Update match state
      if (gameUpdate.matchState) {
        this.state.match = { ...this.state.match, ...gameUpdate.matchState };
      }
      
      this.emitStateChange();
    } catch (error) {
      console.error('Error updating from server:', error);
    }
  }
  
  /**
   * Update player rotation
   */
  updatePlayerRotation(playerId: string, angle: number): void {
    const player = this.state.players.get(playerId);
    if (player) {
      player.rotation = angle;
      player.lastUpdate = Date.now();
      this.emitStateChange();
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.reset();
    this.events = {};
    console.log('GameStateManager destroyed');
  }
}