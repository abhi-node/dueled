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
  status?: 'PENDING_ACCEPTANCE' | 'BOTH_ACCEPTED' | 'CANCELLED' | 'IN_PROGRESS';
}

export interface PendingMatch {
  matchId: string;
  player1: QueueEntry;
  player2: QueueEntry;
  createdAt: number;
  status: 'PENDING_ACCEPTANCE';
  acceptances: Set<string>;
  expiresAt: number;
}

export class MatchmakingService {
  private readonly QUEUE_KEY = 'matchmaking:queue';
  private readonly MATCH_KEY_PREFIX = 'match:';
  private readonly PENDING_MATCH_PREFIX = 'pending_match:';
  private readonly MATCH_ACCEPTANCE_PREFIX = 'match_acceptance:';
  private readonly PLAYER_IN_QUEUE_PREFIX = 'player:inqueue:';
  private readonly RATING_THRESHOLD_INITIAL = 100;
  private readonly RATING_THRESHOLD_MAX = 500;
  private readonly THRESHOLD_INCREASE_PER_SECOND = 10;
  private readonly MATCH_ACCEPTANCE_TIMEOUT = 30000; // 30 seconds

  constructor() {
    // Start periodic cleanup of expired pending matches
    setInterval(() => {
      this.cleanupExpiredPendingMatches();
    }, 10000); // Check every 10 seconds
  }
  
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
   * Create a pending match between two players
   */
  private async createMatch(player1: QueueEntry, player2: QueueEntry): Promise<MatchData> {
    const matchId = uuidv4();
    const now = Date.now();
    const expiresAt = now + this.MATCH_ACCEPTANCE_TIMEOUT;
    
    const pendingMatch: PendingMatch = {
      matchId,
      player1,
      player2,
      createdAt: now,
      status: 'PENDING_ACCEPTANCE',
      acceptances: new Set(),
      expiresAt
    };
    
    // Store pending match in Redis with TTL
    await redis.setex(
      `${this.PENDING_MATCH_PREFIX}${matchId}`,
      Math.ceil(this.MATCH_ACCEPTANCE_TIMEOUT / 1000), // Convert to seconds
      JSON.stringify({
        matchId,
        player1,
        player2,
        createdAt: now,
        status: 'PENDING_ACCEPTANCE',
        acceptances: [],
        expiresAt
      })
    );
    
    // Create acceptance tracking for both players
    await redis.setex(`${this.MATCH_ACCEPTANCE_PREFIX}${player1.playerId}`, Math.ceil(this.MATCH_ACCEPTANCE_TIMEOUT / 1000), matchId);
    await redis.setex(`${this.MATCH_ACCEPTANCE_PREFIX}${player2.playerId}`, Math.ceil(this.MATCH_ACCEPTANCE_TIMEOUT / 1000), matchId);
    
    logger.info(`Pending match created: ${matchId} between ${player1.username} and ${player2.username}, expires at ${new Date(expiresAt).toISOString()}`);
    
    // Notify players through WebSocket about match found (not created yet)
    const matchData: MatchData = {
      matchId,
      player1,
      player2,
      createdAt: now,
      status: 'PENDING_ACCEPTANCE'
    };
    
    if (gameHandler) {
      gameHandler.notifyMatchFound(matchData);
    }
    
    // Set timeout to auto-cancel if not accepted
    setTimeout(() => {
      this.checkAndCancelExpiredMatch(matchId);
    }, this.MATCH_ACCEPTANCE_TIMEOUT);
    
    return matchData;
  }
  
