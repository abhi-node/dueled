/**
 * RoundSystem - Manages best of 3/5 rounds with 60 second timer
 * 
 * Handles round progression, scoring, and time limits for arena combat
 * Designed for simple 1v1 Archer vs Berserker matches
 */

import { logger } from '../../utils/logger.js';

export interface RoundConfig {
  maxRounds: 3 | 5;           // Best of 3 or 5
  roundDuration: number;      // Round time in seconds
  intermissionDuration: number; // Time between rounds in seconds
  suddenDeathDuration: number;  // Overtime duration in seconds
}

export interface RoundScore {
  player1: number;            // Rounds won by player 1
  player2: number;            // Rounds won by player 2
}

export interface RoundResult {
  roundNumber: number;
  winnerId: string | null;    // null for draw/timeout
  reason: 'elimination' | 'timeout' | 'forfeit';
  duration: number;           // Actual round duration
  finalHealths: {
    player1: number;
    player2: number;
  };
}

export interface MatchResult {
  matchId: string;
  winnerId: string | null;
  finalScore: RoundScore;
  rounds: RoundResult[];
  totalDuration: number;
  reason: 'completed' | 'forfeit' | 'disconnect';
}

export type RoundState = 
  | 'waiting'        // Waiting for players
  | 'intermission'   // Between rounds
  | 'starting'       // Round countdown
  | 'active'         // Round in progress
  | 'sudden_death'   // Overtime
  | 'ending'         // Round just ended
  | 'completed';     // Match completed

export interface MatchState {
  currentRound: number;
  timeLeft: number;
  score: { player1: number; player2: number };
  state: RoundState;
}

export interface RoundCallbacks {
  onRoundStart?: (roundNumber: number) => void;
  onRoundEnd?: (result: RoundResult) => void;
  onMatchEnd?: (result: MatchResult) => void;
  onTimeWarning?: (timeLeft: number) => void;
  onStateChange?: (state: RoundState, timeLeft: number) => void;
}

/**
 * RoundSystem - Manages round-based combat with timing and scoring
 */
export class RoundSystem {
  private config: RoundConfig;
  private callbacks: RoundCallbacks = {};
  
  // Match state
  private matchId: string;
  private player1Id: string;
  private player2Id: string;
  
  // Round tracking
  private currentRound: number = 0;
  private score: RoundScore = { player1: 0, player2: 0 };
  private rounds: RoundResult[] = [];
  private state: RoundState = 'waiting';
  
  // Timing
  private roundStartTime: number = 0;
  private roundEndTime: number = 0;
  private timeLeft: number = 0;
  private timer: NodeJS.Timeout | null = null;
  
  // Match tracking
  private matchStartTime: number = 0;
  private isMatchCompleted: boolean = false;
  
