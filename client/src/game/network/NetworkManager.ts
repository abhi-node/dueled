/**
 * NetworkManager - Clean WebSocket event handling for 1v1 arena combat
 * 
 * Replaces monolithic MainGameScene network handling with specialized system
 * Designed for Archer vs Berserker combat with server-authoritative state
 */

import { Socket } from 'socket.io-client';
import type { ClassType } from '@dueled/shared';
import { DeltaProcessor } from './DeltaProcessor.js';
import type { GameStateDelta, FullGameState, ClientPlayerState, ClientProjectileState } from '../../types/DeltaTypes.js';

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
  mapData?: {
    arenaType: string;
    size: { x: number; y: number };
    walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    spawnPoints: Array<{ position: { x: number; y: number }; rotation: number }>;
  };
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
  onMapUpdate?: (mapData: MatchData['mapData']) => void;
  onPlayerIdAssigned?: (data: { matchId: string; yourPlayerId: string }) => void;
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
  
  // Delta compression processor
  private deltaProcessor: DeltaProcessor;
  private useDeltaCompression: boolean = true;
  
  // Network statistics
  private stats: NetworkStats = {
    connected: false,
    ping: 0,
    packetsReceived: 0,
    packetsSent: 0,
    lastHeartbeat: 0,
    reconnectAttempts: 0
  };
  
  // OPTIMIZED: Reduced throttling for smoother movement
  private lastMovementUpdate: number = 0;
  private movementUpdateInterval: number = 16; // 60 FPS for movement (match server)
  
  private lastRotationUpdate: number = 0;
  private rotationUpdateInterval: number = 16; // 60 FPS for rotation (match server)
  
  // Event listener cleanup
  private setupComplete: boolean = false;
  
  constructor(socket: Socket | null = null) {
    this.socket = socket;
    this.callbacks = {};
    
    // Initialize delta processor
    this.deltaProcessor = new DeltaProcessor({
      debugLogging: process.env.NODE_ENV === 'development'
    });
    
    this.setupDeltaProcessorCallbacks();
    
    if (this.socket) {
      this.setupEventListeners();
    }
    
    console.log('NetworkManager initialized with delta compression');
  }
  
  /**
   * Setup delta processor callbacks
   */
  private setupDeltaProcessorCallbacks(): void {
    this.deltaProcessor.setCallbacks({
      onStateUpdate: (players: ClientPlayerState[], projectiles: ClientProjectileState[], roundInfo: any) => {
        // Convert delta processor format to legacy format for compatibility
        const legacyPlayers = players.map(player => ({
          id: player.id,
          x: player.x,
          y: player.y,
          angle: player.rotation,
          classType: player.classType as ClassType,
          health: player.health,
          armor: 50, // Default armor value
          isAlive: player.isAlive,
          isMoving: player.isMoving,
          username: player.username
        }));
        
        const legacyProjectiles = projectiles.map(projectile => ({
          id: projectile.id,
          x: projectile.x,
          y: projectile.y,
          type: projectile.type,
          rotation: projectile.rotation,
          velocity: projectile.velocity,
          ownerId: projectile.ownerId,
          createdAt: projectile.lastUpdate
        }));
        
        // Notify callbacks
        if (this.callbacks.onPlayerUpdate) {
          legacyPlayers.forEach(player => this.callbacks.onPlayerUpdate!(player));
        }
        
        if (this.callbacks.onProjectileUpdate) {
          this.callbacks.onProjectileUpdate(legacyProjectiles);
        }
        
        // Update match data
        if (this.callbacks.onMatchUpdate) {
          this.callbacks.onMatchUpdate({
            matchId: this.matchId,
            yourPlayerId: this.localPlayerId,
            players: legacyPlayers,
            status: roundInfo.status,
            roundNumber: roundInfo.currentRound,
            roundTimeLeft: roundInfo.timeLeft
          });
        }
      },
      
      onFullSyncNeeded: (reason: string) => {
        // OPTIMIZED: Removed delta sync logging for better performance
        if (this.socket) {
          this.socket.emit('request_full_sync', {
            matchId: this.matchId,
            reason
          });
        }
      },
      
      onSequenceGap: (missing: number[]) => {
        // OPTIMIZED: Removed sequence gap logging for better performance
      }
    });
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
    
    // Delta compression events (primary communication)
    this.socket.on('game_state_delta', (data) => this.handleGameStateDelta(data));
    this.socket.on('game_state_full_sync', (data) => this.handleGameStateFullSync(data));
    this.socket.on('player_id_assigned', (data) => this.handlePlayerIdAssigned(data));
    this.socket.on('match_update', (data) => this.handleMatchUpdate(data));
    this.socket.on('match_ended', (data) => this.handleMatchEnded(data));
    this.socket.on('match_error', (data) => this.handleMatchError(data));
    
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
    this.socket.off('game_state');
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
    // Note: localPlayerId will be set when initial_game_state is received
    
    console.log('NetworkManager connected, awaiting player ID from server');
    
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
   * Handle player ID assignment from server
   */
  private handlePlayerIdAssigned(data: { matchId: string; yourPlayerId: string }): void {
    this.matchId = data.matchId;
    this.localPlayerId = data.yourPlayerId;
    
    console.log('🎯 Player ID assigned:', {
      matchId: data.matchId,
      playerId: data.yourPlayerId
    });
    
    // Notify callback
    if (this.callbacks.onPlayerIdAssigned) {
      this.callbacks.onPlayerIdAssigned(data);
    }
  }

  /**
   * Handle delta update from server
   */
  private handleGameStateDelta(data: GameStateDelta): void {
    this.stats.packetsReceived++;
    
    if (this.useDeltaCompression) {
      const success = this.deltaProcessor.processDelta(data);
      
      if (success && this.socket) {
        // Send acknowledgment to server
        this.socket.emit('delta_ack', {
          matchId: data.header.matchId,
          sequence: data.header.sequence
        });
      }
      
      // OPTIMIZED: Removed delta logging for better performance
    }
  }

  /**
   * Handle full sync from server
   */
  private handleGameStateFullSync(data: FullGameState): void {
    this.stats.packetsReceived++;
    
    // Handle map data caching (only sent with full syncs)
    if (data.mapData && this.callbacks.onMapUpdate) {
      console.log('🗺️ Caching map data from full sync');
      this.callbacks.onMapUpdate(data.mapData);
    }
    
    if (this.useDeltaCompression) {
      const success = this.deltaProcessor.processFullSync(data);
      
      if (success && this.socket) {
        // Send acknowledgment to server
        this.socket.emit('delta_ack', {
          matchId: data.header.matchId,
          sequence: data.header.sequence
        });
      }
      
      // OPTIMIZED: Removed full sync logging for better performance
    }
  }

  
  /**
   * Handle match error from server
   */
  private handleMatchError(data: { matchId: string; error: string; code: string }): void {
    console.error('❌ Match error received:', data);
    
    if (this.callbacks.onConnectionError) {
      this.callbacks.onConnectionError(`Match error: ${data.error} (${data.code})`);
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
    
    // OPTIMIZED: Removed movement logging for better performance
    
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
   * Detach all listeners without disconnecting.
   * Useful for React-StrictMode dev remounts where the socket
   * must stay alive across the fake unmount.
   */
  detach(): void {
    this.removeEventListeners();
    console.log('NetworkManager detached (listeners removed, connection preserved)');
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
   * Enable/disable delta compression
   */
  setDeltaCompression(enabled: boolean): void {
    this.useDeltaCompression = enabled;
    console.log(`Delta compression ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Get delta processor statistics
   */
  getDeltaStats(): any {
    return this.deltaProcessor.getStats();
  }
  
  /**
   * Get network statistics including delta info
   */
  getNetworkStats(): NetworkStats & { deltaStats?: any } {
    return {
      ...this.stats,
      deltaStats: this.useDeltaCompression ? this.deltaProcessor.getStats() : undefined
    };
  }
  
  /**
   * Force request full sync
   */
  requestFullSync(reason: string = 'manual'): void {
    if (this.socket && this.matchId) {
      this.socket.emit('request_full_sync', {
        matchId: this.matchId,
        reason
      });
      console.log(`🔄 Manually requested full sync: ${reason}`);
    }
  }
  
  /**
   * Reset delta processor state
   */
  resetDeltaState(): void {
    this.deltaProcessor.reset();
    console.log('🔄 Delta processor state reset');
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.disconnect();
    this.deltaProcessor.reset();
    this.callbacks = {};
    console.log('NetworkManager destroyed');
  }
}