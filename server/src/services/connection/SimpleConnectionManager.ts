import { Socket } from 'socket.io';
import { logger } from '../../utils/logger.js';

/**
 * SimpleConnectionManager - Clean, scalable connection management
 * 
 * Features:
 * - Simple connection tracking without complex heartbeats
 * - 2-second grace period for disconnections
 * - Clean resource cleanup
 * - Match termination on player disconnect
 * - Scalable for spectator support
 */

export interface ConnectionInfo {
  playerId: string;
  username: string;
  socket: Socket;
  connectedAt: number;
  lastActivity: number;
  matchId?: string;
  isInMatch: boolean;
}

export interface DisconnectionGracePeriod {
  playerId: string;
  matchId: string;
  disconnectedAt: number;
  timeoutId: NodeJS.Timeout;
  gracePeriodMs: number;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  matchConnections: number;
  averageSessionDuration: number;
  disconnectionsInGracePeriod: number;
}

/**
 * SimpleConnectionManager - Clean WebSocket connection management
 */
export class SimpleConnectionManager {
  private connections: Map<string, ConnectionInfo> = new Map();
  private gracePeriods: Map<string, DisconnectionGracePeriod> = new Map();
  private connectionHistory: Array<{ playerId: string; duration: number }> = [];
  private readonly GRACE_PERIOD_MS = 2000; // 2 seconds
  private readonly MAX_HISTORY_SIZE = 1000;

  constructor() {
    logger.info('SimpleConnectionManager initialized');
  }

  /**
   * Register new connection
   */
  addConnection(playerId: string, username: string, socket: Socket): void {
    // Remove any existing connection for this player
    this.removeConnection(playerId);

    // Cancel any grace period for this player
    this.cancelGracePeriod(playerId);

    const connectionInfo: ConnectionInfo = {
      playerId,
      username,
      socket,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      isInMatch: false
    };

    this.connections.set(playerId, connectionInfo);
    
    // Set up socket event handlers
    this.setupSocketHandlers(connectionInfo);
    
    logger.info(`Player connected: ${username} (${playerId})`);
  }

  /**
   * Remove connection and handle cleanup
   */
  removeConnection(playerId: string): boolean {
    const connection = this.connections.get(playerId);
    if (!connection) return false;

    // Calculate session duration for stats
    const sessionDuration = Date.now() - connection.connectedAt;
    this.connectionHistory.push({ playerId, duration: sessionDuration });
    
    // Keep history manageable
    if (this.connectionHistory.length > this.MAX_HISTORY_SIZE) {
      this.connectionHistory = this.connectionHistory.slice(-500);
    }

    // Handle match disconnection
    if (connection.isInMatch && connection.matchId) {
      this.handleMatchDisconnection(connection);
    }

    // Remove connection
    this.connections.delete(playerId);
    
    logger.info(`Player disconnected: ${connection.username} (${playerId}) - Session: ${Math.round(sessionDuration / 1000)}s`);
    return true;
  }

  /**
   * Handle match disconnection with grace period
   */
  private handleMatchDisconnection(connection: ConnectionInfo): void {
    if (!connection.matchId) return;

    // Start grace period
    const gracePeriod: DisconnectionGracePeriod = {
      playerId: connection.playerId,
      matchId: connection.matchId,
      disconnectedAt: Date.now(),
      gracePeriodMs: this.GRACE_PERIOD_MS,
      timeoutId: setTimeout(() => {
        this.finalizeMatchDisconnection(connection.playerId, connection.matchId!);
      }, this.GRACE_PERIOD_MS)
    };

    this.gracePeriods.set(connection.playerId, gracePeriod);
    
    logger.info(`Grace period started for ${connection.username} in match ${connection.matchId} (${this.GRACE_PERIOD_MS}ms)`);
    
    // Notify other players in match about disconnection
    this.notifyMatchDisconnection(connection.matchId, connection.playerId, this.GRACE_PERIOD_MS);
  }

