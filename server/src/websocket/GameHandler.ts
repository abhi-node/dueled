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
    socket.on('player:attack', (data) => this.handlePlayerAttack(socket, data));
    socket.on('game:action', (action) => this.handleGameAction(socket, action));
    
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
    // For now, matches are auto-accepted. This is for future expansion.
    logger.info(`Match ${data.matchId} accepted by player ${socket.data.userId}`);
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

  private async handleJoinMatch(socket: Socket, data: { matchId: string }) {
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
        classType: userId === matchData.player1.playerId ? matchData.player1.classType : matchData.player2.classType,
        position: playerPosition,
        angle: 0
      });
      
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
      
      logger.info(`Player ${userId} joined match ${data.matchId}`);
    } catch (error) {
      logger.error('Error joining match:', error);
      socket.emit('match_error', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handlePlayerMove(socket: Socket, data: { position: { x: number; y: number }; angle: number }) {
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
    
    // Broadcast movement to other players in the room
    socket.to(roomId).emit('player:moved', {
      playerId: userId,
      position: data.position,
      angle: data.angle
    });
  }

  private handlePlayerAttack(socket: Socket, data: any) {
    const userId = socket.data.userId;
    const roomId = this.playerToRoom.get(userId);
    
    if (!roomId) {
      return;
    }
    
    // Broadcast attack to other players in the room
    socket.to(roomId).emit('player:attacked', {
      playerId: userId,
      ...data
    });
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

  private handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    const username = socket.data.username;
    const roomId = this.playerToRoom.get(userId);
    
    logger.info(`Player ${userId} disconnected from game namespace`);
    
    // Remove from matchmaking queue
    matchmakingService.leaveQueue(userId).catch(error => {
      logger.error('Error removing player from queue on disconnect:', error);
    });
    
    // Remove socket reference
    this.playerSockets.delete(userId);
    
    if (roomId) {
      // Notify other players in the room with username for better notification
      socket.to(roomId).emit('player:left', { 
        playerId: userId,
        username: username 
      });
      
      // Clean up room data
      const room = this.rooms.get(roomId);
      if (room) {
        room.delete(userId);
        if (room.size === 0) {
          this.rooms.delete(roomId);
        }
      }
      
      this.playerToRoom.delete(userId);
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
}