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
import { GameStateAwareConnectionManager } from './GameStateAwareConnectionManager.js';
import type { RoundState } from '../game/match/RoundSystem.js';
import { getConnectionPolicyConfig, type ConnectionPolicyConfig } from '../config/ConnectionPolicies.js';

export interface PlayerSocket {
  id: string;
  socket: Socket;
  playerId: string;
  username?: string;
  classType?: ClassType;
  matchId?: string;
  authenticated: boolean;
  lastHeartbeat: number;
  isTemporarilyDisconnected?: boolean;
  disconnectionTime?: number;
}

export interface DisconnectionInfo {
  playerId: string;
  reason: string;
  timestamp: number;
  isTemporary: boolean;
  gracePeriodMs: number;
  matchId?: string;
}

export type DisconnectReason = 
  | 'client disconnect'     // Intentional disconnect (browser close, etc.)
  | 'transport close'       // Network issue
  | 'ping timeout'          // Connection timeout
  | 'transport error'       // Transport error
  | 'explicit_disconnect'   // Client explicitly sent disconnect
  | 'server ns disconnect'  // Server-side disconnect
  | 'unknown';              // Fallback

export interface SimpleGameHandlerConfig {
  heartbeatInterval: number;    // ms between heartbeat checks
  connectionTimeout: number;    // ms before disconnect
  maxPlayersPerMatch: number;   // Always 2 for 1v1
  connectionPolicyPreset?: 'default' | 'aggressive' | 'lenient' | 'custom'; // Connection policy preset
  connectionPolicyConfig?: ConnectionPolicyConfig; // Custom connection policy configuration
  
  // Disconnection grace periods
  intentionalDisconnectGracePeriod?: number;    // 0ms - immediate for intentional disconnects
  networkIssueGracePeriod?: number;             // 3000ms - 3s for network issues
  unknownDisconnectGracePeriod?: number;        // 5000ms - 5s for unknown disconnects
  matchActiveGracePeriodMultiplier?: number;    // 1.5x - extend grace periods during active rounds
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
  
  // Game-state-aware connection management
  private gameStateConnectionManager: GameStateAwareConnectionManager;
  
  // Legacy heartbeat management (will be replaced)
  private heartbeatTimer: NodeJS.Timeout | null = null;
  
  // Disconnection management
  private pendingDisconnections = new Map<string, DisconnectionInfo>(); // playerId -> disconnection info
  private gracePeriodTimers = new Map<string, NodeJS.Timeout>();        // playerId -> timer
  
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
    
    // Initialize game-state-aware connection manager with configuration
    // COMMENTED OUT FOR DEBUGGING - using legacy heartbeat instead
    // const connectionPolicyConfig = config?.connectionPolicyConfig || 
    //                               getConnectionPolicyConfig(config?.connectionPolicyPreset);
    // this.gameStateConnectionManager = new GameStateAwareConnectionManager(connectionPolicyConfig);
    
    this.config = {
      heartbeatInterval: 30000,  // 30 seconds
      connectionTimeout: 60000,  // 60 seconds
      maxPlayersPerMatch: 2,
      // Disconnection grace period defaults
      intentionalDisconnectGracePeriod: 0,      // Immediate for intentional disconnects
      networkIssueGracePeriod: 3000,            // 3 seconds for network issues
      unknownDisconnectGracePeriod: 5000,       // 5 seconds for unknown disconnects
      matchActiveGracePeriodMultiplier: 1.5,    // 1.5x during active rounds
      ...config
    };
    
    this.setupSocketHandling();
    this.setupMatchmakingIntegration();
    // COMMENTED OUT FOR DEBUGGING - using legacy heartbeat instead
    // this.startGameStateAwareMonitoring();
    // COMMENTED OUT - removing heartbeat monitoring entirely for now
    // this.startLegacyHeartbeatMonitoring();
    
