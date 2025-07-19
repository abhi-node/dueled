import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { simpleELO } from '../rating/SimpleELO.js';
import { ClassType } from '@dueled/shared';

/**
 * SimpleMatchmaking - ELO-based matchmaking for 1v1 arena combat
 * 
 * Features:
 * - ELO-based skill matching for balanced games
 * - Expanding search radius for faster queue times
 * - First-come-first-served within ELO bands
 * - No complex pending acceptance system
 * - Scalable for future tournament modes
 * - Support for cross-class matching
 */

export interface MatchmakingConfig {
  initialELORange: number;     // Starting ELO search range (+/-)
  maxELORange: number;         // Maximum ELO search range
  expansionRate: number;       // How fast to expand range (per second)
  maxWaitTime: number;         // Max queue time before matching anyone
  allowCrossClass: boolean;    // Allow different classes to match
}

export interface QueuedPlayer {
  playerId: string;
  username: string;
  rating: number;
  classType: ClassType;
  queuedAt: number;
  sessionId?: string;
}

export interface MatchPair {
  matchId: string;
  player1: QueuedPlayer;
  player2: QueuedPlayer;
  avgRating: number;
  ratingDifference: number;
  createdAt: number;
}

export interface MatchmakingStats {
  playersInQueue: number;
  averageWaitTime: number;
  matchesCreated: number;
  averageRatingDiff: number;
}

/**
 * SimpleMatchmaking - Clean, ELO-based matchmaking service
 */
export class SimpleMatchmaking {
  private config: MatchmakingConfig;
  private queue: Map<string, QueuedPlayer> = new Map();
  private matchHistory: MatchPair[] = [];
  private stats: MatchmakingStats = {
    playersInQueue: 0,
    averageWaitTime: 0,
    matchesCreated: 0,
    averageRatingDiff: 0
  };
  private matchFoundCallback?: (match: MatchPair) => void;

  constructor(config?: Partial<MatchmakingConfig>) {
    this.config = {
      initialELORange: 100,      // Start with ±100 ELO
      maxELORange: 400,          // Max ±400 ELO difference
      expansionRate: 25,         // Expand by 25 ELO per second
      maxWaitTime: 60000,        // 60 seconds max wait
      allowCrossClass: true,     // Allow different classes
      ...config
    };

    logger.info('SimpleMatchmaking initialized', this.config);
    this.startMatchmakingLoop();
  }

  /**
   * Add player to matchmaking queue
   */
  async joinQueue(player: QueuedPlayer): Promise<void> {
    // Remove any existing queue entry for this player
    await this.leaveQueue(player.playerId);

    // Add to queue
    this.queue.set(player.playerId, {
      ...player,
      queuedAt: Date.now()
    });

    this.updateStats();
    logger.info(`Player ${player.username} (${player.rating} ELO, ${player.classType}) joined queue`);

    // Try immediate matching
    await this.processQueue();
  }

  /**
   * Remove player from queue
   */
  async leaveQueue(playerId: string): Promise<boolean> {
    const removed = this.queue.delete(playerId);
    if (removed) {
      this.updateStats();
      logger.info(`Player ${playerId} left queue`);
    }
    return removed;
  }

  /**
   * Get current queue status for player
   */
  getQueueStatus(playerId: string): {
    inQueue: boolean;
    position?: number;
    estimatedWait?: number;
    currentRange?: number;
  } {
    const player = this.queue.get(playerId);
    if (!player) {
      return { inQueue: false };
    }

    const queueArray = Array.from(this.queue.values());
    const position = queueArray
      .sort((a, b) => a.queuedAt - b.queuedAt)
      .findIndex(p => p.playerId === playerId) + 1;

    const waitTime = Date.now() - player.queuedAt;
    const currentRange = this.calculateCurrentELORange(waitTime);
    const estimatedWait = this.estimateWaitTime(player);

    return {
      inQueue: true,
      position,
      estimatedWait,
      currentRange
    };
  }

  /**
   * Main matchmaking processing loop
   */
  private async processQueue(): Promise<void> {
    if (this.queue.size < 2) return;

    const players = Array.from(this.queue.values());
    const matches: MatchPair[] = [];

    // Sort by queue time (first come, first served within ELO bands)
    players.sort((a, b) => a.queuedAt - b.queuedAt);

    const processed = new Set<string>();

    for (const player of players) {
      if (processed.has(player.playerId)) continue;

      const opponent = this.findBestOpponent(player, players, processed);
      if (opponent) {
        const match = this.createMatch(player, opponent);
        matches.push(match);
        
        // Mark both players as processed
        processed.add(player.playerId);
        processed.add(opponent.playerId);
        
        // Remove from queue
        this.queue.delete(player.playerId);
        this.queue.delete(opponent.playerId);
      }
    }

    // Process all matches
    for (const match of matches) {
      await this.finalizeMatch(match);
    }

    if (matches.length > 0) {
      this.updateStats();
    }
  }

