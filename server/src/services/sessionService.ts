import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type { Player } from '@dueled/shared';

export interface SessionData {
  id: string;
  playerId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsed: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  token?: string;
  expiresAt?: Date;
  error?: string;
}

export class SessionService {
  private readonly JWT_SECRET: string;
  private readonly TOKEN_EXPIRY = '24h';
  private readonly REFRESH_THRESHOLD = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
    if (this.JWT_SECRET === 'default-secret') {
      logger.warn('Using default JWT secret. Set JWT_SECRET environment variable for production.');
    }
  }

  /**
   * Generate a new JWT token and store session in database
   */
  async createSession(
    player: Player, 
    ipAddress?: string, 
    userAgent?: string
  ): Promise<{ token: string; expiresAt: Date }> {
    try {
      // Generate JWT token
      const token = jwt.sign(
        {
          id: player.id,
          username: player.username,
          isAnonymous: player.isAnonymous,
          rating: player.rating,
        },
        this.JWT_SECRET,
        { expiresIn: this.TOKEN_EXPIRY }
      );

      // Create token hash for storage
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      // Calculate expiry date (24 hours from now)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      if (db.isConnected()) {
        // Store session in database
        await db.query(
          `INSERT INTO player_sessions (player_id, token_hash, expires_at, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5)`,
          [player.id, tokenHash, expiresAt, ipAddress, userAgent]
        );

        logger.info(`Session created for player ${player.username || player.id}`);
      } else {
        logger.warn('Database not available, session not stored persistently');
      }

      return { token, expiresAt };
    } catch (error) {
      logger.error('Error creating session:', error);
      throw new Error('Failed to create session');
    }
  }

  /**
   * Validate a JWT token and check if session exists in database
   */
  async validateSession(token: string, ipAddress?: string): Promise<Player | null> {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, this.JWT_SECRET) as Player;
      
      if (db.isConnected()) {
        // Check if session exists in database
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        const result = await db.query(
          `SELECT ps.*, p.username, p.is_anonymous, ps_stats.rating 
           FROM player_sessions ps
           JOIN players p ON ps.player_id = p.id
           LEFT JOIN player_stats ps_stats ON p.id = ps_stats.player_id
           WHERE ps.token_hash = $1 AND ps.expires_at > NOW() AND p.is_active = true`,
          [tokenHash]
        );

        if (result.rows.length === 0) {
          logger.warn('Session not found or expired in database');
          return null;
        }

        // Update last used timestamp
        await db.query(
          `UPDATE player_sessions SET last_used = NOW() WHERE token_hash = $1`,
          [tokenHash]
        );

        const session = result.rows[0];
        return {
          id: session.player_id,
          username: session.username,
          isAnonymous: session.is_anonymous,
          rating: session.rating || 1000,
        };
      } else {
        // Fallback to just JWT validation when database is not available
        logger.warn('Database not available, using JWT-only validation');
        return decoded;
      }
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.debug('Invalid JWT token:', error.message);
      } else {
        logger.error('Error validating session:', error);
      }
      return null;
    }
  }

  /**
   * Refresh a token if it's close to expiry
   */
  async refreshToken(
    token: string, 
    ipAddress?: string, 
    userAgent?: string
  ): Promise<RefreshTokenResponse> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as any;
      const tokenExp = decoded.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      
      // Check if token needs refresh (less than 6 hours remaining)
      if (tokenExp - now > this.REFRESH_THRESHOLD) {
        return {
          success: false,
          error: 'Token does not need refresh yet'
        };
      }

      // Validate current session
      const player = await this.validateSession(token, ipAddress);
      if (!player) {
        return {
          success: false,
          error: 'Invalid or expired session'
        };
      }

      // Revoke old session
      await this.revokeSession(token);

      // Create new session
      const { token: newToken, expiresAt } = await this.createSession(
        player, 
        ipAddress, 
        userAgent
      );

      return {
        success: true,
        token: newToken,
        expiresAt
      };
    } catch (error) {
      logger.error('Error refreshing token:', error);
      return {
        success: false,
        error: 'Failed to refresh token'
      };
    }
  }

  /**
   * Revoke a session (logout)
   */
  async revokeSession(token: string): Promise<boolean> {
    try {
      if (db.isConnected()) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        const result = await db.query(
          `DELETE FROM player_sessions WHERE token_hash = $1`,
          [tokenHash]
        );

        logger.info(`Session revoked, deleted ${result.rowCount} sessions`);
        return result.rowCount > 0;
      } else {
        logger.warn('Database not available, cannot revoke session persistently');
        return true; // Return true since JWT will expire naturally
      }
    } catch (error) {
      logger.error('Error revoking session:', error);
      return false;
    }
  }

  /**
   * Revoke all sessions for a player
   */
  async revokeAllSessions(playerId: string): Promise<number> {
    try {
      if (db.isConnected()) {
        const result = await db.query(
          `DELETE FROM player_sessions WHERE player_id = $1`,
          [playerId]
        );

        logger.info(`Revoked ${result.rowCount} sessions for player ${playerId}`);
        return result.rowCount;
      } else {
        logger.warn('Database not available, cannot revoke sessions persistently');
        return 0;
      }
    } catch (error) {
      logger.error('Error revoking all sessions:', error);
      return 0;
    }
  }

  /**
   * Clean up expired sessions (should be called periodically)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      if (db.isConnected()) {
        const result = await db.query(`SELECT cleanup_expired_sessions()`);
        const deletedCount = result.rows[0].cleanup_expired_sessions;
        
        if (deletedCount > 0) {
          logger.info(`Cleaned up ${deletedCount} expired sessions`);
        }
        
        return deletedCount;
      } else {
        logger.warn('Database not available, cannot cleanup expired sessions');
        return 0;
      }
    } catch (error) {
      logger.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  /**
   * Get active sessions for a player
   */
  async getActiveSessions(playerId: string): Promise<SessionData[]> {
    try {
      if (db.isConnected()) {
        const result = await db.query(
          `SELECT * FROM player_sessions 
           WHERE player_id = $1 AND expires_at > NOW()
           ORDER BY last_used DESC`,
          [playerId]
        );

        return result.rows.map((row: any) => ({
          id: row.id,
          playerId: row.player_id,
          tokenHash: row.token_hash,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          lastUsed: row.last_used,
          ipAddress: row.ip_address,
          userAgent: row.user_agent
        }));
      } else {
        logger.warn('Database not available, cannot get active sessions');
        return [];
      }
    } catch (error) {
      logger.error('Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  startPeriodicCleanup(intervalMinutes: number = 60): NodeJS.Timeout {
    const intervalMs = intervalMinutes * 60 * 1000;
    
    const cleanup = async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        logger.error('Periodic session cleanup failed:', error);
      }
    };

    // Run initial cleanup
    cleanup();

    // Schedule periodic cleanup
    const interval = setInterval(cleanup, intervalMs);
    
    logger.info(`Started periodic session cleanup every ${intervalMinutes} minutes`);
    
    return interval;
  }
}