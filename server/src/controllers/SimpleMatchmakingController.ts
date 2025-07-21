/**
 * SimpleMatchmakingController - Basic matchmaking for 1v1 arena game
 * 
 * Replaces complex matchmakingController.ts with simple queue operations
 * Uses SimpleMatchmaking service for instant first-come-first-served matching
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifyToken } from '../utils/jwt.js';
import { SimpleMatchmaking } from '../services/matchmaking/SimpleMatchmaking.js';
import { logger } from '../utils/logger.js';
import { rateLimit } from 'express-rate-limit';
import type { ClassTypeValue } from '@dueled/shared';

// Simple validation schemas
const joinQueueSchema = z.object({
  classType: z.enum(['gunslinger', 'demolitionist', 'buckshot'])
});

// Rate limiting for matchmaking
const matchmakingLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10,
  message: { success: false, error: 'Too many matchmaking requests' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * SimpleMatchmakingController - Basic queue management
 */
export class SimpleMatchmakingController {
  private router: Router;
  private simpleMatchmaking: SimpleMatchmaking;
  
  constructor() {
    this.router = Router();
    this.simpleMatchmaking = new SimpleMatchmaking();
    this.setupRoutes();
  }
  
  /**
   * Setup matchmaking routes
   */
  private setupRoutes(): void {
    // Apply rate limiting
    this.router.use(matchmakingLimiter);
    
    // Authentication middleware
    this.router.use(this.authenticate.bind(this));
    
    this.router.post('/queue', this.joinQueue.bind(this));
    this.router.delete('/queue', this.leaveQueue.bind(this));
    this.router.get('/status', this.getQueueStatus.bind(this));
    this.router.get('/stats', this.getQueueStats.bind(this));
  }
  
  /**
   * Authentication middleware
   */
  private async authenticate(req: Request, res: Response, next: Function): Promise<void> {
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
      const decoded = verifyToken(token);
      
      if (!decoded) {
        res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
        return;
      }
      
      // Add user info to request
      (req as any).user = { playerId: decoded.sub, username: decoded.username || 'Unknown' };
      next();
      
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Authentication failed'
      });
    }
  }
  
  /**
   * Join matchmaking queue
   */
  private async joinQueue(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.playerId;
      const username = (req as any).user.username;
      
      // Validate input
      const validation = joinQueueSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: validation.error.issues.map(issue => issue.message)
        });
        return;
      }
      
      const { classType } = validation.data;
      
      // Add to queue
      await this.simpleMatchmaking.joinQueue({
        playerId: userId,
        username: username,
        rating: 1000, // Default rating, should fetch from DB
        classType: classType as ClassTypeValue,
        queuedAt: Date.now()
      });
      
      logger.info(`Player ${username} (${userId}) joined queue with class ${classType}`);
      
      res.json({
        success: true,
        data: {
          inQueue: true,
          classType,
          estimatedWait: 30, // 30 seconds average
          matchFound: false
        }
      });
      
    } catch (error) {
      logger.error('Join queue error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to join queue'
      });
    }
  }
  
  /**
   * Leave matchmaking queue
   */
  private async leaveQueue(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.playerId;
      const username = (req as any).user.username;
      
      // Remove from queue
      await this.simpleMatchmaking.leaveQueue(userId);
      
      logger.info(`Player ${username} (${userId}) left queue`);
      
      res.json({
        success: true,
        data: {
          inQueue: false,
          message: 'Left queue successfully'
        }
      });
      
    } catch (error) {
      logger.error('Leave queue error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to leave queue'
      });
    }
  }
  
  /**
   * Get queue status
   */
  private async getQueueStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.playerId;
      
      // Simple status check - just return basic info
      res.json({
        success: true,
        data: {
          inQueue: false, // Simplified - just show not in queue for now
          estimatedWait: 30
        }
      });
      
    } catch (error) {
      logger.error('Get queue status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get queue status'
      });
    }
  }
  
  /**
   * Get queue statistics
   */
  private async getQueueStats(req: Request, res: Response): Promise<void> {
    try {
      // Simple stats - hardcoded for now
      res.json({
        success: true,
        data: {
          totalInQueue: 0,
          queuesByClass: {
            archer: 0,
            berserker: 0
          },
          totalMatches: 0,
          averageWaitTime: 30
        }
      });
      
    } catch (error) {
      logger.error('Get queue stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get queue stats'
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
const simpleMatchmakingController = new SimpleMatchmakingController();
export const simpleMatchmakingRoutes = simpleMatchmakingController.getRouter();