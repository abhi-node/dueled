import { logger } from '../utils/logger.js';

/**
 * Glicko-2 rating system implementation
 * Based on Mark Glickman's Glicko-2 rating system
 */

export interface PlayerRating {
  rating: number;      // µ (mu) - player's rating
  deviation: number;   // φ (phi) - rating deviation
  volatility: number;  // σ (sigma) - volatility
}

export interface MatchResult {
  opponent: PlayerRating;
  score: number; // 1 for win, 0.5 for draw, 0 for loss
}

export interface RatingUpdate {
  rating: number;
  deviation: number;
  volatility: number;
  rating_change: number;
}

export class RatingService {
  // Glicko-2 constants
  private readonly TAU = 0.5;           // System constant (volatility change)
  private readonly EPSILON = 0.000001;  // Convergence tolerance
  private readonly SCALE = 173.7178;    // Scale factor for conversion
  private readonly INITIAL_RATING = 1500;
  private readonly INITIAL_DEVIATION = 350;
  private readonly INITIAL_VOLATILITY = 0.06;

  /**
   * Create a new player rating with default values
   */
  createNewPlayerRating(): PlayerRating {
    return {
      rating: this.INITIAL_RATING,
      deviation: this.INITIAL_DEVIATION,
      volatility: this.INITIAL_VOLATILITY
    };
  }

  /**
   * Convert Glicko-2 rating to display rating
   */
  toDisplayRating(rating: number): number {
    return Math.round(rating * this.SCALE + 1500);
  }

  /**
   * Convert display rating to Glicko-2 rating
   */
  fromDisplayRating(displayRating: number): number {
    return (displayRating - 1500) / this.SCALE;
  }

  /**
   * Convert Glicko-2 deviation to display deviation
   */
  toDisplayDeviation(deviation: number): number {
    return Math.round(deviation * this.SCALE);
  }

  /**
   * Convert display deviation to Glicko-2 deviation
   */
  fromDisplayDeviation(displayDeviation: number): number {
    return displayDeviation / this.SCALE;
  }

  /**
   * Convert player rating to Glicko-2 scale
   */
  private toGlicko2Scale(playerRating: PlayerRating): PlayerRating {
    return {
      rating: this.fromDisplayRating(playerRating.rating),
      deviation: this.fromDisplayDeviation(playerRating.deviation),
      volatility: playerRating.volatility
    };
  }

  /**
   * Convert player rating from Glicko-2 scale
   */
  private fromGlicko2Scale(playerRating: PlayerRating): PlayerRating {
    return {
      rating: this.toDisplayRating(playerRating.rating),
      deviation: this.toDisplayDeviation(playerRating.deviation),
      volatility: playerRating.volatility
    };
  }

  /**
   * Calculate the g function
   */
  private calculateG(deviation: number): number {
    return 1 / Math.sqrt(1 + (3 * deviation * deviation) / (Math.PI * Math.PI));
  }

  /**
   * Calculate the E function (expected score)
   */
  private calculateE(rating: number, opponentRating: number, opponentDeviation: number): number {
    const g = this.calculateG(opponentDeviation);
    return 1 / (1 + Math.exp(-g * (rating - opponentRating)));
  }

  /**
   * Calculate the variance
   */
  private calculateVariance(rating: number, results: MatchResult[]): number {
    let variance = 0;
    
    for (const result of results) {
      const g = this.calculateG(result.opponent.deviation);
      const e = this.calculateE(rating, result.opponent.rating, result.opponent.deviation);
      variance += g * g * e * (1 - e);
    }
    
    return 1 / variance;
  }

  /**
   * Calculate the delta
   */
  private calculateDelta(rating: number, variance: number, results: MatchResult[]): number {
    let delta = 0;
    
    for (const result of results) {
      const g = this.calculateG(result.opponent.deviation);
      const e = this.calculateE(rating, result.opponent.rating, result.opponent.deviation);
      delta += g * (result.score - e);
    }
    
    return variance * delta;
  }

  /**
   * Calculate new volatility using iterative method
   */
  private calculateNewVolatility(
    deviation: number,
    volatility: number,
    variance: number,
    delta: number
  ): number {
    const phi = deviation;
    const sigma = volatility;
    const v = variance;
    const deltaSquared = delta * delta;
    
    // Step 5.2: Set initial values
    let a = Math.log(sigma * sigma);
    let b: number;
    
    if (deltaSquared > phi * phi + v) {
      b = Math.log(deltaSquared - phi * phi - v);
    } else {
      let k = 1;
      while (this.f(a - k * this.TAU, phi, v, delta, a) < 0) {
        k++;
      }
      b = a - k * this.TAU;
    }
    
    // Step 5.3: Iterative procedure
    let fA = this.f(a, phi, v, delta, a);
    let fB = this.f(b, phi, v, delta, a);
    
    while (Math.abs(b - a) > this.EPSILON) {
      const c = a + (a - b) * fA / (fB - fA);
      const fC = this.f(c, phi, v, delta, a);
      
      if (fC * fB < 0) {
        a = b;
        fA = fB;
      } else {
        fA = fA / 2;
      }
      
      b = c;
      fB = fC;
    }
    
    return Math.exp(a / 2);
  }

