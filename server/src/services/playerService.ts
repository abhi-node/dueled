import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { ratingService, type PlayerRating, type MatchResult, type RatingUpdate } from './ratingService.js';
import type { Player, ClassType } from '@dueled/shared';

export interface PlayerStats {
  playerId: string;
  rating: number;
  ratingDeviation: number;
  ratingVolatility: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  favoriteClass?: ClassType;
  totalDamageDealt: number;
  totalDamageTaken: number;
  totalPlaytime: number;
  highestRating: number;
  winStreak: number;
  currentStreak: number;
  lastMatchDate?: Date;
  averageMatchDuration: number;
  damagePerMatch: number;
  accuracyPercentage: number;
  preferredPlayStyle?: string;
  classStats: Record<string, any>;
}

export interface PlayerProfile {
  id: string;
  username?: string;
  email?: string;
  isAnonymous: boolean;
  createdAt: Date;
  lastLogin?: Date;
  isActive: boolean;
  stats: PlayerStats;
}

export interface MatchHistory {
  matchId: string;
  opponentUsername: string;
  opponentId: string;
  playerClass: ClassType;
  opponentClass: ClassType;
  result: 'win' | 'loss' | 'draw';
  playerRatingBefore: number;
  playerRatingAfter: number;
  ratingChange: number;
  damageDealt: number;
  damageTaken: number;
  matchDuration: number;
  matchType: string;
  arenaMap: string;
  playedAt: Date;
}

export interface PlayerSearchResult {
  id: string;
  username: string;
  rating: number;
  matchesPlayed: number;
  winRate: number;
  isOnline: boolean;
  lastMatchDate?: Date;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  favoriteClass?: ClassType;
  highestRating: number;
  winStreak: number;
  damagePerMatch: number;
  lastMatchDate?: Date;
}

export class PlayerService {
  /**
   * Create a new player with initial stats
   */
  async createPlayer(playerData: {
    username?: string;
    email?: string;
    passwordHash?: string;
    isAnonymous: boolean;
  }): Promise<Player> {
    if (!db.isConnected()) {
      logger.warn('Database not available, using in-memory storage');
      const player: Player = {
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        username: playerData.username,
        isAnonymous: playerData.isAnonymous,
        rating: 1000,
      };
      return player;
    }

    try {
      // Validate input
      if (!playerData.isAnonymous) {
        if (!playerData.username || !playerData.email) {
          throw new Error('Username and email are required for non-anonymous players');
        }
        
        // Check for existing username/email
        const existingUser = await this.findPlayerByUsername(playerData.username);
        if (existingUser) {
          throw new Error('Username already exists');
        }
        
        const existingEmail = await this.findPlayerByEmail(playerData.email);
        if (existingEmail) {
          throw new Error('Email already exists');
        }
      }

      // Create player record
      const result = await db.query(
        `INSERT INTO players (username, email, password_hash, is_anonymous) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, username, is_anonymous, created_at`,
        [playerData.username, playerData.email, playerData.passwordHash, playerData.isAnonymous]
      );

      const player = result.rows[0];
      
      // Create initial player stats with Glicko-2 defaults
      const initialRating = ratingService.createNewPlayerRating();
      await db.query(
        `INSERT INTO player_stats (
          player_id, rating, rating_deviation, rating_volatility
        ) VALUES ($1, $2, $3, $4)`,
        [player.id, initialRating.rating, initialRating.deviation, initialRating.volatility]
      );

      logger.info(`Player created in database: ${player.username || 'Anonymous'} (${player.id})`);
      
      return {
        id: player.id,
        username: player.username,
        isAnonymous: player.is_anonymous,
        rating: initialRating.rating,
      };
    } catch (error) {
      logger.error('Database error creating player:', error);
      throw error;
    }
  }

  async findPlayerByUsername(username: string): Promise<any | null> {
    if (db.isConnected()) {
      try {
        const result = await db.query(
          `SELECT p.*, ps.rating 
           FROM players p 
           LEFT JOIN player_stats ps ON p.id = ps.player_id 
           WHERE p.username = $1 AND p.is_active = true`,
          [username]
        );
        return result.rows[0] || null;
      } catch (error) {
        logger.error('Database error finding player:', error);
        return null;
      }
    } else {
      logger.warn('Database not available for player lookup');
      return null;
    }
  }

