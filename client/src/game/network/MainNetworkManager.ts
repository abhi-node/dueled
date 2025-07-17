/**
 * MainNetworkManager - Network communication for the main game
 * Handles WebSocket connections and game state synchronization
 */

import { io, Socket } from 'socket.io-client';
import { WSEvents } from '@dueled/shared';
import type { Vector2, ClassType, MovePayload, RotatePayload, AttackPayload } from '@dueled/shared';

export interface NetworkEventHandler {
  onPlayerJoined(playerId: string, data: any): void;
  onPlayerLeft(playerId: string, data?: any): void;
  onPlayerMoved(playerId: string, position: Vector2, angle: number, classType?: ClassType): void;
  onPlayerRotated?(playerId: string, angle: number, classType?: ClassType): void;
  onMatchEnded?(data: any): void;
  handleGameUpdate?(data: any): void;
  onProjectileUpdate?(projectiles: any[]): void;
  onGameEvents?(events: any[]): void;
  updatePlayerIdFromNetwork?(playerId: string): void;
  onInitialGameState?(data: any): void;
}

export class MainNetworkManager {
  private socket: Socket | null = null;
  private eventHandler: NetworkEventHandler;
  private isConnected: boolean = false;
  private serverUrl: string = 'http://localhost:3000';
  private playerId: string = '';
  
  constructor(eventHandler: NetworkEventHandler, socket?: Socket | null) {
    this.eventHandler = eventHandler;
    if (socket) {
      this.socket = socket;
      this.isConnected = socket.connected;
      console.log('🔌 MainNetworkManager: Using existing socket, connected:', this.isConnected);
    }
  }
  
  /**
   * Connect to the game server
   */
  public connect(): void {
    // If we already have a socket from constructor, set up event handlers and use it
    if (this.socket) {
      console.log('🔌 MainNetworkManager: Using existing socket from constructor');
      this.isConnected = this.socket.connected;
      this.setupEventHandlers();
      
      // If socket is already connected, we're ready
      if (this.socket.connected) {
        console.log('🔌 MainNetworkManager: Socket already connected');
        return;
      }
      
      // If socket is not connected, try to reconnect
      console.log('🔌 MainNetworkManager: Socket not connected, attempting to reconnect...');
      this.socket.connect();
      return;
    }
    
    // Only create new socket if we don't have one
    console.log('🔌 MainNetworkManager: Creating new socket connection');
    
    const token = this.getAuthToken();
    if (!token) {
      console.warn('🔌 No authentication token found - attempting anonymous connection');
      // Create anonymous connection
      this.socket = io(`${this.serverUrl}/game`, {
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });
    } else {
      // Create authenticated connection
      this.socket = io(`${this.serverUrl}/game`, {
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });
    }
    
    this.setupEventHandlers();
  }
  
  /**
   * Disconnect from the server
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }
  
  /**
   * Send player movement update
   */
  public sendMovement(data: { x: number; y: number; angle: number; classType?: ClassType }): void {
    if (!this.socket || !this.isConnected) return;
    
    const payload: MovePayload = {
      position: { x: data.x, y: data.y },
      angle: data.angle,
      classType: data.classType,
      timestamp: Date.now()
    };
    this.socket.emit(WSEvents.PLAYER_MOVE, payload);
  }
  
  /**
   * Send player rotation update (without movement)
   */
  public sendRotation(data: { angle: number; classType?: ClassType }): void {
    if (!this.socket || !this.isConnected) return;
    
    const payload: RotatePayload = {
      angle: data.angle,
      classType: data.classType,
      timestamp: Date.now()
    };
    this.socket.emit(WSEvents.PLAYER_ROTATE, payload);
  }
  
  /**
   * Get the player ID from the server
   */
  public getPlayerId(): string {
    return this.playerId;
  }
  
