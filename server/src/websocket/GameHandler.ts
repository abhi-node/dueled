import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { ActionType, type GameAction, type ClassType, WSEvents, type MovePayload, type RotatePayload, type AttackPayload } from '@dueled/shared';
import jwt from 'jsonwebtoken';
import { matchmakingService } from '../services/matchmakingService.js';
import { PlayerService } from '../services/playerService.js';
import { gameStateService } from '../services/gameStateService.js';
import { authenticateSocketToken } from '../middleware/authSecure.js';
import { verifyToken, JwtPayload } from '../utils/jwt.js';
import { connectionTracker } from '../services/connectionTracker.js';
import { db } from '../services/database.js';

const playerService = new PlayerService();

export class GameHandler {
  private io: Server;
  private rooms: Map<string, Set<string>> = new Map();
  private playerToRoom: Map<string, string> = new Map();
  private playerSockets: Map<string, Socket> = new Map();
  private playerClasses: Map<string, ClassType> = new Map();
  
  // Track match states and join times
  private matchStates: Map<string, {
    expectedPlayers: Set<string>;
    joinedPlayers: Set<string>;
    createdAt: number;
    allPlayersJoinedAt?: number;
  }> = new Map();
  
  private readonly MATCH_JOIN_GRACE_PERIOD = 10000; // 10 seconds for both players to join

  constructor(io: Server) {
    this.io = io;
    this.setupNamespace();
    
    // Connect this handler to the game state service for broadcasting
    gameStateService.setGameHandler(this);
    
    // Start matchmaking queue processor - reduced interval for faster matching
    setInterval(() => {
      matchmakingService.processQueue();
    }, 2000); // Changed from 5000ms to 2000ms for faster matching
    
    // Send periodic queue status updates to all players in queue
    setInterval(() => {
      this.broadcastQueueStatusUpdates();
    }, 3000); // Every 3 seconds
    
    // Start queue cleanup
    setInterval(() => {
      matchmakingService.cleanupQueue();
    }, 30000);
    
    // Start match state cleanup
    setInterval(() => {
      this.cleanupMatchStates();
    }, 15000); // Every 15 seconds
    
    // Start stale player cleanup with connection tracker
    setInterval(() => {
      this.cleanupStaleConnections();
    }, 5000); // Every 5 seconds
  }

  private setupNamespace() {
    const gameNamespace = this.io.of('/game');
    
    gameNamespace.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          // Allow anonymous connections for debugging
          logger.warn(`Socket connection without token - allowing anonymous access for ${socket.id}`);
          socket.data.userId = `anon_${socket.id}`;
          socket.data.sessionId = `anon_session_${socket.id}`;
          socket.data.username = `Anonymous_${socket.id.substr(-4)}`;
          socket.data.isAnonymous = true;
          return next();
        }

        // Use the new JWT verification with RS256
        const payload = await authenticateSocketToken(token);
        if (!payload) {
          logger.error(`Invalid token for socket ${socket.id}`);
          // Fall back to anonymous for debugging
          socket.data.userId = `anon_${socket.id}`;
          socket.data.sessionId = `anon_session_${socket.id}`;
          socket.data.username = `Anonymous_${socket.id.substr(-4)}`;
          socket.data.isAnonymous = true;
          return next();
        }

        // Get player data
        const player = await playerService.findPlayerById(payload.sub);
        if (!player) {
          logger.error(`Player not found for user ${payload.sub}`);
          return next(new Error('Player not found'));
        }

        socket.data.userId = payload.sub;
        socket.data.sessionId = payload.sid; // Session ID for multi-tab support
        socket.data.username = player.username;
        socket.data.isAnonymous = player.isAnonymous;
        socket.data.role = payload.role;
        
