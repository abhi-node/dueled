import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { PlayerService } from '../services/playerService.js';
import { redis } from '../services/redis.js';
import type { Player, ApiResponse, ClassType } from '@dueled/shared';

const router = Router();
const playerService = new PlayerService();

// Rate limiting for player endpoints
const playerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: 'Too many requests to player endpoints from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

// More restrictive rate limiting for search endpoints
const searchRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: 'Too many search requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all player routes
router.use(playerRateLimit);

interface AuthenticatedRequest extends Request {
  user?: Player;
}

/**
 * Validation middleware for player endpoints
 */
const validatePlayerProfile = [
  body('username')
    .optional()
    .isLength({ min: 3, max: 20 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 3-20 characters and contain only letters, numbers, underscore, and hyphen'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email format'),
  body('favoriteClass')
    .optional()
    .isIn(['berserker', 'mage', 'bomber', 'archer'])
    .withMessage('Invalid class type'),
];

const validateMatchHistory = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('classFilter')
    .optional()
    .isIn(['berserker', 'mage', 'bomber', 'archer'])
    .withMessage('Invalid class filter'),
];

const validateLeaderboard = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('classFilter')
    .optional()
    .isIn(['berserker', 'mage', 'bomber', 'archer'])
    .withMessage('Invalid class filter'),
  query('minMatches')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum matches must be non-negative'),
];

const validatePlayerSearch = [
  query('q')
    .notEmpty()
    .isLength({ min: 1, max: 50 })
    .withMessage('Search query must be 1-50 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20'),
];

// Get authenticated player profile
router.get(
  '/profile',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<any>>) => {
    try {
      if (!req.user) {
        logger.warn('Unauthenticated profile access attempt');
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
          timestamp: Date.now(),
        });
      }

      const profile = await playerService.getPlayerProfile(req.user.id);
      
      if (!profile) {
        logger.warn(`Player profile not found: ${req.user.id}`);
        return res.status(404).json({
          success: false,
          error: 'Player profile not found',
          timestamp: Date.now(),
        });
      }

      logger.info(`Profile retrieved for user: ${profile.username}`);
      
      res.json({
        success: true,
        data: profile,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get profile',
        timestamp: Date.now(),
      });
    }
  }
);

// Get player profile by ID (public endpoint)
router.get(
  '/:id/profile',
  async (req: Request, res: Response<ApiResponse<any>>) => {
    try {
      const playerId = req.params.id;
      
      if (!playerId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Player ID is required',
          timestamp: Date.now()
        });
      }

      const profile = await playerService.getPlayerProfile(playerId);
      
      if (!profile) {
        return res.status(404).json({ 
          success: false, 
          error: 'Player not found',
          timestamp: Date.now()
        });
      }

      // Remove sensitive information for public access
      const publicProfile = {
        ...profile,
        email: undefined
      };

      res.json({
        success: true,
        data: publicProfile,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error getting player profile:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        timestamp: Date.now()
      });
    }
  }
);

// Update player profile
router.put(
  '/profile',
  validatePlayerProfile,
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<Player>>) => {
    try {
      if (!req.user) {
        logger.warn('Unauthenticated profile update attempt');
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
          timestamp: Date.now(),
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn(`Profile update validation failed for user ${req.user.id}:`, errors.array());
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
          timestamp: Date.now(),
        });
      }

      const updates = req.body;
      
      const updatedPlayer = await playerService.updatePlayer(req.user.id, updates);
      
      if (!updatedPlayer) {
        return res.status(404).json({ 
          success: false, 
          error: 'Player not found',
          timestamp: Date.now()
        });
      }

      logger.info(`Profile updated for user: ${updatedPlayer.username}`);
      
      res.json({
        success: true,
        data: updatedPlayer,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error updating player profile:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          return res.status(409).json({ 
            success: false, 
            error: error.message,
            timestamp: Date.now()
          });
        }
      }
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        timestamp: Date.now()
      });
    }
  }
);

// Get player stats with caching
router.get(
  '/stats',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<any>>) => {
    try {
      if (!req.user) {
        logger.warn('Unauthenticated stats access attempt');
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
          timestamp: Date.now(),
        });
      }

      const cacheKey = `player_stats:${req.user.id}`;
      
      // Try to get from cache first
      try {
        const cachedStats = await redis.get(cacheKey);
        if (cachedStats) {
          logger.debug(`Stats cache hit for user: ${req.user.id}`);
          return res.json({
            success: true,
            data: JSON.parse(cachedStats),
            cached: true,
            timestamp: Date.now(),
          });
        }
      } catch (cacheError) {
        logger.warn('Cache read error for stats:', cacheError);
      }

      // Get fresh stats from database
      const profile = await playerService.getPlayerProfile(req.user.id);
      
      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Player not found',
          timestamp: Date.now(),
        });
      }

      // Cache the stats for 5 minutes
      try {
        await redis.set(cacheKey, JSON.stringify(profile.stats), 300);
      } catch (cacheError) {
        logger.warn('Cache write error for stats:', cacheError);
      }

      logger.info(`Stats retrieved for user: ${req.user.id}`);
      
      res.json({
        success: true,
        data: profile.stats,
        cached: false,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Get stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get stats',
        timestamp: Date.now(),
      });
    }
  }
);

