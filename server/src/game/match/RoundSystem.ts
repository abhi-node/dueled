/**
 * RoundSystem - Manages best-of-5 round progression and timing
 * 
 * Handles round timers, win conditions, intermissions, and match progression.
 * Integrates with GameStateManager to control match flow.
 */

import { logger } from '../../utils/logger.js';
import type { GameStateManager } from './GameState.js';
import type { GAME_CONSTANTS } from '../types.js';

export type RoundState = 'waiting' | 'countdown' | 'active' | 'ended' | 'intermission';

export interface RoundResult {
  roundNumber: number;
  winnerId: string;
  winnerUsername: string;
  reason: 'elimination' | 'timeout' | 'forfeit';
  duration: number;
  score: { player1: number; player2: number };
}

export interface MatchResult {
  matchId: string;
  winnerId: string;
  winnerUsername: string;
  finalScore: { player1: number; player2: number };
  totalDuration: number;
  roundResults: RoundResult[];
}

export interface RoundSystemCallbacks {
  onRoundStart?: (roundNumber: number) => void;
  onRoundEnd?: (result: RoundResult) => void;
  onMatchEnd?: (result: MatchResult) => void;
  onMatchCompletelyFinished?: (matchId: string) => void; // Called after ELO updates and overlay
  onIntermissionStart?: (nextRound: number) => void;
  onTimeWarning?: (timeLeft: number) => void; // Called at 30s, 10s, 5s remaining
  onCountdownTick?: (roundNumber: number, countdown: number) => void; // Called during 3-2-1 countdown
  onCountdownComplete?: (roundNumber: number) => void; // Called when countdown finishes
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
  private countdownTimer: NodeJS.Timeout | null = null;
  
  // State
  private isActive: boolean = false;
  private isCountdownActive: boolean = false;
  private currentCountdown: number = 0;
  private roundState: RoundState = 'waiting';
  private roundResults: RoundResult[] = [];
  private startTime: number;
  
  // Constants
  private readonly ROUND_DURATION = 60; // seconds
  private readonly INTERMISSION_DURATION = 10; // seconds
  private readonly COUNTDOWN_DURATION = 3; // seconds (3-2-1)
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
    
    // Get winner username from game state
    const players = this.gameState.getAllPlayers();
    const winner = players.find(p => p.id === winnerId);
    const winnerUsername = winner?.username || 'Unknown Player';
    
