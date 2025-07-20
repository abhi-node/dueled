/**
 * SimpleGameHandler - Clean WebSocket management for matchmaking handoff
 * 
 * Simplified to preserve authentication and matchmaking while removing game logic
 */

import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { SimpleMatchmaking, MatchPair } from '../services/matchmaking/SimpleMatchmaking.js';
import { SimpleConnectionManager } from '../services/connection/SimpleConnectionManager.js';
import { SimpleAuth } from '../services/auth/SimpleAuth.js';
import { verifyToken } from '../utils/jwt.js';
import { MatchManager, type MatchManagerCallbacks } from '../game/match/MatchManager.js';
import { createLargeArenaMap } from '../game/maps/ArenaMap.js';
import { GAME_CONSTANTS } from '../game/types.js';
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
 * SimpleGameHandler - Streamlined WebSocket management for auth + matchmaking
 */
export class SimpleGameHandler {
  private io: Server;
  private config: SimpleGameHandlerConfig;
  
  // Simplified connection tracking
  private playerSockets: Map<string, PlayerSocket> = new Map(); // playerId -> socket info
  private socketToPlayer: Map<string, string> = new Map();      // socketId -> playerId
  
  // Active matches (minimal tracking)
  private activeMatches: Map<string, { matchId: string; players: string[] }> = new Map();
  private matchInitializationStatus: Map<string, 'initializing' | 'ready'> = new Map();
  
  // MatchManager integration
  private matchManagers: Map<string, MatchManager> = new Map(); // matchId -> MatchManager
  
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
    this.setupMatchmakingIntegration();
    this.startHeartbeatMonitoring();
    