  async findPlayerById(id: string): Promise<Player | null> {
    if (db.isConnected()) {
      try {
        const result = await db.query(
          `SELECT p.*, ps.rating 
           FROM players p 
           LEFT JOIN player_stats ps ON p.id = ps.player_id 
           WHERE p.id = $1 AND p.is_active = true`,
          [id]
        );

        if (result.rows.length === 0) {
          return null;
        }

        const row = result.rows[0];
        return {
          id: row.id,
          username: row.username,
          isAnonymous: row.is_anonymous,
          rating: row.rating || 1000,
        };
      } catch (error) {
        logger.error('Database error finding player by ID:', error);
        return null;
      }
    } else {
      logger.warn('Database not available for player lookup');
      return null;
    }
  }

  async getPlayerStats(playerId: string): Promise<any> {
    if (db.isConnected()) {
      try {
        const result = await db.query(
          `SELECT * FROM player_stats WHERE player_id = $1`,
          [playerId]
        );
        return result.rows[0] || null;
      } catch (error) {
        logger.error('Database error getting player stats:', error);
        return null;
      }
    } else {
      // Return default stats for in-memory mode
      return {
        player_id: playerId,
        rating: 1000,
        matches_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        favorite_class: null,
        total_damage_dealt: 0,
        total_damage_taken: 0,
        total_playtime_seconds: 0,
        highest_rating: 1000,
        win_streak: 0,
        current_streak: 0,
      };
    }
  }

  async updatePlayerStats(playerId: string, updates: any): Promise<void> {
    if (db.isConnected()) {
      try {
        const setClause = Object.keys(updates)
          .map((key, index) => `${key} = $${index + 2}`)
          .join(', ');
        
        const values = [playerId, ...Object.values(updates)];
        
        await db.query(
          `UPDATE player_stats SET ${setClause} WHERE player_id = $1`,
          values
        );
        
        logger.debug(`Player stats updated for ${playerId}`);
      } catch (error) {
        logger.error('Database error updating player stats:', error);
      }
    } else {
      logger.debug('Database not available, stats update skipped');
    }
  }

  async getRecentMatches(playerId: string, limit: number = 10): Promise<any[]> {
    if (db.isConnected()) {
      try {
        const result = await db.query(
          `SELECT * FROM match_history_view 
           WHERE player1_username = (SELECT username FROM players WHERE id = $1)
              OR player2_username = (SELECT username FROM players WHERE id = $1)
           ORDER BY created_at DESC 
           LIMIT $2`,
          [playerId, limit]
        );
        return result.rows;
      } catch (error) {
        logger.error('Database error getting recent matches:', error);
        return [];
      }
    } else {
      return [];
    }
  }

  async findPlayerByEmail(email: string): Promise<any | null> {
    if (db.isConnected()) {
      try {
        const result = await db.query(
          `SELECT p.*, ps.rating 
           FROM players p 
           LEFT JOIN player_stats ps ON p.id = ps.player_id 
           WHERE p.email = $1 AND p.is_active = true`,
          [email]
        );
        return result.rows[0] || null;
      } catch (error) {
        logger.error('Database error finding player by email:', error);
        return null;
      }
    } else {
      logger.warn('Database not available for player lookup');
      return null;
    }
  }

  async updateLastLogin(playerId: string): Promise<void> {
    if (db.isConnected()) {
      try {
        await db.query(
          `UPDATE players SET last_login = NOW() WHERE id = $1`,
          [playerId]
        );
        logger.debug(`Last login updated for player ${playerId}`);
      } catch (error) {
        logger.error('Database error updating last login:', error);
      }
    } else {
      logger.debug('Database not available, last login update skipped');
    }
  }

