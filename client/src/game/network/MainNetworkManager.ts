/**
 * MainNetworkManager - Network communication for the main game
 * Handles WebSocket connections and game state synchronization
 */

import { io, Socket } from 'socket.io-client';
import type { Vector2, ClassType } from '@dueled/shared';

export interface NetworkEventHandler {
  onPlayerJoined(playerId: string, data: any): void;
  onPlayerLeft(playerId: string, data?: any): void;
  onPlayerMoved(playerId: string, position: Vector2, angle: number, classType?: ClassType): void;
  onPlayerRotated?(playerId: string, angle: number, classType?: ClassType): void;
  onMatchEnded?(data: any): void;
  handleGameUpdate?(data: any): void;
  onProjectileUpdate?(projectiles: any[]): void;
  onGameEvents?(events: any[]): void;
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
    }
  }
  
  /**
   * Connect to the game server
   */
  public connect(): void {
    if (this.socket && this.isConnected) {
      console.warn('Already connected to server');
      return;
    }
    
    const token = this.getAuthToken();
    if (!token) {
      console.error('No authentication token found');
      return;
    }
    
    this.socket = io(`${this.serverUrl}/game`, {
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
    
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
    
    console.log(`📤 Sending movement with class: ${data.classType}`);
    this.socket.emit('player:move', {
      position: { x: data.x, y: data.y },
      angle: data.angle,
      classType: data.classType,
      timestamp: Date.now()
    });
  }
  
  /**
   * Send player rotation update (without movement)
   */
  public sendRotation(data: { angle: number; classType?: ClassType }): void {
    if (!this.socket || !this.isConnected) return;
    
    console.log(`📤 Sending rotation with class: ${data.classType}`);
    this.socket.emit('player:rotate', {
      angle: data.angle,
      classType: data.classType,
      timestamp: Date.now()
    });
  }
  
  /**
   * Send attack action with target information
   */
  public sendAttack(attackData: {
    direction?: { x: number; y: number };
    targetPosition?: { x: number; y: number };
    attackType?: 'basic' | 'special';
  }): void {
    if (!this.socket || !this.isConnected) return;
    
    this.socket.emit('player:attack', {
      direction: attackData.direction,
      targetPosition: attackData.targetPosition,
      attackType: attackData.attackType || 'basic',
      timestamp: Date.now()
    });
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
    
    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Connected to game server namespace');
      this.isConnected = true;
    });
    
    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from game server');
      this.isConnected = false;
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('🚨 Connection error:', error);
    });
    
    // Game events
    this.socket.on('game:joined', (data) => {
      this.playerId = data.playerId;
      console.log('Joined game as player:', this.playerId);
    });
    
    this.socket.on('match_joined', (data) => {
      console.log('Successfully joined match:', data.matchId);
      
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
      if (data.playerId !== this.playerId) {
        this.eventHandler.onPlayerJoined(data.playerId, data);
      }
    });
    
    this.socket.on('player:left', (data) => {
      this.eventHandler.onPlayerLeft(data.playerId, data);
    });
    
    this.socket.on('player:moved', (data) => {
      if (data.playerId !== this.playerId) {
        console.log(`📥 Received movement from ${data.playerId} with class: ${data.classType}`);
        this.eventHandler.onPlayerMoved(
          data.playerId,
          data.position,
          data.angle,
          data.classType // Pass class information if available
        );
      }
    });
    
    this.socket.on('player:rotated', (data) => {
      if (data.playerId !== this.playerId && this.eventHandler.onPlayerRotated) {
        console.log(`📥 Received rotation from ${data.playerId} with class: ${data.classType}`);
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

    this.socket.on('game:update', (data) => {
      console.log(`🌐 NetworkManager received game:update:`, {
        hasData: !!data,
        hasProjectiles: !!data?.projectiles,
        projectileCount: data?.projectiles?.length || 0,
        hasEvents: !!data?.events,
        eventCount: data?.events?.length || 0
      });
      
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
   * Get connection status
   */
  public isConnectedToServer(): boolean {
    return this.isConnected;
  }
  
  /**
   * Get current player ID
   */
  public getPlayerId(): string {
    return this.playerId;
  }
} 