  /**
   * Helper function f for volatility calculation
   */
  private f(x: number, phi: number, v: number, delta: number, a: number): number {
    const expX = Math.exp(x);
    const phi2 = phi * phi;
    const delta2 = delta * delta;
    
    return (expX * (delta2 - phi2 - v - expX)) / (2 * Math.pow(phi2 + v + expX, 2)) - 
           (x - a) / (this.TAU * this.TAU);
  }

  /**
   * Calculate new rating and deviation
   */
  private calculateNewRatingAndDeviation(
    rating: number,
    deviation: number,
    newVolatility: number,
    variance: number,
    delta: number
  ): { rating: number; deviation: number } {
    // Step 6: Update rating deviation
    const phi = deviation;
    const sigma = newVolatility;
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    
    // Step 7: Update rating and deviation
    const newDeviation = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / variance);
    const newRating = rating + newDeviation * newDeviation * delta / variance;
    
    return { rating: newRating, deviation: newDeviation };
  }

  /**
   * Update player rating based on match results
   */
  updateRating(playerRating: PlayerRating, results: MatchResult[]): RatingUpdate {
    try {
      if (results.length === 0) {
        logger.warn('No match results provided for rating update');
        return {
          rating: playerRating.rating,
          deviation: playerRating.deviation,
          volatility: playerRating.volatility,
          rating_change: 0
        };
      }

      // Convert to Glicko-2 scale
      const glicko2Player = this.toGlicko2Scale(playerRating);
      const glicko2Results = results.map(result => ({
        opponent: this.toGlicko2Scale(result.opponent),
        score: result.score
      }));

      // Step 3: Calculate variance
      const variance = this.calculateVariance(glicko2Player.rating, glicko2Results);

      // Step 4: Calculate delta
      const delta = this.calculateDelta(glicko2Player.rating, variance, glicko2Results);

      // Step 5: Calculate new volatility
      const newVolatility = this.calculateNewVolatility(
        glicko2Player.deviation,
        glicko2Player.volatility,
        variance,
        delta
      );

      // Step 6 & 7: Calculate new rating and deviation
      const { rating: newRating, deviation: newDeviation } = this.calculateNewRatingAndDeviation(
        glicko2Player.rating,
        glicko2Player.deviation,
        newVolatility,
        variance,
        delta
      );

      // Convert back to display scale
      const updatedRating = this.fromGlicko2Scale({
        rating: newRating,
        deviation: newDeviation,
        volatility: newVolatility
      });

      const ratingChange = updatedRating.rating - playerRating.rating;

      logger.debug(`Rating updated for player: ${playerRating.rating} -> ${updatedRating.rating} (${ratingChange > 0 ? '+' : ''}${Math.round(ratingChange)})`);

      return {
        rating: Math.round(updatedRating.rating),
        deviation: Math.round(updatedRating.deviation),
        volatility: newVolatility,
        rating_change: Math.round(ratingChange)
      };
    } catch (error) {
      logger.error('Error updating rating:', error);
      throw new Error('Failed to update rating');
    }
  }

  /**
   * Calculate expected score between two players
   */
  calculateExpectedScore(playerRating: PlayerRating, opponentRating: PlayerRating): number {
    const glicko2Player = this.toGlicko2Scale(playerRating);
    const glicko2Opponent = this.toGlicko2Scale(opponentRating);
    
    return this.calculateE(
      glicko2Player.rating,
      glicko2Opponent.rating,
      glicko2Opponent.deviation
    );
  }

  /**
   * Apply rating decay for inactive players
   */
  applyRatingDecay(playerRating: PlayerRating, daysInactive: number): PlayerRating {
    if (daysInactive <= 0) {
      return playerRating;
    }

    // Increase deviation for inactive players
    const maxDeviation = this.INITIAL_DEVIATION;
    const decayRate = 0.1; // Adjust based on desired decay speed
    const additionalDeviation = Math.min(
      daysInactive * decayRate,
      maxDeviation - playerRating.deviation
    );

    return {
      rating: playerRating.rating,
      deviation: Math.min(playerRating.deviation + additionalDeviation, maxDeviation),
      volatility: playerRating.volatility
    };
  }

  /**
   * Get confidence interval for a rating
   */
  getConfidenceInterval(playerRating: PlayerRating, confidence: number = 0.95): {
    lower: number;
    upper: number;
  } {
    const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.58 : 1.96;
    const margin = z * playerRating.deviation;
    
    return {
      lower: Math.round(playerRating.rating - margin),
      upper: Math.round(playerRating.rating + margin)
    };
  }

  /**
   * Check if two players are reasonably matched
   */
  isReasonableMatch(player1: PlayerRating, player2: PlayerRating): boolean {
    const ratingDiff = Math.abs(player1.rating - player2.rating);
    const maxDiff = 400; // Adjust based on game balance requirements
    
    return ratingDiff <= maxDiff;
  }
}

export const ratingService = new RatingService();