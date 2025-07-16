import { ClassType, MatchStatus } from '@dueled/shared';

/**
 * Database model for Match entity
 */
export interface MatchModel {
  id: string;
  player1_id: string;
  player2_id: string;
  player1_class: ClassType;
  player2_class: ClassType;
  winner_id?: string;
  match_duration?: number;
  arena_map: string;
  player1_rating_before?: number;
  player2_rating_before?: number;
  player1_rating_after?: number;
  player2_rating_after?: number;
  status: MatchStatus;
  match_type: string;
  created_at: Date;
  started_at?: Date;
  ended_at?: Date;
}

/**
 * Database model for Match Event entity
 */
export interface MatchEventModel {
  id: string;
  match_id: string;
  player_id?: string;
  event_type: string;
  event_data?: any;
  game_time?: number;
  timestamp: Date;
}

/**
 * Match creation request
 */
export interface CreateMatchRequest {
  player1_id: string;
  player2_id: string;
  player1_class: ClassType;
  player2_class: ClassType;
  arena_map?: string;
  match_type?: string;
  player1_rating_before?: number;
  player2_rating_before?: number;
}

/**
 * Match update request
 */
export interface UpdateMatchRequest {
  winner_id?: string;
  match_duration?: number;
  status?: MatchStatus;
  player1_rating_after?: number;
  player2_rating_after?: number;
  started_at?: Date;
  ended_at?: Date;
}

/**
 * Match history filters
 */
export interface MatchHistoryFilters {
  player_id?: string;
  player1_id?: string;
  player2_id?: string;
  winner_id?: string;
  class_filter?: ClassType;
  match_type?: string;
  status?: MatchStatus;
  start_date?: Date;
  end_date?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Match with player information
 */
export interface MatchWithPlayers extends MatchModel {
  player1_username?: string;
  player2_username?: string;
  winner_username?: string;
}

/**
 * Match statistics summary
 */
export interface MatchStatsSummary {
  total_matches: number;
  completed_matches: number;
  cancelled_matches: number;
  average_duration: number;
  class_distribution: Record<ClassType, number>;
  map_distribution: Record<string, number>;
}

/**
 * Match event creation request
 */
export interface CreateMatchEventRequest {
  match_id: string;
  player_id?: string;
  event_type: string;
  event_data?: any;
  game_time?: number;
}

/**
 * Match event types
 */
export enum MatchEventType {
  MATCH_START = 'match_start',
  MATCH_END = 'match_end',
  PLAYER_MOVE = 'player_move',
  PLAYER_ATTACK = 'player_attack',
  PLAYER_ABILITY = 'player_ability',
  DAMAGE_DEALT = 'damage_dealt',
  DAMAGE_TAKEN = 'damage_taken',
  PLAYER_DEATH = 'player_death',
  PLAYER_RESPAWN = 'player_respawn',
  PLAYER_DISCONNECT = 'player_disconnect',
  PLAYER_RECONNECT = 'player_reconnect',
  MATCH_PAUSE = 'match_pause',
  MATCH_RESUME = 'match_resume'
}

/**
 * Event data types for different events
 */
export interface PlayerMoveEvent {
  from: { x: number; y: number };
  to: { x: number; y: number };
  timestamp: number;
}

export interface PlayerAttackEvent {
  target_id?: string;
  damage: number;
  damage_type: string;
  position: { x: number; y: number };
  timestamp: number;
}

export interface PlayerAbilityEvent {
  ability_name: string;
  target_id?: string;
  position: { x: number; y: number };
  timestamp: number;
}

export interface DamageEvent {
  source_id: string;
  target_id: string;
  damage: number;
  damage_type: string;
  remaining_health: number;
  timestamp: number;
}

/**
 * Match validation schema
 */
export const MatchValidation = {
  duration: {
    min: 1,
    max: 3600 // 1 hour max
  },
  arena_map: {
    allowed: ['default_arena', 'desert_arena', 'forest_arena', 'ice_arena']
  },
  match_type: {
    allowed: ['ranked', 'casual', 'tournament']
  },
  event_type: {
    allowed: Object.values(MatchEventType)
  }
} as const;