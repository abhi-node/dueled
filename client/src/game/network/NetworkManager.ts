/**
 * NetworkManager - Clean WebSocket event handling for 1v1 arena combat
 * 
 * Replaces monolithic MainGameScene network handling with specialized system
 * Designed for Archer vs Berserker combat with server-authoritative state
 */

import { Socket } from 'socket.io-client';
import type { ClassType } from '@dueled/shared';

export interface PlayerUpdate {
  id: string;
  x: number;
  y: number;
  angle: number;
  classType: ClassType;
  health: number;
  armor: number;
  isAlive: boolean;
  isMoving: boolean;
  username?: string;
}

export interface ProjectileUpdate {
  id: string;
  x: number;
  y: number;
  type: string;
  rotation: number;
  velocity: { x: number; y: number };
  ownerId: string;
  createdAt: number;
}

export interface GameEvent {
  type: 'damage' | 'death' | 'respawn' | 'ability_used' | 'round_start' | 'round_end';
  playerId?: string;
  data?: any;
  timestamp: number;
}

export interface MatchData {
  matchId: string;
  yourPlayerId: string;
  players: PlayerUpdate[];
  roundNumber: number;
  roundTimeLeft: number;
  status: 'waiting' | 'in_progress' | 'ended';
}

export interface NetworkCallbacks {
  onPlayerUpdate?: (player: PlayerUpdate) => void;
  onPlayerJoined?: (player: PlayerUpdate) => void;
  onPlayerLeft?: (playerId: string) => void;
  onProjectileUpdate?: (projectiles: ProjectileUpdate[]) => void;
  onProjectileRemoved?: (projectileId: string) => void;
  onGameEvent?: (event: GameEvent) => void;
  onMatchUpdate?: (data: MatchData) => void;
  onMatchEnded?: (data: { winner: string; reason: string }) => void;
  onConnectionError?: (error: string) => void;
  onDisconnected?: (reason: string) => void;
  onReconnected?: () => void;
}

export interface NetworkStats {
  connected: boolean;
  ping: number;
  packetsReceived: number;
  packetsSent: number;
  lastHeartbeat: number;
  reconnectAttempts: number;
}

/**
 * NetworkManager - Simplified WebSocket communication
 */
export class NetworkManager {
  private socket: Socket | null;
  private callbacks: NetworkCallbacks;
  
  private localPlayerId: string = '';
  private matchId: string = '';
  private connected: boolean = false;
  
  // Network statistics
  private stats: NetworkStats = {
    connected: false,
    ping: 0,
    packetsReceived: 0,
    packetsSent: 0,
    lastHeartbeat: 0,
    reconnectAttempts: 0
  };
  
  // Throttling for movement updates
  private lastMovementUpdate: number = 0;
  private movementUpdateInterval: number = 50; // 20 FPS for movement
  
  private lastRotationUpdate: number = 0;
  private rotationUpdateInterval: number = 100; // 10 FPS for rotation
  
  // Event listener cleanup
  private setupComplete: boolean = false;
  
  constructor(socket: Socket | null = null) {
    this.socket = socket;
    this.callbacks = {};
    
    if (this.socket) {
      this.setupEventListeners();
    }
    
    console.log('NetworkManager initialized');
  }
  
  /**
   * Set socket and setup event listeners
   */
  setSocket(socket: Socket): void {
    if (this.socket && this.setupComplete) {
      this.removeEventListeners();
    }
    
    this.socket = socket;
    this.setupEventListeners();
  }
  
