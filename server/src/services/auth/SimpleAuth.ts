import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { db } from '../database.js';
import { createSession, SessionTokens, verifyToken, JwtPayload } from '../../utils/jwt.js';

/**
 * SimpleAuth - Scalable authentication for 1v1 arena game
 * 
 * Focus: Clean, secure, minimal authentication without enterprise complexity
 * Features:
 * - Basic JWT authentication
 * - Simple password validation
 * - Guest/anonymous play support
 * - No complex session tracking
 * - Scalable for future social features
 */

export interface SimpleAuthConfig {
  jwtSecret: string;
  jwtExpiration: string;
  saltRounds: number;
  allowGuestPlay: boolean;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  user?: SimpleUser;
  error?: string;
}

export interface SimpleUser {
  id: string;
  username: string;
  email?: string;
  passwordHash?: string;
  isGuest: boolean;
  rating: number;
  createdAt: Date;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email?: string;
  password: string;
}

export interface TokenPayload {
  userId: string;
  username: string;
  isGuest: boolean;
  iat: number;
  exp: number;
}

/**
 * SimpleAuth - Clean authentication service
 */
export class SimpleAuth {
  private config: SimpleAuthConfig;
  constructor(config?: SimpleAuthConfig) {
    this.config = config || {
      jwtSecret: process.env.JWT_SECRET || (() => {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('JWT_SECRET environment variable is required in production');
        }
        return 'development-only-secret-change-in-production';
      })(),
      jwtExpiration: '1h',
      saltRounds: 12,
      allowGuestPlay: true
    };
  }

  /**
   * Register new user - simple validation
   */
  async register(data: RegisterData): Promise<AuthResult> {
    try {
      // Basic validation
      const validation = this.validateRegistrationData(data);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      // Check if username already exists
      const existingUser = await this.findByUsername(data.username);
      if (existingUser) {
        return { success: false, error: 'Username already taken' };
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, this.config.saltRounds);

      // Create user
      const userId = uuidv4();
      const user = await this.createPlayer({
        id: userId,
        username: data.username,
        email: data.email,
        passwordHash: hashedPassword,
        rating: 1000, // Starting ELO rating
        isGuest: false
      });

      // Generate token
      const tokens = await this.generateToken({
        userId: user.id,
        username: user.username,
        isGuest: false
      });

      const simpleUser: SimpleUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        isGuest: false,
        rating: user.rating,
        createdAt: user.createdAt
      };

      logger.info(`User registered: ${data.username} (${userId})`);
      
      return {
        success: true,
        token: tokens.accessToken,
        user: simpleUser
      };

    } catch (error) {
      logger.error('Registration error:', error);
      return { success: false, error: 'Registration failed' };
    }
  }

  /**
   * Login user - basic credential check
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      // Find user
      const user = await this.findByUsername(credentials.username);
      if (!user) {
        return { success: false, error: 'Invalid username or password' };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash || '');
      if (!isValidPassword) {
        return { success: false, error: 'Invalid username or password' };
      }

      // Generate token
      const tokens = await this.generateToken({
        userId: user.id,
        username: user.username,
        isGuest: false
      });

      const simpleUser: SimpleUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        isGuest: false,
        rating: user.rating,
        createdAt: user.createdAt
      };

      logger.info(`User logged in: ${credentials.username} (${user.id})`);

      return {
        success: true,
        token: tokens.accessToken,
        user: simpleUser
      };

    } catch (error) {
      logger.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  }

  /**
   * Create guest user for anonymous play
   */
  async createGuest(): Promise<AuthResult> {
    try {
      if (!this.config.allowGuestPlay) {
        return { success: false, error: 'Guest play not allowed' };
      }

      const guestId = uuidv4();
      const guestUsername = `Guest_${guestId.substring(0, 8)}`;

      // Create temporary guest user
      const user = await this.createPlayer({
        id: guestId,
        username: guestUsername,
        rating: 1000,
        isGuest: true
      });

      // Generate token
      const tokens = await this.generateToken({
        userId: user.id,
        username: user.username,
        isGuest: true
      });

      const simpleUser: SimpleUser = {
        id: user.id,
        username: user.username,
        isGuest: true,
        rating: user.rating,
        createdAt: user.createdAt
      };

      logger.info(`Guest user created: ${guestUsername} (${guestId})`);

      return {
        success: true,
        token: tokens.accessToken,
        user: simpleUser
      };

    } catch (error) {
      logger.error('Guest creation error:', error);
      return { success: false, error: 'Failed to create guest user' };
    }
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<TokenPayload | null> {
    try {
      const decoded = verifyToken<JwtPayload>(token);
      
      // Additional validation - check if user still exists
      const user = await this.findById(decoded.sub);
      if (!user) {
        logger.warn(`Token verification failed: user ${decoded.sub} not found`);
        return null;
      }

      // Convert JwtPayload to TokenPayload for compatibility
      return {
        userId: decoded.sub,
        username: decoded.username || user.username,
        isGuest: user.isGuest,
        iat: decoded.iat || 0,
        exp: decoded.exp || 0
      };

    } catch (error) {
      logger.warn('Token verification failed:', error);
      return null;
    }
  }

  /**
   * Get user by ID (for token validation)
   */
  async getUserById(userId: string): Promise<SimpleUser | null> {
    try {
      const user = await this.findById(userId);
      if (!user) return null;

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        isGuest: user.isGuest || false,
        rating: user.rating,
        createdAt: user.createdAt
      };

    } catch (error) {
      logger.error('Get user error:', error);
      return null;
    }
  }

  /**
   * Update user rating after match (simple ELO)
   */
  async updateUserRating(userId: string, newRating: number): Promise<boolean> {
    try {
      await this.updateRating(userId, newRating);
      logger.debug(`Updated rating for user ${userId}: ${newRating}`);
      return true;

    } catch (error) {
      logger.error('Rating update error:', error);
      return false;
    }
  }

  /**
   * Change password (for registered users)
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthResult> {
    try {
      const user = await this.findById(userId);
      if (!user || user.isGuest) {
        return { success: false, error: 'User not found or is guest' };
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash || '');
      if (!isValidPassword) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Validate new password
      const validation = this.validatePassword(newPassword);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.config.saltRounds);

      // Update password
      await this.updatePassword(userId, hashedPassword);

      logger.info(`Password changed for user ${userId}`);
      return { success: true };

    } catch (error) {
      logger.error('Password change error:', error);
      return { success: false, error: 'Password change failed' };
    }
  }

  /**
   * Delete guest users (cleanup)
   */
  async cleanupGuestUsers(olderThanHours: number = 24): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
      const deletedCount = await this.deleteGuestUsersOlderThan(cutoffTime);
      
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old guest users`);
      }
      
      return deletedCount;

    } catch (error) {
      logger.error('Guest cleanup error:', error);
      return 0;
    }
  }

  /**
   * Private helper methods
   */
  private async generateToken(payload: { userId: string; username: string; isGuest: boolean }): Promise<SessionTokens> {
    return await createSession(payload.userId, 'user');
  }

  private validateRegistrationData(data: RegisterData): { isValid: boolean; error?: string } {
    // Username validation
    if (!data.username || data.username.length < 3) {
      return { isValid: false, error: 'Username must be at least 3 characters long' };
    }

    if (data.username.length > 20) {
      return { isValid: false, error: 'Username must be less than 20 characters long' };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(data.username)) {
      return { isValid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }

    // Email validation (optional)
    if (data.email && !this.isValidEmail(data.email)) {
      return { isValid: false, error: 'Invalid email format' };
    }

    // Password validation
    const passwordValidation = this.validatePassword(data.password);
    if (!passwordValidation.isValid) {
      return passwordValidation;
    }

    return { isValid: true };
  }

  private validatePassword(password: string): { isValid: boolean; error?: string } {
    if (!password || password.length < 6) {
      return { isValid: false, error: 'Password must be at least 6 characters long' };
    }

    if (password.length > 128) {
      return { isValid: false, error: 'Password is too long' };
    }

    return { isValid: true };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get authentication statistics (for monitoring)
   */
  getAuthStats(): {
    activeUsers: number;
    guestUsers: number;
    registeredUsers: number;
  } {
    // This would need to be implemented with actual user counting
    // For now, return placeholder values
    return {
      activeUsers: 0,
      guestUsers: 0,
      registeredUsers: 0
    };
  }

  /**
   * Middleware helper for Express routes
   */
  createAuthMiddleware() {
    return async (req: any, res: any, next: any) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = await this.verifyToken(token);
        
        if (!decoded) {
          return res.status(401).json({ error: 'Invalid token' });
        }

        // Attach user info to request
        req.user = {
          id: decoded.userId,
          username: decoded.username,
          isGuest: decoded.isGuest
        };

        next();

      } catch (error) {
        logger.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication error' });
      }
    };
  }

  // Database methods - simplified implementations
  private async findByUsername(username: string): Promise<SimpleUser | null> {
    try {
      const result = await db.query(
        `SELECT p.id, p.username, p.password_hash, p.email, p.is_anonymous, p.created_at, ps.rating 
         FROM players p 
         LEFT JOIN player_stats ps ON p.id = ps.player_id 
         WHERE p.username = $1`,
        [username]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        email: row.email || undefined,
        isGuest: row.is_anonymous || false,
        createdAt: row.created_at,
        rating: row.rating || 1000
      };
    } catch (error) {
      logger.error('Error finding user by username:', error);
      return null;
    }
  }

  private async findById(id: string): Promise<SimpleUser | null> {
    try {
      const result = await db.query(
        `SELECT p.id, p.username, p.password_hash, p.email, p.is_anonymous, p.created_at, ps.rating 
         FROM players p 
         LEFT JOIN player_stats ps ON p.id = ps.player_id 
         WHERE p.id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        email: row.email || undefined,
        isGuest: row.is_anonymous || false,
        createdAt: row.created_at,
        rating: row.rating || 1000
      };
    } catch (error) {
      logger.error('Error finding user by id:', error);
      return null;
    }
  }

  private async createPlayer(data: any): Promise<SimpleUser> {
    try {
      // Insert player record
      const playerResult = await db.query(
        `INSERT INTO players (id, username, password_hash, email, is_anonymous) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, username, password_hash, email, is_anonymous, created_at`,
        [data.id, data.username, data.passwordHash, data.email || null, data.isGuest || false]
      );
      
      // Insert player stats record
      await db.query(
        `INSERT INTO player_stats (player_id, rating) VALUES ($1, $2)`,
        [data.id, data.rating || 1000]
      );
      
      const row = playerResult.rows[0];
      return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        email: row.email || undefined,
        isGuest: row.is_anonymous || false,
        createdAt: row.created_at,
        rating: data.rating || 1000
      };
    } catch (error) {
      logger.error('Error creating player:', error);
      throw new Error('Failed to create player');
    }
  }

  private async updateRating(userId: string, rating: number): Promise<void> {
    try {
      await db.query(
        'UPDATE player_stats SET rating = $1 WHERE player_id = $2',
        [rating, userId]
      );
    } catch (error) {
      logger.error('Error updating rating:', error);
      throw new Error('Failed to update rating');
    }
  }

  private async updatePassword(userId: string, passwordHash: string): Promise<void> {
    try {
      await db.query(
        'UPDATE players SET password_hash = $1 WHERE id = $2',
        [passwordHash, userId]
      );
    } catch (error) {
      logger.error('Error updating password:', error);
      throw new Error('Failed to update password');
    }
  }

  private async deleteGuestUsersOlderThan(cutoffTime: Date): Promise<number> {
    try {
      const result = await db.query(
        'DELETE FROM players WHERE is_guest = true AND created_at < $1',
        [cutoffTime]
      );
      return result.rowCount || 0;
    } catch (error) {
      logger.error('Error deleting guest users:', error);
      return 0;
    }
  }
}

/**
 * Default configuration for SimpleAuth
 */
export const createDefaultAuthConfig = (): SimpleAuthConfig => ({
  jwtSecret: process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    return 'development-only-secret-change-in-production';
  })(),
  jwtExpiration: '24h',
  saltRounds: 10,
  allowGuestPlay: true
});

/**
 * Factory function to create SimpleAuth instance
 */
export const createSimpleAuth = (config?: Partial<SimpleAuthConfig>): SimpleAuth => {
  const defaultConfig = createDefaultAuthConfig();
  const mergedConfig = { ...defaultConfig, ...config };
  return new SimpleAuth(mergedConfig);
};

/**
 * Singleton instance for global use
 */
export const simpleAuth = createSimpleAuth();