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
import { rateLimit } from 'express-rate-limit';

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

// Simple rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { success: false, error: 'Too many authentication attempts' },
  standardHeaders: true,
  legacyHeaders: false
});

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
    // Apply rate limiting to all auth routes
    this.router.use(authLimiter);
    
    this.router.post('/register', this.register.bind(this));
    this.router.post('/login', this.login.bind(this));
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
        'SELECT id FROM users WHERE username = $1 OR email = $2',
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
      
      // Create user
      const result = await db.query(
        `INSERT INTO users (username, email, password_hash, elo_rating, created_at) 
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING id, username, email, elo_rating, created_at`,
        [username, email, hashedPassword, 1000] // Starting ELO rating
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
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            eloRating: user.elo_rating,
            createdAt: user.created_at
          },
          token
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
      
      // Get user
      const result = await db.query(
        'SELECT id, username, email, password_hash, elo_rating, created_at FROM users WHERE username = $1',
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
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );
      
      logger.info(`User logged in: ${username} (${user.id})`);
      
      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            eloRating: user.elo_rating,
            createdAt: user.created_at
          },
          token
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
        `SELECT id, username, email, elo_rating, created_at, last_login,
                (SELECT COUNT(*) FROM matches WHERE (player1_id = users.id OR player2_id = users.id) AND status = 'completed') as total_matches,
                (SELECT COUNT(*) FROM matches WHERE winner_id = users.id AND status = 'completed') as wins
         FROM users WHERE id = $1`,
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
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            eloRating: user.elo_rating,
            createdAt: user.created_at,
            lastLogin: user.last_login,
            stats: {
              totalMatches: parseInt(user.total_matches),
              wins: parseInt(user.wins),
              losses: parseInt(user.total_matches) - parseInt(user.wins),
              winRate: parseInt(user.total_matches) > 0 
                ? Math.round((parseInt(user.wins) / parseInt(user.total_matches)) * 100)
                : 0
            }
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