  /**
   * Cancel grace period (player reconnected)
   */
  private cancelGracePeriod(playerId: string): boolean {
    const gracePeriod = this.gracePeriods.get(playerId);
    if (!gracePeriod) return false;

    clearTimeout(gracePeriod.timeoutId);
    this.gracePeriods.delete(playerId);
    
    logger.info(`Grace period cancelled for ${playerId} (reconnected)`);
    
    // Notify match that player reconnected
    this.notifyMatchReconnection(gracePeriod.matchId, playerId);
    return true;
  }

  /**
   * Finalize match disconnection after grace period
   */
  private finalizeMatchDisconnection(playerId: string, matchId: string): void {
    const gracePeriod = this.gracePeriods.get(playerId);
    if (!gracePeriod) return;

    this.gracePeriods.delete(playerId);
    
    logger.info(`Match ${matchId} terminated - Player ${playerId} did not reconnect`);
    
    // Terminate match and clean up
    this.terminateMatch(matchId, playerId);
  }

  /**
   * Set player as in match
   */
  setPlayerInMatch(playerId: string, matchId: string): boolean {
    const connection = this.connections.get(playerId);
    if (!connection) return false;

    connection.isInMatch = true;
    connection.matchId = matchId;
    connection.lastActivity = Date.now();
    
    logger.debug(`Player ${playerId} joined match ${matchId}`);
    return true;
  }

  /**
   * Remove player from match
   */
  removePlayerFromMatch(playerId: string): boolean {
    const connection = this.connections.get(playerId);
    if (!connection) return false;

    connection.isInMatch = false;
    connection.matchId = undefined;
    connection.lastActivity = Date.now();
    
    logger.debug(`Player ${playerId} left match`);
    return true;
  }

  /**
   * Update player activity timestamp
   */
  updateActivity(playerId: string): boolean {
    const connection = this.connections.get(playerId);
    if (!connection) return false;

    connection.lastActivity = Date.now();
    return true;
  }

  /**
   * Get connection info for player
   */
  getConnection(playerId: string): ConnectionInfo | null {
    return this.connections.get(playerId) || null;
  }

  /**
   * Check if player is connected
   */
  isConnected(playerId: string): boolean {
    return this.connections.has(playerId);
  }

  /**
   * Check if player is in grace period
   */
  isInGracePeriod(playerId: string): boolean {
    return this.gracePeriods.has(playerId);
  }

