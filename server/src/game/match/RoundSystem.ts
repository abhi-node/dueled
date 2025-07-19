/**
 * RoundSystem - Manages best-of-5 round progression and timing
 * 
 * Handles round timers, win conditions, intermissions, and match progression.
 * Integrates with GameStateManager to control match flow.
 */

import { logger } from '../../utils/logger.js';
import type { GameStateManager } from './GameState.js';
import type { GAME_CONSTANTS } from '../types.js';

export interface RoundResult {
  roundNumber: number;
  winnerId: string;
  reason: 'elimination' | 'timeout' | 'forfeit';
  duration: number;
  score: { player1: number; player2: number };
}

export interface MatchResult {
  matchId: string;
  winnerId: string;
  finalScore: { player1: number; player2: number };
  totalDuration: number;
  roundResults: RoundResult[];
}

export interface RoundSystemCallbacks {
  onRoundStart?: (roundNumber: number) => void;
  onRoundEnd?: (result: RoundResult) => void;
  onMatchEnd?: (result: MatchResult) => void;
  onIntermissionStart?: (nextRound: number) => void;
  onTimeWarning?: (timeLeft: number) => void; // Called at 30s, 10s, 5s remaining
}

export class RoundSystem {
  private gameState: GameStateManager;
  private matchId: string;
  private player1Id: string;
  private player2Id: string;
  private callbacks: RoundSystemCallbacks;
  
  // Timers
  private roundTimer: NodeJS.Timeout | null = null;
  private intermissionTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  
  // State
  private isActive: boolean = false;
  private roundResults: RoundResult[] = [];
  private startTime: number;
  
  // Constants
  private readonly ROUND_DURATION = 60; // seconds
  private readonly INTERMISSION_DURATION = 10; // seconds
  private readonly ROUNDS_TO_WIN = 3;
  private readonly MAX_ROUNDS = 5;
  private readonly TICK_INTERVAL = 1000; // 1 second
  
  constructor(
    gameState: GameStateManager,
    matchId: string,
    player1Id: string,
    player2Id: string,
    callbacks: RoundSystemCallbacks = {}
  ) {
    this.gameState = gameState;
    this.matchId = matchId;
    this.player1Id = player1Id;
    this.player2Id = player2Id;
    this.callbacks = callbacks;
    this.startTime = Date.now();
    
    logger.info(`RoundSystem initialized for match ${matchId}`, {
      player1Id,
      player2Id,
      roundDuration: this.ROUND_DURATION,
      roundsToWin: this.ROUNDS_TO_WIN
    });
  }
  
  // ============================================================================
  // MATCH CONTROL
  // ============================================================================
  
  /**
   * Start the match (begins round 1)
   */
  startMatch(): void {
    if (this.isActive) {
      logger.warn(`Match ${this.matchId} already active`);
      return;
    }
    
    this.isActive = true;
    this.startRound(1);
    
    logger.info(`Match ${this.matchId} started`);
  }
  
  /**
   * Force end the match (forfeit)
   */
  endMatch(winnerId: string, reason: 'forfeit' | 'disconnection' = 'forfeit'): void {
    this.cleanup();
    
    const matchResult: MatchResult = {
      matchId: this.matchId,
      winnerId,
      finalScore: this.getCurrentScore(),
      totalDuration: Date.now() - this.startTime,
      roundResults: [...this.roundResults]
    };
    
    // Update game state
    this.gameState.endMatch(winnerId);
    
    // Notify callback
    this.callbacks.onMatchEnd?.(matchResult);
    
    logger.info(`Match ${this.matchId} force ended`, {
      winnerId,
      reason,
      finalScore: matchResult.finalScore
    });
  }
  
  // ============================================================================
  // ROUND MANAGEMENT
  // ============================================================================
  
  /**
   * Start a specific round
   */
  private startRound(roundNumber: number): void {
    logger.info(`Starting round ${roundNumber} for match ${this.matchId}`);
    
    // Update game state
    this.gameState.startRound();
    
    // Start round timer
    this.startRoundTimer();
    
    // Start tick timer for time warnings
    this.startTickTimer();
    
    // Notify callback
    this.callbacks.onRoundStart?.(roundNumber);
  }
  