// Get detailed match history with filtering and pagination
router.get(
  '/matches',
  validateMatchHistory,
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

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
          timestamp: Date.now()
        });
      }

      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      const classFilter = req.query.classFilter as ClassType;
      const opponentFilter = req.query.opponent as string;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

      const result = await playerService.getMatchHistory(req.user.id, {
        limit,
        offset,
        classFilter,
        opponentFilter,
        dateFrom,
        dateTo
      });

      res.json({
        success: true,
        data: {
          matches: result.matches,
          pagination: {
            total: result.total,
            limit,
            offset,
            hasMore: offset + limit < result.total
          }
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Get matches error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get match history',
        timestamp: Date.now(),
      });
    }
  }
);

// Get leaderboard with enhanced filtering and pagination
router.get(
  '/leaderboard',
  validateLeaderboard,
  async (req: Request, res: Response<ApiResponse<any>>) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
          timestamp: Date.now()
        });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const classFilter = req.query.classFilter as ClassType;
      const minMatches = parseInt(req.query.minMatches as string) || 5;
      const excludeAnonymous = req.query.excludeAnonymous !== 'false';
      
      const result = await playerService.getLeaderboard({
        limit,
        offset,
        classFilter,
        minMatches,
        excludeAnonymous
      });
      
      res.json({
        success: true,
        data: {
          entries: result.entries,
          pagination: {
            total: result.total,
            limit,
            offset,
            hasMore: offset + limit < result.total
          }
        },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error getting leaderboard:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        timestamp: Date.now()
      });
    }
  }
);

// Search for players by username
router.get(
  '/search',
  searchRateLimit,
  validatePlayerSearch,
  async (req: Request, res: Response<ApiResponse<any>>) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
          timestamp: Date.now()
        });
      }

      const searchTerm = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const results = await playerService.searchPlayers(searchTerm, limit);
      
      res.json({
        success: true,
        data: results,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error searching players:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        timestamp: Date.now()
      });
    }
  }
);

// Get username suggestions for autocomplete
router.get(
  '/suggestions',
  searchRateLimit,
  async (req: Request, res: Response<ApiResponse<any>>) => {
    try {
      const prefix = req.query.prefix as string;
      const limit = parseInt(req.query.limit as string) || 5;
      
      if (!prefix || prefix.length < 1) {
        return res.status(400).json({ 
          success: false, 
          error: 'Prefix parameter is required',
          timestamp: Date.now()
        });
      }

      const suggestions = await playerService.getUsernameSuggestions(prefix, limit);
      
      res.json({
        success: true,
        data: suggestions,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error getting username suggestions:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        timestamp: Date.now()
      });
    }
  }
);

// Get player class statistics
router.get(
  '/class-stats',
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

      const classType = req.query.class as ClassType;
      const classStats = await playerService.getPlayerClassStats(req.user.id, classType);
      
      res.json({
        success: true,
        data: classStats,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error getting player class stats:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        timestamp: Date.now()
      });
    }
  }
);

// Get player class statistics by ID (public endpoint)
router.get(
  '/:id/class-stats',
  async (req: Request, res: Response<ApiResponse<any>>) => {
    try {
      const playerId = req.params.id;
      const classType = req.query.class as ClassType;
      
      if (!playerId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Player ID is required',
          timestamp: Date.now()
        });
      }

      const classStats = await playerService.getPlayerClassStats(playerId, classType);
      
      res.json({
        success: true,
        data: classStats,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error getting player class stats:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        timestamp: Date.now()
      });
    }
  }
);

// Get comprehensive player analytics
router.get(
  '/analytics',
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

      const analytics = await playerService.getPlayerAnalytics(req.user.id);
      
      if (!analytics) {
        return res.status(404).json({ 
          success: false, 
          error: 'Player not found',
          timestamp: Date.now()
        });
      }

      res.json({
        success: true,
        data: analytics,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error getting player analytics:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        timestamp: Date.now()
      });
    }
  }
);

export { router as playerRoutes };