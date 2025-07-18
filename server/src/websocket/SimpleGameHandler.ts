/**
 * SimpleGameHandler - Clean WebSocket management for 1v1 arena combat
 * 
 * Replaces complex GameHandler with simplified socket handling
 * Only includes essential events for Archer vs Berserker combat
 */

import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { SimpleMatchmaking } from '../services/matchmaking/SimpleMatchmaking.js';
import { SimpleConnectionManager } from '../services/connection/SimpleConnectionManager.js';
import { SimpleAuth } from '../services/auth/SimpleAuth.js';
import { verifyToken } from '../utils/jwt.js';
import type { ClassType } from '@dueled/shared';

export interface PlayerSocket {
  id: string;
  socket: Socket;
  playerId: string;
  username?: string;
  classType?: ClassType;
  matchId?: string;
  authenticated: boolean;
  lastHeartbeat: number;
}

export interface SimpleGameHandlerConfig {
  heartbeatInterval: number;    // ms between heartbeat checks
  connectionTimeout: number;    // ms before disconnect
  maxPlayersPerMatch: number;   // Always 2 for 1v1
}

/**
 * SimpleGameHandler - Streamlined WebSocket management
 */
export class SimpleGameHandler {
  private io: Server;
  private config: SimpleGameHandlerConfig;
  
  // Simplified connection tracking
  private playerSockets: Map<string, PlayerSocket> = new Map(); // playerId -> socket info
  private socketToPlayer: Map<string, string> = new Map();      // socketId -> playerId
  
  // Service integrations
  private simpleMatchmaking: SimpleMatchmaking;
  private simpleConnectionManager: SimpleConnectionManager;
  private simpleAuth: SimpleAuth;
  
  // Heartbeat management
  private heartbeatTimer: NodeJS.Timeout | null = null;
  
  constructor(
    io: Server,
    simpleMatchmaking: SimpleMatchmaking,
    simpleConnectionManager: SimpleConnectionManager,
    simpleAuth?: SimpleAuth,
    config?: Partial<SimpleGameHandlerConfig>
  ) {
    this.io = io;
    this.simpleMatchmaking = simpleMatchmaking;
    this.simpleConnectionManager = simpleConnectionManager;
    this.simpleAuth = simpleAuth || new SimpleAuth();
    
    this.config = {
      heartbeatInterval: 30000,  // 30 seconds
      connectionTimeout: 60000,  // 60 seconds
      maxPlayersPerMatch: 2,
      ...config
    };
    
    this.setupSocketHandling();
    this.startHeartbeatMonitoring();
    
    logger.info('SimpleGameHandler initialized');
  }
  