  /**
   * Set network callbacks
   */
  setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = { ...callbacks };
  }
  
  /**
   * Setup all socket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket || this.setupComplete) return;
    
    // Connection events
    this.socket.on('connect', () => this.handleConnect());
    this.socket.on('disconnect', (reason) => this.handleDisconnect(reason));
    this.socket.on('connect_error', (error) => this.handleConnectionError(error));
    this.socket.on('reconnect', () => this.handleReconnect());
    
    // Player events
    this.socket.on('player_update', (data) => this.handlePlayerUpdate(data));
    this.socket.on('player_joined', (data) => this.handlePlayerJoined(data));
    this.socket.on('player_left', (data) => this.handlePlayerLeft(data));
    
    // Projectile events
    this.socket.on('projectile_update', (data) => this.handleProjectileUpdate(data));
    this.socket.on('projectile_removed', (data) => this.handleProjectileRemoved(data));
    
    // Game events
    this.socket.on('game_event', (data) => this.handleGameEvent(data));
    this.socket.on('match_update', (data) => this.handleMatchUpdate(data));
    this.socket.on('match_ended', (data) => this.handleMatchEnded(data));
    this.socket.on('initial_game_state', (data) => this.handleInitialGameState(data));
    
    // Network monitoring
    this.socket.on('pong', (latency) => this.handlePong(latency));
    
    this.setupComplete = true;
    console.log('NetworkManager event listeners setup complete');
  }
  
  /**
   * Remove all socket event listeners
   */
  private removeEventListeners(): void {
    if (!this.socket) return;
    
    this.socket.off('connect');
    this.socket.off('disconnect');
    this.socket.off('connect_error');
    this.socket.off('reconnect');
    this.socket.off('player_update');
    this.socket.off('player_joined');
    this.socket.off('player_left');
    this.socket.off('projectile_update');
    this.socket.off('projectile_removed');
    this.socket.off('game_event');
    this.socket.off('match_update');
    this.socket.off('match_ended');
    this.socket.off('initial_game_state');
    this.socket.off('pong');
    
    this.setupComplete = false;
    console.log('NetworkManager event listeners removed');
  }
  
  /**
   * Handle connection established
   */
  private handleConnect(): void {
    this.connected = true;
    this.stats.connected = true;
    this.stats.reconnectAttempts = 0;
    this.localPlayerId = this.socket?.id || '';
    
    console.log('NetworkManager connected:', this.localPlayerId);
    
    if (this.callbacks.onReconnected) {
      this.callbacks.onReconnected();
    }
  }
  
  /**
   * Handle disconnection
   */
  private handleDisconnect(reason: string): void {
    this.connected = false;
    this.stats.connected = false;
    
    console.log('NetworkManager disconnected:', reason);
    
    if (this.callbacks.onDisconnected) {
      this.callbacks.onDisconnected(reason);
    }
  }
  
  /**
   * Handle connection error
   */
  private handleConnectionError(error: any): void {
    console.error('NetworkManager connection error:', error);
    this.stats.reconnectAttempts++;
    
    if (this.callbacks.onConnectionError) {
      this.callbacks.onConnectionError(error.message || 'Connection failed');
    }
  }
  
  /**
   * Handle reconnection
   */
  private handleReconnect(): void {
    console.log('NetworkManager reconnected');
    this.stats.reconnectAttempts = 0;
    
    if (this.callbacks.onReconnected) {
      this.callbacks.onReconnected();
    }
  }
  
  /**
   * Handle player update from server
   */
  private handlePlayerUpdate(data: PlayerUpdate): void {
    this.stats.packetsReceived++;
    
    if (this.callbacks.onPlayerUpdate) {
      this.callbacks.onPlayerUpdate(data);
    }
  }
  
  /**
   * Handle player joined
   */
  private handlePlayerJoined(data: PlayerUpdate): void {
    this.stats.packetsReceived++;
    
    if (this.callbacks.onPlayerJoined) {
      this.callbacks.onPlayerJoined(data);
    }
  }
  
  /**
   * Handle player left
   */
  private handlePlayerLeft(data: { playerId: string }): void {
    this.stats.packetsReceived++;
    
    if (this.callbacks.onPlayerLeft) {
      this.callbacks.onPlayerLeft(data.playerId);
    }
  }
  
  /**
   * Handle projectile updates
   */
  private handleProjectileUpdate(data: ProjectileUpdate[]): void {
    this.stats.packetsReceived++;
    
    if (this.callbacks.onProjectileUpdate) {
      this.callbacks.onProjectileUpdate(data);
    }
  }
  
  /**
   * Handle projectile removed
   */
  private handleProjectileRemoved(data: { projectileId: string }): void {
    this.stats.packetsReceived++;
    
    if (this.callbacks.onProjectileRemoved) {
      this.callbacks.onProjectileRemoved(data.projectileId);
    }
  }
  
  /**
   * Handle game events
   */
  private handleGameEvent(data: GameEvent): void {
    this.stats.packetsReceived++;
    
    if (this.callbacks.onGameEvent) {
      this.callbacks.onGameEvent(data);
    }
  }
  
  /**
   * Handle match updates
   */
  private handleMatchUpdate(data: MatchData): void {
    this.stats.packetsReceived++;
    this.matchId = data.matchId;
    this.localPlayerId = data.yourPlayerId;
    
    if (this.callbacks.onMatchUpdate) {
      this.callbacks.onMatchUpdate(data);
    }
  }
  
  /**
   * Handle match ended
   */
  private handleMatchEnded(data: { winner: string; reason: string }): void {
    this.stats.packetsReceived++;
    
    if (this.callbacks.onMatchEnded) {
      this.callbacks.onMatchEnded(data);
    }
  }
  
  /**
   * Handle initial game state
   */
  private handleInitialGameState(data: MatchData): void {
    this.stats.packetsReceived++;
    this.matchId = data.matchId;
    this.localPlayerId = data.yourPlayerId;
    
    console.log('NetworkManager received initial game state:', {
      matchId: data.matchId,
      yourPlayerId: data.yourPlayerId,
      players: data.players.length
    });
    
    if (this.callbacks.onMatchUpdate) {
      this.callbacks.onMatchUpdate(data);
    }
  }
  
  /**
   * Handle pong response for latency measurement
   */
  private handlePong(latency: number): void {
    this.stats.ping = latency;
    this.stats.lastHeartbeat = Date.now();
  }
  
  /**
   * Send movement update to server (throttled)
   */
  sendMovementUpdate(x: number, y: number, classType: ClassType): void {
    if (!this.connected || !this.socket) return;
    
    const now = Date.now();
    if (now - this.lastMovementUpdate < this.movementUpdateInterval) return;
    
    this.socket.emit('player_move', {
      x,
      y,
      classType,
      timestamp: now
    });
    
    this.stats.packetsSent++;
    this.lastMovementUpdate = now;
  }
  
  /**
   * Send rotation update to server (throttled)
   */
  sendRotationUpdate(angle: number): void {
    if (!this.connected || !this.socket) return;
    
    const now = Date.now();
    if (now - this.lastRotationUpdate < this.rotationUpdateInterval) return;
    
    this.socket.emit('player_rotate', {
      angle,
      timestamp: now
    });
    
    this.stats.packetsSent++;
    this.lastRotationUpdate = now;
  }
  
  /**
   * Send primary attack
   */
  sendPrimaryAttack(): void {
    if (!this.connected || !this.socket) return;
    
    this.socket.emit('primary_attack', {
      timestamp: Date.now()
    });
    
    this.stats.packetsSent++;
  }
  
  /**
   * Send special ability
   */
  sendSpecialAbility(): void {
    if (!this.connected || !this.socket) return;
    
    this.socket.emit('special_ability', {
      timestamp: Date.now()
    });
    
    this.stats.packetsSent++;
  }
  
  /**
   * Send dash action
   */
  sendDash(direction: { x: number; y: number }): void {
    if (!this.connected || !this.socket) return;
    
    this.socket.emit('dash', {
      direction,
      timestamp: Date.now()
    });
    
    this.stats.packetsSent++;
  }
  
  /**
   * Send ready signal
   */
  sendReady(): void {
    if (!this.connected || !this.socket) return;
    
    this.socket.emit('player_ready', {
      timestamp: Date.now()
    });
    
    this.stats.packetsSent++;
  }
  
  /**
   * Leave match
   */
  leaveMatch(): void {
    if (!this.connected || !this.socket) return;
    
    this.socket.emit('leave_match', {
      matchId: this.matchId,
      timestamp: Date.now()
    });
    
    this.stats.packetsSent++;
  }
  
  /**
   * Get local player ID
   */
  getLocalPlayerId(): string {
    return this.localPlayerId;
  }
  
  /**
   * Get match ID
   */
  getMatchId(): string {
    return this.matchId;
  }
  
  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }
  
  /**
   * Get network statistics
   */
  getStats(): NetworkStats {
    return { ...this.stats };
  }
  
  /**
   * Update throttling settings
   */
  updateThrottling(movementInterval: number, rotationInterval: number): void {
    this.movementUpdateInterval = movementInterval;
    this.rotationUpdateInterval = rotationInterval;
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      connected: this.connected,
      ping: 0,
      packetsReceived: 0,
      packetsSent: 0,
      lastHeartbeat: 0,
      reconnectAttempts: 0
    };
  }
  
  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    if (this.socket) {
      this.removeEventListeners();
      this.socket.disconnect();
    }
    
    this.connected = false;
    this.stats.connected = false;
    this.localPlayerId = '';
    this.matchId = '';
    
    console.log('NetworkManager disconnected');
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.disconnect();
    this.callbacks = {};
    console.log('NetworkManager destroyed');
  }
}