    logger.info('SimpleGameHandler initialized WITHOUT heartbeat monitoring (debugging mode)');
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
      socket.on('explicit_disconnect', (data) => this.handleExplicitDisconnect(socket, data));
      socket.on('player_disconnect', (data) => this.handlePlayerDisconnect(socket, data));
      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason).catch(error => {
        logger.error('Error handling disconnect:', error);
      }));
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
      
      // Register with legacy connection manager
      this.simpleConnectionManager.addConnection(playerId, username, socket);
      
      // COMMENTED OUT FOR DEBUGGING
      // Register with game-state-aware connection manager
      // this.gameStateConnectionManager.registerPlayer(playerId);
      
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
      
      // Get player data including usernames and class types
      const allPlayers = matchState.gameState.players;
      const playersData: { [playerId: string]: { username: string; classType: string } } = {};
      
      for (const [pId, player] of allPlayers) {
        playersData[pId] = {
          username: player.username,
          classType: player.classType
        };
      }
      
      // Send proper MatchStartData structure
      socket.emit('match_start', {
        matchId: data.matchId,
        yourPlayerId: playerId,
        opponentId: opponentId,
        mapData: clientMapData,
        roundDuration: GAME_CONSTANTS.ROUND_DURATION * 1000, // Convert to milliseconds
        maxRounds: GAME_CONSTANTS.MAX_ROUNDS,
        players: playersData
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
      },
      
      // COMMENTED OUT FOR DEBUGGING
      // Connection management callbacks for game-state-aware monitoring
      // onStateChange: (matchId: string, newState: RoundState, oldState: RoundState) => {
      //   logger.debug(`🔄 Match ${matchId} state transition: ${oldState} → ${newState}`);
      //   this.gameStateConnectionManager.updateMatchState(matchId, newState);
      // },
      
      // onSuspendMonitoring: (matchId: string, durationMs: number) => {
      //   logger.debug(`⏸️ Suspending connection monitoring for match ${matchId} (${durationMs}ms)`);
      //   this.gameStateConnectionManager.suspendMonitoring(matchId, durationMs);
      // },
      
      // onMatchRegistered: (matchId: string, playerIds: string[]) => {
      //   logger.info(`📝 Registering match ${matchId} with connection manager`, { playerIds });
      //   this.gameStateConnectionManager.registerMatch(matchId, playerIds);
      // },
      
      // onMatchUnregistered: (matchId: string) => {
      //   logger.info(`🗑️ Unregistering match ${matchId} from connection manager`);
      //   this.gameStateConnectionManager.unregisterMatch(matchId);
      // }
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
      
      // COMMENTED OUT FOR DEBUGGING
      // Update game-state-aware connection manager
      // this.gameStateConnectionManager.updatePlayerHeartbeat(playerId!);
      
      socket.emit('heartbeat_ack');
    }
  }

  /**
   * Handle explicit disconnect from client
   */
  private async handleExplicitDisconnect(socket: Socket, data: { reason?: string }): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(socket);
    
    if (!playerId) {
      logger.warn(`Explicit disconnect from unknown socket: ${socket.id}`);
      return;
    }

    const explicitReason = data?.reason || 'user_action';
    logger.info(`🚪 Explicit disconnect from ${playerId}: ${explicitReason}`);

    // Force immediate disconnection by simulating explicit_disconnect reason
    await this.handleDisconnect(socket, 'explicit_disconnect');
  }

  /**
   * Handle player_disconnect event from client (with custom reason)
   */
  private async handlePlayerDisconnect(socket: Socket, data: { reason?: string }): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(socket);
    
    if (!playerId) {
      logger.warn(`Player disconnect from unknown socket: ${socket.id}`);
      return;
    }

    const disconnectReason = data?.reason || 'user_disconnect';
    logger.info(`🚪 Player disconnect event from ${playerId}: ${disconnectReason}`);

    // Handle disconnect with the custom reason
    await this.handleDisconnect(socket, disconnectReason);
  }
  
  /**
   * Handle disconnect with intelligent grace period management
   */
  private async handleDisconnect(socket: Socket, reason: string): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(socket);
    
    if (!playerId) {
      logger.warn(`Disconnect event for unknown socket: ${socket.id}`);
      return;
    }

    const playerSocket = this.playerSockets.get(playerId);
    if (!playerSocket) {
      logger.warn(`Disconnect event for unknown player: ${playerId}`);
      return;
    }

    logger.info(`🔌 Player ${playerId} disconnected with reason: "${reason}"`);

    // Classify the disconnect reason and determine grace period
    const disconnectType = this.classifyDisconnectReason(reason);
    const gracePeriodMs = this.calculateGracePeriod(disconnectType, playerSocket.matchId);
    
    // Create disconnection info
    const disconnectionInfo: DisconnectionInfo = {
      playerId,
      reason,
      timestamp: Date.now(),
      isTemporary: gracePeriodMs > 0,
      gracePeriodMs,
      matchId: playerSocket.matchId
    };

    if (gracePeriodMs === 0) {
      // Immediate disconnection for intentional disconnects
      logger.info(`⚡ Immediate disconnection for ${playerId} (intentional disconnect)`);
      await this.processDisconnection(disconnectionInfo);
    } else {
      // Start grace period for potential reconnection
      logger.info(`⏱️ Starting ${gracePeriodMs}ms grace period for ${playerId} (${disconnectType})`);
      await this.startGracePeriod(disconnectionInfo);
    }
  }

  /**
   * Classify disconnect reason into categories
   */
  private classifyDisconnectReason(reason: string): DisconnectReason {
    const normalizedReason = reason.toLowerCase();
    
    if (normalizedReason.includes('client disconnect') || normalizedReason === 'io client disconnect') {
      return 'client disconnect';
    } else if (normalizedReason.includes('transport close')) {
      return 'transport close';
    } else if (normalizedReason.includes('ping timeout')) {
      return 'ping timeout';
    } else if (normalizedReason.includes('transport error')) {
      return 'transport error';
    } else if (normalizedReason.includes('explicit_disconnect')) {
      return 'explicit_disconnect';
    } else if (normalizedReason.includes('exit_match')) {
      // Special case: Player clicked exit button - terminate the entire match
      return 'explicit_disconnect'; // Treat as explicit for no grace period
    } else if (normalizedReason.includes('server ns disconnect')) {
      return 'server ns disconnect';
    } else {
      return 'unknown';
    }
  }

  /**
   * Calculate appropriate grace period based on disconnect type and match state
   */
  private calculateGracePeriod(disconnectType: DisconnectReason, matchId?: string): number {
    let baseGracePeriod = 0;

    switch (disconnectType) {
      case 'client disconnect':
      case 'explicit_disconnect':
        baseGracePeriod = this.config.intentionalDisconnectGracePeriod || 0;
        break;
      
      case 'transport close':
      case 'ping timeout':
      case 'transport error':
        baseGracePeriod = this.config.networkIssueGracePeriod || 3000;
        break;
      
      case 'unknown':
      case 'server ns disconnect':
      default:
        baseGracePeriod = this.config.unknownDisconnectGracePeriod || 5000;
        break;
    }

    // Apply multiplier if player is in an active match
    if (matchId && this.isMatchActive(matchId)) {
      const multiplier = this.config.matchActiveGracePeriodMultiplier || 1.5;
      baseGracePeriod = Math.round(baseGracePeriod * multiplier);
    }

    return baseGracePeriod;
  }

  /**
   * Check if a match is currently active (not in lobby or completed)
   */
  private isMatchActive(matchId: string): boolean {
    const matchManager = this.matchManagers.get(matchId);
    if (!matchManager) return false;

    const roundInfo = matchManager.getRoundInfo();
    return roundInfo.roundState === 'active' || roundInfo.roundState === 'countdown';
  }

  // ============================================================================
  // GRACE PERIOD AND DISCONNECTION PROCESSING
  // ============================================================================

  /**
   * Start grace period for potential reconnection
   */
  private async startGracePeriod(disconnectionInfo: DisconnectionInfo): Promise<void> {
    const { playerId, gracePeriodMs, matchId } = disconnectionInfo;
    
    // Mark player as temporarily disconnected
    const playerSocket = this.playerSockets.get(playerId);
    if (playerSocket) {
      playerSocket.isTemporarilyDisconnected = true;
      playerSocket.disconnectionTime = Date.now();
    }

    // Store pending disconnection info
    this.pendingDisconnections.set(playerId, disconnectionInfo);

    // Notify match about temporary disconnection
    if (matchId) {
      this.broadcastToMatch(matchId, 'player_temporarily_disconnected', {
        playerId,
        gracePeriodMs,
        reason: disconnectionInfo.reason
      });

      // Pause match if in active round
      const matchManager = this.matchManagers.get(matchId);
      if (matchManager && this.isMatchActive(matchId)) {
        logger.info(`⏸️ Pausing match ${matchId} due to player disconnection`);
        // TODO: Implement match pause functionality
        // matchManager.pauseMatch('player_disconnection');
      }
    }

    // Set grace period timer
    const gracePeriodTimer = setTimeout(async () => {
      await this.onGracePeriodExpired(playerId);
    }, gracePeriodMs);

    this.gracePeriodTimers.set(playerId, gracePeriodTimer);
    
    logger.info(`⏱️ Grace period started for ${playerId}: ${gracePeriodMs}ms`);
  }

  /**
   * Handle grace period expiration
   */
  private async onGracePeriodExpired(playerId: string): Promise<void> {
    const disconnectionInfo = this.pendingDisconnections.get(playerId);
    
    if (!disconnectionInfo) {
      logger.warn(`Grace period expired for ${playerId} but no disconnection info found`);
      return;
    }

    // Check if player reconnected during grace period
    const playerSocket = this.playerSockets.get(playerId);
    if (playerSocket && !playerSocket.isTemporarilyDisconnected) {
      logger.info(`✅ Player ${playerId} reconnected during grace period`);
      this.cleanupGracePeriod(playerId);
      return;
    }

    logger.info(`⏰ Grace period expired for ${playerId} - processing disconnection`);
    await this.processDisconnection(disconnectionInfo);
  }

  /**
   * Process actual disconnection (after grace period or immediate)
   */
  private async processDisconnection(disconnectionInfo: DisconnectionInfo): Promise<void> {
    const { playerId, matchId, reason } = disconnectionInfo;
    const playerSocket = this.playerSockets.get(playerId);

    logger.info(`🔌 Processing disconnection for ${playerId}: ${reason}`);

    // Handle special case: exit_match should terminate the entire match
    if (matchId && reason.toLowerCase().includes('exit_match')) {
      logger.info(`🚪 Player ${playerId} clicked exit - terminating entire match ${matchId}`);
      
      const matchManager = this.matchManagers.get(matchId);
      if (matchManager) {
        // Determine the winner (the other player)
        const activeMatch = this.activeMatches.get(matchId);
        const otherPlayerId = activeMatch?.players.find(pId => pId !== playerId);
        
        if (otherPlayerId) {
          // Force end the match immediately with the other player as winner
          // This will trigger onMatchEnd callback which handles cleanup and notifications
          matchManager.forceEnd(otherPlayerId, 'player_exit');
        } else {
          // No other player, just end the match with the current player as winner (shouldn't happen)
          matchManager.forceEnd(playerId, 'player_exit');
        }
      }
    } else if (matchId) {
      // Normal disconnection handling
      const matchManager = this.matchManagers.get(matchId);
      if (matchManager) {
        matchManager.disconnectPlayer(playerId);
      }
      
      // Notify other players in match about final disconnection
      this.broadcastToMatch(matchId, 'player_disconnected', {
        playerId,
        reason,
        isFinal: true
      });

      // Resume match if it was paused
      if (matchManager && this.isMatchActive(matchId)) {
        logger.info(`▶️ Resuming match ${matchId} after player disconnection`);
        // TODO: Implement match resume functionality
        // matchManager.resumeMatch();
      }
    }
    
    // Clean up player resources
    await this.simpleConnectionManager.removeConnection(playerId);
    await this.simpleMatchmaking.leaveQueue(playerId);
    this.removePlayerSocket(playerId);
    
    // Clean up grace period tracking
    this.cleanupGracePeriod(playerId);
    
    logger.info(`🧹 Player ${playerId} completely disconnected and cleaned up`);
  }

  /**
   * Handle player reconnection during grace period
   */
  handlePlayerReconnection(playerId: string, newSocket: Socket): boolean {
    const playerSocket = this.playerSockets.get(playerId);
    const disconnectionInfo = this.pendingDisconnections.get(playerId);
    
    if (!playerSocket || !disconnectionInfo || !playerSocket.isTemporarilyDisconnected) {
      return false; // Not in grace period
    }

    logger.info(`🔄 Player ${playerId} reconnecting during grace period`);
    
    // Update socket reference
    playerSocket.socket = newSocket;
    playerSocket.isTemporarilyDisconnected = false;
    delete playerSocket.disconnectionTime;
    
    // Update socket mapping
    this.socketToPlayer.set(newSocket.id, playerId);
    
    // Notify match about reconnection
    if (disconnectionInfo.matchId) {
      this.broadcastToMatch(disconnectionInfo.matchId, 'player_reconnected', {
        playerId,
        gracePeriodRemaining: this.getRemainingGracePeriod(playerId)
      });

      // Resume match if it was paused
      const matchManager = this.matchManagers.get(disconnectionInfo.matchId);
      if (matchManager && this.isMatchActive(disconnectionInfo.matchId)) {
        logger.info(`▶️ Resuming match ${disconnectionInfo.matchId} after player reconnection`);
        // TODO: Implement match resume functionality
        // matchManager.resumeMatch();
      }
    }
    
    // Clean up grace period
    this.cleanupGracePeriod(playerId);
    
    logger.info(`✅ Player ${playerId} successfully reconnected`);
    return true;
  }

  /**
   * Get remaining grace period time
   */
  private getRemainingGracePeriod(playerId: string): number {
    const disconnectionInfo = this.pendingDisconnections.get(playerId);
    if (!disconnectionInfo) return 0;
    
    const elapsed = Date.now() - disconnectionInfo.timestamp;
    return Math.max(0, disconnectionInfo.gracePeriodMs - elapsed);
  }

  /**
   * Clean up grace period tracking for a player
   */
  private cleanupGracePeriod(playerId: string): void {
    // Clear timer
    const timer = this.gracePeriodTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.gracePeriodTimers.delete(playerId);
    }
    
    // Remove pending disconnection
    this.pendingDisconnections.delete(playerId);
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
      
      // Clean up any pending grace period for this player
      this.cleanupGracePeriod(playerId);
      
      // COMMENTED OUT FOR DEBUGGING
      // Unregister from game-state-aware connection manager
      // this.gameStateConnectionManager.unregisterPlayer(playerId);
    }
  }
  
  /**
   * Start game-state-aware connection monitoring
   */
  private startGameStateAwareMonitoring(): void {
    this.heartbeatTimer = setInterval(() => {
      const playersToCheck = this.gameStateConnectionManager.getPlayersForMonitoring();
      const disconnectedPlayers: string[] = [];
      
      for (const playerId of playersToCheck) {
        const result = this.gameStateConnectionManager.shouldDisconnectPlayer(playerId);
        
        if (result.shouldDisconnect) {
          disconnectedPlayers.push(playerId);
          logger.warn(`Player ${playerId} marked for disconnection`, {
            reason: result.reason,
            policy: result.policy.description
          });
        }
      }
      
      // Disconnect players that should be disconnected
      for (const playerId of disconnectedPlayers) {
        const playerSocket = this.playerSockets.get(playerId);
        if (playerSocket) {
          playerSocket.socket.disconnect(true);
          logger.info(`Disconnected player using game-state-aware logic: ${playerId}`);
        }
      }
      
      // Log monitoring stats periodically for debugging
      if (Math.random() < 0.1) { // 10% chance each cycle
        const stats = this.gameStateConnectionManager.getMonitoringStats();
        logger.debug('Connection monitoring stats', stats);
      }
      
    }, this.config.heartbeatInterval);
  }
  
  /**
   * Legacy heartbeat monitoring (kept for reference)
   */
  private startLegacyHeartbeatMonitoring(): void {
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
    // COMMENTED OUT - not using heartbeat timer anymore
    // if (this.heartbeatTimer) {
    //   clearInterval(this.heartbeatTimer);
    //   this.heartbeatTimer = null;
    // }
    
    // Clean up all grace period timers
    for (const timer of this.gracePeriodTimers.values()) {
      clearTimeout(timer);
    }
    this.gracePeriodTimers.clear();
    this.pendingDisconnections.clear();
    
    this.playerSockets.clear();
    this.socketToPlayer.clear();
    this.activeMatches.clear();
    this.matchInitializationStatus.clear();
    
    logger.info('SimpleGameHandler destroyed and all resources cleaned up');
  }
}