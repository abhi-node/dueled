import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { ActionType, type GameAction, type ClassType } from '@dueled/shared';
import jwt from 'jsonwebtoken';
import { matchmakingService } from '../services/matchmakingService.js';
import { PlayerService } from '../services/playerService.js';
import { gameStateService } from '../services/gameStateService.js';

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
    
    // Start matchmaking queue processor
    setInterval(() => {
      matchmakingService.processQueue();
    }, 5000);
    
    // Start queue cleanup
    setInterval(() => {
      matchmakingService.cleanupQueue();
    }, 30000);
    
    // Start match state cleanup
    setInterval(() => {
      this.cleanupMatchStates();
    }, 15000); // Every 15 seconds
  }

  private setupNamespace() {
    const gameNamespace = this.io.of('/game');
    
    gameNamespace.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          logger.warn(`Socket connection rejected: No token provided for ${socket.id}`);
          return next(new Error('No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.data.userId = decoded.id; // Fixed: JWT contains 'id', not 'userId'
        socket.data.username = decoded.username;
        socket.data.isAnonymous = decoded.isAnonymous;
        
        logger.info(`Socket authenticated successfully: user ${decoded.id} (${decoded.username}) on socket ${socket.id}`);
        next();
      } catch (error) {
        logger.error(`Socket authentication failed for ${socket.id}:`, error);
        next(new Error('Authentication failed'));
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
    logger.info(`Player ${userId} connected to game namespace`);
    
    // Store socket reference
    this.playerSockets.set(userId, socket);

    // Setup event handlers
    socket.on('join_queue', (data) => this.handleJoinQueue(socket, data));
    socket.on('leave_queue', () => this.handleLeaveQueue(socket));
    socket.on('queue_status', () => this.handleQueueStatus(socket));
    socket.on('match_accepted', (data) => this.handleMatchAccepted(socket, data));
    socket.on('match_declined', (data) => this.handleMatchDeclined(socket, data));
    
    // Game events
    socket.on('join_match', (data) => this.handleJoinMatch(socket, data));
    socket.on('player:move', (data) => this.handlePlayerMove(socket, data));
    socket.on('player:rotate', (data) => this.handlePlayerRotate(socket, data));
    socket.on('player:attack', (data) => this.handlePlayerAttack(socket, data));
    socket.on('game:action', (action) => this.handleGameAction(socket, action));
    
    // Debug endpoints
    socket.on('debug:test_projectile', () => this.handleDebugTestProjectile(socket));
    socket.on('debug:game_status', () => this.handleDebugGameStatus(socket));
    socket.on('debug:init_game', (data) => this.handleDebugInitGame(socket, data));
    
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  private async handleJoinQueue(socket: Socket, data: { classType: ClassType }) {
    try {
      const userId = socket.data.userId;
      const username = socket.data.username;
      
      // Get player rating
      const player = await playerService.getPlayerProfile(userId);
      const rating = player?.stats?.rating || 1000;
      
      // Join matchmaking queue
      await matchmakingService.joinQueue(userId, username, rating, data.classType);
      
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
      
      await matchmakingService.leaveQueue(userId);
      
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
      
      const status = await matchmakingService.getQueueStatus(userId);
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
      const roomId = `match:${data.matchId}`;
      
      // Join the match room
      socket.join(roomId);
      this.playerToRoom.set(userId, roomId);
      
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
      let playerPosition = { x: 100, y: 100 }; // Default
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
      
      // Notify other players with position
      socket.to(roomId).emit('player:joined', {
        playerId: userId,
        username: socket.data.username,
        classType: playerClass,
        position: playerPosition,
        angle: 0
      });
      
      logger.info(`Emitting player:joined for ${userId} with class ${playerClass} to room ${roomId}`);
      
      // Get initial spawn position for this player
      const playerIndex = userId === matchData.player1.playerId ? 0 : 1;
      const spawnPoint = { x: 100, y: 100 }; // Default, should be from game state
      
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

  private async handlePlayerMove(socket: Socket, data: { position: { x: number; y: number }; angle: number; classType?: ClassType }) {
    const userId = socket.data.userId;
    const roomId = this.playerToRoom.get(userId);
    
    if (!roomId) {
      return;
    }
    
    // Extract match ID from room ID
    const matchId = roomId.replace('match:', '');
    
    // Add player input to game state
    const action: GameAction = {
      type: ActionType.MOVE,
      playerId: userId,
      data: {
        position: data.position,
        angle: data.angle
      },
      timestamp: Date.now()
    };
    
    await gameStateService.addPlayerInput(matchId, userId, action);
    
    // Get player class (from data or stored)
    let classType = data.classType || this.playerClasses.get(userId);
    
    // If class not found, try to get from match data
    if (!classType) {
      try {
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
    
    if (!classType) {
      logger.warn(`Player ${userId} movement without class type - class not found anywhere`);
      // Still send the movement but without class type
      socket.to(roomId).emit('player:moved', {
        playerId: userId,
        position: data.position,
        angle: data.angle,
        // No classType field when unknown
      });
      return;
    }
    
    logger.debug(`Player ${userId} movement: provided class=${data.classType}, stored class=${this.playerClasses.get(userId)}, using class=${classType}`);
    
    // Update stored class if provided
    if (data.classType) {
      this.playerClasses.set(userId, data.classType);
    }
    
    // Broadcast movement to other players in the room
    socket.to(roomId).emit('player:moved', {
      playerId: userId,
      position: data.position,
      angle: data.angle,
      classType: classType
    });
  }

  private async handlePlayerRotate(socket: Socket, data: { angle: number; classType?: ClassType }) {
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
    
    if (!classType) {
      logger.warn(`Player ${userId} rotation without class type - class not found anywhere`);
      // Still send the rotation but without class type
      socket.to(roomId).emit('player:rotated', {
        playerId: userId,
        angle: data.angle,
        // No classType field when unknown
      });
      return;
    }
    
    // Update stored class if provided
    if (data.classType) {
      this.playerClasses.set(userId, data.classType);
    }
    
    // Broadcast rotation to other players in the room
    socket.to(roomId).emit('player:rotated', {
      playerId: userId,
      angle: data.angle,
      classType: classType
    });
  }

  private async handlePlayerAttack(socket: Socket, data: any) {
    const userId = socket.data.userId;
    const roomId = this.playerToRoom.get(userId);
    
    logger.info(`🎯 Received player:attack from ${userId}, roomId: ${roomId}`);
    
    if (!roomId) {
      logger.warn(`❌ Player ${userId} tried to attack without being in a room`);
      return;
    }
    
    // Extract match ID from room ID
    const matchId = roomId.replace('match:', '');
    logger.info(`📍 Attack for match: ${matchId}`);
    
    // Ensure game state exists before processing attack
    const gameState = await gameStateService.getGameState(matchId);
    if (!gameState) {
      logger.warn(`⚠️ Game state not found for match ${matchId}, attempting to create it...`);
      await this.ensureGameStateAndStart(matchId);
      
      // Check again after creation attempt
      const newGameState = await gameStateService.getGameState(matchId);
      if (!newGameState) {
        logger.error(`❌ Failed to create game state for match ${matchId}`);
        return;
      }
    }
    
    // Get player class for attack processing
    let classType = this.playerClasses.get(userId);
    if (!classType) {
      try {
        const matchData = await matchmakingService.getMatch(matchId);
        if (matchData) {
          classType = userId === matchData.player1.playerId ? matchData.player1.classType : matchData.player2.classType;
          if (classType) {
            this.playerClasses.set(userId, classType);
            logger.info(`🔍 Retrieved class ${classType} for player ${userId}`);
          }
        }
      } catch (error) {
        logger.error(`Error retrieving player class for attack:`, error);
      }
    }
    
    if (!classType) {
      logger.warn(`❌ Player ${userId} attack without class type`);
      return;
    }
    
    logger.info(`⚔️ Processing attack from ${userId} (${classType}):`, {
      direction: data.direction,
      targetPosition: data.targetPosition,
      attackType: data.attackType
    });
    
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
    const added = await gameStateService.addPlayerInput(matchId, userId, action);
    
    logger.info(`📨 Attack action ${added ? 'successfully added' : 'FAILED to add'} to game state for processing`);
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
    // Don't delete class data immediately - it might be needed for reconnection
    // this.playerClasses.delete(userId);
    
    if (roomId) {
      const room = this.rooms.get(roomId);
      
      // If this is a match room
      if (roomId.startsWith('match:') && room) {
        const matchId = roomId.replace('match:', '');
        const matchState = this.matchStates.get(matchId);
        
        let shouldEndMatch = false;
        let reason = '';
        
        if (matchState) {
          const now = Date.now();
          const timeSinceCreation = now - matchState.createdAt;
          
          // Case 1: Both players joined and someone is leaving
          if (matchState.allPlayersJoinedAt) {
            shouldEndMatch = true;
            reason = `Player ${username} left after match started`;
            logger.info(`Match ${matchId}: Player disconnect after both joined. Ending match after 2 second delay.`);
            
            // Give a 2-second grace period for reconnection before ending the match
            setTimeout(async () => {
              // Check if the player rejoined during the delay
              const currentMatchState = this.matchStates.get(matchId);
              const currentRoom = this.rooms.get(roomId);
              
              // If match is still active and player hasn't rejoined
              if (currentMatchState && currentRoom && !currentRoom.has(userId)) {
                logger.info(`Match ${matchId}: Player ${username} didn't rejoin within 2 seconds. Ending match.`);
                
                // Notify all remaining players that the match is ending
                this.io.of('/game').to(roomId).emit('match_ended', {
                  reason: 'player_disconnect',
                  disconnectedPlayer: {
                    playerId: userId,
                    username: username
                  },
                  message: `${username} has left the game. Match ended.`
                });
                
                // Get all players in the room to disconnect them
                const playersInRoom = Array.from(currentRoom);
                
                // Remove all players from the room
                for (const playerId of playersInRoom) {
                  const playerSocket = this.playerSockets.get(playerId);
                  if (playerSocket && playerId !== userId) {
                    // Force disconnect the remaining player after a short delay to allow notification to be received
                    setTimeout(() => {
                      logger.info(`Forcibly disconnecting player ${playerId} from ended match`);
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
                  await gameStateService.cleanup(matchId);
                  logger.info(`Game state cleaned up for match ${matchId}`);
                } catch (error) {
                  logger.error(`Error cleaning up game state for match ${matchId}:`, error);
                }
                
                // Clean up room
                this.rooms.delete(roomId);
                
                // Clean up match state
                this.matchStates.delete(matchId);
                
                // Clean up disconnected player's class data
                this.playerClasses.delete(userId);
              } else if (currentRoom && currentRoom.has(userId)) {
                logger.info(`Match ${matchId}: Player ${username} rejoined within 2 seconds. Match continues.`);
              }
            }, 2000);
            
            // Don't end the match immediately
            shouldEndMatch = false;
          }
          // Case 2: Still within grace period (10 seconds) and not all players joined
          else if (timeSinceCreation < this.MATCH_JOIN_GRACE_PERIOD) {
            shouldEndMatch = false;
            logger.info(`Match ${matchId}: Player ${username} disconnected during grace period (${Math.round(timeSinceCreation/1000)}s/${Math.round(this.MATCH_JOIN_GRACE_PERIOD/1000)}s). Waiting for other player.`);
          }
          // Case 3: Grace period expired and not all players joined
          else {
            shouldEndMatch = true;
            reason = `Grace period expired - not all players joined`;
            logger.info(`Match ${matchId}: Grace period expired. Ending match.`);
          }
        } else {
          // No match state - this shouldn't happen but end match to be safe
          shouldEndMatch = true;
          reason = `No match state found`;
          logger.warn(`Match ${matchId}: No match state found. Ending match.`);
        }
        
        if (shouldEndMatch) {
          // Notify all remaining players that the match is ending
          socket.to(roomId).emit('match_ended', {
            reason: reason.includes('Grace period') ? 'grace_period_expired' : 'player_disconnect',
            disconnectedPlayer: reason.includes('Grace period') ? undefined : {
              playerId: userId,
              username: username
            },
            message: reason
          });
          
          // Get all players in the room to disconnect them
          const playersInRoom = Array.from(room);
          
          // Remove all players from the room
          for (const playerId of playersInRoom) {
            const playerSocket = this.playerSockets.get(playerId);
            if (playerSocket && playerId !== userId) {
              // Force disconnect the remaining player after a short delay to allow notification to be received
              setTimeout(() => {
                logger.info(`Forcibly disconnecting player ${playerId} from ended match`);
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
            await gameStateService.cleanup(matchId);
            logger.info(`Game state cleaned up for match ${matchId}`);
          } catch (error) {
            logger.error(`Error cleaning up game state for match ${matchId}:`, error);
          }
          
          // Clean up room
          this.rooms.delete(roomId);
          
          // Clean up match state
          this.matchStates.delete(matchId);
        } else {
          // Player disconnected during grace period - just remove them
          logger.info(`Match ${matchId}: Removing player ${username} during grace period`);
          
          // Notify other players that someone left (but match continues)
          socket.to(roomId).emit('player:left', { 
            playerId: userId,
            username: username,
            message: `${username} disconnected. Waiting for players to join...`
          });
          
          // Remove player from room
          if (room) {
            room.delete(userId);
          }
          
          // Clean up this player's data
          this.playerToRoom.delete(userId);
          this.playerSockets.delete(userId);
          // Don't delete class data during grace period - player might reconnect
          // this.playerClasses.delete(userId);
          
          // Update match state to remove this player from joined list
          if (matchState) {
            matchState.joinedPlayers.delete(userId);
            logger.info(`Match ${matchId}: Players in match after disconnect: ${matchState.joinedPlayers.size}/${matchState.expectedPlayers.size}`);
          }
        }
      } else {
        // Handle normal room cleanup for non-match rooms or single player rooms
        socket.to(roomId).emit('player:left', { 
          playerId: userId,
          username: username 
        });
        
        // Clean up room data
        if (room) {
          room.delete(userId);
          if (room.size === 0) {
            this.rooms.delete(roomId);
          }
        }
        
        this.playerToRoom.delete(userId);
      }
    }
    
    // Final cleanup of class data if not in a match
    if (!roomId || !roomId.startsWith('match:')) {
      this.playerClasses.delete(userId);
    }
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
    
    const readyMessage = {
      matchId,
      message: 'Both players accepted! Match is ready. You can now join the game.',
      status: 'READY_TO_JOIN',
      timestamp: Date.now()
    };
    
    if (player1Socket) {
      player1Socket.emit('match_ready', readyMessage);
    }
    
    if (player2Socket) {
      player2Socket.emit('match_ready', readyMessage);
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
  
  // Broadcast game update to all players in a match
  public broadcastGameUpdate(matchId: string, gameUpdate: any) {
    const roomId = `match:${matchId}`;
    
    // Broadcast to all players in the match room
    this.io.of('/game').to(roomId).emit('game:update', gameUpdate);
  }
  
  // Clean up orphaned match states
  private cleanupMatchStates() {
    const now = Date.now();
    const statesToDelete: string[] = [];
    
    for (const [matchId, state] of this.matchStates) {
      // Clean up matches where grace period has passed but not all players joined
      if (!state.allPlayersJoinedAt && 
          (now - state.createdAt) > this.MATCH_JOIN_GRACE_PERIOD * 2) {
        statesToDelete.push(matchId);
        logger.info(`Cleaning up orphaned match state for ${matchId} - players never fully joined`);
      }
      // Clean up old match states (matches that have been running for more than 2 hours)
      else if (state.allPlayersJoinedAt && 
               (now - state.allPlayersJoinedAt) > 7200000) { // 2 hours
        statesToDelete.push(matchId);
        logger.info(`Cleaning up old match state for ${matchId} - match has been running for over 2 hours`);
      }
    }
    
    // Delete identified match states
    for (const matchId of statesToDelete) {
      this.matchStates.delete(matchId);
    }
    
    if (statesToDelete.length > 0) {
      logger.info(`Cleaned up ${statesToDelete.length} orphaned/old match states`);
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
}