  /**
   * Setup core socket event handling
   */
  private setupSocketHandling(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Socket connected: ${socket.id}`);
      
      // Authentication required for all operations
      socket.on('authenticate', (data) => this.handleAuthentication(socket, data));
      
      // Core game events (require authentication)
      socket.on('join_queue', (data) => this.handleJoinQueue(socket, data));
      socket.on('leave_queue', () => this.handleLeaveQueue(socket));
      socket.on('accept_match', (data) => this.handleAcceptMatch(socket, data));
      socket.on('join_match', (data) => this.handleJoinMatch(socket, data));
      
      // In-game events
      socket.on('player_move', (data) => this.handlePlayerMove(socket, data));
      socket.on('player_rotate', (data) => this.handlePlayerRotate(socket, data));
      socket.on('primary_attack', (data) => this.handlePrimaryAttack(socket, data));
      socket.on('special_ability', (data) => this.handleSpecialAbility(socket, data));
      socket.on('dash', (data) => this.handleDash(socket, data));
      socket.on('player_ready', (data) => this.handlePlayerReady(socket, data));
      socket.on('leave_match', (data) => this.handleLeaveMatch(socket, data));
      
      // Connection management
      socket.on('heartbeat', () => this.handleHeartbeat(socket));
      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
    });
  }
  
  /**
   * Handle player authentication
   */
  private async handleAuthentication(socket: Socket, data: { token: string }): Promise<void> {
    if (!data?.token) {
      socket.emit('auth_error', { message: 'Token required' });
      return;
    }
    
    try {
      const decoded = verifyToken(data.token);
      const playerId = decoded.playerId;
      const username = decoded.username;
      
      // Remove existing connection if player reconnecting
      const existingSocket = this.playerSockets.get(playerId);
      if (existingSocket) {
        this.removePlayerSocket(existingSocket.id);
      }
      
      // Add new connection
      const playerSocket: PlayerSocket = {
        id: socket.id,
        socket,
        playerId,
        username,
        authenticated: true,
        lastHeartbeat: Date.now()
      };
      
      this.playerSockets.set(playerId, playerSocket);
      this.socketToPlayer.set(socket.id, playerId);
      
      // Register with connection manager
      await this.simpleConnectionManager.addConnection(playerId, socket.id);
      
      socket.emit('authenticated', { 
        playerId, 
        username,
        message: 'Authentication successful' 
      });
      
      logger.info(`Player ${playerId} (${username}) authenticated`);
      
    } catch (error) {
      socket.emit('auth_error', { message: 'Invalid token' });
      logger.warn(`Authentication failed for socket ${socket.id}:`, error);
    }
  }
  
  /**
   * Handle join matchmaking queue
   */
  private async handleJoinQueue(socket: Socket, data: { classType: ClassType }): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(socket);
    if (!playerId) return;
    
    const playerSocket = this.playerSockets.get(playerId);
    if (!playerSocket) return;
    
    try {
      playerSocket.classType = data.classType;
      
      const result = await this.simpleMatchmaking.addToQueue(playerId, data.classType);
      
      if (result.success) {
        socket.emit('queue_joined', { 
          message: 'Added to queue',
          classType: data.classType,
          estimatedWait: result.estimatedWait 
        });
        
        // Check for immediate match
        if (result.matchFound) {
          this.handleMatchFound(result.matchId!, result.players!);
        }
      } else {
        socket.emit('queue_error', { message: result.error });
      }
      
    } catch (error) {
      logger.error(`Error joining queue for player ${playerId}:`, error);
      socket.emit('queue_error', { message: 'Failed to join queue' });
    }
  }
  
  /**
   * Handle leave matchmaking queue
   */
  private async handleLeaveQueue(socket: Socket): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(socket);
    if (!playerId) return;
    
    try {
      await this.simpleMatchmaking.removeFromQueue(playerId);
      socket.emit('queue_left', { message: 'Left queue' });
      
    } catch (error) {
      logger.error(`Error leaving queue for player ${playerId}:`, error);
    }
  }
  
  /**
   * Handle match found notification
   */
  private handleMatchFound(matchId: string, players: string[]): void {
    for (const playerId of players) {
      const playerSocket = this.playerSockets.get(playerId);
      if (playerSocket) {
        playerSocket.socket.emit('match_found', {
          matchId,
          message: 'Match found! Please accept within 10 seconds'
        });
      }
    }
  }
  
  /**
   * Handle match acceptance
   */
  private async handleAcceptMatch(socket: Socket, data: { matchId: string }): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(socket);
    if (!playerId) return;
    
    try {
      const result = await this.simpleMatchmaking.acceptMatch(data.matchId, playerId);
      
      if (result.success) {
        socket.emit('match_accepted', { matchId: data.matchId });
        
        if (result.allAccepted) {
          // Start the match
          this.startMatch(data.matchId, result.players!);
        }
      } else {
        socket.emit('match_error', { message: result.error });
      }
      
    } catch (error) {
      logger.error(`Error accepting match for player ${playerId}:`, error);
      socket.emit('match_error', { message: 'Failed to accept match' });
    }
  }
  
  /**
   * Start match and notify players
   */
  private startMatch(matchId: string, players: string[]): void {
    for (const playerId of players) {
      const playerSocket = this.playerSockets.get(playerId);
      if (playerSocket) {
        playerSocket.matchId = matchId;
        playerSocket.socket.join(matchId); // Join socket room
        
        playerSocket.socket.emit('match_start', {
          matchId,
          yourPlayerId: playerId,
          players: players.map(id => ({
            id,
            username: this.playerSockets.get(id)?.username || 'Unknown',
            classType: this.playerSockets.get(id)?.classType || 'archer'
          }))
        });
      }
    }
    
    logger.info(`Match ${matchId} started with players: ${players.join(', ')}`);
  }
  
  /**
   * Handle player movement
   */
  private handlePlayerMove(socket: Socket, data: { x: number; y: number; timestamp: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket?.matchId) return;
    
    // Broadcast to other players in match
    socket.to(playerSocket.matchId).emit('player_update', {
      playerId,
      position: { x: data.x, y: data.y },
      timestamp: data.timestamp
    });
  }
  
  /**
   * Handle player rotation
   */
  private handlePlayerRotate(socket: Socket, data: { angle: number; timestamp: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket?.matchId) return;
    
    socket.to(playerSocket.matchId).emit('player_update', {
      playerId,
      rotation: data.angle,
      timestamp: data.timestamp
    });
  }
  
  /**
   * Handle primary attack
   */
  private handlePrimaryAttack(socket: Socket, data: { timestamp: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket?.matchId) return;
    
    socket.to(playerSocket.matchId).emit('player_attack', {
      playerId,
      attackType: 'primary',
      timestamp: data.timestamp
    });
  }
  
  /**
   * Handle special ability
   */
  private handleSpecialAbility(socket: Socket, data: { timestamp: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket?.matchId) return;
    
    socket.to(playerSocket.matchId).emit('player_ability', {
      playerId,
      timestamp: data.timestamp
    });
  }
  
  /**
   * Handle dash movement
   */
  private handleDash(socket: Socket, data: { direction: { x: number; y: number }; timestamp: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket?.matchId) return;
    
    socket.to(playerSocket.matchId).emit('player_dash', {
      playerId,
      direction: data.direction,
      timestamp: data.timestamp
    });
  }
  
  /**
   * Handle player ready signal
   */
  private handlePlayerReady(socket: Socket, data: { timestamp: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket?.matchId) return;
    
    socket.to(playerSocket.matchId).emit('player_ready', {
      playerId,
      timestamp: data.timestamp
    });
  }
  
  /**
   * Handle join match (reconnection)
   */
  private handleJoinMatch(socket: Socket, data: { matchId: string }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket) return;
    
    playerSocket.matchId = data.matchId;
    socket.join(data.matchId);
    
    socket.emit('match_joined', { 
      matchId: data.matchId,
      message: 'Reconnected to match' 
    });
    
    logger.info(`Player ${playerId} rejoined match ${data.matchId}`);
  }
  
  /**
   * Handle leave match
   */
  private handleLeaveMatch(socket: Socket, data: { matchId: string }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket) return;
    
    socket.leave(data.matchId);
    playerSocket.matchId = undefined;
    
    // Notify other players
    socket.to(data.matchId).emit('player_left', {
      playerId,
      reason: 'voluntary'
    });
    
    socket.emit('match_left', { message: 'Left match' });
    logger.info(`Player ${playerId} left match ${data.matchId}`);
  }
  
  /**
   * Handle heartbeat for connection monitoring
   */
  private handleHeartbeat(socket: Socket): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    
    if (playerSocket) {
      playerSocket.lastHeartbeat = Date.now();
      socket.emit('heartbeat_ack');
    }
  }
  
  /**
   * Handle disconnect
   */
  private async handleDisconnect(socket: Socket, reason: string): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(socket);
    
    if (playerId) {
      const playerSocket = this.playerSockets.get(playerId);
      
      // Notify match if player was in one
      if (playerSocket?.matchId) {
        socket.to(playerSocket.matchId).emit('player_disconnected', {
          playerId,
          reason
        });
      }
      
      // Clean up
      await this.simpleConnectionManager.removeConnection(playerId);
      await this.simpleMatchmaking.removeFromQueue(playerId);
      this.removePlayerSocket(playerId);
      
      logger.info(`Player ${playerId} disconnected: ${reason}`);
    }
  }
  
  /**
   * Get player ID from socket
   */
  private getPlayerIdFromSocket(socket: Socket): string | null {
    return this.socketToPlayer.get(socket.id) || null;
  }
  
  /**
   * Remove player socket
   */
  private removePlayerSocket(playerId: string): void {
    const playerSocket = this.playerSockets.get(playerId);
    if (playerSocket) {
      this.socketToPlayer.delete(playerSocket.id);
      this.playerSockets.delete(playerId);
    }
  }
  
  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const disconnectedPlayers: string[] = [];
      
      for (const [playerId, playerSocket] of this.playerSockets.entries()) {
        if (now - playerSocket.lastHeartbeat > this.config.connectionTimeout) {
          disconnectedPlayers.push(playerId);
        }
      }
      
      // Disconnect stale connections
      for (const playerId of disconnectedPlayers) {
        const playerSocket = this.playerSockets.get(playerId);
        if (playerSocket) {
          playerSocket.socket.disconnect(true);
          logger.info(`Disconnected stale player: ${playerId}`);
        }
      }
      
    }, this.config.heartbeatInterval);
  }
  
  /**
   * Broadcast game update to match
   */
  broadcastGameUpdate(matchId: string, update: any): void {
    this.io.to(matchId).emit('game_update', update);
  }
  
  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    authenticatedPlayers: number;
    playersInMatches: number;
    activeMatches: number;
  } {
    const authenticatedPlayers = Array.from(this.playerSockets.values())
      .filter(ps => ps.authenticated).length;
    
    const playersInMatches = Array.from(this.playerSockets.values())
      .filter(ps => ps.matchId).length;
    
    const activeMatches = new Set(
      Array.from(this.playerSockets.values())
        .map(ps => ps.matchId)
        .filter(Boolean)
    ).size;
    
    return {
      totalConnections: this.playerSockets.size,
      authenticatedPlayers,
      playersInMatches,
      activeMatches
    };
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    this.playerSockets.clear();
    this.socketToPlayer.clear();
    
    logger.info('SimpleGameHandler destroyed');
  }
}