        logger.info(`Socket authenticated successfully: user ${payload.sub} (${player.username}) session ${payload.sid} on socket ${socket.id}`);
        next();
      } catch (error) {
        logger.error(`Socket authentication failed for ${socket.id}:`, error);
        // Fall back to anonymous for debugging
        logger.warn(`Falling back to anonymous connection for ${socket.id}`);
        socket.data.userId = `anon_${socket.id}`;
        socket.data.sessionId = `anon_session_${socket.id}`;
        socket.data.username = `Anonymous_${socket.id.substr(-4)}`;
        socket.data.isAnonymous = true;
        next();
      }
    });

    gameNamespace.on('connection', (socket) => {
      logger.info(`WebSocket connected: ${socket.data.username} (${socket.data.userId}) on socket ${socket.id}`);
      this.handleConnection(socket);
      
      socket.on('disconnect', (reason) => {
        logger.info(`WebSocket disconnected: ${socket.data.username} (${socket.data.userId}) on socket ${socket.id}, reason: ${reason}`);
      });
    });
  }

  private handleConnection(socket: Socket) {
    const userId = socket.data.userId;
    const sessionId = socket.data.sessionId;
    logger.info(`Player ${userId} connected to game namespace`);
    
    // Store socket reference
    this.playerSockets.set(userId, socket);
    
    // Update connection tracker with heartbeat
    const roomId = this.playerToRoom.get(userId);
    if (roomId && roomId.startsWith('match:')) {
      const matchId = roomId.replace('match:', '');
      connectionTracker.updateLastSeen(matchId, userId, sessionId, socket.id);
    }

    // Setup event handlers
    socket.on('join_queue', (data) => this.handleJoinQueue(socket, data));
    socket.on('leave_queue', () => this.handleLeaveQueue(socket));
    socket.on('queue_status', () => this.handleQueueStatus(socket));
    socket.on('match_accepted', (data) => this.handleMatchAccepted(socket, data));
    socket.on('match_declined', (data) => this.handleMatchDeclined(socket, data));
    
    // Game events
    socket.on('join_match', (data) => this.handleJoinMatch(socket, data));
    socket.on(WSEvents.PLAYER_MOVE, (data) => this.handlePlayerMove(socket, data));
    socket.on(WSEvents.PLAYER_ROTATE, (data) => this.handlePlayerRotate(socket, data));
    socket.on(WSEvents.PLAYER_ATTACK, (data) => this.handlePlayerAttack(socket, data));
    socket.on('game:action', (action) => this.handleGameAction(socket, action));
    
    // Heartbeat for connection tracking
    socket.on('heartbeat', () => this.handleHeartbeat(socket));
    
    // Reconnection handler
    socket.on('reconnect_to_match', (data) => this.handleReconnectToMatch(socket, data));
    
    // Debug endpoints
    socket.on('debug:test_projectile', () => this.handleDebugTestProjectile(socket));
    socket.on('debug:game_status', () => this.handleDebugGameStatus(socket));
    socket.on('debug:init_game', (data) => this.handleDebugInitGame(socket, data));
    
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  private async handleJoinQueue(socket: Socket, data: { classType: ClassType }) {
    try {
      const userId = socket.data.userId;
      const sessionId = socket.data.sessionId;
      const username = socket.data.username;
      
      // Get player rating
      const player = await playerService.getPlayerProfile(userId);
      const rating = player?.stats?.rating || 1000;
      
      // Join matchmaking queue with sessionId for multi-tab support
      await matchmakingService.joinQueue(userId, sessionId, username, rating, data.classType);
      
      // Store player class
      this.playerClasses.set(userId, data.classType);
      
      // Send confirmation
      socket.emit('queue_joined', { success: true });
      
      // Send initial queue status
      const status = await matchmakingService.getQueueStatus(userId);
      socket.emit('queue_status', status);
      
      logger.info(`Player ${userId} joined queue as ${data.classType}`);
    } catch (error) {
      logger.error('Error joining queue:', error);
      socket.emit('queue_error', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleLeaveQueue(socket: Socket) {
    try {
      const userId = socket.data.userId;
      const sessionId = socket.data.sessionId;
      
      await matchmakingService.leaveQueue(userId, sessionId);
      
      socket.emit('queue_left', { success: true });
      
      logger.info(`Player ${userId} left queue`);
    } catch (error) {
      logger.error('Error leaving queue:', error);
      socket.emit('queue_error', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleQueueStatus(socket: Socket) {
    try {
      const userId = socket.data.userId;
      const sessionId = socket.data.sessionId;
      
      const status = await matchmakingService.getQueueStatus(userId, sessionId);
      socket.emit('queue_status', status);
    } catch (error) {
      logger.error('Error getting queue status:', error);
    }
  }

  private async handleMatchAccepted(socket: Socket, data: { matchId: string }) {
    try {
      const userId = socket.data.userId;
      logger.info(`Match ${data.matchId} accepted by player ${userId}`);
      
      // Handle the acceptance through matchmaking service
      const bothAccepted = await matchmakingService.handleMatchAccepted(userId, data.matchId);
      
      if (bothAccepted) {
        // Both players have accepted, match is being created
        socket.emit('match_accepted_confirmed', { 
          matchId: data.matchId,
          message: 'Both players accepted! Preparing game...',
          status: 'BOTH_ACCEPTED'
        });
      } else {
        // This player accepted, waiting for other player
        socket.emit('match_accepted_confirmed', { 
          matchId: data.matchId,
          message: 'Waiting for opponent to accept...',
          status: 'WAITING_FOR_OPPONENT'
        });
      }
      
    } catch (error) {
      logger.error('Error handling match acceptance:', error);
      socket.emit('match_error', { error: 'Failed to process match acceptance' });
    }
  }

  private async handleMatchDeclined(socket: Socket, data: { matchId: string }) {
    try {
      const userId = socket.data.userId;
      logger.info(`Match ${data.matchId} declined by player ${userId}`);
      
      // Handle the decline through matchmaking service
      await matchmakingService.handleMatchDecline(data.matchId, userId);
      
      // Send confirmation to the declining player
      socket.emit('match_decline_confirmed', { 
        matchId: data.matchId,
        message: 'You have been removed from the queue.' 
      });
      
    } catch (error) {
      logger.error('Error handling match decline:', error);
      socket.emit('match_error', { error: 'Failed to process match decline' });
    }
  }

  private async handleJoinMatch(socket: Socket, data: { matchId: string, classType?: ClassType }) {
    try {
      const matchData = await matchmakingService.getMatch(data.matchId);
      if (!matchData) {
        socket.emit('match_error', { error: 'Match not found' });
        return;
      }
      
      const userId = socket.data.userId;
      const sessionId = socket.data.sessionId;
      const roomId = `match:${data.matchId}`;
      
      // Join the match room
      socket.join(roomId);
      this.playerToRoom.set(userId, roomId);
      
      // Update connection tracker for this match
      connectionTracker.updateLastSeen(data.matchId, userId, sessionId, socket.id);
      
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set());
      }
      this.rooms.get(roomId)!.add(userId);
      
      // Store player class if provided, or get from match data
      const playerClass = data.classType || 
        (userId === matchData.player1.playerId ? matchData.player1.classType : matchData.player2.classType);
      this.playerClasses.set(userId, playerClass);
      
      logger.info(`Player ${userId} joining match with class ${playerClass} (provided: ${data.classType}, from match: ${userId === matchData.player1.playerId ? matchData.player1.classType : matchData.player2.classType})`);
      
      // Get initial spawn position for this player for notification
      let playerPosition = { x: 2.5, y: 2.5 }; // Default within map bounds
      try {
        const gameState = await gameStateService.getGameState(data.matchId);
        if (gameState) {
          const serverPlayer = gameState.players.get(userId);
          if (serverPlayer) {
            playerPosition = { x: serverPlayer.position.x, y: serverPlayer.position.y };
          }
        }
      } catch (error) {
        logger.warn(`Could not get position for player notification ${userId}:`, error);
      }
      
      // Removed player:joined broadcast - sprites now handled via game_update packets only
      
      // Get initial spawn position for this player
      const playerIndex = userId === matchData.player1.playerId ? 0 : 1;
      const spawnPoint = { x: 2.5, y: 2.5 }; // Default within map bounds
      
      // Try to get actual spawn position from game state
      try {
        const gameState = await gameStateService.getGameState(data.matchId);
        if (gameState) {
          const serverPlayer = gameState.players.get(userId);
          if (serverPlayer) {
            spawnPoint.x = serverPlayer.position.x;
            spawnPoint.y = serverPlayer.position.y;
          }
        }
      } catch (error) {
        logger.warn(`Could not get spawn position for player ${userId}:`, error);
      }
      
      // Send match info to the joining player
      socket.emit('match_joined', {
        matchId: data.matchId,
        players: [matchData.player1, matchData.player2],
        yourPlayerId: userId,
        initialPosition: spawnPoint
      });
      
      logger.info(`Sent match_joined to ${userId} with players: player1(${matchData.player1.playerId}, class:${matchData.player1.classType}), player2(${matchData.player2.playerId}, class:${matchData.player2.classType})`);
      
      // CRITICAL: Always ensure game state exists when player joins
      // This handles cases where match creation didn't properly initialize game state
      logger.info(`🔍 Checking game state existence for match ${data.matchId}...`);
      await this.ensureGameStateAndStart(data.matchId);
      
      // Now send the initial game state to the joining player
      const gameState = await gameStateService.getGameState(data.matchId);
      if (gameState) {
        // Send initial game state
        const players = Array.from(gameState.players.values()).map(p => ({
          id: p.id,
          position: p.position,
          velocity: p.velocity,
          rotation: p.rotation,
          health: p.health,
          armor: p.armor,
          isAlive: p.isAlive,
          classType: p.classType,
          username: p.username
        }));
        
        socket.emit('game:initial_state', {
          matchId: data.matchId,
          players,
          status: gameState.status
        });
        
        logger.info(`📤 Sent initial game state to ${userId} with ${players.length} players`);
      }
      
      // Track player joining the match
      const matchState = this.matchStates.get(data.matchId);
      if (matchState) {
        matchState.joinedPlayers.add(userId);
        
        // Check if all expected players have joined
        if (matchState.joinedPlayers.size === matchState.expectedPlayers.size) {
          matchState.allPlayersJoinedAt = Date.now();
          logger.info(`All players have joined match ${data.matchId}`);
          
          // Ensure game state exists and start game loop
          await this.ensureGameStateAndStart(data.matchId);
        }
        
        logger.info(`Player ${userId} joined match ${data.matchId}. Players in match: ${matchState.joinedPlayers.size}/${matchState.expectedPlayers.size}`);
      } else {
        logger.info(`Player ${userId} joined match ${data.matchId}`);
        
        // If no match state tracking, try to ensure game state anyway
        await this.ensureGameStateAndStart(data.matchId);
      }
    } catch (error) {
      logger.error('Error joining match:', error);
      socket.emit('match_error', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  
  /**
   * Ensure game state exists and start the game
   */
  private async ensureGameStateAndStart(matchId: string): Promise<void> {
    try {
      // Check if game state already exists
      let gameState = await gameStateService.getGameState(matchId);
      
      if (!gameState) {
        logger.warn(`🎮 Game state not found for match ${matchId}, creating it now...`);
        
        // Get match data
        const matchData = await matchmakingService.getMatch(matchId);
        if (!matchData) {
          logger.error(`Cannot create game state: Match ${matchId} not found`);
          return;
        }
        
        // Get player profiles
        const player1Profile = await playerService.getPlayerProfile(matchData.player1.playerId);
        const player2Profile = await playerService.getPlayerProfile(matchData.player2.playerId);
        
        if (!player1Profile || !player2Profile) {
          logger.error(`Cannot create game state: Player profiles not found`);
          return;
        }
        
        // Create player objects
        const player1 = {
          id: matchData.player1.playerId,
          username: matchData.player1.username,
          rating: matchData.player1.rating,
          isAnonymous: player1Profile.isAnonymous
        };
        
        const player2 = {
          id: matchData.player2.playerId,
          username: matchData.player2.username,
          rating: matchData.player2.rating,
          isAnonymous: player2Profile.isAnonymous
        };
        
        // Initialize game state
        const initialized = await gameStateService.initializeGameState(
          matchId,
          player1,
          player2,
          matchData.player1.classType,
          matchData.player2.classType
        );
        
        if (!initialized) {
          logger.error(`Failed to initialize game state for match ${matchId}`);
          return;
        }
        
        logger.info(`✅ Game state created for match ${matchId}`);
      }
      
      // Start game loop if not already running
      const started = await gameStateService.startGameLoop(matchId);
      if (started) {
        logger.info(`🎮 Game loop started for match ${matchId}`);
      } else {
        logger.warn(`⚠️ Failed to start game loop for match ${matchId} (may already be running)`);
      }
      
    } catch (error) {
      logger.error(`Error ensuring game state for match ${matchId}:`, error);
    }
  }

  private async handlePlayerMove(socket: Socket, data: MovePayload) {
    const userId = socket.data.userId;
    const roomId = this.playerToRoom.get(userId);
    
    if (!roomId) return;
    
    const matchId = roomId.replace('match:', '');
    
    // Add player input to game state efficiently
    const action: GameAction = {
      type: ActionType.MOVE,
      playerId: userId,
      data: { position: data.position, rotation: data.angle },
      timestamp: data.timestamp || Date.now()
    };
    
    await gameStateService.addPlayerInput(matchId, userId, action);
    
    // Get player class efficiently - cache lookup first
    let classType = data.classType || this.playerClasses.get(userId);
    
    // Only query match data if class not found and not already cached
    if (!classType) {
      try {
        const matchData = await matchmakingService.getMatch(matchId);
        if (matchData) {
          classType = userId === matchData.player1.playerId ? matchData.player1.classType : matchData.player2.classType;
          if (classType) this.playerClasses.set(userId, classType);
        }
      } catch (error) {
        // Silent fail for performance
      }
    }
    
    // Update stored class if provided
    if (data.classType) {
      this.playerClasses.set(userId, data.classType);
    }
    
    // REMOVED: Immediate player:moved broadcast to prevent position conflicts
    // The authoritative position is now provided by game_update after collision correction
    // This eliminates sprite teleporting caused by raw position vs corrected position mismatch
  }

  private async handlePlayerRotate(socket: Socket, data: RotatePayload) {
    const userId = socket.data.userId;
    const roomId = this.playerToRoom.get(userId);
    
    if (!roomId) {
      return;
    }
    
    // Get player class (from data or stored)
    let classType = data.classType || this.playerClasses.get(userId);
    
    // If class not found, try to get from match data
    if (!classType) {
      try {
        const matchId = roomId.replace('match:', '');
        const matchData = await matchmakingService.getMatch(matchId);
        if (matchData) {
          classType = userId === matchData.player1.playerId ? matchData.player1.classType : matchData.player2.classType;
          // Store it for future use
          if (classType) {
            this.playerClasses.set(userId, classType);
            logger.info(`Retrieved class ${classType} for player ${userId} from match data`);
          }
        }
      } catch (error) {
        logger.error(`Error retrieving player class from match data:`, error);
      }
    }
    
    // Update stored class if provided
    if (data.classType) {
      this.playerClasses.set(userId, data.classType);
    }
    
    // CRITICAL FIX: Update game state with rotation data
    // Create a game action for rotation to ensure server stores the latest facing direction
    const rotationAction: GameAction = {
      type: ActionType.MOVE, // Use MOVE type but with position from current state
      playerId: userId,
      data: {
        position: undefined, // Will be filled by GameStateService from current player position
        rotation: data.angle,
        timestamp: data.timestamp || Date.now()
      },
      timestamp: data.timestamp || Date.now()
    };
    
    // Add to game state processing - this ensures server stores the rotation
    gameStateService.addPlayerInput(roomId.replace('match:', ''), userId, rotationAction);
    
    // Removed immediate player:rotated broadcast - rotations now handled via game_update packets only
  }

  private async handlePlayerAttack(socket: Socket, data: any) {
    const userId = socket.data.userId;
    const roomId = this.playerToRoom.get(userId);
    
    // Fast validation - essential checks only
    if (!data || typeof data !== 'object' || 
        (!data.direction && !data.targetPosition) ||
        !data.attackType || !roomId) {
      socket.emit('attack:error', { error: 'Invalid attack data' });
      return;
    }
    
    const matchId = roomId.replace('match:', '');
    
    // Ensure game state exists
    let gameState = await gameStateService.getGameState(matchId);
    if (!gameState) {
      await this.ensureGameStateAndStart(matchId);
      gameState = await gameStateService.getGameState(matchId);
      if (!gameState) {
        logger.error(`❌ Failed to create game state for match ${matchId}`);
        return;
      }
    }
    
    // Ensure game loop is running
    const gameLoopRunning = await gameStateService.isGameLoopRunning(matchId);
    if (!gameLoopRunning) {
      await this.ensureGameStateAndStart(matchId);
    }
    
    // Get player class efficiently
    let classType = this.playerClasses.get(userId);
    if (!classType) {
      try {
        const matchData = await matchmakingService.getMatch(matchId);
        if (matchData) {
          classType = userId === matchData.player1.playerId ? matchData.player1.classType : matchData.player2.classType;
          if (classType) this.playerClasses.set(userId, classType);
        }
      } catch (error) {
        // Silent fail for performance
      }
    }
    
    if (!classType) return;
    
    // Create attack action for server processing
    const action: GameAction = {
      type: ActionType.ATTACK,
      playerId: userId,
      data: {
        direction: data.direction,
        targetPosition: data.targetPosition,
        attackType: data.attackType || 'basic',
        classType: classType,
        timestamp: data.timestamp
      },
      timestamp: Date.now()
    };
    
    // Process attack through game state service
    logger.info(`📨 [STEP 5.5] Adding attack action to game state...`);
    const added = await gameStateService.addPlayerInput(matchId, userId, action);
    
    logger.info(`📨 [STEP 5.6] Attack action ${added ? 'successfully added' : 'FAILED to add'} to game state for processing`);
  }

  private handleGameAction(socket: Socket, action: GameAction) {
    const userId = socket.data.userId;
    const roomId = this.playerToRoom.get(userId);
    
    if (!roomId) {
      logger.warn(`Player ${userId} tried to send action without being in a room`);
      return;
    }

    // Validate action
    if (!action.type || !action.timestamp) {
      logger.warn(`Invalid action from player ${userId}`);
      return;
    }

    // Add server timestamp
    const serverAction = {
      ...action,
      serverTimestamp: Date.now(),
    };

    // Broadcast to all players in the room (including sender for confirmation)
    this.io.of('/game').to(roomId).emit('game:state', serverAction);
    
    logger.debug(`Game action ${action.type} from player ${userId} in room ${roomId}`);
  }

  // Debug method to test projectile creation
  private async handleDebugTestProjectile(socket: Socket) {
    const userId = socket.data.userId;
    const roomId = this.playerToRoom.get(userId);
    
    logger.info(`🧪 DEBUG: Test projectile requested by ${userId}`);
    
    if (!roomId) {
      logger.warn(`🧪 DEBUG: User ${userId} not in a room`);
      return;
    }
    
    const matchId = roomId.replace('match:', '');
    
    // Manually trigger an attack
    const testAttackData = {
      direction: { x: 1, y: 0 },
      targetPosition: { x: 500, y: 300 },
      attackType: 'basic',
      timestamp: Date.now()
    };
    
    logger.info(`🧪 DEBUG: Simulating attack for ${userId} in match ${matchId}`);
    await this.handlePlayerAttack(socket, testAttackData);
  }

  // Debug method to check game state status
  private async handleDebugGameStatus(socket: Socket) {
    const userId = socket.data.userId;
    const roomId = this.playerToRoom.get(userId);
    
    if (!roomId) {
      socket.emit('debug:status', { error: 'Not in a room' });
      return;
    }
    
    const matchId = roomId.replace('match:', '');
    const status = await gameStateService.getGameStateStatus(matchId);
    
    logger.info(`🔍 DEBUG: Game status for match ${matchId}:`, status);
    socket.emit('debug:status', status);
  }

  // Debug method to force initialize game state
  private async handleDebugInitGame(socket: Socket, data: { matchId: string }) {
    try {
      logger.info(`🔧 DEBUG: Force initializing game state for match ${data.matchId}`);
      
      await this.ensureGameStateAndStart(data.matchId);
      
      // Check status
      const status = await gameStateService.getGameStateStatus(data.matchId);
      
      socket.emit('debug:init_result', {
        success: true,
        matchId: data.matchId,
        status
      });
    } catch (error) {
      logger.error(`Failed to force init game state:`, error);
      socket.emit('debug:init_result', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private handleHeartbeat(socket: Socket) {
    const userId = socket.data.userId;
    const sessionId = socket.data.sessionId;
    const roomId = this.playerToRoom.get(userId);
    
    if (roomId && roomId.startsWith('match:')) {
      const matchId = roomId.replace('match:', '');
      connectionTracker.updateLastSeen(matchId, userId, sessionId, socket.id);
    }
  }

  /**
   * Handle player reconnection to an existing match
   * Resync state instead of recreating
   */
  private async handleReconnectToMatch(socket: Socket, data: { matchId: string }) {
    try {
      const userId = socket.data.userId;
      const sessionId = socket.data.sessionId;
      const username = socket.data.username;
      
      logger.info(`Player ${userId} attempting to reconnect to match ${data.matchId}`);
      
      // Check if game state still exists
      const gameState = await gameStateService.getGameState(data.matchId);
      if (!gameState) {
        socket.emit('reconnect_failed', { 
          error: 'game_state_not_found',
          message: 'Game state no longer exists' 
        });
        return;
      }
      
      // Check if player was in this match
      if (!gameState.players.has(userId)) {
        socket.emit('reconnect_failed', { 
          error: 'player_not_in_match',
          message: 'You were not a player in this match' 
        });
        return;
      }
      
      const roomId = `match:${data.matchId}`;
      
      // Rejoin the match room
      socket.join(roomId);
      this.playerToRoom.set(userId, roomId);
      
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set());
      }
      this.rooms.get(roomId)!.add(userId);
      
      // Update connection tracker
      connectionTracker.updateLastSeen(data.matchId, userId, sessionId, socket.id);
      
      // Update socket reference
      this.playerSockets.set(userId, socket);
      
      // Notify other players of reconnection
      socket.to(roomId).emit('player:reconnected', {
        playerId: userId,
        username,
        message: `${username} has reconnected`
      });
      
      // Send current game state to reconnecting player
      const players = Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        rotation: p.rotation,
        health: p.health,
        armor: p.armor,
        isAlive: p.isAlive,
        classType: p.classType,
        username: p.username
      }));
      
      const projectiles = Array.from(gameState.projectiles.values()).map(p => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        ownerId: p.ownerId,
        config: p.config
      }));
      
      // Send resync state event
      socket.emit('resync_state', {
        matchId: data.matchId,
        players,
        projectiles,
        status: gameState.status,
        timestamp: Date.now()
      });
      
      logger.info(`Player ${userId} successfully reconnected to match ${data.matchId}`);
      
    } catch (error) {
      logger.error(`Error handling reconnection for player ${socket.data.userId}:`, error);
      socket.emit('reconnect_failed', { 
        error: 'internal_error',
        message: 'Internal server error during reconnection' 
      });
    }
  }

  private async handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    const username = socket.data.username;
    const roomId = this.playerToRoom.get(userId);
    
    logger.info(`Player ${userId} (${username}) disconnected from game namespace`);
    
    // Remove from matchmaking queue
    matchmakingService.leaveQueue(userId).catch(error => {
      logger.error('Error removing player from queue on disconnect:', error);
    });
    
    // Remove socket reference
    this.playerSockets.delete(userId);
    
    if (roomId && roomId.startsWith('match:')) {
      const matchId = roomId.replace('match:', '');
      
      // Mark as disconnected in connection tracker but don't destroy state
      connectionTracker.markDisconnected(matchId, userId);
      
      // Remove from room for now - they can rejoin if they reconnect
      const room = this.rooms.get(roomId);
      if (room) {
        room.delete(userId);
        
        // Notify other players
        socket.to(roomId).emit('player:disconnected', {
          playerId: userId,
          username,
          message: `${username} disconnected. Waiting for reconnection...`
        });
      }
      
      this.playerToRoom.delete(userId);
      
      logger.info(`Player ${userId} marked as disconnected. Grace period active.`);
    } else {
      // Handle non-match room cleanup
      if (roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
          room.delete(userId);
          if (room.size === 0) {
            this.rooms.delete(roomId);
          }
        }
        
        socket.to(roomId).emit('player:left', { 
          playerId: userId,
          username 
        });
        
        this.playerToRoom.delete(userId);
      }
      
      // Clean up class data for non-match disconnections
      this.playerClasses.delete(userId);
    }
  }

  /**
   * New stale connection cleanup using connection tracker
   * Replaces the old 2s timer approach with proper heartbeat tracking
   */
  private async cleanupStaleConnections() {
    try {
      const staleMatches = connectionTracker.getStaleMatches();
      
      for (const matchId of staleMatches) {
        // Check if the match is finished before cleanup
        const gameState = await gameStateService.getGameState(matchId);
        if (gameState && !gameState.isFinished) {
          // Only check finished matches or surrendered ones
          continue;
        }
        
        logger.info(`Cleaning up stale match: ${matchId}`);
        
        const roomId = `match:${matchId}`;
        
        // Notify any remaining players
        this.io.of('/game').to(roomId).emit('match_ended', {
          reason: 'player_disconnect',
          message: 'All players have been disconnected for too long. Match ended.'
        });
        
        // Clean up all match resources
        await this.cleanupMatch(matchId);
      }
    } catch (error) {
      logger.error('Error during stale connection cleanup:', error);
    }
  }

  /**
   * Clean up all resources for a match
   */
  private async cleanupMatch(matchId: string) {
    const roomId = `match:${matchId}`;
    const room = this.rooms.get(roomId);
    
    // Remove all players from room
    if (room) {
      for (const playerId of room) {
        this.playerToRoom.delete(playerId);
        this.playerClasses.delete(playerId);
        
        // Disconnect socket if still connected
        const socket = this.playerSockets.get(playerId);
        if (socket) {
          socket.disconnect(true);
        }
        this.playerSockets.delete(playerId);
      }
      
      this.rooms.delete(roomId);
    }
    
    // Clean up game state
    try {
      await gameStateService.cleanup(matchId);
      logger.info(`Game state cleaned up for match ${matchId}`);
    } catch (error) {
      logger.error(`Error cleaning up game state for match ${matchId}:`, error);
    }
    
    // Remove from connection tracker
    connectionTracker.removeMatch(matchId);
    
    // Clean up match state
    this.matchStates.delete(matchId);
  }

  // Called when a match is found by the matchmaking service
  public notifyMatchFound(matchData: any) {
    const { player1, player2, matchId } = matchData;
    
    // Notify both players
    const player1Socket = this.playerSockets.get(player1.playerId);
    const player2Socket = this.playerSockets.get(player2.playerId);
    
    const matchInfo = {
      matchId,
      opponent: {
        username: '',
        rating: 0,
        classType: ''
      }
    };
    
    if (player1Socket) {
      player1Socket.emit('match_found', {
        ...matchInfo,
        opponent: {
          username: player2.username,
          rating: player2.rating,
          classType: player2.classType
        }
      });
    }
    
    if (player2Socket) {
      player2Socket.emit('match_found', {
        ...matchInfo,
        opponent: {
          username: player1.username,
          rating: player1.rating,
          classType: player1.classType
        }
      });
    }
    
    logger.info(`Match found notification sent for match ${matchId}`);
  }

  // Notify player they're back in queue after opponent declined
  public notifyPlayerBackInQueue(playerId: string) {
    const playerSocket = this.playerSockets.get(playerId);
    if (playerSocket) {
      playerSocket.emit('back_in_queue', {
        message: 'Your opponent declined the match. You have been returned to the queue.',
        timestamp: Date.now()
      });
      logger.info(`Notified player ${playerId} they are back in queue`);
    }
  }

  // Notify player that their opponent accepted the match
  public notifyPlayerAccepted(playerId: string, acceptedPlayerId: string) {
    const playerSocket = this.playerSockets.get(playerId);
    if (playerSocket) {
      playerSocket.emit('opponent_accepted', {
        message: 'Your opponent has accepted the match! Waiting for you to accept...',
        acceptedPlayerId,
        timestamp: Date.now()
      });
      logger.info(`Notified player ${playerId} that opponent ${acceptedPlayerId} accepted`);
    }
  }

  // Notify both players that the match is ready (both accepted)
  public notifyMatchReady(matchData: any) {
    const { player1, player2, matchId } = matchData;
    
    // Initialize match state tracking
    this.matchStates.set(matchId, {
      expectedPlayers: new Set([player1.playerId, player2.playerId]),
      joinedPlayers: new Set(),
      createdAt: Date.now()
    });
    
    // Set a timeout to check if all players joined within grace period
    setTimeout(() => {
      this.checkMatchGracePeriod(matchId);
    }, this.MATCH_JOIN_GRACE_PERIOD);
    
    const player1Socket = this.playerSockets.get(player1.playerId);
    const player2Socket = this.playerSockets.get(player2.playerId);
    
    // Create personalized messages for each player including their player ID
    const player1Message = {
      matchId,
      yourPlayerId: player1.playerId,
      opponent: {
        playerId: player2.playerId,
        username: player2.username,
        rating: player2.rating,
        classType: player2.classType
      },
      message: 'Both players accepted! Match is ready. You can now join the game.',
      status: 'READY_TO_JOIN',
      timestamp: Date.now()
    };
    
    const player2Message = {
      matchId,
      yourPlayerId: player2.playerId,
      opponent: {
        playerId: player1.playerId,
        username: player1.username,
        rating: player1.rating,
        classType: player1.classType
      },
      message: 'Both players accepted! Match is ready. You can now join the game.',
      status: 'READY_TO_JOIN',
      timestamp: Date.now()
    };
    
    if (player1Socket) {
      player1Socket.emit('match_ready', player1Message);
    }
    
    if (player2Socket) {
      player2Socket.emit('match_ready', player2Message);
    }
    
    logger.info(`Match ${matchId} ready notification sent to both players`);
  }

  // Notify players about match timeout
  public notifyMatchTimeout(player1Id: string, player2Id: string) {
    const player1Socket = this.playerSockets.get(player1Id);
    const player2Socket = this.playerSockets.get(player2Id);
    
    const timeoutMessage = {
      message: 'Match acceptance timed out. You have been returned to the queue.',
      reason: 'timeout',
      timestamp: Date.now()
    };
    
    if (player1Socket) {
      player1Socket.emit('match_timeout', timeoutMessage);
    }
    
    if (player2Socket) {
      player2Socket.emit('match_timeout', timeoutMessage);
    }
    
    logger.info(`Match timeout notification sent to players ${player1Id} and ${player2Id}`);
  }
  
  // Clean up resources
  public cleanup() {
    // Disconnect all sockets
    for (const [userId, socket] of this.playerSockets) {
      socket.disconnect(true);
    }
    
    // Clear all maps
    this.rooms.clear();
    this.playerToRoom.clear();
    this.playerSockets.clear();
    
    logger.info('GameHandler cleanup completed');
  }
  
  // Clean up orphaned match states
  private cleanupMatchStates() {
    const now = Date.now();
    const cutoffTime = now - this.MATCH_JOIN_GRACE_PERIOD * 2; // Give extra time
    
    for (const [matchId, state] of this.matchStates) {
      if (state.createdAt < cutoffTime && !state.allPlayersJoinedAt) {
        logger.info(`Cleaning up abandoned match state for ${matchId}`);
        this.matchStates.delete(matchId);
      }
    }
  }
  
  /**
   * Broadcast game update to all players in a match
   * Called by gameStateService during game loop
   */
  public broadcastGameUpdate(matchId: string, gameUpdate: any) {
    const roomId = `match:${matchId}`;
    
    // Emit to all clients in the match room - MUST use the game namespace
    this.io.of('/game').to(roomId).emit(WSEvents.GAME_UPDATE, gameUpdate);
    
    // Log if there are projectiles for debugging
    if (gameUpdate.projectiles && gameUpdate.projectiles.length > 0) {
      logger.info(`📡 [STEP 18] Broadcasting game update to room ${roomId} with ${gameUpdate.projectiles.length} projectiles`);
    }
  }

  /**
   * Announce match end to all players in the match
   * Called by MatchFinalizationService when match is completed
   */
  public async announceMatchEnd(matchId: string, result: {
    winnerId: string;
    loserId: string;
    winnerRatingChange: number;
    loserRatingChange: number;
    newWinnerRating: number;
    newLoserRating: number;
    matchDuration: number;
  }): Promise<void> {
    const roomId = `match:${matchId}`;
    
    try {
      // Get player usernames for display
      const [winnerProfile, loserProfile] = await Promise.all([
        this.getUserProfile(result.winnerId),
        this.getUserProfile(result.loserId)
      ]);

      const matchEndData = {
        matchId,
        reason: 'player_death',
        winnerId: result.winnerId,
        loserId: result.loserId,
        winnerUsername: winnerProfile?.username || 'Unknown Player',
        loserUsername: loserProfile?.username || 'Unknown Player',
        ratingChanges: {
          winner: result.winnerRatingChange,
          loser: result.loserRatingChange
        },
        finalRatings: {
          winner: result.newWinnerRating,
          loser: result.newLoserRating
        },
        matchDuration: result.matchDuration,
        timestamp: Date.now()
      };

      // Broadcast to all players in the match room
      this.io.of('/game').to(roomId).emit('match_ended', matchEndData);
      
      logger.info(`📢 Match end announced for ${matchId}:`, {
        winner: matchEndData.winnerUsername,
        winnerRating: `${result.newWinnerRating} (${result.winnerRatingChange > 0 ? '+' : ''}${result.winnerRatingChange})`,
        loser: matchEndData.loserUsername,
        loserRating: `${result.newLoserRating} (${result.loserRatingChange > 0 ? '+' : ''}${result.loserRatingChange})`,
        duration: `${result.matchDuration}s`
      });

      // Schedule match cleanup after allowing time for victory screen
      setTimeout(() => {
        this.cleanupMatch(matchId);
      }, 10000); // 10 seconds to display results

    } catch (error) {
      logger.error(`❌ Failed to announce match end for ${matchId}:`, error);
      // Still try to cleanup the match
      setTimeout(() => {
        this.cleanupMatch(matchId);
      }, 5000);
    }
  }

  /**
   * Get user profile for display purposes
   */
  private async getUserProfile(userId: string): Promise<{ username: string } | null> {
    try {
      const result = await db.query('SELECT username FROM players WHERE id = $1', [userId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.warn(`Failed to get profile for user ${userId}:`, error);
      return null;
    }
  }
  
  // Check if match grace period has expired
  private async checkMatchGracePeriod(matchId: string) {
    const matchState = this.matchStates.get(matchId);
    const roomId = `match:${matchId}`;
    const room = this.rooms.get(roomId);
    
    if (!matchState || !room) {
      return; // Match already cleaned up
    }
    
    // If not all players joined within grace period, end the match
    if (!matchState.allPlayersJoinedAt) {
      logger.info(`Match ${matchId}: Grace period expired. Only ${matchState.joinedPlayers.size}/${matchState.expectedPlayers.size} players joined. Ending match.`);
      
      // Notify any players in the room
      this.io.of('/game').to(roomId).emit('match_ended', {
        reason: 'grace_period_expired',
        message: 'Match cancelled - not all players joined in time.'
      });
      
      // Get all players in the room to disconnect them
      const playersInRoom = Array.from(room);
      
      // Remove all players from the room
      for (const playerId of playersInRoom) {
        const playerSocket = this.playerSockets.get(playerId);
        if (playerSocket) {
          // Force disconnect after a short delay
          setTimeout(() => {
            logger.info(`Forcibly disconnecting player ${playerId} from expired match`);
            playerSocket.disconnect(true);
          }, 2000);
        }
        
        // Clean up player data
        this.playerToRoom.delete(playerId);
        this.playerSockets.delete(playerId);
        this.playerClasses.delete(playerId);
      }
      
      // Clean up game state
      try {
        const { gameStateService } = await import('../services/gameStateService.js');
        await gameStateService.cleanup(matchId);
        logger.info(`Game state cleaned up for expired match ${matchId}`);
      } catch (error) {
        logger.error(`Error cleaning up game state for expired match ${matchId}:`, error);
      }
      
      // Clean up room and match state
      this.rooms.delete(roomId);
      this.matchStates.delete(matchId);
    }
  }

  // Send periodic queue status updates to all players in queue
  private async broadcastQueueStatusUpdates() {
    try {
      // Get all players currently in queue
      const queuedPlayers = await matchmakingService.getAllQueuedPlayers();
      
      // Send individual queue status to each player
      for (const queueEntry of queuedPlayers) {
        const playerSocket = this.playerSockets.get(queueEntry.playerId);
        if (playerSocket) {
          const status = await matchmakingService.getQueueStatus(queueEntry.playerId);
          playerSocket.emit('queue_status', status);
        }
      }
      
      if (queuedPlayers.length > 0) {
        logger.debug(`Sent queue status updates to ${queuedPlayers.length} players in queue`);
      }
    } catch (error) {
      logger.error('Error broadcasting queue status updates:', error);
    }
  }
}