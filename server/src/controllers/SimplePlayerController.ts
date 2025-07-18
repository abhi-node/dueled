/**
 * SimplePlayerController - Basic player management for 1v1 arena game
 * 
 * Replaces the complex 630-line playerController.ts with essential features only
 * Removes complex analytics, advanced search, and enterprise-level features
 */

import { Router, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { db } from '../services/database.js';

/**
 * SimplePlayerController - Essential player endpoints
 */
export class SimplePlayerController {
  private router: Router;
  
  constructor() {
    this.router = Router();
    this.setupRoutes();
  }
  
  /**
   * Setup player routes
   */
  private setupRoutes(): void {
    // All routes require authentication
    this.router.use(this.authenticateToken.bind(this));
    
    this.router.get('/leaderboard', this.getLeaderboard.bind(this));
    this.router.get('/match-history', this.getMatchHistory.bind(this));
    this.router.get('/stats', this.getPlayerStats.bind(this));
  }
  
  /**
   * Authenticate token middleware
   */
  private async authenticateToken(req: Request, res: Response, next: Function): Promise<void> {
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
      (req as any).user = { playerId: decoded.sub, username: decoded.sub };
      next();
      
    } catch (error) {
      logger.error('Token authentication error:', error);
      res.status(401).json({
        success: false,
        error: 'Authentication failed'
      });
    }
  }
  
  /**
   * Get simple leaderboard (top 50 by ELO)
   */
  private async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(10, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;
      
      const result = await db.query(
        `SELECT 
           u.id, u.username, u.elo_rating,
           COUNT(m.id) as total_matches,
           COUNT(CASE WHEN m.winner_id = u.id THEN 1 END) as wins,
           u.created_at
         FROM users u
         LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id) AND m.status = 'completed'
         GROUP BY u.id, u.username, u.elo_rating, u.created_at
         ORDER BY u.elo_rating DESC, total_matches DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      // Get total count for pagination
      const countResult = await db.query('SELECT COUNT(*) FROM users');
      const totalUsers = parseInt(countResult.rows[0].count);
      
      const leaderboard = result.rows.map((row: any, index: number) => ({
        rank: offset + index + 1,
        id: row.id,
        username: row.username,
        eloRating: row.elo_rating,
        totalMatches: parseInt(row.total_matches),
        wins: parseInt(row.wins),
        losses: parseInt(row.total_matches) - parseInt(row.wins),
        winRate: parseInt(row.total_matches) > 0 
          ? Math.round((parseInt(row.wins) / parseInt(row.total_matches)) * 100)
          : 0,
        memberSince: row.created_at
      }));
      
      res.json({
        success: true,
        data: {
          leaderboard,
          pagination: {
            page,
            limit,
            total: totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
            hasNext: offset + limit < totalUsers,
            hasPrev: page > 1
          }
        }
      });
      
    } catch (error) {
      logger.error('Get leaderboard error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get leaderboard'
      });
    }
  }
  
  /**
   * Get player match history
   */
  private async getMatchHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.playerId;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(10, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;
      
      const result = await db.query(
        `SELECT 
           m.id, m.status, m.winner_id, m.created_at, m.ended_at,
           p1.username as player1_username, p1.elo_rating as player1_elo,
           p2.username as player2_username, p2.elo_rating as player2_elo,
           CASE 
             WHEN m.player1_id = $1 THEN p2.username
             ELSE p1.username
           END as opponent_username,
           CASE 
             WHEN m.player1_id = $1 THEN p2.elo_rating
             ELSE p1.elo_rating
           END as opponent_elo,
           CASE 
             WHEN m.winner_id = $1 THEN 'win'
             WHEN m.winner_id IS NULL THEN 'draw'
             ELSE 'loss'
           END as result
         FROM matches m
         JOIN users p1 ON m.player1_id = p1.id
         JOIN users p2 ON m.player2_id = p2.id
         WHERE (m.player1_id = $1 OR m.player2_id = $1) AND m.status = 'completed'
         ORDER BY m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      
      // Get total match count
      const countResult = await db.query(
        'SELECT COUNT(*) FROM matches WHERE (player1_id = $1 OR player2_id = $1) AND status = \'completed\'',
        [userId]
      );
      const totalMatches = parseInt(countResult.rows[0].count);
      
      const matches = result.rows.map((row: any) => ({
        id: row.id,
        opponent: row.opponent_username,
        opponentElo: row.opponent_elo,
        result: row.result,
        date: row.created_at,
        duration: row.ended_at ? 
          Math.round((new Date(row.ended_at).getTime() - new Date(row.created_at).getTime()) / 1000) : 
          null
      }));
      
      res.json({
        success: true,
        data: {
          matches,
          pagination: {
            page,
            limit,
            total: totalMatches,
            totalPages: Math.ceil(totalMatches / limit),
            hasNext: offset + limit < totalMatches,
            hasPrev: page > 1
          }
        }
      });
      
    } catch (error) {
      logger.error('Get match history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get match history'
      });
    }
  }
  
  /**
   * Get player statistics
   */
  private async getPlayerStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.playerId;
      
      // Get basic stats
      const statsResult = await db.query(
        `SELECT 
           u.username, u.elo_rating, u.created_at,
           COUNT(m.id) as total_matches,
           COUNT(CASE WHEN m.winner_id = u.id THEN 1 END) as wins,
           COUNT(CASE WHEN m.winner_id IS NOT NULL AND m.winner_id != u.id THEN 1 END) as losses,
           COUNT(CASE WHEN m.winner_id IS NULL THEN 1 END) as draws
         FROM users u
         LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id) AND m.status = 'completed'
         WHERE u.id = $1
         GROUP BY u.id, u.username, u.elo_rating, u.created_at`,
        [userId]
      );
      
      if (statsResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Player not found'
        });
        return;
      }
      
      const stats = statsResult.rows[0];
      
      // Get recent performance (last 10 matches)
      const recentResult = await db.query(
        `SELECT 
           CASE 
             WHEN m.winner_id = $1 THEN 'win'
             WHEN m.winner_id IS NULL THEN 'draw'
             ELSE 'loss'
           END as result
         FROM matches m
         WHERE (m.player1_id = $1 OR m.player2_id = $1) AND m.status = 'completed'
         ORDER BY m.created_at DESC
         LIMIT 10`,
        [userId]
      );
      
      const recentMatches = recentResult.rows.map((row: any) => row.result);
      const recentWins = recentMatches.filter((result: string) => result === 'win').length;
      
      // Get current rank
      const rankResult = await db.query(
        `SELECT COUNT(*) + 1 as rank
         FROM users 
         WHERE elo_rating > (SELECT elo_rating FROM users WHERE id = $1)`,
        [userId]
      );
      
      const currentRank = parseInt(rankResult.rows[0].rank);
      
      // Calculate win rate
      const totalMatches = parseInt(stats.total_matches);
      const wins = parseInt(stats.wins);
      const losses = parseInt(stats.losses);
      const draws = parseInt(stats.draws);
      const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
      
      res.json({
        success: true,
        data: {
          player: {
            username: stats.username,
            eloRating: stats.elo_rating,
            currentRank,
            memberSince: stats.created_at
          },
          matchStats: {
            totalMatches,
            wins,
            losses,
            draws,
            winRate,
            recentPerformance: {
              last10Matches: recentMatches,
              last10Wins: recentWins,
              last10WinRate: recentMatches.length > 0 
                ? Math.round((recentWins / recentMatches.length) * 100)
                : 0
            }
          }
        }
      });
      
    } catch (error) {
      logger.error('Get player stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get player stats'
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
const simplePlayerController = new SimplePlayerController();
export const simplePlayerRoutes = simplePlayerController.getRouter();