  /**
   * Get all connections for a match
   */
  getMatchConnections(matchId: string): ConnectionInfo[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.matchId === matchId);
  }

  /**
   * Get all players in matches
   */
  getPlayersInMatches(): string[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.isInMatch)
      .map(conn => conn.playerId);
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(connection: ConnectionInfo): void {
    const { socket, playerId } = connection;

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnect: ${playerId} - ${reason}`);
      this.removeConnection(playerId);
    });

    // Handle activity ping
    socket.on('activity', () => {
      this.updateActivity(playerId);
    });

    // Handle error
    socket.on('error', (error) => {
      logger.warn(`Socket error for ${playerId}:`, error);
    });
  }

  /**
   * Send message to specific player
   */
  sendToPlayer(playerId: string, event: string, data?: any): boolean {
    const connection = this.connections.get(playerId);
    if (!connection) return false;

    try {
      connection.socket.emit(event, data);
      this.updateActivity(playerId);
      return true;
    } catch (error) {
      logger.error(`Failed to send to player ${playerId}:`, error);
      return false;
    }
  }

  /**
   * Send message to all players in match
   */
  sendToMatch(matchId: string, event: string, data?: any): number {
    const connections = this.getMatchConnections(matchId);
    let sent = 0;

    for (const connection of connections) {
      if (this.sendToPlayer(connection.playerId, event, data)) {
        sent++;
      }
    }

    return sent;
  }

  /**
   * Send message to all connected players
   */
  broadcast(event: string, data?: any): number {
    let sent = 0;
    
    for (const connection of this.connections.values()) {
      if (this.sendToPlayer(connection.playerId, event, data)) {
        sent++;
      }
    }

    return sent;
  }

  /**
   * Notify match about player disconnection
   */
  private notifyMatchDisconnection(matchId: string, playerId: string, gracePeriodMs: number): void {
    this.sendToMatch(matchId, 'player_disconnected', {
      playerId,
      gracePeriodMs,
      timestamp: Date.now()
    });
  }

  /**
   * Notify match about player reconnection
   */
  private notifyMatchReconnection(matchId: string, playerId: string): void {
    this.sendToMatch(matchId, 'player_reconnected', {
      playerId,
      timestamp: Date.now()
    });
  }

  /**
   * Terminate match due to disconnection
   */
  private terminateMatch(matchId: string, disconnectedPlayerId: string): void {
    // Send match termination event
    this.sendToMatch(matchId, 'match_terminated', {
      reason: 'player_disconnect',
      disconnectedPlayerId,
      timestamp: Date.now()
    });

    // Remove all players from this match
    const matchConnections = this.getMatchConnections(matchId);
    for (const connection of matchConnections) {
      this.removePlayerFromMatch(connection.playerId);
    }

    // Emit event for game systems to handle cleanup
    this.onMatchTerminated(matchId, disconnectedPlayerId);
  }

  /**
   * Event handler for match termination (to be overridden)
   */
  protected onMatchTerminated(matchId: string, disconnectedPlayerId: string): void {
    // Override this in your game integration
    logger.info(`Match ${matchId} terminated due to disconnect: ${disconnectedPlayerId}`);
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    const totalConnections = this.connections.size;
    const matchConnections = Array.from(this.connections.values())
      .filter(conn => conn.isInMatch).length;

    // Calculate average session duration
    let averageSessionDuration = 0;
    if (this.connectionHistory.length > 0) {
      const totalDuration = this.connectionHistory
        .slice(-100) // Last 100 sessions
        .reduce((sum, session) => sum + session.duration, 0);
      averageSessionDuration = totalDuration / Math.min(100, this.connectionHistory.length);
    }

    return {
      totalConnections,
      activeConnections: totalConnections,
      matchConnections,
      averageSessionDuration,
      disconnectionsInGracePeriod: this.gracePeriods.size
    };
  }

  /**
   * Get current grace periods (for debugging)
   */
  getGracePeriods(): DisconnectionGracePeriod[] {
    return Array.from(this.gracePeriods.values());
  }

  /**
   * Force disconnect player (admin function)
   */
  forceDisconnect(playerId: string, reason: string = 'admin_disconnect'): boolean {
    const connection = this.connections.get(playerId);
    if (!connection) return false;

    logger.warn(`Force disconnecting player ${playerId}: ${reason}`);
    
    connection.socket.emit('force_disconnect', { reason });
    connection.socket.disconnect(true);
    
    return true;
  }

  /**
   * Clean up stale connections (maintenance)
   */
  cleanupStaleConnections(maxIdleTimeMs: number = 300000): number { // 5 minutes default
    const now = Date.now();
    let cleaned = 0;

    for (const [playerId, connection] of this.connections.entries()) {
      const idleTime = now - connection.lastActivity;
      
      if (idleTime > maxIdleTimeMs) {
        logger.warn(`Cleaning up stale connection: ${playerId} (idle for ${Math.round(idleTime / 1000)}s)`);
        this.removeConnection(playerId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} stale connections`);
    }

    return cleaned;
  }

  /**
   * Get connection info for all players (admin/debug)
   */
  getAllConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get detailed connection status
   */
  getConnectionStatus(): {
    connections: number;
    matches: number;
    gracePeriods: number;
    averageLatency: number;
  } {
    return {
      connections: this.connections.size,
      matches: new Set(Array.from(this.connections.values())
        .filter(c => c.matchId)
        .map(c => c.matchId)).size,
      gracePeriods: this.gracePeriods.size,
      averageLatency: 0 // Could be implemented with ping tracking
    };
  }
}

/**
 * Factory function for creating SimpleConnectionManager
 */
export const createSimpleConnectionManager = (): SimpleConnectionManager => {
  return new SimpleConnectionManager();
};

/**
 * Default instance for global use
 */
export const simpleConnectionManager = createSimpleConnectionManager();