  /**
   * Find best opponent for player using ELO-based matching
   */
  private findBestOpponent(
    player: QueuedPlayer, 
    candidates: QueuedPlayer[], 
    processed: Set<string>
  ): QueuedPlayer | null {
    const waitTime = Date.now() - player.queuedAt;
    const currentRange = this.calculateCurrentELORange(waitTime);

    // Filter candidates
    const eligibleOpponents = candidates.filter(candidate => {
      // Skip self and already processed players
      if (candidate.playerId === player.playerId || processed.has(candidate.playerId)) {
        return false;
      }

      // Check ELO range
      const ratingDiff = Math.abs(player.rating - candidate.rating);
      if (ratingDiff > currentRange) {
        return false;
      }

      // Check class compatibility if needed
      if (!this.config.allowCrossClass && player.classType !== candidate.classType) {
        return false;
      }

      return true;
    });

    if (eligibleOpponents.length === 0) {
      return null;
    }

    // Find best match (closest ELO, longest wait time as tiebreaker)
    let bestOpponent = eligibleOpponents[0];
    let bestScore = this.calculateMatchScore(player, bestOpponent);

    for (const opponent of eligibleOpponents.slice(1)) {
      const score = this.calculateMatchScore(player, opponent);
      if (score > bestScore) {
        bestScore = score;
        bestOpponent = opponent;
      }
    }

    return bestOpponent;
  }

  /**
   * Calculate match quality score (higher = better match)
   */
  private calculateMatchScore(player: QueuedPlayer, opponent: QueuedPlayer): number {
    const ratingDiff = Math.abs(player.rating - opponent.rating);
    const maxRating = Math.max(player.rating, opponent.rating);
    
    // ELO closeness score (0-100)
    const eloScore = Math.max(0, 100 - (ratingDiff / this.config.maxELORange) * 100);
    
    // Wait time score (0-50) - prefer matching players who have waited longer
    const combinedWaitTime = (Date.now() - player.queuedAt) + (Date.now() - opponent.queuedAt);
    const waitScore = Math.min(50, combinedWaitTime / 2000); // 2 seconds = 1 point
    
    // Class matching bonus (0-25)
    const classBonus = player.classType === opponent.classType ? 25 : 0;
    
    // Balanced game bonus - prefer matches where neither player is heavily favored
    const winProbability = simpleELO.calculateWinProbability(player.rating, opponent.rating);
    const balanceScore = Math.max(0, 25 - Math.abs(winProbability - 0.5) * 100);

    return eloScore + waitScore + classBonus + balanceScore;
  }

  /**
   * Calculate current ELO search range based on wait time
   */
  private calculateCurrentELORange(waitTime: number): number {
    const expansionTime = waitTime / 1000; // Convert to seconds
    const expandedRange = this.config.initialELORange + (expansionTime * this.config.expansionRate);
    
    return Math.min(this.config.maxELORange, expandedRange);
  }

  /**
   * Estimate wait time for player
   */
  private estimateWaitTime(player: QueuedPlayer): number {
    const queueSize = this.queue.size;
    if (queueSize < 2) return this.config.maxWaitTime;

    // Simple estimation based on current queue size and average match rate
    const baseWaitTime = (queueSize / 2) * 5000; // 5 seconds per match ahead
    
    // Adjust for ELO - players with extreme ratings wait longer
    const playerRating = player.rating;
    const avgRating = Array.from(this.queue.values())
      .reduce((sum, p) => sum + p.rating, 0) / queueSize;
    
    const ratingDeviation = Math.abs(playerRating - avgRating);
    const ratingPenalty = (ratingDeviation / 200) * 10000; // 10 seconds per 200 ELO deviation
    
    return Math.min(this.config.maxWaitTime, baseWaitTime + ratingPenalty);
  }

  /**
   * Create match between two players
   */
  private createMatch(player1: QueuedPlayer, player2: QueuedPlayer): MatchPair {
    const matchId = uuidv4();
    const avgRating = Math.round((player1.rating + player2.rating) / 2);
    const ratingDifference = Math.abs(player1.rating - player2.rating);

    const match: MatchPair = {
      matchId,
      player1,
      player2,
      avgRating,
      ratingDifference,
      createdAt: Date.now()
    };

    // Add to match history for statistics
    this.matchHistory.push(match);
    
    // Keep only recent matches for performance
    if (this.matchHistory.length > 1000) {
      this.matchHistory = this.matchHistory.slice(-500);
    }

    return match;
  }

