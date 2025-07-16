import { ClassType } from '@dueled/shared';

/**
 * Database model for Player entity
 */
export interface PlayerModel {
  id: string;
  username?: string;
  email?: string;
  password_hash?: string;
  created_at: Date;
  last_login?: Date;
  is_anonymous: boolean;
  is_active: boolean;
}

/**
 * Database model for Player Stats entity
 */
export interface PlayerStatsModel {
  player_id: string;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  favorite_class?: ClassType;
  total_damage_dealt: number;
  total_damage_taken: number;
  total_playtime_seconds: number;
  highest_rating: number;
  win_streak: number;
  current_streak: number;
  updated_at: Date;
}

/**
 * Combined player data with stats
 */
export interface PlayerWithStats extends PlayerModel {
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  favorite_class?: ClassType;
  total_damage_dealt: number;
  total_damage_taken: number;
  total_playtime_seconds: number;
  highest_rating: number;
  win_streak: number;
  current_streak: number;
  win_rate: number;
}

/**
 * Player creation request
 */
export interface CreatePlayerRequest {
  username?: string;
  email?: string;
  password_hash?: string;
  is_anonymous: boolean;
}

/**
 * Player update request
 */
export interface UpdatePlayerRequest {
  username?: string;
  email?: string;
  favorite_class?: ClassType;
}

/**
 * Player search filters
 */
export interface PlayerSearchFilters {
  username?: string;
  min_rating?: number;
  max_rating?: number;
  class_filter?: ClassType;
  min_matches?: number;
  limit?: number;
  offset?: number;
}

/**
 * Player statistics update
 */
export interface PlayerStatsUpdate {
  rating?: number;
  matches_played?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  favorite_class?: ClassType;
  total_damage_dealt?: number;
  total_damage_taken?: number;
  total_playtime_seconds?: number;
  highest_rating?: number;
  win_streak?: number;
  current_streak?: number;
}

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  favorite_class?: ClassType;
  highest_rating: number;
  win_streak: number;
  win_rate: number;
}

/**
 * Player validation schema
 */
export const PlayerValidation = {
  username: {
    minLength: 3,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9_-]+$/,
    reserved: ['admin', 'system', 'anonymous', 'guest', 'moderator']
  },
  email: {
    pattern: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
    maxLength: 100
  },
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false
  },
  rating: {
    min: 0,
    max: 5000,
    default: 1000
  }
} as const;