  /**
   * Handle player accepting a match
   */
  async handleMatchAccepted(playerId: string, matchId: string): Promise<boolean> {
    try {
      // Get pending match data
      const pendingMatchData = await redis.get(`${this.PENDING_MATCH_PREFIX}${matchId}`);
      if (!pendingMatchData) {
        logger.warn(`Pending match ${matchId} not found for acceptance by player ${playerId}`);
        return false;
      }
      
      const pendingMatch = JSON.parse(pendingMatchData);
      
      // Verify player is part of this match
      if (pendingMatch.player1.playerId !== playerId && pendingMatch.player2.playerId !== playerId) {
        logger.warn(`Player ${playerId} tried to accept match ${matchId} they're not part of`);
        return false;
      }
      
      // Check if match has expired
      if (Date.now() > pendingMatch.expiresAt) {
        logger.info(`Match ${matchId} has expired, cannot accept`);
        await this.cancelPendingMatch(matchId, 'expired');
        return false;
      }
      
      // Add player's acceptance
      if (!pendingMatch.acceptances) {
        pendingMatch.acceptances = [];
      }
      
      if (!pendingMatch.acceptances.includes(playerId)) {
        pendingMatch.acceptances.push(playerId);
        
        // Update pending match in Redis
        await redis.setex(
          `${this.PENDING_MATCH_PREFIX}${matchId}`,
          Math.ceil((pendingMatch.expiresAt - Date.now()) / 1000),
          JSON.stringify(pendingMatch)
        );
        
        logger.info(`Player ${playerId} accepted match ${matchId}. Acceptances: ${pendingMatch.acceptances.length}/2`);
      }
      
      // Check if both players have accepted
      if (pendingMatch.acceptances.length === 2) {
        logger.info(`Both players accepted match ${matchId}. Creating actual game lobby.`);
        await this.createActualMatch(pendingMatch);
        return true; // Both players have accepted
      }
      
      // Notify the other player that someone accepted
      if (gameHandler) {
        const otherPlayerId = pendingMatch.player1.playerId === playerId ? pendingMatch.player2.playerId : pendingMatch.player1.playerId;
        gameHandler.notifyPlayerAccepted(otherPlayerId, playerId);
      }
      
      return false; // Only one player has accepted so far
    } catch (error) {
      logger.error('Error handling match acceptance:', error);
      return false;
    }
  }
  
  /**
   * Create the actual match after both players accept
   */
  private async createActualMatch(pendingMatch: any): Promise<void> {
    try {
      const { matchId, player1, player2 } = pendingMatch;
      
      // Create actual match data
      const matchData: MatchData = {
        matchId,
        player1,
        player2,
        createdAt: Date.now(),
        status: 'BOTH_ACCEPTED'
      };
      
      // Store actual match data in Redis
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
      
      // Clean up pending match data
      await redis.delete(`${this.PENDING_MATCH_PREFIX}${matchId}`);
      await redis.delete(`${this.MATCH_ACCEPTANCE_PREFIX}${player1.playerId}`);
      await redis.delete(`${this.MATCH_ACCEPTANCE_PREFIX}${player2.playerId}`);
      
      // Notify both players that the match is ready
      if (gameHandler) {
        gameHandler.notifyMatchReady(matchData);
      }
      
      logger.info(`Actual match ${matchId} created and ready for both players`);
    } catch (error) {
      logger.error('Error creating actual match:', error);
      throw error;
    }
  }
  
  /**
   * Cancel a pending match
   */
  private async cancelPendingMatch(matchId: string, reason: string): Promise<void> {
    try {
      const pendingMatchData = await redis.get(`${this.PENDING_MATCH_PREFIX}${matchId}`);
      if (!pendingMatchData) {
        return;
      }
      
      const pendingMatch = JSON.parse(pendingMatchData);
      
      // Put both players back in queue if the match was cancelled due to timeout
      if (reason === 'expired') {
        await this.putPlayerBackInQueue(pendingMatch.player1);
        await this.putPlayerBackInQueue(pendingMatch.player2);
        
        // Notify players about timeout
        if (gameHandler) {
          gameHandler.notifyMatchTimeout(pendingMatch.player1.playerId, pendingMatch.player2.playerId);
        }
      }
      
      // Clean up pending match data
      await redis.delete(`${this.PENDING_MATCH_PREFIX}${matchId}`);
      await redis.delete(`${this.MATCH_ACCEPTANCE_PREFIX}${pendingMatch.player1.playerId}`);
      await redis.delete(`${this.MATCH_ACCEPTANCE_PREFIX}${pendingMatch.player2.playerId}`);
      
      logger.info(`Pending match ${matchId} cancelled due to: ${reason}`);
    } catch (error) {
      logger.error('Error cancelling pending match:', error);
    }
  }
  
  /**
   * Check and cancel expired match
   */
  private async checkAndCancelExpiredMatch(matchId: string): Promise<void> {
    try {
      const pendingMatchData = await redis.get(`${this.PENDING_MATCH_PREFIX}${matchId}`);
      if (!pendingMatchData) {
        return; // Already handled or doesn't exist
      }
      
      const pendingMatch = JSON.parse(pendingMatchData);
      
      // Check if it has expired
      if (Date.now() >= pendingMatch.expiresAt) {
        logger.info(`Match ${matchId} expired, cancelling`);
        await this.cancelPendingMatch(matchId, 'expired');
      }
    } catch (error) {
      logger.error('Error checking expired match:', error);
    }
  }
  
