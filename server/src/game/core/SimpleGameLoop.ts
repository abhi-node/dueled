/**
 * SimpleGameLoop - Core game loop types and interface for 1v1 arena combat
 * 
 * Provides essential types used across the game systems
 */

import type { ClassType } from '@dueled/shared';

export interface SimplePlayer {
  id: string;
  username: string;
  x: number;
  y: number;
  rotation: number;
  health: number;
  maxHealth: number;
  classType: ClassType;
  isAlive: boolean;
  lastUpdate: number;
}

export interface GameLoopConfig {
  tickRate: number;        // Server update rate (Hz)
  maxPlayers: number;      // Always 2 for 1v1
  arenaWidth: number;      // Arena dimensions
  arenaHeight: number;
}

/**
 * SimpleGameLoop - Basic game loop interface
 * Used as a contract for game loop implementations
 */
export interface SimpleGameLoop {
  readonly config: GameLoopConfig;
  readonly players: Map<string, SimplePlayer>;
  readonly isRunning: boolean;
  
  // Player management
  addPlayer(player: SimplePlayer): boolean;
  removePlayer(playerId: string): boolean;
  updatePlayerPosition(playerId: string, x: number, y: number, rotation: number): boolean;
  
  // Game state
  start(): void;
  stop(): void;
  update(deltaTime: number): void;
  
  // Events
  onPlayerJoin?(player: SimplePlayer): void;
  onPlayerLeave?(playerId: string): void;
  onPlayerUpdate?(player: SimplePlayer): void;
}

/**
 * Basic implementation of SimpleGameLoop
 */
export class BasicGameLoop implements SimpleGameLoop {
  public readonly config: GameLoopConfig;
  public readonly players: Map<string, SimplePlayer> = new Map();
  public isRunning = false;
  
  private updateInterval?: NodeJS.Timeout;
  private lastUpdate = 0;
  
  constructor(config: GameLoopConfig) {
    this.config = config;
  }
  
  addPlayer(player: SimplePlayer): boolean {
    if (this.players.size >= this.config.maxPlayers) {
      return false;
    }
    
    this.players.set(player.id, player);
    this.onPlayerJoin?.(player);
    return true;
  }
  
  removePlayer(playerId: string): boolean {
    const removed = this.players.delete(playerId);
    if (removed) {
      this.onPlayerLeave?.(playerId);
    }
    return removed;
  }
  
  updatePlayerPosition(playerId: string, x: number, y: number, rotation: number): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    
    player.x = x;
    player.y = y;
    player.rotation = rotation;
    player.lastUpdate = Date.now();
    
    this.onPlayerUpdate?.(player);
    return true;
  }
  
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastUpdate = Date.now();
    
    const tickInterval = 1000 / this.config.tickRate;
    this.updateInterval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - this.lastUpdate) / 1000;
      this.update(deltaTime);
      this.lastUpdate = now;
    }, tickInterval);
  }
  
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
  }
  
  update(deltaTime: number): void {
    // Basic update - override in subclasses for game-specific logic
    for (const player of this.players.values()) {
      // Update player state if needed
      if (player.lastUpdate && (Date.now() - player.lastUpdate) > 5000) {
        // Player hasn't updated in 5 seconds - could be disconnected
      }
    }
  }
  
  // Event handlers - can be overridden
  onPlayerJoin?(player: SimplePlayer): void;
  onPlayerLeave?(playerId: string): void;
  onPlayerUpdate?(player: SimplePlayer): void;
}