  /**
   * Send attack action with target information
   */
  public sendAttack(attackData: {
    direction?: { x: number; y: number };
    targetPosition?: { x: number; y: number };
    attackType?: 'basic' | 'special';
  }): void {
    if (!this.socket || !this.isConnectedToServer()) {
      console.error('🚨 Cannot send attack - socket not connected', {
        hasSocket: !!this.socket,
        isConnected: this.isConnected,
        socketConnected: this.socket?.connected,
        socketId: this.socket?.id
      });
      return;
    }
    
    const attackPayload: AttackPayload = {
      direction: attackData.direction,
      targetPosition: attackData.targetPosition,
      attackType: attackData.attackType || 'basic',
      timestamp: Date.now()
    };
    
    this.socket.emit(WSEvents.PLAYER_ATTACK, attackPayload);
  }
  
  /**
   * Join a match
   */
  public joinMatch(matchId: string, classType?: ClassType): void {
    if (!this.socket || !this.isConnected) {
      // Try again after connection
      setTimeout(() => this.joinMatch(matchId, classType), 1000);
      return;
    }
    
    this.socket.emit('join_match', { matchId, classType });
    console.log('Joining match:', matchId, 'with class:', classType);
  }
  
  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;
    
    // Remove existing event handlers to avoid duplication
    this.socket.off('connect');
    this.socket.off('disconnect');
    this.socket.off('connect_error');
    
    // Connection events
    this.socket.on(WSEvents.CONNECT, () => {
      console.log('✅ Connected to game server namespace');
      this.isConnected = true;
      
      // CRITICAL: Set player ID immediately on connection to prevent race conditions
      // This ensures we have a player ID before any 'player:joined' events are processed
      if (this.socket?.id && !this.playerId) {
        this.playerId = this.socket.id;
        console.log('🆔 MainNetworkManager: Set initial player ID from socket:', this.playerId);
        
        // Update the game scene with the player ID immediately
        if ('updatePlayerIdFromNetwork' in this.eventHandler) {
          (this.eventHandler as any).updatePlayerIdFromNetwork(this.playerId);
        }
      }
    });
    
    this.socket.on(WSEvents.DISCONNECT, () => {
      console.log('❌ Disconnected from game server');
      this.isConnected = false;
    });
    
    this.socket.on(WSEvents.ERROR, (error) => {
      console.error('🚨 Connection error:', error);
    });
    
    // Game events
    this.socket.on('game:joined', (data) => {
      this.playerId = data.playerId;
      console.log('✅ NetworkManager: Joined game as player:', this.playerId);
      
      // Update the game scene with the player ID BEFORE processing any other events
      if ('updatePlayerIdFromNetwork' in this.eventHandler) {
        (this.eventHandler as any).updatePlayerIdFromNetwork(this.playerId);
      }
    });
    
    this.socket.on('match_joined', (data) => {
      console.log('✅ NetworkManager: Successfully joined match:', data.matchId, 'with playerId:', this.playerId);
      
      // Make sure we have the player ID set before processing match data
      if (!this.playerId && data.yourPlayerId) {
        this.playerId = data.yourPlayerId;
        console.log('✅ NetworkManager: Setting player ID from match_joined:', this.playerId);
        
        // Update the game scene with the player ID
        if ('updatePlayerIdFromNetwork' in this.eventHandler) {
          (this.eventHandler as any).updatePlayerIdFromNetwork(this.playerId);
        }
      }
      
      // Forward the entire match_joined data to the event handler
      if ('onMatchJoined' in this.eventHandler) {
        (this.eventHandler as any).onMatchJoined(data);
      } else {
        // Fallback: Handle existing players in the match
        if (data.players) {
          data.players.forEach((player: any) => {
            if (player.playerId !== this.playerId) {
              this.eventHandler.onPlayerJoined(player.playerId, player);
            }
          });
        }
      }
    });
    
    this.socket.on('player:joined', (data) => {
      // CRITICAL: Skip if this is our own player joining
      if (data.playerId === this.playerId) {
        console.log(`🔒 MainNetworkManager: Skipping player:joined for local player ${data.playerId}`);
        return;
      }
      this.eventHandler.onPlayerJoined(data.playerId, data);
    });
    