  async updatePlayer(playerId: string, updates: {
    username?: string;
    email?: string;
    favoriteClass?: string;
  }): Promise<Player | null> {
    if (db.isConnected()) {
      try {
        // Check if username/email already exist (if being updated)
        if (updates.username) {
          const existingUser = await this.findPlayerByUsername(updates.username);
          if (existingUser && existingUser.id !== playerId) {
            throw new Error('Username already exists');
          }
        }

        if (updates.email) {
          const existingUser = await this.findPlayerByEmail(updates.email);
          if (existingUser && existingUser.id !== playerId) {
            throw new Error('Email already exists');
          }
        }

        // Build dynamic update query
        const setClause = [];
        const values = [playerId];
        let paramIndex = 2;

        if (updates.username !== undefined) {
          setClause.push(`username = $${paramIndex++}`);
          values.push(updates.username);
        }

        if (updates.email !== undefined) {
          setClause.push(`email = $${paramIndex++}`);
          values.push(updates.email);
        }

        if (setClause.length === 0 && !updates.favoriteClass) {
          // No updates to make
          return await this.findPlayerById(playerId);
        }

        // Update player table if needed
        if (setClause.length > 0) {
          await db.query(
            `UPDATE players SET ${setClause.join(', ')} WHERE id = $1`,
            values
          );
        }

        // Update favorite class in player_stats if provided
        if (updates.favoriteClass !== undefined) {
          await db.query(
            `UPDATE player_stats SET favorite_class = $2 WHERE player_id = $1`,
            [playerId, updates.favoriteClass]
          );
        }

        logger.info(`Player updated: ${playerId}`);
        return await this.findPlayerById(playerId);
      } catch (error) {
        logger.error('Database error updating player:', error);
        throw error;
      }
    } else {
      logger.warn('Database not available for player update');
      throw new Error('Database not available');
    }
  }

  async deletePlayer(playerId: string): Promise<boolean> {
    if (db.isConnected()) {
      try {
        // Soft delete by setting is_active to false
        const result = await db.query(
          `UPDATE players SET is_active = false WHERE id = $1`,
          [playerId]
        );

        logger.info(`Player soft deleted: ${playerId}`);
        return result.rowCount > 0;
      } catch (error) {
        logger.error('Database error deleting player:', error);
        return false;
      }
    } else {
      logger.warn('Database not available for player deletion');
      return false;
    }
  }

  /**
   * Get comprehensive player profile with statistics
   */
  async getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
    if (!db.isConnected()) {
      logger.warn('Database not available for player profile');
      return null;
    }

    try {
      const result = await db.query(
        `SELECT 
          p.id, p.username, p.email, p.is_anonymous, p.created_at, p.last_login, p.is_active,
          ps.rating, ps.rating_deviation, ps.rating_volatility, ps.matches_played, 
          ps.wins, ps.losses, ps.draws, ps.favorite_class, ps.total_damage_dealt, 
          ps.total_damage_taken, ps.total_playtime_seconds, ps.highest_rating, 
          ps.win_streak, ps.current_streak, ps.last_match_date, ps.average_match_duration,
          ps.damage_per_match, ps.accuracy_percentage, ps.preferred_play_style, ps.class_stats
        FROM players p
        JOIN player_stats ps ON p.id = ps.player_id
        WHERE p.id = $1 AND p.is_active = true`,
        [playerId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        email: row.email,
        isAnonymous: row.is_anonymous,
        createdAt: row.created_at,
        lastLogin: row.last_login,
        isActive: row.is_active,
        stats: {
          playerId: row.id,
          rating: row.rating,
          ratingDeviation: row.rating_deviation,
          ratingVolatility: row.rating_volatility,
          matchesPlayed: row.matches_played,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          winRate: row.matches_played > 0 ? (row.wins / row.matches_played) * 100 : 0,
          favoriteClass: row.favorite_class,
          totalDamageDealt: row.total_damage_dealt,
          totalDamageTaken: row.total_damage_taken,
          totalPlaytime: row.total_playtime_seconds,
          highestRating: row.highest_rating,
          winStreak: row.win_streak,
          currentStreak: row.current_streak,
          lastMatchDate: row.last_match_date,
          averageMatchDuration: row.average_match_duration,
          damagePerMatch: row.damage_per_match,
          accuracyPercentage: row.accuracy_percentage,
          preferredPlayStyle: row.preferred_play_style,
          classStats: row.class_stats || {}
        }
      };
    } catch (error) {
      logger.error('Database error getting player profile:', error);
      return null;
    }
  }

