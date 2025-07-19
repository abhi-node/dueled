import { logger } from '../../utils/logger.js';

/**
 * SimpleELO - Clean, scalable rating system for 1v1 arena combat
 * 
 * Replaces complex Glicko-2 system with straightforward ELO calculation
 * Features:
 * - Classic ELO rating algorithm
 * - Simple +/-20 point adjustments
 * - No complex volatility or deviation calculations
 * - Perfect for 1v1 arena matches
 * - Easily extensible for seasons/leagues
 */

export interface ELOConfig {
  startingRating: number;
  kFactor: number;
  minRating: number;
  maxRating: number;
}

export interface MatchResult {
  winnerId: string;
  loserId: string;
  winnerRating: number;
  loserRating: number;
  matchType: 'ranked' | 'casual';
  timestamp: Date;
}

export interface RatingChange {
  playerId: string;
  oldRating: number;
  newRating: number;
  change: number;
  matchId?: string;
}

export interface PlayerRating {
  playerId: string;
  rating: number;
  wins: number;
  losses: number;
  winRate: number;
  lastMatchDate?: Date;
}

/**
 * SimpleELO rating calculation system
 */
export class SimpleELO {
  private config: ELOConfig;

  constructor(config?: Partial<ELOConfig>) {
    this.config = {
      startingRating: 1000,
      kFactor: 20,
      minRating: 100,
      maxRating: 3000,
      ...config
    };

    logger.info('SimpleELO initialized', this.config);
  }

  /**
   * Calculate new ratings after a match
   */
  calculateNewRatings(
    winnerRating: number,
    loserRating: number,
    kFactor?: number
  ): { winnerNewRating: number; loserNewRating: number; changes: { winner: number; loser: number } } {
    const k = kFactor || this.config.kFactor;

    // Calculate expected scores using ELO formula
    const expectedWinner = this.calculateExpectedScore(winnerRating, loserRating);
    const expectedLoser = this.calculateExpectedScore(loserRating, winnerRating);

    // Calculate rating changes
    // Winner gets points based on how unlikely their win was
    const winnerChange = Math.round(k * (1 - expectedWinner));
    // Loser loses points based on how likely they were to win
    const loserChange = Math.round(k * (0 - expectedLoser));

    // Apply changes with bounds checking
    const winnerNewRating = this.clampRating(winnerRating + winnerChange);
    const loserNewRating = this.clampRating(loserRating + loserChange);

    return {
      winnerNewRating,
      loserNewRating,
      changes: {
        winner: winnerChange,
        loser: loserChange
      }
    };
  }

  /**
   * Process match result and return rating changes
   */
  processMatch(matchResult: MatchResult): { winnerChange: RatingChange; loserChange: RatingChange } {
    const result = this.calculateNewRatings(
      matchResult.winnerRating,
      matchResult.loserRating
    );

    const winnerChange: RatingChange = {
      playerId: matchResult.winnerId,
      oldRating: matchResult.winnerRating,
      newRating: result.winnerNewRating,
      change: result.changes.winner
    };

    const loserChange: RatingChange = {
      playerId: matchResult.loserId,
      oldRating: matchResult.loserRating,
      newRating: result.loserNewRating,
      change: result.changes.loser
    };

    logger.info(`ELO Match processed: Winner ${matchResult.winnerId} (${matchResult.winnerRating} → ${result.winnerNewRating}, +${result.changes.winner}), ` +
               `Loser ${matchResult.loserId} (${matchResult.loserRating} → ${result.loserNewRating}, ${result.changes.loser})`);

    return { winnerChange, loserChange };
  }

  /**
   * Calculate expected score for player A against player B
   */
  private calculateExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /**
   * Clamp rating within configured bounds
   */
  private clampRating(rating: number): number {
    return Math.max(this.config.minRating, Math.min(this.config.maxRating, rating));
  }

  /**
   * Get starting rating for new players
   */
  getStartingRating(): number {
    return this.config.startingRating;
  }

  /**
   * Calculate win probability between two players
   */
  calculateWinProbability(playerRating: number, opponentRating: number): number {
    return this.calculateExpectedScore(playerRating, opponentRating);
  }

  /**
   * Get rating tier/rank name
   */
  getRatingTier(rating: number): string {
    if (rating < 600) return 'Bronze';
    if (rating < 900) return 'Silver';
    if (rating < 1200) return 'Gold';
    if (rating < 1500) return 'Platinum';
    if (rating < 1800) return 'Diamond';
    if (rating < 2100) return 'Master';
    return 'Grandmaster';
  }

  /**
   * Get rating color for UI display
   */
  getRatingColor(rating: number): string {
    const tier = this.getRatingTier(rating);
    const colors = {
      'Bronze': '#CD7F32',
      'Silver': '#C0C0C0',
      'Gold': '#FFD700',
      'Platinum': '#E5E4E2',
      'Diamond': '#B9F2FF',
      'Master': '#FF6B00',
      'Grandmaster': '#FF1744'
    };
    return colors[tier as keyof typeof colors] || '#C0C0C0';
  }

