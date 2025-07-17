import { logger } from '../utils/logger.js';

export interface PlayerConnection {
  playerId: string;
  sessionId: string;
  lastSeen: number;
  socketId?: string;
}

export interface StalePlayer {
  matchId: string;
  playerId: string;
  sessionId: string;
  lastSeen: number;
  staleDuration: number;
}

/**
 * Tracks player connections and heartbeats for robust match lifecycle management
 * Replaces the ad-hoc 2s timer with formal heartbeat tracking
 */
class ConnectionTracker {
  private connections = new Map<string, Map<string, PlayerConnection>>();
  private readonly GRACE_PERIOD_MS = 30000; // 30 seconds

  /**
   * Updates the last seen timestamp for a player in a match
   */
  updateLastSeen(matchId: string, playerId: string, sessionId: string, socketId?: string): void {
    if (!this.connections.has(matchId)) {
      this.connections.set(matchId, new Map());
    }

    const matchConnections = this.connections.get(matchId)!;
    const now = Date.now();

    matchConnections.set(playerId, {
      playerId,
      sessionId,
      lastSeen: now,
      socketId
    });

    logger.debug(`Updated heartbeat for player ${playerId} in match ${matchId}`);
  }

  /**
   * Removes a player's socket ID but keeps the connection record for grace period
   */
  markDisconnected(matchId: string, playerId: string): void {
    const matchConnections = this.connections.get(matchId);
    if (matchConnections?.has(playerId)) {
      const connection = matchConnections.get(playerId)!;
      connection.socketId = undefined;
      logger.debug(`Marked player ${playerId} as disconnected in match ${matchId}`);
    }
  }

  /**
   * Gets all players who have been stale for longer than GRACE_PERIOD
   */
  getStalePlayers(): StalePlayer[] {
    const stalePlayers: StalePlayer[] = [];
    const now = Date.now();

    for (const [matchId, matchConnections] of this.connections) {
      for (const [playerId, connection] of matchConnections) {
        const staleDuration = now - connection.lastSeen;
        
        if (staleDuration > this.GRACE_PERIOD_MS) {
          stalePlayers.push({
            matchId,
            playerId,
            sessionId: connection.sessionId,
            lastSeen: connection.lastSeen,
            staleDuration
          });
        }
      }
    }

    return stalePlayers;
  }

  /**
   * Checks if all players in a match are stale
   */
  areAllPlayersStale(matchId: string): boolean {
    const matchConnections = this.connections.get(matchId);
    if (!matchConnections || matchConnections.size === 0) {
      return true; // No players = all stale
    }

    const now = Date.now();
    for (const connection of matchConnections.values()) {
      if (now - connection.lastSeen <= this.GRACE_PERIOD_MS) {
        return false; // At least one player is not stale
      }
    }

    return true;
  }

  /**
   * Gets all matches where all players are stale
   */
  getStaleMatches(): string[] {
    const staleMatches: string[] = [];

    for (const matchId of this.connections.keys()) {
      if (this.areAllPlayersStale(matchId)) {
        staleMatches.push(matchId);
      }
    }

    return staleMatches;
  }

  /**
   * Removes all connection tracking for a match
   */
  removeMatch(matchId: string): void {
    const removed = this.connections.delete(matchId);
    if (removed) {
      logger.debug(`Removed connection tracking for match ${matchId}`);
    }
  }

  /**
   * Gets the connection info for a player in a match
   */
  getPlayerConnection(matchId: string, playerId: string): PlayerConnection | undefined {
    return this.connections.get(matchId)?.get(playerId);
  }

  /**
   * Checks if a player is currently connected (has socket ID and recent heartbeat)
   */
  isPlayerConnected(matchId: string, playerId: string): boolean {
    const connection = this.getPlayerConnection(matchId, playerId);
    if (!connection || !connection.socketId) {
      return false;
    }

    const now = Date.now();
    return (now - connection.lastSeen) <= this.GRACE_PERIOD_MS;
  }

  /**
   * Gets all active matches being tracked
   */
  getActiveMatches(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Gets connection stats for debugging
   */
  getStats(): { totalMatches: number; totalConnections: number } {
    let totalConnections = 0;
    for (const matchConnections of this.connections.values()) {
      totalConnections += matchConnections.size;
    }

    return {
      totalMatches: this.connections.size,
      totalConnections
    };
  }
}

export const connectionTracker = new ConnectionTracker();