  /**
   * Get detailed match history for a player
   */
  async getMatchHistory(playerId: string, options: {
    limit?: number;
    offset?: number;
    classFilter?: ClassType;
    opponentFilter?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<{ matches: MatchHistory[]; total: number }> {
    if (!db.isConnected()) {
      logger.warn('Database not available for match history');
      return { matches: [], total: 0 };
    }

    const { limit = 10, offset = 0, classFilter, opponentFilter, dateFrom, dateTo } = options;

    try {
      let whereClause = 'WHERE (m.player1_id = $1 OR m.player2_id = $1) AND m.status = \'completed\'';
      const params = [playerId];
      let paramIndex = 2;

      if (classFilter) {
        whereClause += ` AND ((m.player1_id = $1 AND m.player1_class = $${paramIndex}) OR (m.player2_id = $1 AND m.player2_class = $${paramIndex}))`;
        params.push(classFilter);
        paramIndex++;
      }

      if (opponentFilter) {
        whereClause += ` AND ((m.player1_id = $1 AND p2.username ILIKE $${paramIndex}) OR (m.player2_id = $1 AND p1.username ILIKE $${paramIndex}))`;
        params.push(`%${opponentFilter}%`);
        paramIndex++;
      }

      if (dateFrom) {
        whereClause += ` AND m.ended_at >= $${paramIndex}`;
        params.push(dateFrom.toISOString());
        paramIndex++;
      }

      if (dateTo) {
        whereClause += ` AND m.ended_at <= $${paramIndex}`;
        params.push(dateTo.toISOString());
        paramIndex++;
      }

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(*) as total
         FROM matches m
         JOIN players p1 ON m.player1_id = p1.id
         JOIN players p2 ON m.player2_id = p2.id
         ${whereClause}`,
        params
      );

      const total = parseInt(countResult.rows[0].total);

      // Get matches
      const matchesResult = await db.query(
        `SELECT 
          m.id as match_id,
          m.player1_id, m.player2_id,
          m.player1_class, m.player2_class,
          m.winner_id,
          m.player1_rating_before, m.player1_rating_after,
          m.player2_rating_before, m.player2_rating_after,
          m.player1_damage_dealt, m.player1_damage_taken,
          m.player2_damage_dealt, m.player2_damage_taken,
          m.match_duration, m.match_type, m.arena_map,
          m.ended_at,
          p1.username as player1_username,
          p2.username as player2_username
        FROM matches m
        JOIN players p1 ON m.player1_id = p1.id
        JOIN players p2 ON m.player2_id = p2.id
        ${whereClause}
        ORDER BY m.ended_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      const matches = matchesResult.rows.map((row: any) => {
        const isPlayer1 = row.player1_id === playerId;
        const opponentId = isPlayer1 ? row.player2_id : row.player1_id;
        const opponentUsername = isPlayer1 ? row.player2_username : row.player1_username;
        const playerClass = isPlayer1 ? row.player1_class : row.player2_class;
        const opponentClass = isPlayer1 ? row.player2_class : row.player1_class;
        const playerRatingBefore = isPlayer1 ? row.player1_rating_before : row.player2_rating_before;
        const playerRatingAfter = isPlayer1 ? row.player1_rating_after : row.player2_rating_after;
        const damageDealt = isPlayer1 ? row.player1_damage_dealt : row.player2_damage_dealt;
        const damageTaken = isPlayer1 ? row.player1_damage_taken : row.player2_damage_taken;
        
        let result: 'win' | 'loss' | 'draw' = 'draw';
        if (row.winner_id === playerId) {
          result = 'win';
        } else if (row.winner_id && row.winner_id !== playerId) {
          result = 'loss';
        }

        return {
          matchId: row.match_id,
          opponentUsername,
          opponentId,
          playerClass,
          opponentClass,
          result,
          playerRatingBefore,
          playerRatingAfter,
          ratingChange: playerRatingAfter - playerRatingBefore,
          damageDealt,
          damageTaken,
          matchDuration: row.match_duration,
          matchType: row.match_type,
          arenaMap: row.arena_map,
          playedAt: row.ended_at
        };
      });

      return { matches, total };
    } catch (error) {
      logger.error('Database error getting match history:', error);
      return { matches: [], total: 0 };
    }
  }

  /**
   * Search for players by username
   */
  async searchPlayers(searchTerm: string, limit: number = 10): Promise<PlayerSearchResult[]> {
    if (!db.isConnected()) {
      logger.warn('Database not available for player search');
      return [];
    }

    try {
      const result = await db.query(
        `SELECT * FROM search_players($1, $2)`,
        [searchTerm, limit]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        username: row.username,
        rating: row.rating,
        matchesPlayed: row.matches_played,
        winRate: row.win_rate,
        isOnline: false, // TODO: Implement online status
        lastMatchDate: row.last_match_date
      }));
    } catch (error) {
      logger.error('Database error searching players:', error);
      return [];
    }
  }