    const matchResult: MatchResult = {
      matchId: this.matchId,
      winnerId,
      winnerUsername,
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
  // STATE TRANSITION MANAGEMENT
  // ============================================================================
  
  /**
   * Transition to a new round state
   */
  private transitionToState(newState: RoundState): void {
    const oldState = this.roundState;
    this.roundState = newState;
    
    logger.info(`Round state transition: ${oldState} → ${newState}`, {
      matchId: this.matchId,
      roundNumber: this.gameState.getMatchState().currentRound
    });
    
    // Update legacy state flags for compatibility
    this.updateLegacyFlags();
  }
  
  /**
   * Update legacy boolean flags based on round state
   */
  private updateLegacyFlags(): void {
    this.isCountdownActive = this.roundState === 'countdown';
    this.isActive = this.roundState === 'active';
  }
  
  /**
   * Get current round state
   */
  getCurrentRoundState(): RoundState {
    return this.roundState;
  }
  
  // ============================================================================
  // ROUND MANAGEMENT
  // ============================================================================
  
  /**
   * Start a specific round with countdown (checks player readiness first)
   */
  private startRound(roundNumber: number): void {
    logger.info(`🚀 startRound(${roundNumber}) called`);
    
    // Safety check: Don't start if match should be over
    if (this.shouldMatchBeOver()) {
      logger.warn(`❌ EARLY MATCH END: Attempted to start round ${roundNumber} but match should be over`);
      this.completeMatch();
      return;
    }
    
    // Player readiness is checked at MatchManager level before calling startMatch()
    // No need for additional checks here since rounds should only start when ready
    
    logger.info(`Starting countdown for round ${roundNumber} in match ${this.matchId}`);
    
    // Transition to countdown state
    this.transitionToState('countdown');
    
    // Start with 3-2-1 countdown
    this.startCountdown(roundNumber);
  }
  
  /**
   * Check if match should be over due to win conditions
   */
  private shouldMatchBeOver(): boolean {
    const matchState = this.gameState.getMatchState();
    const { player1: score1, player2: score2 } = matchState.score;
    const maxScore = Math.max(score1, score2);
    const currentRound = matchState.currentRound;
    
    const shouldEnd = maxScore >= this.ROUNDS_TO_WIN || currentRound >= this.MAX_ROUNDS;
    
    logger.info(`🚨 shouldMatchBeOver() called:`, {
      score1,
      score2,
      maxScore,
      currentRound,
      roundsToWin: this.ROUNDS_TO_WIN,
      maxRounds: this.MAX_ROUNDS,
      winCondition: maxScore >= this.ROUNDS_TO_WIN,
      roundCondition: currentRound >= this.MAX_ROUNDS,
      shouldEnd
    });
    
    return shouldEnd;
  }
  
  /**
   * Start the 3-2-1 countdown before round begins
   */
  private startCountdown(roundNumber: number): void {
    this.isCountdownActive = true;
    this.currentCountdown = this.COUNTDOWN_DURATION;
    
    logger.info(`Starting countdown for round ${roundNumber}: ${this.currentCountdown}`);
    
    // Notify initial countdown
    this.callbacks.onCountdownTick?.(roundNumber, this.currentCountdown);
    
    // Start countdown interval
    this.countdownTimer = setInterval(() => {
      this.currentCountdown--;
      
      if (this.currentCountdown > 0) {
        // Continue countdown
        logger.info(`Countdown: ${this.currentCountdown}`);
        this.callbacks.onCountdownTick?.(roundNumber, this.currentCountdown);
      } else {
        // Countdown complete - start the actual round
        this.stopCountdownTimer();
        
        logger.info(`Countdown complete - starting round ${roundNumber}`);
        this.callbacks.onCountdownComplete?.(roundNumber);
        
        // Transition to active state and start the round
        this.transitionToState('active');
        this.beginRound(roundNumber);
      }
    }, 1000);
  }
  
  /**
   * Begin the actual round after countdown completes
   */
  private beginRound(roundNumber: number): void {
    logger.info(`Round ${roundNumber} active for match ${this.matchId}`);
    
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
    
    // Transition to ended state
    this.transitionToState('ended');
    
    // Stop timers
    this.stopRoundTimer();
    this.stopTickTimer();
    
    // Get winner username from game state
    const players = this.gameState.getAllPlayers();
    const winner = players.find(p => p.id === winnerId);
    const winnerUsername = winner?.username || 'Unknown Player';
    
    // Update game state FIRST
    this.gameState.endRound(winnerId, reason);
    
    // Get updated state with new score
    const updatedMatchState = this.gameState.getMatchState();
    
    // Create round result with UPDATED score
    const roundResult: RoundResult = {
      roundNumber,
      winnerId,
      winnerUsername,
      reason,
      duration,
      score: { ...updatedMatchState.score }
    };
    
    this.roundResults.push(roundResult);
    const { player1: score1, player2: score2 } = updatedMatchState.score;
    const maxScore = Math.max(score1, score2);
    
    // Debug logging to trace the exact decision making
    logger.info(`🔍 MATCH END CHECK:`, {
      roundNumber,
      score1,
      score2,
      maxScore,
      roundsToWin: this.ROUNDS_TO_WIN,
      currentRoundAfterIncrement: updatedMatchState.currentRound,
      maxRounds: this.MAX_ROUNDS,
      shouldEndForWins: maxScore >= this.ROUNDS_TO_WIN,
      shouldEndForMaxRounds: updatedMatchState.currentRound > this.MAX_ROUNDS
    });
    
    // Check for 3-win match limit (primary condition)
    if (maxScore >= this.ROUNDS_TO_WIN) {
      const matchWinner = score1 >= this.ROUNDS_TO_WIN ? this.player1Id : this.player2Id;
      logger.info(`🏆 MATCH END DECISION: ${matchWinner} reached ${this.ROUNDS_TO_WIN} wins`, {
        finalScore: { player1: score1, player2: score2 },
        roundsPlayed: roundNumber
      });
      this.completeMatch();
    }
    // Check for max rounds failsafe (only after all 5 rounds completed)
    else if (updatedMatchState.currentRound > this.MAX_ROUNDS) {
      const matchWinner = score1 > score2 ? this.player1Id : 
                         score2 > score1 ? this.player2Id : this.player1Id; // Tie goes to player1
      logger.info(`🏆 MATCH END DECISION: Reached maximum ${this.MAX_ROUNDS} rounds`, {
        finalScore: { player1: score1, player2: score2 },
        winner: matchWinner,
        totalRoundsPlayed: this.MAX_ROUNDS
      });
      this.completeMatch();
    }
    // Continue to next round
    else {
      logger.info(`▶️ CONTINUING TO NEXT ROUND: Round ${roundNumber} complete. Score: ${score1}-${score2}.`);
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
    const nextRound = matchState.currentRound; // currentRound was already incremented in endRound()
    
    // Transition to intermission state
    this.transitionToState('intermission');
    
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
    
    // Get winner username from game state
    const players = this.gameState.getAllPlayers();
    const winner = players.find(p => p.id === winnerId);
    const winnerUsername = winner?.username || 'Unknown Player';
    
    const matchResult: MatchResult = {
      matchId: this.matchId,
      winnerId,
      winnerUsername,
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
    
    // Schedule final cleanup after ELO updates and match end overlay
    setTimeout(() => {
      logger.info(`🧹 Initiating final match cleanup for ${this.matchId}`);
      this.callbacks.onMatchCompletelyFinished?.(this.matchId);
    }, 5000); // 5 second delay for ELO updates and overlay display
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
  
  /**
   * Stop the countdown timer
   */
  private stopCountdownTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
  
  // ============================================================================
  // GAME EVENT HANDLERS
  // ============================================================================
  
  /**
   * Handle player elimination
   */
  onPlayerEliminated(deadPlayerId: string, killerId?: string): void {
    if (!this.isActive || this.isCountdownActive) {
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
   * Check for round end conditions (health ≤ 0 or timer = 0)
   */
  checkRoundEndConditions(): void {
    if (!this.isActive || this.isCountdownActive) {
      return;
    }
    
    const players = this.gameState.getAllPlayers();
    const alivePlayers = players.filter(p => p.isAlive && p.health > 0);
    const deadPlayers = players.filter(p => !p.isAlive || p.health <= 0);
    
    // Check for elimination scenario
    if (alivePlayers.length === 0) {
      // Both players died simultaneously - use timeout logic
      logger.info('Both players eliminated simultaneously - using timeout logic');
      const winnerId = this.determineTimeoutWinner();
      this.endRound(winnerId, 'elimination');
      return;
    }
    
    if (alivePlayers.length === 1) {
      // One player eliminated
      const winnerId = alivePlayers[0].id;
      const deadPlayerId = deadPlayers[0]?.id || 'unknown';
      
      logger.info(`Player eliminated by health check`, {
        deadPlayerId,
        winnerId
      });
      
      this.endRound(winnerId, 'elimination');
      return;
    }
    
    // Check for timer timeout
    const matchState = this.gameState.getMatchState();
    if (matchState.roundTimeLeft <= 0) {
      logger.info('Round ended by timeout');
      const winnerId = this.determineTimeoutWinner();
      this.endRound(winnerId, 'timeout');
      return;
    }
  }
  
  /**
   * Handle player disconnection
   */
  onPlayerDisconnected(playerId: string): void {
    // Handle disconnection during any phase of the match
    const winnerId = this.getOtherPlayer(playerId);
    
    logger.info(`🔌 Player disconnected from match ${this.matchId}`, {
      disconnectedPlayer: playerId,
      winnerId,
      currentState: this.roundState,
      isMatchActive: this.isActive
    });
    
    // Immediately end the match and declare the remaining player as winner
    this.endMatch(winnerId, 'disconnection');
  }
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  /**
   * Determine winner when round times out or both players die
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
    // 1. Player still alive (if one died)
    if (player1.isAlive && !player2.isAlive) {
      logger.info('Player1 wins by survival');
      return this.player1Id;
    }
    if (player2.isAlive && !player1.isAlive) {
      logger.info('Player2 wins by survival');
      return this.player2Id;
    }
    
    // 2. Player with higher health percentage
    const player1HealthPct = player1.health / player1.maxHealth;
    const player2HealthPct = player2.health / player2.maxHealth;
    
    if (player1HealthPct !== player2HealthPct) {
      const winnerId = player1HealthPct > player2HealthPct ? this.player1Id : this.player2Id;
      logger.info(`Winner by health: ${winnerId} (${player1HealthPct.toFixed(2)} vs ${player2HealthPct.toFixed(2)})`);
      return winnerId;
    }
    
    // 3. Player with more damage dealt this round
    if (player1.roundDamageDealt !== player2.roundDamageDealt) {
      const winnerId = player1.roundDamageDealt > player2.roundDamageDealt ? this.player1Id : this.player2Id;
      logger.info(`Winner by damage dealt: ${winnerId} (${player1.roundDamageDealt} vs ${player2.roundDamageDealt})`);
      return winnerId;
    }
    
    // 4. Tie - default to player1
    logger.info('Perfect tie - defaulting to player1');
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
    this.transitionToState('ended');
    this.stopRoundTimer();
    this.stopTickTimer();
    this.stopCountdownTimer();
    
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
    roundState: RoundState;
    isCountdownActive: boolean;
    countdownValue: number;
  } {
    const matchState = this.gameState.getMatchState();
    return {
      currentRound: matchState.currentRound,
      timeLeft: matchState.roundTimeLeft,
      score: { ...matchState.score },
      status: matchState.status,
      roundState: this.roundState,
      isCountdownActive: this.isCountdownActive,
      countdownValue: this.currentCountdown
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