  /**
   * End the current round with a winner
   */
  endRound(winnerId: string, reason: 'elimination' | 'timeout' | 'forfeit'): void {
    const matchState = this.gameState.getMatchState();
    const roundNumber = matchState.currentRound;
    const duration = this.ROUND_DURATION - matchState.roundTimeLeft;
    
    // Stop timers
    this.stopRoundTimer();
    this.stopTickTimer();
    
    // Create round result
    const roundResult: RoundResult = {
      roundNumber,
      winnerId,
      reason,
      duration,
      score: { ...matchState.score }
    };
    
    this.roundResults.push(roundResult);
    
    // Update game state
    this.gameState.endRound(winnerId, reason);
    
    // Check if match is over
    const updatedMatchState = this.gameState.getMatchState();
    const maxScore = Math.max(updatedMatchState.score.player1, updatedMatchState.score.player2);
    
    if (maxScore >= this.ROUNDS_TO_WIN || roundNumber >= this.MAX_ROUNDS) {
      // Match is over
      this.completeMatch();
    } else {
      // Start intermission before next round
      this.startIntermission();
    }
    
    // Notify callback
    this.callbacks.onRoundEnd?.(roundResult);
    
    logger.info(`Round ${roundNumber} ended`, {
      winnerId,
      reason,
      duration,
      newScore: roundResult.score
    });
  }
  
  /**
   * Start intermission between rounds
   */
  private startIntermission(): void {
    const matchState = this.gameState.getMatchState();
    const nextRound = matchState.currentRound + 1;
    
    logger.info(`Starting intermission before round ${nextRound}`);
    
    // Notify callback
    this.callbacks.onIntermissionStart?.(nextRound);
    
    // Start intermission timer
    this.intermissionTimer = setTimeout(() => {
      this.startRound(nextRound);
    }, this.INTERMISSION_DURATION * 1000);
  }
  
  /**
   * Complete the entire match
   */
  private completeMatch(): void {
    const matchState = this.gameState.getMatchState();
    const winnerId = this.determineMatchWinner(matchState.score);
    
    this.cleanup();
    
    const matchResult: MatchResult = {
      matchId: this.matchId,
      winnerId,
      finalScore: matchState.score,
      totalDuration: Date.now() - this.startTime,
      roundResults: [...this.roundResults]
    };
    
    // Notify callback
    this.callbacks.onMatchEnd?.(matchResult);
    
    logger.info(`Match ${this.matchId} completed`, {
      winnerId,
      finalScore: matchResult.finalScore,
      totalDuration: matchResult.totalDuration,
      totalRounds: this.roundResults.length
    });
  }
  
  // ============================================================================
  // TIMER MANAGEMENT
  // ============================================================================
  
  /**
   * Start the round countdown timer
   */
  private startRoundTimer(): void {
    this.roundTimer = setTimeout(() => {
      logger.info(`Round timeout for match ${this.matchId}`);
      
      // Determine winner based on health/damage
      const winnerId = this.determineTimeoutWinner();
      this.endRound(winnerId, 'timeout');
    }, this.ROUND_DURATION * 1000);
  }
  
  /**
   * Stop the round timer
   */
  private stopRoundTimer(): void {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }
  
  /**
   * Start the tick timer for time warnings and updates
   */
  private startTickTimer(): void {
    this.tickTimer = setInterval(() => {
      const matchState = this.gameState.getMatchState();
      if (matchState.status !== 'active') {
        return;
      }
      
      // Decrement time
      const newTimeLeft = Math.max(0, matchState.roundTimeLeft - 1);
      
      // Check for time warnings
      if (newTimeLeft === 30 || newTimeLeft === 10 || newTimeLeft === 5) {
        this.callbacks.onTimeWarning?.(newTimeLeft);
        logger.info(`Time warning: ${newTimeLeft} seconds remaining`);
      }
      
      // Update game state time
      this.gameState.updateRoundTime(newTimeLeft);
      
    }, this.TICK_INTERVAL);
  }
  
