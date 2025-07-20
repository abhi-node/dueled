/**
 * GameStateAwareConnectionManager - Coordinates connection monitoring with game state
 * 
 * This class prevents false disconnections during legitimate game state transitions
 * by adjusting connection monitoring behavior based on the current round state.
 */

import { logger } from '../utils/logger.js';
import type { RoundState } from '../game/match/RoundSystem.js';
import { createConnectionPolicies, DEFAULT_CONNECTION_POLICY_CONFIG, type ConnectionPolicyConfig } from '../config/ConnectionPolicies.js';

export interface ConnectionPolicy {
  /** Whether heartbeat monitoring is active */
  heartbeatEnabled: boolean;
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  /** Grace period before disconnection in milliseconds */
  gracePeriod: number;
  /** Human-readable description of the policy */
  description: string;
}

export interface MatchConnectionState {
  matchId: string;
  currentState: RoundState;
  playerIds: Set<string>;
  lastStateChange: number;
  suspendedUntil?: number; // Optional temporary suspension
}

export interface PlayerConnectionInfo {
  playerId: string;
  matchId?: string;
  lastHeartbeat: number;
  connectionStartTime: number;
}

/**
 * Game-state-aware connection management system
 */
export class GameStateAwareConnectionManager {
  private matchStates = new Map<string, MatchConnectionState>();
  private playerConnections = new Map<string, PlayerConnectionInfo>();
  private connectionPolicies: Record<RoundState, ConnectionPolicy>;
  private config: ConnectionPolicyConfig;
  
  constructor(config: ConnectionPolicyConfig = DEFAULT_CONNECTION_POLICY_CONFIG) {
    this.config = config;
    this.connectionPolicies = createConnectionPolicies(config);
    
    logger.info('GameStateAwareConnectionManager initialized', {
      baseTimeout: config.baseConnectionTimeout,
      baseGracePeriod: config.baseGracePeriod,
      disableHeartbeatDuringCriticalStates: config.disableHeartbeatDuringCriticalStates
    });
  }
  
  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  /**
   * Update connection policies with new configuration
   */
  updateConfiguration(config: ConnectionPolicyConfig): void {
    this.config = config;
    this.connectionPolicies = createConnectionPolicies(config);
    
    logger.info('Connection policies updated', {
      baseTimeout: config.baseConnectionTimeout,
      baseGracePeriod: config.baseGracePeriod,
      disableHeartbeatDuringCriticalStates: config.disableHeartbeatDuringCriticalStates
    });
  }
  
  /**
   * Get current configuration
   */
  getConfiguration(): ConnectionPolicyConfig {
    return { ...this.config };
  }
  
  /**
   * Get current connection policies
   */
  getConnectionPolicies(): Record<RoundState, ConnectionPolicy> {
    return { ...this.connectionPolicies };
  }
  
  // ============================================================================
  // MATCH STATE MANAGEMENT
  // ============================================================================
  
  /**
   * Register a new match with initial players
   */
  registerMatch(matchId: string, playerIds: string[]): void {
    const matchState: MatchConnectionState = {
      matchId,
      currentState: 'waiting',
      playerIds: new Set(playerIds),
      lastStateChange: Date.now()
    };
    
    this.matchStates.set(matchId, matchState);
    
    // Associate players with this match
    for (const playerId of playerIds) {
      const playerInfo = this.playerConnections.get(playerId);
      if (playerInfo) {
        playerInfo.matchId = matchId;
      }
    }
    
    logger.info(`Match ${matchId} registered with game-state-aware connection monitoring`, {
      playerIds,
      initialPolicy: this.connectionPolicies.waiting.description
    });
  }
  
  /**
   * Update the round state for a match
   */
  updateMatchState(matchId: string, newState: RoundState): void {
    const matchState = this.matchStates.get(matchId);
    if (!matchState) {
      logger.warn(`Cannot update state for unknown match: ${matchId}`);
      return;
    }
    
    const oldState = matchState.currentState;
    const oldPolicy = this.connectionPolicies[oldState];
    const newPolicy = this.connectionPolicies[newState];
    
    matchState.currentState = newState;
    matchState.lastStateChange = Date.now();
    
    // Clear any temporary suspensions when transitioning states
    delete matchState.suspendedUntil;
    
    logger.info(`Match ${matchId} state transition: ${oldState} → ${newState}`, {
      oldPolicy: oldPolicy.description,
      newPolicy: newPolicy.description,
      heartbeatChange: oldPolicy.heartbeatEnabled !== newPolicy.heartbeatEnabled,
      timeoutChange: oldPolicy.connectionTimeout !== newPolicy.connectionTimeout
    });
  }
  
  /**
   * Temporarily suspend connection monitoring for a match
   */
  suspendMonitoring(matchId: string, durationMs: number): void {
    const matchState = this.matchStates.get(matchId);
    if (!matchState) {
      logger.warn(`Cannot suspend monitoring for unknown match: ${matchId}`);
      return;
    }
    
    const suspendUntil = Date.now() + durationMs;
    matchState.suspendedUntil = suspendUntil;
    
    logger.info(`Connection monitoring suspended for match ${matchId}`, {
      duration: durationMs,
      suspendedUntil: new Date(suspendUntil).toISOString()
    });
  }
  
