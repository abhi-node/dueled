/**
 * MatchFinalizationService - Handles match completion, rating updates, and cleanup
 * 
 * This service is responsible for:
 * 1. Finalizing matches when win conditions are met
 * 2. Calculating and applying Glicko-2 rating changes
 * 3. Updating match records in the database
 * 4. Coordinating with GameHandler for match cleanup
 */

import { logger } from '../utils/logger.js';
import { db } from './database.js';
import { PlayerService } from './playerService.js';
import { ratingService } from './ratingService.js';
import type { GameHandler } from '../websocket/GameHandler.js';

export interface MatchResult {
  winnerId: string;
  loserId: string;
  winnerRatingChange: number;
  loserRatingChange: number;
  newWinnerRating: number;
  newLoserRating: number;
  matchDuration: number;
}

export interface MatchFinalizationData {
  matchId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  startTime: number;
  finalStats?: {
    player1?: { health: number; armor: number; damageDealt: number; damageTaken: number };
    player2?: { health: number; armor: number; damageDealt: number; damageTaken: number };
  };
}

export class MatchFinalizationService {
  private playerService: PlayerService;
  private ratingService: typeof ratingService;
  private gameHandler: GameHandler | null = null;
  private finalizedMatches = new Set<string>(); // Prevent double finalization

  constructor(playerService: PlayerService, ratingServiceInstance: typeof ratingService) {
    this.playerService = playerService;
    this.ratingService = ratingServiceInstance;
  }

  /**
   * Set the GameHandler reference to avoid circular imports
   */
  public setGameHandler(gameHandler: GameHandler): void {
    this.gameHandler = gameHandler;
  }

  /**
   * Finalize a match and apply rating changes
   * This is the main entry point called when a match ends
   */
  public async finalizeMatch(data: MatchFinalizationData): Promise<MatchResult> {
    const { matchId, player1Id, player2Id, winnerId, startTime, finalStats } = data;

    // Guard against double finalization
    if (this.finalizedMatches.has(matchId)) {
      logger.warn(`⚠️ Match ${matchId} already finalized, skipping...`);
      throw new Error(`Match ${matchId} has already been finalized`);
    }

    this.finalizedMatches.add(matchId);
    logger.info(`🏁 Finalizing match ${matchId} with winner ${winnerId}`);

    try {
      // Calculate match duration
      const matchDuration = Math.floor((Date.now() - startTime) / 1000);
      
      // Determine loser
      const loserId = winnerId === player1Id ? player2Id : player1Id;

      // Get current ratings for both players
      const [winnerStats, loserStats] = await Promise.all([
        this.playerService.getPlayerStats(winnerId),
        this.playerService.getPlayerStats(loserId)
      ]);

      if (!winnerStats || !loserStats) {
        throw new Error(`Unable to retrieve player stats for match finalization`);
      }

      // Calculate new ratings using Glicko-2
      const ratingCalculation = this.ratingService.calculateMatchRating(
        { rating: winnerStats.rating, deviation: winnerStats.rating_deviation, volatility: winnerStats.volatility },
        { rating: loserStats.rating, deviation: loserStats.rating_deviation, volatility: loserStats.volatility },
        true // winner won
      );

      // Cap rating changes to prevent extreme swings
      const MAX_RATING_CHANGE = 150;
      const winnerRatingChange = Math.max(-MAX_RATING_CHANGE, Math.min(MAX_RATING_CHANGE, 
        ratingCalculation.winner.rating - winnerStats.rating));
      const loserRatingChange = Math.max(-MAX_RATING_CHANGE, Math.min(MAX_RATING_CHANGE,
        ratingCalculation.loser.rating - loserStats.rating));

      const newWinnerRating = winnerStats.rating + winnerRatingChange;
      const newLoserRating = loserStats.rating + loserRatingChange;

      // Update database in a transaction
      await this.updateMatchInDatabase({
        matchId,
        winnerId,
        loserId,
        matchDuration,
        player1Id,
        player2Id,
        winnerRating: { before: winnerStats.rating, after: newWinnerRating },
        loserRating: { before: loserStats.rating, after: newLoserRating },
        ratingCalculation,
        finalStats
      });

      const result: MatchResult = {
        winnerId,
        loserId,
        winnerRatingChange,
        loserRatingChange,
        newWinnerRating,
        newLoserRating,
        matchDuration
      };

      // Announce match end via GameHandler
      if (this.gameHandler) {
        await this.gameHandler.announceMatchEnd(matchId, result);
      } else {
        logger.warn(`⚠️ No GameHandler available to announce match end for ${matchId}`);
      }

      logger.info(`✅ Match ${matchId} finalized successfully:`, {
        winner: winnerId,
        winnerRatingChange: `${winnerRatingChange > 0 ? '+' : ''}${winnerRatingChange}`,
        loser: loserId,
        loserRatingChange: `${loserRatingChange > 0 ? '+' : ''}${loserRatingChange}`,
        duration: `${matchDuration}s`
      });

      return result;

    } catch (error) {
      // Remove from finalized set if we failed
      this.finalizedMatches.delete(matchId);
      logger.error(`❌ Failed to finalize match ${matchId}:`, error);
      throw error;
    }
  }

