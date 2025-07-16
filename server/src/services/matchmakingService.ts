import { redis } from './redis.js';
import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { ClassType } from '@dueled/shared';
import { gameStateService } from './gameStateService.js';
import { PlayerService } from './playerService.js';

const playerService = new PlayerService();

// We'll need to get the gameHandler instance
let gameHandler: any = null;

export function setGameHandler(handler: any) {
  gameHandler = handler;
}

export interface QueueEntry {
  playerId: string;
  username: string;
  rating: number;
  classType: ClassType;
  joinedAt: number;
}

export interface MatchData {
  matchId: string;
  player1: QueueEntry;
  player2: QueueEntry;
  createdAt: number;
}

export class MatchmakingService {
  private readonly QUEUE_KEY = 'matchmaking:queue';
  private readonly MATCH_KEY_PREFIX = 'match:';
  private readonly PLAYER_IN_QUEUE_PREFIX = 'player:inqueue:';
  private readonly RATING_THRESHOLD_INITIAL = 100;
  private readonly RATING_THRESHOLD_MAX = 500;
  private readonly THRESHOLD_INCREASE_PER_SECOND = 10;
  
  /**
   * Add player to matchmaking queue
   */
  async joinQueue(playerId: string, username: string, rating: number, classType: ClassType): Promise<void> {
    try {
      // Check if player is already in queue
      const inQueue = await redis.get(`${this.PLAYER_IN_QUEUE_PREFIX}${playerId}`);
      if (inQueue) {
        throw new Error('Player already in queue');
      }
      
      const queueEntry: QueueEntry = {
        playerId,
        username,
        rating,
        classType,
        joinedAt: Date.now()
      };
      
      // Add to queue using rating as score for sorted set
      await redis.zadd(this.QUEUE_KEY, rating, JSON.stringify(queueEntry));
      
      // Mark player as in queue
      await redis.setex(`${this.PLAYER_IN_QUEUE_PREFIX}${playerId}`, 300, '1'); // 5 min TTL
      
      logger.info(`Player ${playerId} joined queue with rating ${rating}`);
      
      // Try to find a match immediately
      await this.findMatch(queueEntry);
    } catch (error) {
      logger.error('Error joining queue:', error);
      throw error;
    }
  }
  
  /**
   * Remove player from queue
   */
  async leaveQueue(playerId: string): Promise<void> {
    try {
      // Get all queue entries
      const members = await redis.zrange(this.QUEUE_KEY, 0, -1) as string[];
      
      // Find and remove the player's entry
      for (const member of members) {
        const entry = JSON.parse(member) as QueueEntry;
        if (entry.playerId === playerId) {
          await redis.zrem(this.QUEUE_KEY, member);
          break;
        }
      }
      
      // Remove in-queue marker
      await redis.delete(`${this.PLAYER_IN_QUEUE_PREFIX}${playerId}`);
      
      logger.info(`Player ${playerId} left queue`);
    } catch (error) {
      logger.error('Error leaving queue:', error);
      throw error;
    }
  }
  
  /**
   * Get queue status for a player
   */
  async getQueueStatus(playerId: string): Promise<{ inQueue: boolean; estimatedWait: number; queuePosition?: number }> {
    try {
      const inQueue = await redis.get(`${this.PLAYER_IN_QUEUE_PREFIX}${playerId}`) !== null;
      
      if (!inQueue) {
        return { inQueue: false, estimatedWait: 0 };
      }
      
      // Get queue size
      const queueSize = await redis.zcard(this.QUEUE_KEY);
      
      // Get player's position (simplified - could be more accurate)
      const members = await redis.zrange(this.QUEUE_KEY, 0, -1) as string[];
      let position = 0;
      for (let i = 0; i < members.length; i++) {
        const entry = JSON.parse(members[i]) as QueueEntry;
        if (entry.playerId === playerId) {
          position = i + 1;
          break;
        }
      }
      
      // Estimate wait time (30 seconds per position as a rough estimate)
      const estimatedWait = position * 30 * 1000;
      
      return {
        inQueue: true,
        estimatedWait,
        queuePosition: position
      };
    } catch (error) {
      logger.error('Error getting queue status:', error);
      return { inQueue: false, estimatedWait: 0 };
    }
  }
  
  /**
   * Try to find a match for a player
   */
  private async findMatch(playerEntry: QueueEntry): Promise<MatchData | null> {
    try {
      const currentTime = Date.now();
      const timeInQueue = (currentTime - playerEntry.joinedAt) / 1000; // seconds
      
      // Calculate rating threshold based on time in queue
      const ratingThreshold = Math.min(
        this.RATING_THRESHOLD_INITIAL + (timeInQueue * this.THRESHOLD_INCREASE_PER_SECOND),
        this.RATING_THRESHOLD_MAX
      );
      
      // Get players within rating range
      const minRating = playerEntry.rating - ratingThreshold;
      const maxRating = playerEntry.rating + ratingThreshold;
      
      const candidates = await redis.zrangebyscore(this.QUEUE_KEY, minRating, maxRating) as string[];
      
      // Find suitable opponent
      for (const candidateData of candidates) {
        const candidate = JSON.parse(candidateData) as QueueEntry;
        
        // Skip self
        if (candidate.playerId === playerEntry.playerId) {
          continue;
        }
        
        // Found a match!
        const matchData = await this.createMatch(playerEntry, candidate);
        
        // Remove both players from queue
        await this.leaveQueue(playerEntry.playerId);
        await this.leaveQueue(candidate.playerId);
        
        return matchData;
      }
      
      return null;
    } catch (error) {
      logger.error('Error finding match:', error);
      return null;
    }
  }
  