  /**
   * Get autocomplete suggestions for usernames
   */
  async getUsernameSuggestions(prefix: string, limit: number = 5): Promise<string[]> {
    if (!db.isConnected()) {
      logger.warn('Database not available for username suggestions');
      return [];
    }

    try {
      const result = await db.query(
        `SELECT username 
         FROM players 
         WHERE username ILIKE $1 AND is_active = true AND is_anonymous = false
         ORDER BY username
         LIMIT $2`,
        [`${prefix}%`, limit]
      );

      return result.rows.map((row: any) => row.username);
    } catch (error) {
      logger.error('Database error getting username suggestions:', error);
      return [];
    }
  }

  /**
   * Update player rating after a match
   */
  async updatePlayerRating(playerId: string, opponentRating: PlayerRating, score: number): Promise<RatingUpdate> {
    if (!db.isConnected()) {
      throw new Error('Database not available for rating update');
    }

    try {
      // Get current player rating
      const playerResult = await db.query(
        `SELECT rating, rating_deviation, rating_volatility 
         FROM player_stats 
         WHERE player_id = $1`,
        [playerId]
      );

      if (playerResult.rows.length === 0) {
        throw new Error('Player not found');
      }

      const playerRating: PlayerRating = {
        rating: playerResult.rows[0].rating,
        deviation: playerResult.rows[0].rating_deviation,
        volatility: playerResult.rows[0].rating_volatility
      };

      // Calculate new rating
      const matchResult: MatchResult = { opponent: opponentRating, score };
      const ratingUpdate = ratingService.updateRating(playerRating, [matchResult]);

      // Update player stats
      await db.query(
        `UPDATE player_stats 
         SET rating = $2, rating_deviation = $3, rating_volatility = $4
         WHERE player_id = $1`,
        [playerId, ratingUpdate.rating, ratingUpdate.deviation, ratingUpdate.volatility]
      );

      logger.info(`Rating updated for player ${playerId}: ${playerRating.rating} -> ${ratingUpdate.rating} (${ratingUpdate.rating_change > 0 ? '+' : ''}${ratingUpdate.rating_change})`);
      
      return ratingUpdate;
    } catch (error) {
      logger.error('Database error updating player rating:', error);
      throw error;
    }
  }

  /**
   * Get leaderboard with enhanced filtering and pagination
   */
  async getLeaderboard(options: {
    limit?: number;
    offset?: number;
    classFilter?: ClassType;
    minMatches?: number;
    excludeAnonymous?: boolean;
  } = {}): Promise<{ entries: LeaderboardEntry[]; total: number }> {
    if (!db.isConnected()) {
      logger.warn('Database not available for leaderboard');
      return { entries: [], total: 0 };
    }

    const { 
      limit = 50, 
      offset = 0, 
      classFilter, 
      minMatches = 5,
      excludeAnonymous = true 
    } = options;

    try {
      let whereClause = 'WHERE p.is_active = true';
      const params: any[] = [];
      let paramIndex = 1;

      if (excludeAnonymous) {
        whereClause += ' AND p.is_anonymous = false';
      }

      if (minMatches > 0) {
        whereClause += ` AND ps.matches_played >= $${paramIndex}`;
        params.push(minMatches);
        paramIndex++;
      }

      if (classFilter) {
        whereClause += ` AND ps.favorite_class = $${paramIndex}`;
        params.push(classFilter);
        paramIndex++;
      }

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(*) as total
         FROM players p
         JOIN player_stats ps ON p.id = ps.player_id
         ${whereClause}`,
        params
      );

      const total = parseInt(countResult.rows[0].total);

      // Get leaderboard entries
      const result = await db.query(
        `SELECT 
          p.id, p.username, 
          ps.rating, ps.matches_played, ps.wins, ps.losses, ps.draws,
          ps.favorite_class, ps.highest_rating, ps.win_streak, ps.last_match_date,
          ps.total_damage_dealt, ps.matches_played,
          CASE 
            WHEN ps.matches_played = 0 THEN 0
            ELSE ROUND((ps.wins::DECIMAL / ps.matches_played) * 100, 2)
          END as win_rate,
          CASE 
            WHEN ps.matches_played = 0 THEN 0
            ELSE ROUND(ps.total_damage_dealt::DECIMAL / ps.matches_played, 2)
          END as damage_per_match,
          ROW_NUMBER() OVER (ORDER BY ps.rating DESC, ps.matches_played DESC) as rank
        FROM players p
        JOIN player_stats ps ON p.id = ps.player_id
        ${whereClause}
        ORDER BY ps.rating DESC, ps.matches_played DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      const entries = result.rows.map((row: any) => ({
        rank: parseInt(row.rank) + offset,
        id: row.id,
        username: row.username,
        rating: row.rating,
        matchesPlayed: row.matches_played,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        winRate: row.win_rate,
        favoriteClass: row.favorite_class,
        highestRating: row.highest_rating,
        winStreak: row.win_streak,
        damagePerMatch: row.damage_per_match,
        lastMatchDate: row.last_match_date
      }));

      return { entries, total };
    } catch (error) {
      logger.error('Database error getting leaderboard:', error);
      return { entries: [], total: 0 };
    }
  }