    this.socket.on('player:left', (data) => {
      this.eventHandler.onPlayerLeft(data.playerId, data);
    });
    
    this.socket.on(WSEvents.PLAYER_MOVED, (data) => {
      // CRITICAL: Skip if this is our own player movement
      if (data.playerId === this.playerId) {
        return;
      }
      this.eventHandler.onPlayerMoved(
        data.playerId,
        data.position,
        data.angle,
        data.classType
      );
    });
    
    this.socket.on(WSEvents.PLAYER_ROTATED, (data) => {
      // CRITICAL: Skip if this is our own player rotation
      if (data.playerId === this.playerId) {
        return;
      }
      if (this.eventHandler.onPlayerRotated) {
        this.eventHandler.onPlayerRotated(
          data.playerId,
          data.angle,
          data.classType
        );
      }
    });
    
    this.socket.on('game:state', (gameState) => {
      // Handle full game state updates
      console.log('Received game state update');
    });

    this.socket.on(WSEvents.GAME_UPDATE, (data) => {
      if (this.eventHandler.handleGameUpdate) {
        this.eventHandler.handleGameUpdate(data);
      }
      
      // Handle projectile updates
      if (data.projectiles && this.eventHandler.onProjectileUpdate) {
        this.eventHandler.onProjectileUpdate(data.projectiles);
      }
      
      // Handle game events (projectile creation, hits, etc.)
      if (data.events && this.eventHandler.onGameEvents) {
        this.eventHandler.onGameEvents(data.events);
      }
    });

    // Match ended event
    this.socket.on('match_ended', (data) => {
      console.log('Match ended:', data);
      if (this.eventHandler.onMatchEnded) {
        this.eventHandler.onMatchEnded(data);
      }
    });

    // Handle initial game state when joining
    this.socket.on('game:initial_state', (data) => {
      console.log('📋 Received initial game state:', data);
      
      if (this.eventHandler.onInitialGameState) {
        this.eventHandler.onInitialGameState(data);
      }
      
      // Process players from initial state
      if (data.players && this.eventHandler.onPlayerJoined) {
        for (const player of data.players) {
          // CRITICAL: Skip local player
          if (player.id === this.playerId) {
            console.log(`🔒 MainNetworkManager: Skipping initial_state player for local player ${player.id}`);
            continue;
          }
          this.eventHandler.onPlayerJoined(player.id, {
            username: player.username,
            classType: player.classType,
            position: player.position,
            angle: player.rotation || 0
          });
        }
      }
    });
  }
  
  /**
   * Get authentication token from storage
   */
  private getAuthToken(): string | null {
    // First try localStorage (primary source)
    const localToken = localStorage.getItem('authToken');
    if (localToken) {
      return localToken;
    }
    
    // Try to get from Zustand store if available
    try {
      const storeData = localStorage.getItem('dueled-auth');
      if (storeData) {
        const parsed = JSON.parse(storeData);
        if (parsed.state && parsed.state.token) {
          return parsed.state.token;
        }
      }
    } catch (error) {
      console.warn('Failed to parse auth store data:', error);
    }
    
    return null;
  }
  
  /**
   * Check if connected to server
   */
  public isConnectedToServer(): boolean {
    return this.socket !== null && this.socket.connected && this.isConnected;
  }
  
  /**
   * Get diagnostic information about the connection
   */
  public getDiagnosticInfo(): any {
    return {
      hasSocket: !!this.socket,
      socketConnected: this.socket?.connected,
      socketId: this.socket?.id,
      isConnected: this.isConnected,
      playerId: this.playerId,
      serverUrl: this.serverUrl
    };
  }
  
  /**
   * Get the socket instance for debugging
   */
  public getSocket(): Socket | null {
    return this.socket;
  }
} 