  /**
   * Put a player back in the matchmaking queue
   */
  private async putPlayerBackInQueue(player: QueueEntry): Promise<void> {
    try {
      const updatedQueueEntry: QueueEntry = {
        ...player,
        joinedAt: Date.now() // Reset their queue time for fair matching
      };
      
      await redis.zadd(this.QUEUE_KEY, player.rating, JSON.stringify(updatedQueueEntry));
      await redis.setex(`${this.PLAYER_IN_QUEUE_PREFIX}${player.playerId}`, 300, '1');
      
      logger.info(`Player ${player.username} returned to queue after match timeout`);
    } catch (error) {
      logger.error('Error putting player back in queue:', error);
    }
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
   * Handle match decline - put the other player back in queue and cancel the pending match
   */
  async handleMatchDecline(matchId: string, decliningPlayerId: string): Promise<void> {
    try {
      // First, try to get pending match data
      const pendingMatchData = await redis.get(`${this.PENDING_MATCH_PREFIX}${matchId}`);
      
      if (pendingMatchData) {
        // This is a pending match that hasn't been fully created yet
        const pendingMatch = JSON.parse(pendingMatchData);
        
        // Determine which player declined and which should go back to queue
        const decliningPlayer = pendingMatch.player1.playerId === decliningPlayerId ? pendingMatch.player1 : pendingMatch.player2;
        const otherPlayer = pendingMatch.player1.playerId === decliningPlayerId ? pendingMatch.player2 : pendingMatch.player1;
        
        logger.info(`Player ${decliningPlayer.username} declined pending match ${matchId}. Returning ${otherPlayer.username} to queue.`);
        
        // Remove the declining player from queue completely
        await this.leaveQueue(decliningPlayerId);
        
        // Put the other player back in queue with updated timestamp
        await this.putPlayerBackInQueue(otherPlayer);
        
        // Clean up pending match data
        await redis.delete(`${this.PENDING_MATCH_PREFIX}${matchId}`);
        await redis.delete(`${this.MATCH_ACCEPTANCE_PREFIX}${pendingMatch.player1.playerId}`);
        await redis.delete(`${this.MATCH_ACCEPTANCE_PREFIX}${pendingMatch.player2.playerId}`);
        
        // Notify the other player they're back in queue through game handler
        if (gameHandler) {
          gameHandler.notifyPlayerBackInQueue(otherPlayer.playerId);
        }
        
        logger.info(`Pending match ${matchId} cancelled due to decline. Player ${otherPlayer.username} returned to queue.`);
        
      } else {
        // Check if this is an already created match
        const matchData = await this.getMatch(matchId);
        if (matchData) {
          // Handle decline of already created match (shouldn't happen with new system, but keep as fallback)
          const decliningPlayer = matchData.player1.playerId === decliningPlayerId ? matchData.player1 : matchData.player2;
          const otherPlayer = matchData.player1.playerId === decliningPlayerId ? matchData.player2 : matchData.player1;
          
          logger.info(`Player ${decliningPlayer.username} declined active match ${matchId}. Returning ${otherPlayer.username} to queue.`);
          
          // Remove the declining player from queue completely
          await this.leaveQueue(decliningPlayerId);
          
          // Put the other player back in queue
          await this.putPlayerBackInQueue(otherPlayer);
          
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
          
          // Notify the other player they're back in queue
          if (gameHandler) {
            gameHandler.notifyPlayerBackInQueue(otherPlayer.playerId);
          }
          
          logger.info(`Active match ${matchId} cancelled due to decline. Player ${otherPlayer.username} returned to queue.`);
        } else {
          logger.warn(`Match ${matchId} not found for decline handling`);
        }
      }
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

  /**
   * Clean up expired pending matches
   */
  private async cleanupExpiredPendingMatches(): Promise<void> {
    try {
      // Get all pending match keys
      const pendingKeys = await redis.keys(`${this.PENDING_MATCH_PREFIX}*`);
      
      if (pendingKeys.length === 0) {
        return;
      }
      
      const currentTime = Date.now();
      let cleanedCount = 0;
      
      for (const key of pendingKeys) {
        try {
          const matchData = await redis.get(key);
          if (matchData) {
            const pendingMatch = JSON.parse(matchData);
            
            // Check if expired
            if (currentTime >= pendingMatch.expiresAt) {
              const matchId = pendingMatch.matchId;
              logger.info(`Cleaning up expired pending match ${matchId}`);
              
              await this.cancelPendingMatch(matchId, 'expired');
              cleanedCount++;
            }
          }
        } catch (error) {
          logger.error(`Error processing pending match ${key}:`, error);
          // Remove corrupted data
          await redis.delete(key);
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired pending matches`);
      }
    } catch (error) {
      logger.error('Error cleaning up expired pending matches:', error);
    }
  }
}

// Export singleton instance
export const matchmakingService = new MatchmakingService();