  /**
   * Unregister a match (cleanup)
   */
  unregisterMatch(matchId: string): void {
    const matchState = this.matchStates.get(matchId);
    if (!matchState) {
      return;
    }
    
    // Clear match association from players
    for (const playerId of matchState.playerIds) {
      const playerInfo = this.playerConnections.get(playerId);
      if (playerInfo && playerInfo.matchId === matchId) {
        delete playerInfo.matchId;
      }
    }
    
    this.matchStates.delete(matchId);
    logger.info(`Match ${matchId} unregistered from connection monitoring`);
  }
  
  // ============================================================================
  // PLAYER CONNECTION MANAGEMENT
  // ============================================================================
  
  /**
   * Register a player connection
   */
  registerPlayer(playerId: string): void {
    const playerInfo: PlayerConnectionInfo = {
      playerId,
      lastHeartbeat: Date.now(),
      connectionStartTime: Date.now()
    };
    
    this.playerConnections.set(playerId, playerInfo);
    logger.debug(`Player ${playerId} registered for connection monitoring`);
  }
  
  /**
   * Update player heartbeat timestamp
   */
  updatePlayerHeartbeat(playerId: string): void {
    const playerInfo = this.playerConnections.get(playerId);
    if (playerInfo) {
      playerInfo.lastHeartbeat = Date.now();
    }
  }
  
  /**
   * Unregister a player connection
   */
  unregisterPlayer(playerId: string): void {
    this.playerConnections.delete(playerId);
    logger.debug(`Player ${playerId} unregistered from connection monitoring`);
  }
  
  // ============================================================================
  // CONNECTION MONITORING
  // ============================================================================
  
  /**
   * Check if a player should be considered disconnected
   */
  shouldDisconnectPlayer(playerId: string): {
    shouldDisconnect: boolean;
    reason: string;
    policy: ConnectionPolicy;
  } {
    const playerInfo = this.playerConnections.get(playerId);
    if (!playerInfo) {
      return {
        shouldDisconnect: true,
        reason: 'Player not registered',
        policy: this.connectionPolicies.waiting
      };
    }
    
    // Get current policy based on match state
    const policy = this.getCurrentPolicy(playerId);
    const now = Date.now();
    const timeSinceHeartbeat = now - playerInfo.lastHeartbeat;
    
    // Check if monitoring is temporarily suspended
    if (playerInfo.matchId) {
      const matchState = this.matchStates.get(playerInfo.matchId);
      if (matchState?.suspendedUntil && now < matchState.suspendedUntil) {
        return {
          shouldDisconnect: false,
          reason: 'Monitoring temporarily suspended',
          policy
        };
      }
    }
    
    // Check if heartbeat monitoring is disabled for current state
    if (!policy.heartbeatEnabled) {
      return {
        shouldDisconnect: false,
        reason: `Heartbeat monitoring disabled for state: ${this.getPlayerMatchState(playerId)}`,
        policy
      };
    }
    
    // Check if connection has timed out
    const hasTimedOut = timeSinceHeartbeat > policy.connectionTimeout;
    
    return {
      shouldDisconnect: hasTimedOut,
      reason: hasTimedOut 
        ? `Connection timeout (${timeSinceHeartbeat}ms > ${policy.connectionTimeout}ms)`
        : 'Connection healthy',
      policy
    };
  }
  
  /**
   * Get connection policy for a specific player based on their current state
   */
  getCurrentPolicy(playerId: string): ConnectionPolicy {
    const playerInfo = this.playerConnections.get(playerId);
    
    if (!playerInfo?.matchId) {
      // Player not in a match, use waiting policy
      return this.connectionPolicies.waiting;
    }
    
    const matchState = this.matchStates.get(playerInfo.matchId);
    if (!matchState) {
      // Match not found, fallback to waiting policy
      return this.connectionPolicies.waiting;
    }
    
    return this.connectionPolicies[matchState.currentState];
  }
  
  /**
   * Get the current round state for a player
   */
  private getPlayerMatchState(playerId: string): RoundState | 'none' {
    const playerInfo = this.playerConnections.get(playerId);
    if (!playerInfo?.matchId) {
      return 'none';
    }
    
    const matchState = this.matchStates.get(playerInfo.matchId);
    return matchState?.currentState || 'none';
  }
  
  // ============================================================================
  // MONITORING UTILITIES
  // ============================================================================
  
  /**
   * Get all players that need disconnection checking
   */
  getPlayersForMonitoring(): string[] {
    return Array.from(this.playerConnections.keys());
  }
  
  /**
   * Get monitoring statistics for debugging
   */
  getMonitoringStats(): {
    totalPlayers: number;
    totalMatches: number;
    playersInMatches: number;
    suspendedMatches: number;
    policySummary: Record<RoundState, number>;
  } {
    const now = Date.now();
    const suspendedMatches = Array.from(this.matchStates.values())
      .filter(m => m.suspendedUntil && now < m.suspendedUntil).length;
    
    // Count players by state
    const policySummary: Record<RoundState, number> = {
      waiting: 0,
      countdown: 0,
      active: 0,
      ended: 0,
      intermission: 0
    };
    
    let playersInMatches = 0;
    for (const playerInfo of this.playerConnections.values()) {
      if (playerInfo.matchId) {
        playersInMatches++;
        const state = this.getPlayerMatchState(playerInfo.playerId);
        if (state !== 'none') {
          policySummary[state as RoundState]++;
        }
      }
    }
    
    return {
      totalPlayers: this.playerConnections.size,
      totalMatches: this.matchStates.size,
      playersInMatches,
      suspendedMatches,
      policySummary
    };
  }
}