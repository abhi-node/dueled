-- Migration: Enhance database schema with missing fields and constraints
-- Created: 2024-07-15T10:00:00Z
-- Description: Add missing fields and improve constraints for players, matches, and events

BEGIN;

-- Add missing columns to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_type VARCHAR(20) DEFAULT 'ranked';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS map_name VARCHAR(50) DEFAULT 'default_arena';

-- Update match_events table structure
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) NOT NULL DEFAULT 'unknown';
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS event_data JSONB;

-- Add constraints and validations
ALTER TABLE players ADD CONSTRAINT chk_username_length CHECK (LENGTH(username) >= 3 AND LENGTH(username) <= 50);
ALTER TABLE players ADD CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Add rating constraints
ALTER TABLE player_stats ADD CONSTRAINT chk_rating_range CHECK (rating >= 0 AND rating <= 5000);
ALTER TABLE player_stats ADD CONSTRAINT chk_matches_non_negative CHECK (matches_played >= 0 AND wins >= 0 AND losses >= 0);

-- Add match constraints
ALTER TABLE matches ADD CONSTRAINT chk_player_different CHECK (player1_id != player2_id);
ALTER TABLE matches ADD CONSTRAINT chk_match_duration_positive CHECK (match_duration > 0);
ALTER TABLE matches ADD CONSTRAINT chk_valid_status CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled'));

-- Create view for match history with player names
CREATE OR REPLACE VIEW match_history_view AS
SELECT 
    m.id as match_id,
    m.player1_id,
    m.player2_id,
    p1.username as player1_username,
    p2.username as player2_username,
    m.player1_class,
    m.player2_class,
    m.winner_id,
    CASE 
        WHEN m.winner_id = m.player1_id THEN p1.username
        WHEN m.winner_id = m.player2_id THEN p2.username
        ELSE NULL
    END as winner_username,
    m.match_duration,
    m.arena_map,
    m.player1_rating_before,
    m.player2_rating_before,
    m.player1_rating_after,
    m.player2_rating_after,
    m.status,
    m.created_at,
    m.started_at,
    m.ended_at
FROM matches m
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id;

-- Add additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_rating ON players USING btree ((SELECT rating FROM player_stats WHERE player_id = players.id));
CREATE INDEX IF NOT EXISTS idx_matches_match_type ON matches(match_type);
CREATE INDEX IF NOT EXISTS idx_match_events_event_type ON match_events(event_type);
CREATE INDEX IF NOT EXISTS idx_player_stats_updated_at ON player_stats(updated_at);

-- Add function to calculate win rate
CREATE OR REPLACE FUNCTION calculate_win_rate(player_wins INTEGER, total_matches INTEGER)
RETURNS NUMERIC(5,2) AS $$
BEGIN
    IF total_matches = 0 THEN
        RETURN 0.0;
    END IF;
    RETURN ROUND((player_wins::NUMERIC / total_matches::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Add function to update player statistics after match
CREATE OR REPLACE FUNCTION update_player_stats_after_match(
    p_player_id UUID,
    p_rating_change INTEGER,
    p_is_winner BOOLEAN,
    p_damage_dealt BIGINT,
    p_damage_taken BIGINT,
    p_match_duration INTEGER,
    p_class_used VARCHAR(20)
) RETURNS VOID AS $$
BEGIN
    UPDATE player_stats 
    SET 
        rating = rating + p_rating_change,
        matches_played = matches_played + 1,
        wins = wins + CASE WHEN p_is_winner THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN NOT p_is_winner THEN 1 ELSE 0 END,
        total_damage_dealt = total_damage_dealt + p_damage_dealt,
        total_damage_taken = total_damage_taken + p_damage_taken,
        total_playtime_seconds = total_playtime_seconds + p_match_duration,
        highest_rating = GREATEST(highest_rating, rating + p_rating_change),
        current_streak = CASE 
            WHEN p_is_winner THEN 
                CASE WHEN current_streak >= 0 THEN current_streak + 1 ELSE 1 END
            ELSE 
                CASE WHEN current_streak <= 0 THEN current_streak - 1 ELSE -1 END
        END,
        win_streak = CASE 
            WHEN p_is_winner AND current_streak >= 0 THEN GREATEST(win_streak, current_streak + 1)
            ELSE win_streak
        END,
        favorite_class = CASE 
            WHEN favorite_class IS NULL THEN p_class_used
            ELSE favorite_class
        END,
        updated_at = NOW()
    WHERE player_id = p_player_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;