  constructor(
    matchId: string,
    player1Id: string,
    player2Id: string,
    config?: Partial<RoundConfig>
  ) {
    this.matchId = matchId;
    this.player1Id = player1Id;
    this.player2Id = player2Id;
    
    // Default configuration
    this.config = {
      maxRounds: 3,
      roundDuration: 60,        // 60 seconds per round
      intermissionDuration: 10, // 10 seconds between rounds
      suddenDeathDuration: 30,  // 30 seconds sudden death
      ...config
    };
    
    logger.info(`RoundSystem initialized for match ${matchId}: Best of ${this.config.maxRounds}`);
  }
  
  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: RoundCallbacks): void {
    this.callbacks = { ...callbacks };
  }
  
  /**
   * Start the match
   */
  startMatch(): void {
    if (this.state !== 'waiting') {
      logger.warn(`Cannot start match ${this.matchId}: Already started`);
      return;
    }
    
    this.matchStartTime = Date.now();
    this.startNextRound();
  }
  
  /**
   * Start the next round
   */
  private startNextRound(): void {
    if (this.isMatchCompleted) return;
    
    this.currentRound++;
    this.state = 'intermission';
    
    logger.info(`Starting round ${this.currentRound} for match ${this.matchId}`);
    
    // Intermission period (skip for first round)
    if (this.currentRound > 1) {
      this.timeLeft = this.config.intermissionDuration;
      this.startTimer(() => this.beginRound());
    } else {
      this.beginRound();
    }
  }
  
  /**
   * Begin the actual round
   */
  private beginRound(): void {
    this.state = 'starting';
    this.timeLeft = 3; // 3 second countdown
    
    this.startTimer(() => {
      this.state = 'active';
      this.roundStartTime = Date.now();
      this.timeLeft = this.config.roundDuration;
      
      if (this.callbacks.onRoundStart) {
        this.callbacks.onRoundStart(this.currentRound);
      }
      
      // Start round timer
      this.startTimer(() => this.handleRoundTimeout());
    });
  }
  
  /**
   * Handle round timeout
   */
  private handleRoundTimeout(): void {
    if (this.state !== 'active') return;
    
    logger.info(`Round ${this.currentRound} timed out in match ${this.matchId}`);
    
    // Start sudden death
    this.state = 'sudden_death';
    this.timeLeft = this.config.suddenDeathDuration;
    
    if (this.callbacks.onTimeWarning) {
      this.callbacks.onTimeWarning(this.timeLeft);
    }
    
    this.startTimer(() => this.handleSuddenDeathTimeout());
  }
  
  /**
   * Handle sudden death timeout
   */
  private handleSuddenDeathTimeout(): void {
    if (this.state !== 'sudden_death') return;
    
    logger.info(`Sudden death timeout in round ${this.currentRound} for match ${this.matchId}`);
    
    // End round as draw
    this.endRound(null, 'timeout', { player1: 50, player2: 50 }); // Assume equal health
  }
  
  /**
   * End current round with result
   */
  endRound(
    winnerId: string | null,
    reason: 'elimination' | 'timeout' | 'forfeit',
    finalHealths: { player1: number; player2: number }
  ): void {
    if (this.state !== 'active' && this.state !== 'sudden_death') {
      logger.warn(`Cannot end round: Invalid state ${this.state}`);
      return;
    }
    
    this.clearTimer();
    this.state = 'ending';
    this.roundEndTime = Date.now();
    
    const duration = (this.roundEndTime - this.roundStartTime) / 1000;
    
    // Update score
    if (winnerId === this.player1Id) {
      this.score.player1++;
    } else if (winnerId === this.player2Id) {
      this.score.player2++;
    }
    
    // Create round result
    const roundResult: RoundResult = {
      roundNumber: this.currentRound,
      winnerId,
      reason,
      duration,
      finalHealths
    };
    
    this.rounds.push(roundResult);
    
    logger.info(`Round ${this.currentRound} ended: ${winnerId ? `Winner: ${winnerId}` : 'Draw'} (${reason})`);
    
    if (this.callbacks.onRoundEnd) {
      this.callbacks.onRoundEnd(roundResult);
    }
    
    // Check if match is completed
    const roundsToWin = Math.ceil(this.config.maxRounds / 2);
    
    if (this.score.player1 >= roundsToWin || this.score.player2 >= roundsToWin) {
      this.endMatch('completed');
    } else if (this.currentRound >= this.config.maxRounds) {
      // Maximum rounds reached, determine winner by score
      this.endMatch('completed');
    } else {
      // Continue to next round
      setTimeout(() => this.startNextRound(), 2000); // 2 second delay
    }
  }
  
  /**
   * End the entire match
   */
  private endMatch(reason: 'completed' | 'forfeit' | 'disconnect'): void {
    this.clearTimer();
    this.state = 'completed';
    this.isMatchCompleted = true;
    
    const totalDuration = (Date.now() - this.matchStartTime) / 1000;
    
    // Determine match winner
    let winnerId: string | null = null;
    if (this.score.player1 > this.score.player2) {
      winnerId = this.player1Id;
    } else if (this.score.player2 > this.score.player1) {
      winnerId = this.player2Id;
    }
    // null for tie
    
    const matchResult: MatchResult = {
      matchId: this.matchId,
      winnerId,
      finalScore: { ...this.score },
      rounds: [...this.rounds],
      totalDuration,
      reason
    };
    
    logger.info(`Match ${this.matchId} completed: ${winnerId ? `Winner: ${winnerId}` : 'Tie'} (${this.score.player1}-${this.score.player2})`);
    
    if (this.callbacks.onMatchEnd) {
      this.callbacks.onMatchEnd(matchResult);
    }
  }
  
  /**
   * Forfeit the match
   */
  forfeitMatch(playerId: string): void {
    if (this.isMatchCompleted) return;
    
    this.clearTimer();
    
    // Award rounds to opponent
    const opponentId = playerId === this.player1Id ? this.player2Id : this.player1Id;
    const roundsNeeded = Math.ceil(this.config.maxRounds / 2);
    
    if (playerId === this.player1Id) {
      this.score.player2 = roundsNeeded;
    } else {
      this.score.player1 = roundsNeeded;
    }
    
    logger.info(`Player ${playerId} forfeited match ${this.matchId}`);
    this.endMatch('forfeit');
  }
  
  /**
   * Handle player disconnect
   */
  handleDisconnect(playerId: string): void {
    if (this.isMatchCompleted) return;
    
    logger.info(`Player ${playerId} disconnected from match ${this.matchId}`);
    this.endMatch('disconnect');
  }
  
  /**
   * Start countdown timer
   */
  private startTimer(onComplete: () => void): void {
    this.clearTimer();
    
    const interval = 1000; // 1 second intervals
    
    this.timer = setInterval(() => {
      this.timeLeft--;
      
      // Emit state change
      if (this.callbacks.onStateChange) {
        this.callbacks.onStateChange(this.state, this.timeLeft);
      }
      
      // Time warnings
      if (this.state === 'active' && this.callbacks.onTimeWarning) {
        if (this.timeLeft === 30 || this.timeLeft === 10 || this.timeLeft <= 5) {
          this.callbacks.onTimeWarning(this.timeLeft);
        }
      }
      
      // Timer complete
      if (this.timeLeft <= 0) {
        this.clearTimer();
        onComplete();
      }
    }, interval);
  }
  
  /**
   * Clear current timer
   */
  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  
  /**
   * Get current state
   */
  getState(): {
    state: RoundState;
    currentRound: number;
    score: RoundScore;
    timeLeft: number;
    maxRounds: number;
  } {
    return {
      state: this.state,
      currentRound: this.currentRound,
      score: { ...this.score },
      timeLeft: this.timeLeft,
      maxRounds: this.config.maxRounds
    };
  }
  
  /**
   * Get round history
   */
  getRounds(): RoundResult[] {
    return [...this.rounds];
  }
  
  /**
   * Get match statistics
   */
  getStats(): {
    totalRounds: number;
    averageRoundDuration: number;
    longestRound: number;
    shortestRound: number;
  } {
    if (this.rounds.length === 0) {
      return {
        totalRounds: 0,
        averageRoundDuration: 0,
        longestRound: 0,
        shortestRound: 0
      };
    }
    
    const durations = this.rounds.map(r => r.duration);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    
    return {
      totalRounds: this.rounds.length,
      averageRoundDuration: totalDuration / this.rounds.length,
      longestRound: Math.max(...durations),
      shortestRound: Math.min(...durations)
    };
  }
  
  /**
   * Update configuration
   */
  /**
   * Update round timer and state
   */
  update(deltaTime: number): void {
    if (this.state === 'active' && this.timer) {
      this.timeLeft = Math.max(0, this.timeLeft - deltaTime / 1000);
      
      if (this.timeLeft <= 0) {
        this.endRound(null, 'timeout', { player1: 50, player2: 50 });
      }
    }
  }

  /**
   * Check if match is complete
   */
  isMatchComplete(): boolean {
    return this.isMatchCompleted;
  }

  /**
   * Get current match state for spectators
   */
  getMatchState(): MatchState {
    return {
      currentRound: this.currentRound,
      timeLeft: this.timeLeft,
      score: { ...this.score },
      state: this.state
    };
  }

  updateConfig(newConfig: Partial<RoundConfig>): void {
    if (this.state !== 'waiting') {
      logger.warn('Cannot update config: Match already started');
      return;
    }
    
    this.config = { ...this.config, ...newConfig };
    logger.info(`Updated round config for match ${this.matchId}:`, this.config);
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.clearTimer();
    this.callbacks = {};
    logger.info(`RoundSystem destroyed for match ${this.matchId}`);
  }
}