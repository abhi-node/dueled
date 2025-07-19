/**
 * SimpleGameHandler - Clean WebSocket management for 1v1 arena combat
 * 
 * Replaces complex GameHandler with simplified socket handling
 * Only includes essential events for Archer vs Berserker combat
 */

import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { SimpleMatchmaking, MatchPair } from '../services/matchmaking/SimpleMatchmaking.js';
import { SimpleConnectionManager } from '../services/connection/SimpleConnectionManager.js';
import { SimpleAuth } from '../services/auth/SimpleAuth.js';
import { SimpleGameState } from '../services/game/SimpleGameState.js';
import { RoundSystem, RoundCallbacks } from '../game/arena/RoundSystem.js';
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
  
  // Active matches and round systems
  private activeMatches: Map<string, RoundSystem> = new Map();  // matchId -> RoundSystem
  
  // Pending join requests queue
  private pendingJoins: Map<string, Array<{socket: Socket, data: any, timestamp: number}>> = new Map();  // matchId -> pending joins
  private matchInitializationStatus: Map<string, 'initializing' | 'ready'> = new Map();  // matchId -> status
  
  // Service integrations
  private simpleMatchmaking: SimpleMatchmaking;
  private simpleConnectionManager: SimpleConnectionManager;
  private simpleAuth: SimpleAuth;
  private simpleGameState: SimpleGameState;
  
  // Heartbeat management
  private heartbeatTimer: NodeJS.Timeout | null = null;
  
  constructor(
    io: Server,
    simpleMatchmaking: SimpleMatchmaking,
    simpleConnectionManager: SimpleConnectionManager,
    simpleGameState: SimpleGameState,
    simpleAuth?: SimpleAuth,
    config?: Partial<SimpleGameHandlerConfig>
  ) {
    this.io = io;
    this.simpleMatchmaking = simpleMatchmaking;
    this.simpleConnectionManager = simpleConnectionManager;
    this.simpleGameState = simpleGameState;
    this.simpleAuth = simpleAuth || new SimpleAuth();
    
    this.config = {
      heartbeatInterval: 30000,  // 30 seconds
      connectionTimeout: 60000,  // 60 seconds
      maxPlayersPerMatch: 2,
      ...config
    };
    
    this.setupSocketHandling();
    this.setupMatchmakingIntegration();
    this.setupGameStateCallbacks();
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
      
      // Delta compression events
      socket.on('delta_ack', (data) => this.handleDeltaAck(socket, data));
      socket.on('request_full_sync', (data) => this.handleRequestFullSync(socket, data));
      
      // Connection management
      socket.on('heartbeat', () => this.handleHeartbeat(socket));
      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
    });
  }

  /**
   * Setup game state callbacks for broadcasting updates
   */
  private setupGameStateCallbacks(): void {
    this.simpleGameState.setCallbacks({
      onDeltaUpdate: (delta) => {
        this.io.to(delta.header.matchId).emit('game_state_delta', delta);
        
        logger.debug(`📡 Delta update`, {
          match: delta.header.matchId,
          seq: delta.header.sequence,
          players: delta.players?.length || 0,
          projectiles: delta.projectiles?.length || 0
        });
      },
      
      onFullSync: (fullState) => {
        this.io.to(fullState.header.matchId).emit('game_state_full_sync', fullState);
        
        logger.debug(`📡 Full sync`, {
          match: fullState.header.matchId,
          seq: fullState.header.sequence,
          players: fullState.players.length,
          projectiles: fullState.projectiles.length
        });
      }
    });
    
    logger.info('Game state callbacks configured with delta compression');
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
      
      // Check if player has a match that's already ready and send initialization complete signal
      const existingMatchId = this.getPlayerMatchId(playerId);
      if (existingMatchId) {
        const matchStatus = this.matchInitializationStatus.get(existingMatchId);
        if (matchStatus === 'ready') {
          logger.info(`🎯 Player ${playerId} authenticated for already-ready match ${existingMatchId}, sending immediate signal`);
          socket.emit('match_initialization_complete', {
            matchId: existingMatchId,
            message: 'Match is ready - you can now join!',
            timestamp: Date.now()
          });
        }
      }
      
      logger.info(`✅ Player ${playerId} (${username}) authenticated successfully - socket mappings updated`);
      
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
    
    // Mark match as initializing immediately to handle early join_match requests
    logger.info(`🔄 Setting match ${match.matchId} status to 'initializing' (immediately after match_found)`);
    this.matchInitializationStatus.set(match.matchId, 'initializing');
    
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
      } else {
        logger.warn(`Player ${playerId} not found in connected sockets for match ${match.matchId}`);
      }
    }

    // Auto-start match after 5 seconds
    setTimeout(() => {
      logger.info(`🚀 Auto-starting match ${match.matchId} after countdown`);
      this.autoStartMatch(match);
    }, 5000);
  }

  /**
   * Automatically start match and create game lobby with round system
   */
  private autoStartMatch(match: MatchPair): void {
    const { matchId, player1, player2 } = match;
    
    logger.info(`🎮 autoStartMatch called for ${matchId}`);
    
    // Verify both players are still connected
    const player1Socket = this.playerSockets.get(player1.playerId);
    const player2Socket = this.playerSockets.get(player2.playerId);
    
    if (!player1Socket || !player2Socket) {
      logger.warn(`Cannot start match ${matchId}: Player(s) disconnected`);
      // TODO: Handle player disconnect - could re-queue remaining player
      return;
    }
    
    logger.info(`✅ Both players connected for match ${matchId}, proceeding with initialization`);

    // Create round system for this match
    const roundSystem = new RoundSystem(matchId, player1.playerId, player2.playerId, {
      maxRounds: 3,
      roundDuration: 60,
      intermissionDuration: 10,
      suddenDeathDuration: 30
    });

    // Set up round system callbacks
    const callbacks: RoundCallbacks = {
      onRoundStart: (roundNumber: number) => {
        this.io.to(matchId).emit('round_start', {
          roundNumber,
          message: `Round ${roundNumber} starting!`
        });
        logger.info(`Round ${roundNumber} started for match ${matchId}`);
      },
      
      onRoundEnd: (result) => {
        this.io.to(matchId).emit('round_end', {
          roundNumber: result.roundNumber,
          winnerId: result.winnerId,
          reason: result.reason,
          finalHealths: result.finalHealths
        });
        logger.info(`Round ${result.roundNumber} ended for match ${matchId}: winner=${result.winnerId}`);
      },
      
      onMatchEnd: (result) => {
        this.io.to(matchId).emit('match_end', {
          matchId: result.matchId,
          winnerId: result.winnerId,
          finalScore: result.finalScore,
          totalDuration: result.totalDuration,
          reason: result.reason
        });
        
        // Clean up match
        this.activeMatches.delete(matchId);
        this.matchInitializationStatus.delete(matchId);
        this.pendingJoins.delete(matchId);
        
        // Remove players from match room
        player1Socket.socket.leave(matchId);
        player2Socket.socket.leave(matchId);
        player1Socket.matchId = undefined;
        player2Socket.matchId = undefined;
        
        logger.info(`Match ${matchId} completed: winner=${result.winnerId}`);
      },
      
      onStateChange: (state, timeLeft) => {
        const gameState = roundSystem.getState();
        this.io.to(matchId).emit('game_state_update', {
          state,
          timeLeft,
          currentRound: gameState.currentRound,
          score: gameState.score
        });
      }
    };

    roundSystem.setCallbacks(callbacks);
    this.activeMatches.set(matchId, roundSystem);

    // Add players to match room
    player1Socket.socket.join(matchId);
    player2Socket.socket.join(matchId);
    player1Socket.matchId = matchId;
    player2Socket.matchId = matchId;

    // Mark match as initializing
    logger.info(`🔄 Setting match ${matchId} status to 'initializing'`);
    this.matchInitializationStatus.set(matchId, 'initializing');
    
    // Initialize game state for this match
    logger.info(`🎮 Creating game state for match ${matchId}`);
    const gameStateCreated = this.simpleGameState.createMatch(
      matchId,
      { id: player1.playerId, username: player1.username, classType: player1.classType },
      { id: player2.playerId, username: player2.username, classType: player2.classType }
    );
    
    if (!gameStateCreated) {
      logger.error(`❌ Failed to create game state for match ${matchId} - aborting match setup`);
      // Clean up partial state
      this.activeMatches.delete(matchId);
      this.matchInitializationStatus.delete(matchId);
      this.pendingJoins.delete(matchId);
      
      // Notify players of match failure
      player1Socket.socket.emit('match_error', {
        matchId,
        error: 'Failed to initialize game state',
        code: 'GAME_STATE_CREATION_FAILED'
      });
      player2Socket.socket.emit('match_error', {
        matchId,
        error: 'Failed to initialize game state', 
        code: 'GAME_STATE_CREATION_FAILED'
      });
      
      return;
    }
    
    logger.info(`✅ Game state created successfully for match ${matchId}`);
    
    // Mark match as ready and process any pending joins
    logger.info(`✅ Setting match ${matchId} status to 'ready'`);
    this.matchInitializationStatus.set(matchId, 'ready');
    
    // Notify both players that match initialization is complete and they can join
    logger.info(`📢 Emitting match_initialization_complete to both players for match ${matchId}`);
    const initCompleteData = {
      matchId,
      message: 'Match is ready - you can now join!',
      timestamp: Date.now()
    };
    
    // Send to individual player sockets (more reliable than room broadcast)
    player1Socket.socket.emit('match_initialization_complete', initCompleteData);
    player2Socket.socket.emit('match_initialization_complete', initCompleteData);
    
    logger.info(`📤 Sent match_initialization_complete to players:`, {
      player1: player1.playerId,
      player2: player2.playerId,
      socketIds: [player1Socket.id, player2Socket.id]
    });
    
    logger.info(`📋 Processing pending joins for match ${matchId}`);
    this.processPendingJoins(matchId);

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
      message: 'Match starting! Prepare for battle!'
    });

    // Start the round system
    roundSystem.startMatch();
    
    logger.info(`Match ${matchId} started with round system: ${player1.username} vs ${player2.username}`);
  }
  
  /**
   * Handle match acceptance
   */
  private async handleAcceptMatch(socket: Socket, data: { matchId: string }): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(socket);
    if (!playerId) return;
    
    try {
      // Simple matchmaking auto-accepts matches, no manual acceptance needed
      logger.info(`Player ${playerId} acknowledged match ${data.matchId}`);
      socket.emit('match_accepted', { matchId: data.matchId });
      
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
  private handlePlayerMove(socket: Socket, data: { x: number; y: number; classType: ClassType; timestamp: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket?.matchId) return;
    
    console.log('📥 Server received movement update:', { playerId, x: data.x, y: data.y, timestamp: data.timestamp });
    
    // Basic server-side validation
    if (typeof data.x !== 'number' || typeof data.y !== 'number' || 
        isNaN(data.x) || isNaN(data.y) || 
        Math.abs(data.x) > 100 || Math.abs(data.y) > 100) {
      console.warn('⚠️ Invalid movement data received:', data);
      return;
    }
    
    // Update server-side game state (server-authoritative)
    const updated = this.simpleGameState.updatePlayerPosition(playerId, data.x, data.y, 0);
    
    if (updated) {
      console.log('✅ Player position updated on server, broadcasting to other players');
      
      // Broadcast to ALL players in match (including sender for echo confirmation)
      this.io.to(playerSocket.matchId).emit('player_update', {
        id: playerId,
        x: data.x,
        y: data.y,
        angle: 0, // We'll update this with rotation events
        classType: data.classType,
        health: 100, // Get from game state
        armor: 50,
        isAlive: true,
        isMoving: true,
        timestamp: data.timestamp
      });
      
      console.log('📡 Broadcasted movement to match:', playerSocket.matchId);
    } else {
      console.warn('❌ Failed to update player position on server');
    }
  }
  
  /**
   * Handle player rotation
   */
  private handlePlayerRotate(socket: Socket, data: { angle: number; timestamp: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket?.matchId) return;
    
    console.log('📥 Server received rotation update:', { playerId, angle: data.angle, timestamp: data.timestamp });
    
    // Basic validation for angle
    if (typeof data.angle !== 'number' || isNaN(data.angle)) {
      console.warn('⚠️ Invalid rotation data received:', data);
      return;
    }
    
    // Update server-side game state with rotation
    const updated = this.simpleGameState.updatePlayerRotation(playerId, data.angle);
    
    if (updated) {
      // Broadcast to ALL players in match (including sender for echo confirmation)
      this.io.to(playerSocket.matchId).emit('player_update', {
        id: playerId,
        angle: data.angle,
        timestamp: data.timestamp
      });
      
      console.log('📡 Broadcasted rotation to match:', playerSocket.matchId);
    }
  }
  
  /**
   * Handle primary attack
   */
  private handlePrimaryAttack(socket: Socket, data: { targetX: number; targetY: number; timestamp: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    if (!playerId || !playerSocket?.matchId) return;
    
    // Process server-side attack logic
    const attackResult = this.simpleGameState.handlePlayerAttack(playerId, data.targetX, data.targetY);
    
    if (attackResult) {
      // Broadcast attack event to all players in match
      this.io.to(playerSocket.matchId).emit('player_attack', {
        playerId,
        attackType: 'primary',
        targetX: data.targetX,
        targetY: data.targetY,
        timestamp: data.timestamp
      });
    }
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
   * Process pending join requests for a match that is now ready
   */
  private processPendingJoins(matchId: string): void {
    const pendingJoins = this.pendingJoins.get(matchId);
    if (!pendingJoins || pendingJoins.length === 0) {
      return;
    }
    
    logger.info(`Processing ${pendingJoins.length} pending joins for match ${matchId}`);
    
    // Process all pending joins
    for (const {socket, data} of pendingJoins) {
      this.handleJoinMatchInternal(socket, data);
    }
    
    // Clear pending joins for this match
    this.pendingJoins.delete(matchId);
  }
  
  /**
   * Handle join match (reconnection)
   */
  private handleJoinMatch(socket: Socket, data: { matchId: string; classType?: string }): void {
    const matchStatus = this.matchInitializationStatus.get(data.matchId);
    
    logger.info(`🎯 handleJoinMatch called:`, {
      socketId: socket.id,
      matchId: data.matchId,
      matchStatus,
      allMatchStatuses: Array.from(this.matchInitializationStatus.entries())
    });
    
    if (matchStatus !== 'ready') {
      // Match is 'initializing' or still undefined – queue the request
      logger.info(`Match ${data.matchId} not ready yet (status: ${matchStatus}), queuing join request for socket ${socket.id}`);
      
      if (!this.pendingJoins.has(data.matchId)) {
        this.pendingJoins.set(data.matchId, []);
      }
      
      this.pendingJoins.get(data.matchId)!.push({
        socket,
        data,
        timestamp: Date.now()
      });
      
      return;
    } else {
      // Match is ready, process immediately
      this.handleJoinMatchInternal(socket, data);
    }
  }
  
  /**
   * Internal handler for join match (after match is ready)
   */
  private handleJoinMatchInternal(socket: Socket, data: { matchId: string; classType?: string }): void {
    logger.info(`🎮 handleJoinMatchInternal called:`, {
      socketId: socket.id,
      matchId: data.matchId,
      classType: data.classType,
      socketConnected: socket.connected,
      socketHandshake: socket.handshake?.auth
    });
    
    // Debug socket mappings
    logger.info(`🔍 Socket mapping debug:`, {
      socketToPlayerSize: this.socketToPlayer.size,
      playerSocketsSize: this.playerSockets.size,
      socketToPlayerEntries: Array.from(this.socketToPlayer.entries()),
      playerSocketIds: Array.from(this.playerSockets.values()).map(ps => ({
        socketId: ps.id,
        playerId: ps.playerId,
        authenticated: ps.authenticated,
        username: ps.username
      }))
    });
    
    const playerId = this.getPlayerIdFromSocket(socket);
    const playerSocket = this.playerSockets.get(playerId!);
    
    logger.info(`🔍 Player lookup result:`, {
      playerId,
      hasPlayerSocket: !!playerSocket,
      playerSocketAuthenticated: playerSocket?.authenticated,
      playerSocketUsername: playerSocket?.username,
      allPlayerIds: Array.from(this.playerSockets.keys())
    });
    
    if (!playerId || !playerSocket) {
      logger.error(`❌ Player not found for join_match:`, {
        socketId: socket.id,
        playerId,
        hasPlayerSocket: !!playerSocket
      });
      return;
    }
    
    playerSocket.matchId = data.matchId;
    socket.join(data.matchId);
    
    // Send initial full sync to joining player
    this.simpleGameState.forceFullSync(data.matchId);
    
    // Send player ID separately for initialization
    socket.emit('player_id_assigned', {
      matchId: data.matchId,
      yourPlayerId: playerId
    });
    
    logger.info(`✅ Player ${playerId} joined match ${data.matchId}`);
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
   * Handle delta acknowledgment from client
   */
  private handleDeltaAck(socket: Socket, data: { matchId: string; sequence: number }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    if (!playerId) return;
    
    // Track client sequence for delta compression optimization
    this.simpleGameState.trackClientSequence(data.matchId, playerId, data.sequence);
    
    logger.debug(`Delta acknowledgment received`, {
      playerId,
      matchId: data.matchId,
      sequence: data.sequence
    });
  }
  
  /**
   * Handle client request for full sync
   */
  private handleRequestFullSync(socket: Socket, data: { matchId: string; reason?: string }): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    if (!playerId) return;
    
    logger.info(`Full sync requested by player ${playerId}`, {
      matchId: data.matchId,
      reason: data.reason || 'client_request'
    });
    
    // Force full sync for this match
    this.simpleGameState.forceFullSync(data.matchId);
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
   * Get match ID for a player (if they're in a match)
   */
  private getPlayerMatchId(playerId: string): string | null {
    const playerSocket = this.playerSockets.get(playerId);
    return playerSocket?.matchId || null;
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
    this.activeMatches.clear();
    this.matchInitializationStatus.clear();
    this.pendingJoins.clear();
    
    logger.info('SimpleGameHandler destroyed');
  }
}