  /**
   * Finalize match and notify game systems
   */
  private async finalizeMatch(match: MatchPair): Promise<void> {
    try {
      logger.info(`Match created: ${match.player1.username} (${match.player1.rating}) vs ` +
                 `${match.player2.username} (${match.player2.rating}) - Diff: ${match.ratingDifference} ELO`);

      // Emit match event for game systems to handle
      this.onMatchCreated(match);
      
      this.stats.matchesCreated++;

    } catch (error) {
      logger.error('Failed to finalize match:', error);
      
      // Re-queue players if match creation failed
      await this.joinQueue(match.player1);
      await this.joinQueue(match.player2);
    }
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.playersInQueue = this.queue.size;
    
    if (this.matchHistory.length > 0) {
      // Calculate average rating difference
      const totalRatingDiff = this.matchHistory
        .slice(-100) // Last 100 matches
        .reduce((sum, match) => sum + match.ratingDifference, 0);
      this.stats.averageRatingDiff = totalRatingDiff / Math.min(100, this.matchHistory.length);
      
      // Calculate average wait time
      const recentMatches = this.matchHistory.slice(-50);
      if (recentMatches.length > 0) {
        const totalWaitTime = recentMatches.reduce((sum, match) => {
          const p1Wait = match.createdAt - match.player1.queuedAt;
          const p2Wait = match.createdAt - match.player2.queuedAt;
          return sum + (p1Wait + p2Wait) / 2;
        }, 0);
        this.stats.averageWaitTime = totalWaitTime / recentMatches.length;
      }
    }
  }

  /**
   * Start the matchmaking processing loop
   */
  private startMatchmakingLoop(): void {
    setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        logger.error('Matchmaking loop error:', error);
      }
    }, 2000); // Process every 2 seconds

    logger.info('Matchmaking loop started');
  }

  /**
   * Event handler for when matches are created
   */
  protected onMatchCreated(match: MatchPair): void {
    logger.debug(`Match ready: ${match.matchId}`);
    
    // Call registered callback if available
    if (this.matchFoundCallback) {
      this.matchFoundCallback(match);
    }
  }

  /**
   * Set callback for when matches are found
   */
  setMatchFoundCallback(callback: (match: MatchPair) => void): void {
    this.matchFoundCallback = callback;
    logger.info('Match found callback registered');
  }

  /**
   * Get current matchmaking statistics
   */
  getStats(): MatchmakingStats {
    return { ...this.stats };
  }

  /**
   * Get all players currently in queue (for admin/debug)
   */
  getQueueSnapshot(): QueuedPlayer[] {
    return Array.from(this.queue.values());
  }

  /**
   * Clear queue (for maintenance)
   */
  clearQueue(): number {
    const count = this.queue.size;
    this.queue.clear();
    this.updateStats();
    logger.warn(`Cleared matchmaking queue (${count} players removed)`);
    return count;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<MatchmakingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Matchmaking config updated', this.config);
  }

  /**
   * Get player's match history (for UI)
   */
  getPlayerMatchHistory(playerId: string, limit: number = 10): MatchPair[] {
    return this.matchHistory
      .filter(match => match.player1.playerId === playerId || match.player2.playerId === playerId)
      .slice(-limit);
  }

  /**
   * Check if two players can be matched (for manual testing)
   */
  canMatch(player1: QueuedPlayer, player2: QueuedPlayer): {
    canMatch: boolean;
    reason?: string;
    score?: number;
  } {
    if (player1.playerId === player2.playerId) {
      return { canMatch: false, reason: 'Same player' };
    }

    const ratingDiff = Math.abs(player1.rating - player2.rating);
    if (ratingDiff > this.config.maxELORange) {
      return { canMatch: false, reason: `Rating difference too large (${ratingDiff} > ${this.config.maxELORange})` };
    }

    if (!this.config.allowCrossClass && player1.classType !== player2.classType) {
      return { canMatch: false, reason: 'Cross-class matching disabled' };
    }

    const score = this.calculateMatchScore(player1, player2);
    return { canMatch: true, score };
  }

  /**
   * Force match two specific players (for testing/custom games)
   */
  async forceMatch(playerId1: string, playerId2: string): Promise<MatchPair | null> {
    const player1 = this.queue.get(playerId1);
    const player2 = this.queue.get(playerId2);

    if (!player1 || !player2) {
      logger.warn(`Cannot force match: player(s) not in queue`);
      return null;
    }

    const match = this.createMatch(player1, player2);
    
    // Remove from queue
    this.queue.delete(playerId1);
    this.queue.delete(playerId2);
    
    await this.finalizeMatch(match);
    this.updateStats();
    
    logger.info(`Forced match created: ${playerId1} vs ${playerId2}`);
    return match;
  }
}

/**
 * Factory function for creating SimpleMatchmaking instance
 */
export const createSimpleMatchmaking = (config?: Partial<MatchmakingConfig>): SimpleMatchmaking => {
  return new SimpleMatchmaking(config);
};

/**
 * Default instance for global use
 */
export const simpleMatchmaking = createSimpleMatchmaking();