  /**
   * Calculate rating statistics
   */
  calculateStats(playerRating: PlayerRating): {
    tier: string;
    color: string;
    percentile: number;
    nextTierRating: number;
    ratingProgress: number;
  } {
    const tier = this.getRatingTier(playerRating.rating);
    const color = this.getRatingColor(playerRating.rating);
    
    // Simple percentile calculation (would need real data for accuracy)
    const percentile = Math.min(99, Math.max(1, Math.round((playerRating.rating - this.config.minRating) / (this.config.maxRating - this.config.minRating) * 100)));
    
    // Calculate next tier threshold
    const tiers = [600, 900, 1200, 1500, 1800, 2100, 3000];
    const nextTierRating = tiers.find(t => t > playerRating.rating) || this.config.maxRating;
    
    // Calculate progress to next tier
    const currentTierMin = tiers.reverse().find(t => t <= playerRating.rating) || this.config.minRating;
    const ratingProgress = nextTierRating > currentTierMin ? 
      (playerRating.rating - currentTierMin) / (nextTierRating - currentTierMin) : 1;

    return {
      tier,
      color,
      percentile,
      nextTierRating,
      ratingProgress
    };
  }

  /**
   * Simulate rating change for UI preview
   */
  simulateMatchOutcome(
    playerRating: number,
    opponentRating: number,
    playerWins: boolean
  ): { newRating: number; change: number; probability: number } {
    if (playerWins) {
      const result = this.calculateNewRatings(playerRating, opponentRating);
      return {
        newRating: result.winnerNewRating,
        change: result.changes.winner,
        probability: this.calculateWinProbability(playerRating, opponentRating)
      };
    } else {
      const result = this.calculateNewRatings(opponentRating, playerRating);
      return {
        newRating: result.loserNewRating,
        change: result.changes.loser,
        probability: 1 - this.calculateWinProbability(playerRating, opponentRating)
      };
    }
  }

  /**
   * Check if players are suitable for matchmaking
   */
  isGoodMatch(rating1: number, rating2: number, maxDifference: number = 200): boolean {
    return Math.abs(rating1 - rating2) <= maxDifference;
  }

  /**
   * Get ideal rating range for matchmaking
   */
  getMatchmakingRange(rating: number, tolerance: number = 100): { min: number; max: number } {
    return {
      min: Math.max(this.config.minRating, rating - tolerance),
      max: Math.min(this.config.maxRating, rating + tolerance)
    };
  }

  /**
   * Calculate rating volatility (simple version)
   */
  calculateVolatility(recentMatches: RatingChange[]): number {
    if (recentMatches.length < 2) return 0;

    const changes = recentMatches.map(m => Math.abs(m.change));
    const average = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    
    return Math.round(average);
  }

  /**
   * Adjust K-factor based on rating and experience
   */
  getAdaptiveKFactor(rating: number, gamesPlayed: number): number {
    let k = this.config.kFactor;

    // Higher K-factor for new players (faster rating adjustment)
    if (gamesPlayed < 10) {
      k = 40;
    } else if (gamesPlayed < 30) {
      k = 30;
    }

    // Lower K-factor for very high rated players (rating stability)
    if (rating > 2000) {
      k = Math.max(10, k - 5);
    }

    return k;
  }

  /**
   * Handle special match types (e.g., tournaments)
   */
  processSpecialMatch(
    matchResult: MatchResult,
    multiplier: number = 1.0
  ): { winnerChange: RatingChange; loserChange: RatingChange } {
    const adjustedKFactor = this.config.kFactor * multiplier;
    
    const result = this.calculateNewRatings(
      matchResult.winnerRating,
      matchResult.loserRating,
      adjustedKFactor
    );

    const winnerChange: RatingChange = {
      playerId: matchResult.winnerId,
      oldRating: matchResult.winnerRating,
      newRating: result.winnerNewRating,
      change: result.changes.winner
    };

    const loserChange: RatingChange = {
      playerId: matchResult.loserId,
      oldRating: matchResult.loserRating,
      newRating: result.loserNewRating,
      change: result.changes.loser
    };

    logger.info(`Special match processed (${multiplier}x): Winner +${result.changes.winner}, Loser ${result.changes.loser}`);
    return { winnerChange, loserChange };
  }

  /**
   * Get configuration for external use
   */
  getConfig(): ELOConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ELOConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('SimpleELO config updated', this.config);
  }
}

/**
 * Factory function for creating SimpleELO instance
 */
export const createSimpleELO = (config?: Partial<ELOConfig>): SimpleELO => {
  return new SimpleELO(config);
};

/**
 * Default instance for global use
 */
export const simpleELO = createSimpleELO();