  /**
   * Stop the tick timer
   */
  private stopTickTimer(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
  
  // ============================================================================
  // GAME EVENT HANDLERS
  // ============================================================================
  
  /**
   * Handle player elimination
   */
  onPlayerEliminated(deadPlayerId: string, killerId?: string): void {
    if (!this.isActive) {
      return;
    }
    
    const winnerId = killerId || this.getOtherPlayer(deadPlayerId);
    
    logger.info(`Player eliminated in round`, {
      deadPlayerId,
      killerId,
      winnerId
    });
    
    this.endRound(winnerId, 'elimination');
  }
  
  /**
   * Handle player disconnection
   */
  onPlayerDisconnected(playerId: string): void {
    if (!this.isActive) {
      return;
    }
    
    const winnerId = this.getOtherPlayer(playerId);
    
    logger.info(`Player disconnected during round`, {
      disconnectedPlayer: playerId,
      winnerId
    });
    
    this.endMatch(winnerId, 'disconnection');
  }
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  /**
   * Determine winner when round times out
   */
  private determineTimeoutWinner(): string {
    const players = this.gameState.getAllPlayers();
    const player1 = players.find(p => p.id === this.player1Id);
    const player2 = players.find(p => p.id === this.player2Id);
    
    if (!player1 || !player2) {
      logger.error('Missing player data for timeout determination');
      return this.player1Id; // Fallback
    }
    
    // Winner determination priority:
    // 1. Player with higher health percentage
    const player1HealthPct = player1.health / player1.maxHealth;
    const player2HealthPct = player2.health / player2.maxHealth;
    
    if (player1HealthPct !== player2HealthPct) {
      return player1HealthPct > player2HealthPct ? this.player1Id : this.player2Id;
    }
    
    // 2. Player with more damage dealt this round
    if (player1.roundDamageDealt !== player2.roundDamageDealt) {
      return player1.roundDamageDealt > player2.roundDamageDealt ? this.player1Id : this.player2Id;
    }
    
    // 3. Tie - default to player1
    logger.info('Timeout tie - defaulting to player1');
    return this.player1Id;
  }
  
  /**
   * Determine overall match winner
   */
  private determineMatchWinner(score: { player1: number; player2: number }): string {
    return score.player1 > score.player2 ? this.player1Id : this.player2Id;
  }
  
  /**
   * Get the other player's ID
   */
  private getOtherPlayer(playerId: string): string {
    return playerId === this.player1Id ? this.player2Id : this.player1Id;
  }
  
  /**
   * Get current score
   */
  private getCurrentScore(): { player1: number; player2: number } {
    const matchState = this.gameState.getMatchState();
    return { ...matchState.score };
  }
  
  /**
   * Clean up all timers and resources
   */
  private cleanup(): void {
    this.isActive = false;
    this.stopRoundTimer();
    this.stopTickTimer();
    
    if (this.intermissionTimer) {
      clearTimeout(this.intermissionTimer);
      this.intermissionTimer = null;
    }
  }
  
  // ============================================================================
  // PUBLIC STATE ACCESS
  // ============================================================================
  
  /**
   * Get current round information
   */
  getRoundInfo(): {
    currentRound: number;
    timeLeft: number;
    score: { player1: number; player2: number };
    status: string;
  } {
    const matchState = this.gameState.getMatchState();
    return {
      currentRound: matchState.currentRound,
      timeLeft: matchState.roundTimeLeft,
      score: { ...matchState.score },
      status: matchState.status
    };
  }
  
  /**
   * Get match statistics
   */
  getMatchStats(): {
    totalRounds: number;
    averageRoundDuration: number;
    roundResults: RoundResult[];
  } {
    const totalDuration = this.roundResults.reduce((sum, r) => sum + r.duration, 0);
    const averageDuration = this.roundResults.length > 0 ? totalDuration / this.roundResults.length : 0;
    
    return {
      totalRounds: this.roundResults.length,
      averageRoundDuration: averageDuration,
      roundResults: [...this.roundResults]
    };
  }
  
  /**
   * Check if match is currently active
   */
  isMatchActive(): boolean {
    return this.isActive;
  }
  
  /**
   * Destroy the round system and clean up resources
   */
  destroy(): void {
    logger.info(`Destroying RoundSystem for match ${this.matchId}`);
    this.cleanup();
  }
}