  /**
   * Get player statistics by class
   */
  async getPlayerClassStats(playerId: string, classType?: ClassType): Promise<any[]> {
    if (!db.isConnected()) {
      logger.warn('Database not available for class stats');
      return [];
    }

    try {
      let query = `
        SELECT 
          class_type, matches_played, wins, losses, draws,
          total_damage_dealt, total_damage_taken, total_healing_done,
          favorite_ability, average_match_duration, best_performance_score,
          last_played,
          CASE 
            WHEN matches_played = 0 THEN 0
            ELSE ROUND((wins::DECIMAL / matches_played) * 100, 2)
          END as win_rate
        FROM player_class_stats
        WHERE player_id = $1
      `;

      const params = [playerId];
      
      if (classType) {
        query += ' AND class_type = $2';
        params.push(classType);
      }

      query += ' ORDER BY matches_played DESC';

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Database error getting player class stats:', error);
      return [];
    }
  }

  /**
   * Record match performance for detailed statistics
   */
  async recordMatchPerformance(matchId: string, playerId: string, performance: {
    classPlayed: ClassType;
    damageDealt: number;
    damageTaken: number;
    healingDone?: number;
    abilitiesUsed?: number;
    accuracyPercentage?: number;
    timeAlive?: number;
    distanceMoved?: number;
    criticalHits?: number;
    kills?: number;
    deaths?: number;
  }): Promise<void> {
    if (!db.isConnected()) {
      logger.warn('Database not available for match performance recording');
      return;
    }

    try {
      // Calculate performance score (simplified algorithm)
      const performanceScore = this.calculatePerformanceScore(performance);
      
      await db.query(
        `INSERT INTO player_match_performance (
          match_id, player_id, class_played, damage_dealt, damage_taken,
          healing_done, abilities_used, accuracy_percentage, time_alive,
          distance_moved, critical_hits, kills, deaths, performance_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          matchId, playerId, performance.classPlayed, performance.damageDealt,
          performance.damageTaken, performance.healingDone || 0, performance.abilitiesUsed || 0,
          performance.accuracyPercentage || 0, performance.timeAlive || 0,
          performance.distanceMoved || 0, performance.criticalHits || 0,
          performance.kills || 0, performance.deaths || 0, performanceScore
        ]
      );

      // Update class-specific statistics
      await this.updatePlayerClassStats(playerId, performance.classPlayed, performance);
      
      logger.debug(`Match performance recorded for player ${playerId} in match ${matchId}`);
    } catch (error) {
      logger.error('Database error recording match performance:', error);
    }
  }

  /**
   * Update class-specific statistics
   */
  private async updatePlayerClassStats(playerId: string, classType: ClassType, performance: any): Promise<void> {
    try {
      await db.query(
        `INSERT INTO player_class_stats (
          player_id, class_type, matches_played, total_damage_dealt, 
          total_damage_taken, total_healing_done, last_played
        ) VALUES ($1, $2, 1, $3, $4, $5, NOW())
        ON CONFLICT (player_id, class_type) DO UPDATE SET
          matches_played = player_class_stats.matches_played + 1,
          total_damage_dealt = player_class_stats.total_damage_dealt + $3,
          total_damage_taken = player_class_stats.total_damage_taken + $4,
          total_healing_done = player_class_stats.total_healing_done + $5,
          last_played = NOW()`,
        [playerId, classType, performance.damageDealt, performance.damageTaken, performance.healingDone || 0]
      );
    } catch (error) {
      logger.error('Database error updating player class stats:', error);
    }
  }

  /**
   * Calculate performance score based on various metrics
   */
  private calculatePerformanceScore(performance: any): number {
    // Simplified performance score calculation
    // This can be enhanced with more sophisticated algorithms
    let score = 0;
    
    // Damage contribution
    score += performance.damageDealt * 0.1;
    
    // Survival bonus
    score += (performance.timeAlive || 0) * 0.05;
    
    // Accuracy bonus
    score += (performance.accuracyPercentage || 0) * 2;
    
    // Critical hit bonus
    score += (performance.criticalHits || 0) * 10;
    
    // Kill bonus
    score += (performance.kills || 0) * 50;
    
    // Death penalty
    score -= (performance.deaths || 0) * 25;
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Apply rating decay for inactive players
   */
  async applyRatingDecay(playerId: string): Promise<void> {
    if (!db.isConnected()) {
      logger.warn('Database not available for rating decay');
      return;
    }

    try {
      const result = await db.query(
        `SELECT 
          ps.rating, ps.rating_deviation, ps.rating_volatility,
          ps.last_match_date,
          EXTRACT(DAYS FROM (NOW() - ps.last_match_date)) as days_inactive
        FROM player_stats ps
        WHERE ps.player_id = $1`,
        [playerId]
      );

      if (result.rows.length === 0) {
        return;
      }

      const row = result.rows[0];
      const daysInactive = parseInt(row.days_inactive) || 0;
      
      if (daysInactive > 30) { // Apply decay after 30 days of inactivity
        const currentRating: PlayerRating = {
          rating: row.rating,
          deviation: row.rating_deviation,
          volatility: row.rating_volatility
        };

        const decayedRating = ratingService.applyRatingDecay(currentRating, daysInactive);
        
        await db.query(
          `UPDATE player_stats 
           SET rating_deviation = $2, rating_volatility = $3
           WHERE player_id = $1`,
          [playerId, decayedRating.deviation, decayedRating.volatility]
        );

        logger.info(`Rating decay applied to player ${playerId} after ${daysInactive} days of inactivity`);
      }
    } catch (error) {
      logger.error('Database error applying rating decay:', error);
    }
  }

  /**
   * Get comprehensive player statistics
   */
  async getPlayerAnalytics(playerId: string): Promise<any> {
    if (!db.isConnected()) {
      logger.warn('Database not available for player analytics');
      return null;
    }

    try {
      // Get basic stats
      const profile = await this.getPlayerProfile(playerId);
      if (!profile) {
        return null;
      }

      // Get class stats
      const classStats = await this.getPlayerClassStats(playerId);

      // Get recent performance trends
      const performanceTrends = await db.query(
        `SELECT 
          DATE_TRUNC('day', ended_at) as date,
          AVG(CASE WHEN player1_id = $1 THEN player1_rating_after - player1_rating_before 
                   ELSE player2_rating_after - player2_rating_before END) as avg_rating_change,
          COUNT(*) as matches_played
        FROM matches
        WHERE (player1_id = $1 OR player2_id = $1) 
          AND status = 'completed'
          AND ended_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', ended_at)
        ORDER BY date ASC`,
        [playerId]
      );

      // Get win/loss streaks
      const streaks = await db.query(
        `SELECT 
          winner_id,
          ended_at,
          LAG(winner_id) OVER (ORDER BY ended_at) as prev_winner
        FROM matches
        WHERE (player1_id = $1 OR player2_id = $1) 
          AND status = 'completed'
        ORDER BY ended_at DESC
        LIMIT 20`,
        [playerId]
      );

      return {
        profile,
        classStats,
        performanceTrends: performanceTrends.rows,
        recentStreaks: streaks.rows
      };
    } catch (error) {
      logger.error('Database error getting player analytics:', error);
      return null;
    }
  }
}