import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { matchmakingService } from '../services/matchmakingService.js';
import rateLimit from 'express-rate-limit';
import type { Player, ApiResponse, ClassType, MatchmakingStatus } from '@dueled/shared';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: Player;
}

// Rate limiting for matchmaking endpoints
const matchmakingRateLimit = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many matchmaking requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting to all matchmaking routes
router.use(matchmakingRateLimit);

// Join matchmaking queue
router.post(
  '/queue',
  [
    authenticateToken,
    body('classType').isIn(['berserker', 'mage', 'bomber', 'archer']),
    body('preferences').optional().isObject(),
  ],
  async (req: AuthenticatedRequest, res: Response<ApiResponse<MatchmakingStatus>>) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: errors.array(),
          timestamp: Date.now(),
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
          timestamp: Date.now(),
        });
      }

      const { classType, preferences } = req.body;

      // Validate class type
      if (!['berserker', 'mage', 'bomber', 'archer'].includes(classType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid class type',
          timestamp: Date.now(),
        });
      }

      // Add to matchmaking queue
      await matchmakingService.joinQueue(
        req.user.id,
        req.user.username || 'Anonymous',
        req.user.rating || 1000,
        classType as ClassType
      );
      
      const status = await matchmakingService.getQueueStatus(req.user.id);

      logger.info(`Player ${req.user.username} (${req.user.id}) joined queue with class ${classType}`);

      res.json({
        success: true,
        data: status,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Join queue error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: Date.now(),
      });
    }
  }
);

// Leave matchmaking queue
router.delete(
  '/queue',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<MatchmakingStatus>>) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
          timestamp: Date.now(),
        });
      }

      // Remove from matchmaking queue
      await matchmakingService.leaveQueue(req.user.id);

      logger.info(`Player ${req.user.username} (${req.user.id}) left queue`);

      const status: MatchmakingStatus = {
        inQueue: false,
        estimatedWait: 0,
      };

      res.json({
        success: true,
        data: status,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Leave queue error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: Date.now(),
      });
    }
  }
);

// Get queue status
router.get(
  '/status',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<MatchmakingStatus>>) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
          timestamp: Date.now(),
        });
      }

      // Get queue status from service
      const queueStatus = await matchmakingService.getQueueStatus(req.user.id);

      const status: MatchmakingStatus = {
        inQueue: queueStatus.inQueue,
        estimatedWait: queueStatus.estimatedWait,
        queuePosition: queueStatus.queuePosition,
      };

      res.json({
        success: true,
        data: status,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Get queue status error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: Date.now(),
      });
    }
  }
);

// Get queue statistics (admin endpoint)
router.get(
  '/stats',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<any>>) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
          timestamp: Date.now(),
        });
      }

      // Get queue statistics - not implemented yet
      const stats = { queueSize: 0, activeMatches: 0 };

      res.json({
        success: true,
        data: stats,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Get queue stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: Date.now(),
      });
    }
  }
);

// Get match information
router.get(
  '/match/:matchId',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<any>>) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
          timestamp: Date.now(),
        });
      }

      const { matchId } = req.params;
      
      if (!matchId) {
        return res.status(400).json({
          success: false,
          error: 'Match ID is required',
          timestamp: Date.now(),
        });
      }

      // Get match information
      const match = await matchmakingService.getMatch(matchId);
      
      if (!match) {
        return res.status(404).json({
          success: false,
          error: 'Match not found',
          timestamp: Date.now(),
        });
      }

      // Check if user is part of this match
      if (match.player1.playerId !== req.user.id && match.player2.playerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          timestamp: Date.now(),
        });
      }

      res.json({
        success: true,
        data: match,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Get match error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: Date.now(),
      });
    }
  }
);

export { router as matchmakingRoutes };