/**
 * SimpleAuthController - Clean authentication for 1v1 arena game
 * 
 * Replaces the complex 710-line authController.ts with simple auth flow
 * Removes enterprise features like suspicious activity tracking and complex validation
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signAccessToken, verifyToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { db } from '../services/database.js';

// Simple validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(6).max(100)
});

const loginSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(6).max(100)
});

// Rate limiting removed for development

/**
 * SimpleAuthController - Basic authentication endpoints
 */
export class SimpleAuthController {
  private router: Router;
  
  constructor() {
    this.router = Router();
    this.setupRoutes();
  }
  
  /**
   * Setup authentication routes
   */
  private setupRoutes(): void {
    // Rate limiting removed for development
    
    this.router.post('/register', this.register.bind(this));
    this.router.post('/login', this.login.bind(this));
    this.router.post('/anonymous', this.createAnonymousSession.bind(this));
    this.router.post('/logout', this.logout.bind(this));
    this.router.get('/me', this.getProfile.bind(this));
  }
  
  /**
   * Register new user
   */
  private async register(req: Request, res: Response): Promise<void> {
    try {
      // Validate input
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: validation.error.issues.map(issue => issue.message)
        });
        return;
      }
      
      const { username, email, password } = validation.data;
      
      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM players WHERE username = $1 OR email = $2',
        [username, email]
      );
      
      if (existingUser.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: 'Username or email already exists'
        });
        return;
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Create user with proper UUID
      const { v4: uuidv4 } = await import('uuid');
      const userId = uuidv4();
      
      const result = await db.query(
        `INSERT INTO players (id, username, email, password_hash, is_anonymous) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, username, email, is_anonymous, created_at`,
        [userId, username, email, hashedPassword, false]
      );
      
      // Create player stats
      await db.query(
        `INSERT INTO player_stats (player_id, rating) VALUES ($1, $2)`,
        [userId, 1000]
      );
      
      const user = result.rows[0];
      
      // Generate token
      const token = signAccessToken({
        sub: user.id,
        sid: `session_${Date.now()}`,
        role: 'user'
      });
      
      logger.info(`User registered: ${username} (${user.id})`);
      
      res.status(201).json({
        success: true,
        token,
        player: {
          id: user.id,
          username: user.username,
          email: user.email,
          isAnonymous: user.is_anonymous,
          rating: 1000
        }
      });
      
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Registration failed'
      });
    }
  }
  
  /**
   * Login user
   */
  private async login(req: Request, res: Response): Promise<void> {
    try {
      // Validate input
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid input'
        });
        return;
      }
      
      const { username, password } = validation.data;
      
      // Get user with rating from player_stats
      const result = await db.query(
        `SELECT p.id, p.username, p.email, p.password_hash, p.is_anonymous, p.created_at, ps.rating 
         FROM players p 
         LEFT JOIN player_stats ps ON p.id = ps.player_id 
         WHERE p.username = $1`,
        [username]
      );
      
      if (result.rows.length === 0) {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
        return;
      }
      
      const user = result.rows[0];
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
        return;
      }
      
      // Generate token
      const token = signAccessToken({
        sub: user.id,
        sid: `session_${Date.now()}`,
        role: 'user'
      });
      
      // Update last login
      await db.query(
        'UPDATE players SET last_login = NOW() WHERE id = $1',
        [user.id]
      );
      
      logger.info(`User logged in: ${username} (${user.id})`);
      
      res.json({
        success: true,
        token,
        player: {
          id: user.id,
          username: user.username,
          email: user.email,
          isAnonymous: user.is_anonymous,
          rating: user.rating || 1000
        }
      });
      
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed'
      });
    }
  }

  /**
   * Create anonymous session for guest play
   */
  private async createAnonymousSession(req: Request, res: Response): Promise<void> {
    try {
      // Create guest user with UUID
      const { v4: uuidv4 } = await import('uuid');
      const userId = uuidv4();
      const guestUsername = `Guest_${Date.now().toString().slice(-6)}`;

      // Create anonymous player
      const result = await db.query(
        `INSERT INTO players (id, username, is_anonymous) 
         VALUES ($1, $2, $3) 
         RETURNING id, username, is_anonymous, created_at`,
        [userId, guestUsername, true]
      );

      // Create player stats
      await db.query(
        `INSERT INTO player_stats (player_id, rating) VALUES ($1, $2)`,
        [userId, 1000]
      );

      const user = result.rows[0];

      // Generate token
      const token = signAccessToken({
        sub: user.id,
        sid: `session_${Date.now()}`,
        role: 'user'
      });

      logger.info(`Anonymous session created: ${guestUsername} (${user.id})`);

      res.status(201).json({
        success: true,
        token,
        player: {
          id: user.id,
          username: user.username,
          isAnonymous: user.is_anonymous,
          rating: 1000
        }
      });

    } catch (error) {
      logger.error('Anonymous session error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create guest session'
      });
    }
  }
  
  /**
   * Logout user (simple - just client-side token removal)
   */
  private async logout(req: Request, res: Response): Promise<void> {
    // For simple JWT auth, logout is handled client-side by removing the token
    // We could add token blacklisting here if needed, but it's overkill for this game
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
  
  /**
   * Get user profile
   */
  private async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: 'No token provided'
        });
        return;
      }
      
      const token = authHeader.substring(7);
      
      // Verify token
      const decoded = verifyToken(token);
      if (!decoded) {
        res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
        return;
      }
      
      // Get user data
      const result = await db.query(
        `SELECT p.id, p.username, p.email, p.is_anonymous, p.created_at, p.last_login, ps.rating,
                (SELECT COUNT(*) FROM matches WHERE (player1_id = p.id OR player2_id = p.id) AND status = 'completed') as total_matches,
                (SELECT COUNT(*) FROM matches WHERE winner_id = p.id AND status = 'completed') as wins
         FROM players p
         LEFT JOIN player_stats ps ON p.id = ps.player_id
         WHERE p.id = $1`,
        [decoded.sub]
      );
      
      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }
      
      const user = result.rows[0];
      
      res.json({
        success: true,
        player: {
          id: user.id,
          username: user.username,
          email: user.email,
          isAnonymous: user.is_anonymous,
          rating: user.rating || 1000,
          stats: {
            totalMatches: parseInt(user.total_matches),
            wins: parseInt(user.wins),
            losses: parseInt(user.total_matches) - parseInt(user.wins),
            winRate: parseInt(user.total_matches) > 0 
              ? Math.round((parseInt(user.wins) / parseInt(user.total_matches)) * 100)
              : 0
          }
        }
      });
      
    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get profile'
      });
    }
  }
  
  /**
   * Get router instance
   */
  getRouter(): Router {
    return this.router;
  }
}

// Create and export router
const simpleAuthController = new SimpleAuthController();
export const simpleAuthRoutes = simpleAuthController.getRouter();