  /**
   * Create a match between two players
   */
  private async createMatch(player1: QueueEntry, player2: QueueEntry): Promise<MatchData> {
    const matchId = uuidv4();
    const matchData: MatchData = {
      matchId,
      player1,
      player2,
      createdAt: Date.now()
    };
    
    // Store match data in Redis
    await redis.setex(
      `${this.MATCH_KEY_PREFIX}${matchId}`,
      3600, // 1 hour TTL
      JSON.stringify(matchData)
    );
    
    // Create match in database
    try {
      await db.query(
        `INSERT INTO matches (id, player1_id, player2_id, player1_class, player2_class, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS', NOW())`,
        [matchId, player1.playerId, player2.playerId, player1.classType, player2.classType]
      );
    } catch (error) {
      logger.error('Error creating match in database:', error);
    }
    
    logger.info(`Match created: ${matchId} between ${player1.username} and ${player2.username}`);
    
    // Notify players through WebSocket
    if (gameHandler) {
      gameHandler.notifyMatchFound(matchData);
    }

    // Initialize game state for the match
    try {
      // Get player details
      const player1Profile = await playerService.getPlayerProfile(player1.playerId);
      const player2Profile = await playerService.getPlayerProfile(player2.playerId);
      
      if (player1Profile && player2Profile) {
        const player1Full = {
          id: player1.playerId,
          username: player1.username,
          rating: player1.rating,
          isAnonymous: player1Profile.isAnonymous
        };
        
        const player2Full = {
          id: player2.playerId,
          username: player2.username,
          rating: player2.rating,
          isAnonymous: player2Profile.isAnonymous
        };
        
        await gameStateService.initializeGameState(
          matchId,
          player1Full,
          player2Full,
          player1.classType,
          player2.classType
        );
        
        // Start the game loop
        await gameStateService.startGameLoop(matchId);
      }
    } catch (error) {
      logger.error('Error initializing game state:', error);
    }
    
    return matchData;
  }
  
  /**
   * Get match data
   */
  async getMatch(matchId: string): Promise<MatchData | null> {
    try {
      const data = await redis.get(`${this.MATCH_KEY_PREFIX}${matchId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting match:', error);
      return null;
    }
  }
  
  /**
   * Process queue periodically to find matches
   */
  async processQueue(): Promise<void> {
    try {
      const members = await redis.zrange(this.QUEUE_KEY, 0, -1) as string[];
      
      for (const memberData of members) {
        const member = JSON.parse(memberData) as QueueEntry;
        await this.findMatch(member);
      }
    } catch (error) {
      logger.error('Error processing queue:', error);
    }
  }
  
  /**
   * Handle match decline - put the other player back in queue and cancel the match
   */
  async handleMatchDecline(matchId: string, decliningPlayerId: string): Promise<void> {
    try {
      // Get match data
      const matchData = await this.getMatch(matchId);
      if (!matchData) {
        logger.warn(`Match ${matchId} not found for decline handling`);
        return;
      }
      
      // Determine which player declined and which should go back to queue
      const decliningPlayer = matchData.player1.playerId === decliningPlayerId ? matchData.player1 : matchData.player2;
      const otherPlayer = matchData.player1.playerId === decliningPlayerId ? matchData.player2 : matchData.player1;
      
      logger.info(`Player ${decliningPlayer.username} declined match ${matchId}. Returning ${otherPlayer.username} to queue.`);
      
      // Remove the declining player from queue completely (if they're still marked as in queue)
      await this.leaveQueue(decliningPlayerId);
      
      // Put the other player back in queue with updated timestamp
      const updatedQueueEntry: QueueEntry = {
        ...otherPlayer,
        joinedAt: Date.now() // Reset their queue time for fair matching
      };
      
      await redis.zadd(this.QUEUE_KEY, otherPlayer.rating, JSON.stringify(updatedQueueEntry));
      await redis.setex(`${this.PLAYER_IN_QUEUE_PREFIX}${otherPlayer.playerId}`, 300, '1');
      
      // Cancel the match in Redis
      await redis.delete(`${this.MATCH_KEY_PREFIX}${matchId}`);
      
      // Update match status in database
      try {
        await db.query(
          `UPDATE matches SET status = 'CANCELLED', ended_at = NOW() WHERE id = $1`,
          [matchId]
        );
      } catch (error) {
        logger.error('Error updating match status in database:', error);
      }
      
      // Clean up any game state that might have been created
      await gameStateService.cleanup(matchId);
      
      // Notify the other player they're back in queue through game handler
      if (gameHandler) {
        gameHandler.notifyPlayerBackInQueue(otherPlayer.playerId);
      }
      
      logger.info(`Match ${matchId} cancelled due to decline. Player ${otherPlayer.username} returned to queue.`);
    } catch (error) {
      logger.error('Error handling match decline:', error);
      throw error;
    }
  }
  
  /**
   * Clean up stale queue entries
   */
  async cleanupQueue(): Promise<void> {
    try {
      const members = await redis.zrange(this.QUEUE_KEY, 0, -1) as string[];
      const currentTime = Date.now();
      
      for (const memberData of members) {
        const member = JSON.parse(memberData) as QueueEntry;
        
        // Remove entries older than 5 minutes
        if (currentTime - member.joinedAt > 300000) {
          await redis.zrem(this.QUEUE_KEY, memberData);
          await redis.delete(`${this.PLAYER_IN_QUEUE_PREFIX}${member.playerId}`);
          logger.info(`Cleaned up stale queue entry for player ${member.playerId}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up queue:', error);
    }
  }
}

// Export singleton instance
export const matchmakingService = new MatchmakingService();