  /**
   * Update match and player records in database with transaction safety
   */
  private async updateMatchInDatabase(data: {
    matchId: string;
    winnerId: string;
    loserId: string;
    matchDuration: number;
    player1Id: string;
    player2Id: string;
    winnerRating: { before: number; after: number };
    loserRating: { before: number; after: number };
    ratingCalculation: any;
    finalStats?: any;
  }): Promise<void> {
    const client = await db.getClient();
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount <= maxRetries) {
      try {
        await client.query('BEGIN');

        // Verify match exists and isn't already completed
        const matchCheck = await client.query(
          'SELECT status, winner_id FROM matches WHERE id = $1',
          [data.matchId]
        );

        if (matchCheck.rows.length === 0) {
          throw new Error(`Match ${data.matchId} not found in database`);
        }

        const currentMatch = matchCheck.rows[0];
        if (currentMatch.status === 'completed') {
          logger.warn(`⚠️ Match ${data.matchId} already completed, skipping finalization`);
          await client.query('ROLLBACK');
          return;
        }

        // Verify both players exist
        const playersCheck = await client.query(
          'SELECT id FROM players WHERE id = ANY($1)',
          [[data.winnerId, data.loserId]]
        );

        if (playersCheck.rows.length !== 2) {
          throw new Error(`Missing player records for match ${data.matchId}`);
        }

        // Update match record
        const matchUpdateResult = await client.query(`
          UPDATE matches 
          SET 
            winner_id = $1,
            status = 'completed',
            match_duration = $2,
            completed_at = NOW(),
            player1_rating_after = $3,
            player2_rating_after = $4,
            match_data = COALESCE(match_data, '{}') || $5
          WHERE id = $6 AND status != 'completed'
          RETURNING id
        `, [
          data.winnerId,
          data.matchDuration,
          data.player1Id === data.winnerId ? data.winnerRating.after : data.loserRating.after,
          data.player2Id === data.winnerId ? data.winnerRating.after : data.loserRating.after,
          JSON.stringify({
            finalStats: data.finalStats,
            ratingChanges: {
              winner: data.winnerRating.after - data.winnerRating.before,
              loser: data.loserRating.after - data.loserRating.before
            },
            finalizationTimestamp: new Date().toISOString()
          }),
          data.matchId
        ]);

        if (matchUpdateResult.rows.length === 0) {
          logger.warn(`⚠️ Match ${data.matchId} was completed by another process`);
          await client.query('ROLLBACK');
          return;
        }

        // Update winner stats with conflict checking
        const winnerUpdateResult = await client.query(`
          UPDATE player_stats 
          SET 
            rating = $1,
            rating_deviation = $2,
            volatility = $3,
            wins = wins + 1,
            matches_played = matches_played + 1,
            last_match_at = NOW(),
            last_rating_change = $4
          WHERE player_id = $5
          RETURNING player_id
        `, [
          Math.max(0, Math.min(5000, data.ratingCalculation.winner.rating)), // Clamp rating
          Math.max(30, Math.min(350, data.ratingCalculation.winner.deviation)), // Clamp deviation
          Math.max(0.06, Math.min(0.15, data.ratingCalculation.winner.volatility)), // Clamp volatility
          data.winnerRating.after - data.winnerRating.before,
          data.winnerId
        ]);

        // Update loser stats with conflict checking
        const loserUpdateResult = await client.query(`
          UPDATE player_stats 
          SET 
            rating = $1,
            rating_deviation = $2,
            volatility = $3,
            losses = losses + 1,
            matches_played = matches_played + 1,
            last_match_at = NOW(),
            last_rating_change = $4
          WHERE player_id = $5
          RETURNING player_id
        `, [
          Math.max(0, Math.min(5000, data.ratingCalculation.loser.rating)), // Clamp rating
          Math.max(30, Math.min(350, data.ratingCalculation.loser.deviation)), // Clamp deviation
          Math.max(0.06, Math.min(0.15, data.ratingCalculation.loser.volatility)), // Clamp volatility
          data.loserRating.after - data.loserRating.before,
          data.loserId
        ]);

        if (winnerUpdateResult.rows.length === 0 || loserUpdateResult.rows.length === 0) {
          throw new Error('Failed to update player stats - player records may have been deleted');
        }

        await client.query('COMMIT');
        logger.info(`💾 Database transaction completed for match ${data.matchId}`);
        return; // Success, exit retry loop

      } catch (error) {
        await client.query('ROLLBACK');
        retryCount++;
        
        if (retryCount > maxRetries) {
          logger.error(`❌ Database transaction failed after ${maxRetries} retries for match ${data.matchId}:`, error);
          throw new Error(`Database transaction failed after retries: ${error.message}`);
        } else {
          logger.warn(`⚠️ Database transaction failed (attempt ${retryCount}/${maxRetries}), retrying in ${retryCount * 1000}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, retryCount * 1000)); // Exponential backoff
        }
      } finally {
        client.release();
      }
    }
  }

  /**
   * Check if a match has already been finalized
   */
  public isMatchFinalized(matchId: string): boolean {
    return this.finalizedMatches.has(matchId);
  }

  /**
   * Get finalization statistics for monitoring
   */
  public getStats(): { finalizedMatches: number } {
    return {
      finalizedMatches: this.finalizedMatches.size
    };
  }

  /**
   * Cleanup old finalized match records (call periodically)
   */
  public cleanup(): void {
    // Keep track of last 1000 finalized matches to prevent memory leaks
    if (this.finalizedMatches.size > 1000) {
      const toDelete = this.finalizedMatches.size - 1000;
      const iterator = this.finalizedMatches.values();
      for (let i = 0; i < toDelete; i++) {
        const next = iterator.next();
        if (!next.done) {
          this.finalizedMatches.delete(next.value);
        }
      }
      logger.info(`🧹 Cleaned up ${toDelete} old finalized match records`);
    }
  }
}

// Create and export singleton instance
const playerService = new PlayerService();
export const matchFinalizationService = new MatchFinalizationService(playerService, ratingService);

// Set up periodic cleanup
setInterval(() => {
  matchFinalizationService.cleanup();
}, 300000); // Clean up every 5 minutes