    logger.info('SimpleGameHandler initialized (minimal version)');
  }
  
  /**
   * Setup core socket event handling
   */
  private setupSocketHandling(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Socket connected: ${socket.id}`);
      
      // Authentication required for all operations
      socket.on('authenticate', (data) => this.handleAuthentication(socket, data));
      
      // Core matchmaking events (require authentication)
      socket.on('join_queue', (data) => this.handleJoinQueue(socket, data));
      socket.on('leave_queue', () => this.handleLeaveQueue(socket));
      socket.on('accept_match', (data) => this.handleAcceptMatch(socket, data));
      socket.on('join_match', (data) => this.handleJoinMatch(socket, data));
      socket.on('leave_match', (data) => this.handleLeaveMatch(socket, data));
      
      // Game input events (require authentication and active match)
      socket.on('input_batch', (data) => this.handleInputBatch(socket, data));
      
      // Connection management
      socket.on('heartbeat', () => this.handleHeartbeat(socket));
      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
    });
  }

  /**
   * Setup integration with matchmaking system
   */
  private setupMatchmakingIntegration(): void {
    // Register callback for when matches are found
    this.simpleMatchmaking.setMatchFoundCallback((match: MatchPair) => {
      this.handleMatchFoundCallback(match);
    });
  }
  
  /**
   * Handle player authentication
   */
  private async handleAuthentication(socket: Socket, data: { token: string }): Promise<void> {
    logger.info(`🔐 Authentication attempt:`, {
      socketId: socket.id,
      hasToken: !!data?.token,
      tokenLength: data?.token?.length || 0
    });
    
    if (!data?.token) {
      logger.warn(`❌ Authentication failed - no token provided for socket ${socket.id}`);
      socket.emit('auth_error', { message: 'Token required' });
      return;
    }
    
    try {
      const decoded = verifyToken(data.token);
      const playerId = decoded.sub;
      const username = decoded.username || 'Unknown';
      
      logger.info(`🔐 Token decoded successfully:`, {
        socketId: socket.id,
        playerId,
        username
      });
      
      // Remove existing connection if player reconnecting
      const existingSocket = this.playerSockets.get(playerId);
      if (existingSocket) {
        logger.info(`🔄 Removing existing connection for player ${playerId}`);
        this.removePlayerSocket(existingSocket.playerId);
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
      this.simpleConnectionManager.addConnection(playerId, username, socket);
      
      socket.emit('authenticated', { 
        playerId, 
        username,
        message: 'Authentication successful' 
      });
      
      logger.info(`✅ Player ${playerId} (${username}) authenticated successfully`);
      
    } catch (error) {
      logger.error(`❌ Authentication failed for socket ${socket.id}:`, error);
      socket.emit('auth_error', { message: 'Invalid token' });
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
      
      await this.simpleMatchmaking.joinQueue({
        playerId,
        username: playerSocket.username || `Player_${playerId}`,
        rating: 1000, // Default rating for now
        classType: data.classType,
        queuedAt: Date.now()
      });
      
      socket.emit('queue_joined', { 
        message: 'Added to queue',
        classType: data.classType,
        estimatedWait: 30 // Simple estimated wait time
      });
      
      logger.info(`Player ${playerId} joined queue with class ${data.classType}`);
      
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
      await this.simpleMatchmaking.leaveQueue(playerId);
      socket.emit('queue_left', { message: 'Left queue' });
      
    } catch (error) {
      logger.error(`Error leaving queue for player ${playerId}:`, error);
    }
  }
  
  /**
   * Handle match found callback from matchmaking system
   */
  private handleMatchFoundCallback(match: MatchPair): void {
    const players = [match.player1.playerId, match.player2.playerId];
    logger.info(`Match found: ${match.matchId} - ${match.player1.username} vs ${match.player2.username}`);
    
    // Mark match as ready (simplified - no complex initialization)
    this.matchInitializationStatus.set(match.matchId, 'ready');
    this.activeMatches.set(match.matchId, { matchId: match.matchId, players });
    
    // Send match found notification with opponent details
    for (const playerId of players) {
      const playerSocket = this.playerSockets.get(playerId);
      if (playerSocket) {
        const opponent = playerId === match.player1.playerId ? match.player2 : match.player1;
        playerSocket.socket.emit('match_found', {
          matchId: match.matchId,
          opponent: {
            username: opponent.username,
            classType: opponent.classType,
            rating: opponent.rating
          },
          countdown: 5000, // 5 seconds countdown
          message: 'Match found! Preparing game...'
        });
        
        // Add player to match room
        playerSocket.socket.join(match.matchId);
        playerSocket.matchId = match.matchId;
      } else {
        logger.warn(`Player ${playerId} not found in connected sockets for match ${match.matchId}`);
      }
    }

    // Auto-start match after 5 seconds
    setTimeout(() => {
      logger.info(`🚀 Auto-starting match ${match.matchId} after countdown`);
      this.startSimpleMatch(match);
    }, 5000);
  }

  /**
   * Start simple match (just notify players, no complex game state)
   */
  private startSimpleMatch(match: MatchPair): void {
    const { matchId, player1, player2 } = match;
    
    // Send match ready event to both players
    this.io.to(matchId).emit('match_ready', {
      matchId,
      players: [
        {
          id: player1.playerId,
          username: player1.username,
          classType: player1.classType,
          rating: player1.rating
        },
        {
          id: player2.playerId,
          username: player2.username,
          classType: player2.classType,
          rating: player2.rating
        }
      ],
      message: 'Match starting! Game logic ready for implementation.'
    });

    // Send initialization complete signal
    this.io.to(matchId).emit('match_initialization_complete', {
      matchId,
      message: 'Match is ready - you can now join!',
      timestamp: Date.now()
    });

    logger.info(`Simple match ${matchId} started: ${player1.username} vs ${player2.username}`);
  }
  
  /**
   * Handle match acceptance
   */
  private async handleAcceptMatch(socket: Socket, data: { matchId: string }): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(socket);
    if (!playerId) return;
    
    try {
      logger.info(`Player ${playerId} acknowledged match ${data.matchId}`);
      socket.emit('match_accepted', { matchId: data.matchId });
      
    } catch (error) {
      logger.error(`Error accepting match for player ${playerId}:`, error);
      socket.emit('match_error', { message: 'Failed to accept match' });
    }
  }
  
  /**
   * Handle join match (handoff to game)
   */
  private handleJoinMatch(socket: Socket, data: { matchId: string; classType?: string }): void {
    logger.info(`📥 [DEBUG] handleJoinMatch received`, { matchId: data.matchId, classType: data.classType, socketId: socket.id });
    
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket) {
      logger.error(`❌ [DEBUG] No player ID or socket found`, { playerId, hasPlayerSocket: !!playerSocket });
      return;
    }
    
    logger.info(`🎮 [DEBUG] Player ${playerId} joining match ${data.matchId}`);
    
    // Get or create MatchManager for this match
    let matchManager = this.matchManagers.get(data.matchId);
    const activeMatch = this.activeMatches.get(data.matchId);
    
    logger.info(`🔍 [DEBUG] Match state check`, { 
      hasMatchManager: !!matchManager, 
      hasActiveMatch: !!activeMatch,
      activeMatchPlayers: activeMatch?.players 
    });
    
    if (!matchManager && activeMatch) {
      logger.info(`🏗️ [DEBUG] Creating new MatchManager for match ${data.matchId}`);
      
      // Create MatchManager instance for this match
      const playerIds = activeMatch.players;
      const player1Data = this.playerSockets.get(playerIds[0]);
      const player2Data = this.playerSockets.get(playerIds[1]);
      
      logger.info(`👥 [DEBUG] Player data retrieved`, {
        player1Id: playerIds[0],
        player2Id: playerIds[1],
        hasPlayer1Data: !!player1Data,
        hasPlayer2Data: !!player2Data
      });
      
      if (player1Data && player2Data) {
        logger.info(`🎯 [DEBUG] Starting MatchManager creation for match ${data.matchId}`);
        
        try {
          // Create tactical arena map
          logger.info(`🗺️ [DEBUG] Creating tactical arena map`);
          const mapData = createLargeArenaMap();
          logger.info(`✅ [DEBUG] Tactical arena map created with ${mapData.walls.length} walls`);
          
          // Create MatchManager with player data
          logger.info(`🏗️ [DEBUG] Instantiating MatchManager`);
          matchManager = new MatchManager(
            data.matchId,
            {
              id: player1Data.playerId,
              username: player1Data.username || 'Player1',
              classType: (player1Data.classType || 'gunslinger') as ClassType,
              rating: 1000 // Default rating for now
            },
            {
              id: player2Data.playerId,
              username: player2Data.username || 'Player2',
              classType: (player2Data.classType || 'gunslinger') as ClassType,
              rating: 1000 // Default rating for now
            },
            mapData,
            this.createMatchManagerCallbacks(data.matchId)
          );
          
          this.matchManagers.set(data.matchId, matchManager);
          logger.info(`🎉 [DEBUG] MatchManager created and stored successfully for match ${data.matchId}`);
        } catch (error) {
          logger.error(`💥 [DEBUG] Failed to create MatchManager:`, error);
          socket.emit('match_error', { message: 'Failed to create match', error: error instanceof Error ? error.message : 'Unknown error' });
          return;
        }
      } else {
        logger.error(`❌ [DEBUG] Missing player data, cannot create MatchManager`);
      }
    }
    
    if (matchManager) {
      logger.info(`🔗 [DEBUG] Connecting player ${playerId} to MatchManager`);
      
      // Connect player to the match
      const connected = matchManager.connectPlayer(playerId);
      logger.info(`📋 [DEBUG] Player connection result: ${connected}`);
      
      // Send connection confirmation for game engine
      logger.info(`📡 [DEBUG] Sending connection_confirmed to client`);
      socket.emit('connection_confirmed', {
        playerId: playerId,
        serverTime: Date.now()
      });
      
      // Send match start data
      logger.info(`🚀 [DEBUG] Getting match state and sending match_start`);
      const matchState = matchManager.getMatchState();
      const activeMatch = this.activeMatches.get(data.matchId);
      
      logger.info(`📊 [DEBUG] Match state retrieved, sending to client`, { 
        hasMapData: !!matchState.gameState.mapData,
        playerCount: matchState.players.length,
        activeMatchPlayers: activeMatch?.players
      });
      
      // Find opponent ID
      const opponentId = activeMatch?.players.find(pId => pId !== playerId) || 'unknown';
      
      // Convert server MapData to ClientMapData format
      const clientMapData = {
        bounds: matchState.gameState.mapData.bounds,
        walls: matchState.gameState.mapData.walls,
        spawnPoints: matchState.gameState.mapData.spawnPoints
      };
      
      // Send proper MatchStartData structure
      socket.emit('match_start', {
        matchId: data.matchId,
        yourPlayerId: playerId,
        opponentId: opponentId,
        mapData: clientMapData,
        roundDuration: GAME_CONSTANTS.ROUND_DURATION * 1000, // Convert to milliseconds
        maxRounds: GAME_CONSTANTS.MAX_ROUNDS
      });
      logger.info(`✅ [DEBUG] match_start event sent to client with proper structure`);
      
      // Start the match if both players are connected
      const allPlayersConnected = Array.from(this.activeMatches.get(data.matchId)?.players || [])
        .every(pId => this.playerSockets.get(pId)?.socket.connected);
      
      if (allPlayersConnected) {
        logger.info(`🎯 Starting match ${data.matchId} - both players connected`);
        matchManager.start();
      }
      
      logger.info(`✅ Player ${playerId} joined match ${data.matchId} via MatchManager`);
    } else {
      logger.error(`❌ Could not create MatchManager for match ${data.matchId}`);
      socket.emit('match_error', { 
        message: 'Failed to initialize match',
        matchId: data.matchId 
      });
    }
  }
  
  /**
   * Create MatchManager callbacks for handling game events
   */
  private createMatchManagerCallbacks(matchId: string): MatchManagerCallbacks {
    return {
      onMatchStart: (matchId: string) => {
        logger.info(`🎯 Match ${matchId} systems started - individual join_match calls will send proper match_start events`);
        // Don't broadcast match_start here - it's sent individually when each player joins via handleJoinMatch
      },
      
      onMatchEnd: (result) => {
        logger.info(`🏁 Match ${matchId} ended`, result);
        
        const matchEndData = {
          winnerId: result.winnerId,
          winnerUsername: result.winnerUsername,
          finalScore: result.finalScore,
          matchDuration: result.totalDuration,
          reason: 'victory'
        };
        
        logger.info(`📡 Broadcasting match_end event to match ${matchId}:`, matchEndData);
        this.broadcastToMatch(matchId, 'match_end', matchEndData);
        
        // Keep WebSocket connections alive for match end sequence
        // Cleanup will be handled after ELO updates and match end overlay
        logger.info(`🔗 Keeping WebSocket connections alive for match end sequence: ${matchId}`);
        
        // Schedule delayed cleanup (fallback safety mechanism)
        setTimeout(() => {
          this.cleanupMatchConnections(matchId);
        }, 30000); // 30 second failsafe
      },
      
      onMatchCompletelyFinished: (matchId: string) => {
        logger.info(`🏠 Match ${matchId} completely finished - returning players to lobby`);
        this.returnPlayersToLobby(matchId);
      },
      
      onCountdownTick: (matchId: string, roundNumber: number, countdown: number) => {
        logger.debug(`⏰ Countdown tick: Round ${roundNumber}, ${countdown}s`);
        this.broadcastToMatch(matchId, 'countdown_tick', { roundNumber, countdown });
      },
      
      onCountdownComplete: (matchId: string, roundNumber: number) => {
        logger.info(`🚀 Countdown complete: Round ${roundNumber} starting`);
        this.broadcastToMatch(matchId, 'countdown_complete', { roundNumber });
      },
      
      onPlayerDisconnected: (matchId: string, playerId: string) => {
        logger.info(`🔌 Player ${playerId} disconnected from match ${matchId}`);
        this.broadcastToMatch(matchId, 'player_disconnected', { playerId });
      },
      
      onDeltaUpdate: (matchId: string, delta) => {
        // Broadcast delta update to all players in the match
        this.broadcastToMatch(matchId, 'game_state_delta', delta);
      },
      
      onRoundStart: (matchId: string, roundNumber: number) => {
        logger.info(`⚡ Round ${roundNumber} started in match ${matchId}`);
        
        // Get spawn positions for both players
        const activeMatch = this.activeMatches.get(matchId);
        const spawnPositions: { [key: string]: { position: { x: number; y: number }; angle: number } } = {};
        
        if (activeMatch) {
          // Use default spawn positions for each player
          const defaultSpawns = [
            { position: { x: 2, y: 2 }, angle: 0 },     // Player 1 spawn
            { position: { x: 18, y: 18 }, angle: Math.PI } // Player 2 spawn (facing opposite)
          ];
          
          activeMatch.players.forEach((playerId, index) => {
            spawnPositions[playerId] = defaultSpawns[index] || defaultSpawns[0];
          });
        }
        
        this.broadcastToMatch(matchId, 'round_start', { 
          roundNumber,
          roundDuration: 60000, // 60 seconds default
          spawnPositions
        });
      },
      
      onRoundEnd: (matchId: string, result: any) => {
        logger.info(`🎌 Round ended in match ${matchId}: ${result.winnerId} wins (${result.reason})`);
        
        // Get winner username from playerSockets
        const winnerPlayerSocket = this.playerSockets.get(result.winnerId);
        const winnerUsername = winnerPlayerSocket?.username || 'Unknown Player';
        
        this.broadcastToMatch(matchId, 'round_end', { 
          winnerId: result.winnerId, 
          winnerUsername,
          reason: result.reason,
          roundDuration: result.duration || 0,
          nextRoundIn: 2000, // 2 second intermission
          currentScore: result.score || { player1: 0, player2: 0 }
        });
      }
    };
  }
  
  /**
   * Broadcast event to all players in a match
   */
  private broadcastToMatch(matchId: string, event: string, data: any): void {
    const activeMatch = this.activeMatches.get(matchId);
    if (!activeMatch) {
      logger.warn(`Cannot broadcast ${event} to match ${matchId}: match not found`);
      return;
    }
    
    logger.info(`📤 Broadcasting ${event} to match ${matchId} players:`, activeMatch.players);
    
    for (const playerId of activeMatch.players) {
      const playerSocket = this.playerSockets.get(playerId);
      if (playerSocket && playerSocket.socket.connected) {
        logger.info(`  ✅ Sent ${event} to player ${playerId} (${playerSocket.username})`);
        playerSocket.socket.emit(event, data);
      } else {
        logger.warn(`  ❌ Cannot send ${event} to player ${playerId}: ${playerSocket ? 'disconnected' : 'not found'}`);
      }
    }
  }
  
  /**
   * Handle input batch from client
   */
  private handleInputBatch(socket: Socket, data: { matchId: string; commands: any[] }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    if (!playerId) return;
    
    const matchManager = this.matchManagers.get(data.matchId);
    if (!matchManager) {
      logger.warn(`No MatchManager found for match ${data.matchId}`);
      return;
    }
    
    // Forward input commands to MatchManager
    for (const command of data.commands) {
      matchManager.queueInput(playerId, command);
    }
  }

  /**
   * Handle leave match
   */
  private handleLeaveMatch(socket: Socket, data: { matchId: string }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket) return;
    
    // Disconnect from MatchManager
    const matchManager = this.matchManagers.get(data.matchId);
    if (matchManager) {
      matchManager.disconnectPlayer(playerId);
    }
    
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
      
      // Disconnect from MatchManager if player was in a match
      if (playerSocket?.matchId) {
        const matchManager = this.matchManagers.get(playerSocket.matchId);
        if (matchManager) {
          matchManager.disconnectPlayer(playerId);
        }
        
        // Notify other players in match
        socket.to(playerSocket.matchId).emit('player_disconnected', {
          playerId,
          reason
        });
      }
      
      // Clean up
      await this.simpleConnectionManager.removeConnection(playerId);
      await this.simpleMatchmaking.leaveQueue(playerId);
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
    
    const activeMatches = this.activeMatches.size;
    
    return {
      totalConnections: this.playerSockets.size,
      authenticatedPlayers,
      playersInMatches,
      activeMatches
    };
  }
  
  /**
   * Clean up match connections and resources (called after match end sequence)
   */
  cleanupMatchConnections(matchId: string): void {
    logger.info(`🧹 Cleaning up match connections: ${matchId}`);
    
    // Remove match resources
    this.matchManagers.delete(matchId);
    this.activeMatches.delete(matchId);
    this.matchInitializationStatus.delete(matchId);
    
    // Find players in this match and reset their match state
    for (const [playerId, playerSocket] of this.playerSockets.entries()) {
      if (playerSocket.matchId === matchId) {
        logger.info(`🔄 Resetting player ${playerId} match state`);
        playerSocket.matchId = undefined;
        // Leave the socket room
        playerSocket.socket.leave(matchId);
      }
    }
    
    logger.info(`✅ Match ${matchId} connections cleaned up`);
  }
  
  /**
   * Explicitly end match and return players to lobby
   */
  returnPlayersToLobby(matchId: string): void {
    logger.info(`🏠 Returning players to lobby from match: ${matchId}`);
    
    // Notify all players to return to lobby
    this.broadcastToMatch(matchId, 'return_to_lobby', { matchId });
    
    // Clean up connections after short delay to allow client processing
    setTimeout(() => {
      this.cleanupMatchConnections(matchId);
    }, 2000); // 2 second delay
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
    this.activeMatches.clear();
    this.matchInitializationStatus.clear();
    
    logger.info('SimpleGameHandler destroyed');
  }
}