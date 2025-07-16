-- Migration: Enhanced Player System
-- Created: 2025-07-15
-- Description: Enhanced player system with advanced statistics and proper rating system

BEGIN;

-- Add missing columns to player_stats table for Glicko-2 rating system
ALTER TABLE player_stats 
ADD COLUMN IF NOT EXISTS rating_deviation INTEGER DEFAULT 350,
ADD COLUMN IF NOT EXISTS rating_volatility DECIMAL(8,6) DEFAULT 0.06,
ADD COLUMN IF NOT EXISTS last_match_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS average_match_duration INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS damage_per_match DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS accuracy_percentage DECIMAL(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS preferred_play_style VARCHAR(20),
ADD COLUMN IF NOT EXISTS class_stats JSONB DEFAULT '{}';

-- Update matches table to include more detailed match information
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS match_type VARCHAR(20) DEFAULT 'ranked',
ADD COLUMN IF NOT EXISTS player1_damage_dealt INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS player2_damage_dealt INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS player1_damage_taken INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS player2_damage_taken INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_actions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS match_data JSONB DEFAULT '{}';

-- Create match_events table with enhanced event tracking
DROP TABLE IF EXISTS match_events;
CREATE TABLE match_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    game_time INTEGER NOT NULL, -- milliseconds since match start
    server_timestamp TIMESTAMP DEFAULT NOW(),
    position_x DECIMAL(10,2),
    position_y DECIMAL(10,2),
    target_id UUID REFERENCES players(id),
    damage_amount INTEGER,
    is_critical BOOLEAN DEFAULT FALSE,
    ability_used VARCHAR(50),
    sequence_number INTEGER NOT NULL
);

-- Create player_achievements table
CREATE TABLE IF NOT EXISTS player_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    achievement_type VARCHAR(50) NOT NULL,
    achievement_data JSONB DEFAULT '{}',
    earned_at TIMESTAMP DEFAULT NOW(),
    match_id UUID REFERENCES matches(id)
);

-- Create player_match_performance table for detailed match statistics
CREATE TABLE IF NOT EXISTS player_match_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    class_played VARCHAR(20) NOT NULL,
    damage_dealt INTEGER DEFAULT 0,
    damage_taken INTEGER DEFAULT 0,
    healing_done INTEGER DEFAULT 0,
    abilities_used INTEGER DEFAULT 0,
    accuracy_percentage DECIMAL(5,2) DEFAULT 0.00,
    time_alive INTEGER DEFAULT 0, -- seconds
    distance_moved DECIMAL(10,2) DEFAULT 0.00,
    critical_hits INTEGER DEFAULT 0,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    performance_score DECIMAL(10,2) DEFAULT 0.00,
    mvp_score DECIMAL(10,2) DEFAULT 0.00
);

-- Create player_class_stats table for class-specific statistics
CREATE TABLE IF NOT EXISTS player_class_stats (
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    class_type VARCHAR(20) NOT NULL,
    matches_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    total_damage_dealt BIGINT DEFAULT 0,
    total_damage_taken BIGINT DEFAULT 0,
    total_healing_done BIGINT DEFAULT 0,
    favorite_ability VARCHAR(50),
    average_match_duration INTEGER DEFAULT 0,
    best_performance_score DECIMAL(10,2) DEFAULT 0.00,
    last_played TIMESTAMP,
    PRIMARY KEY (player_id, class_type)
);

-- Create enhanced indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_events_match_player ON match_events(match_id, player_id);
CREATE INDEX IF NOT EXISTS idx_match_events_type ON match_events(event_type);
CREATE INDEX IF NOT EXISTS idx_match_events_game_time ON match_events(match_id, game_time);
CREATE INDEX IF NOT EXISTS idx_match_events_sequence ON match_events(match_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_type ON player_achievements(achievement_type);
CREATE INDEX IF NOT EXISTS idx_player_achievements_earned_at ON player_achievements(earned_at);

CREATE INDEX IF NOT EXISTS idx_player_match_performance_match ON player_match_performance(match_id);
CREATE INDEX IF NOT EXISTS idx_player_match_performance_player ON player_match_performance(player_id);
CREATE INDEX IF NOT EXISTS idx_player_match_performance_class ON player_match_performance(class_played);

CREATE INDEX IF NOT EXISTS idx_player_class_stats_player ON player_class_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_class_stats_class ON player_class_stats(class_type);
CREATE INDEX IF NOT EXISTS idx_player_class_stats_matches ON player_class_stats(matches_played);

-- Enhanced indexes for existing tables
CREATE INDEX IF NOT EXISTS idx_player_stats_rating_deviation ON player_stats(rating, rating_deviation);
CREATE INDEX IF NOT EXISTS idx_player_stats_last_match ON player_stats(last_match_date);
CREATE INDEX IF NOT EXISTS idx_matches_type ON matches(match_type);
CREATE INDEX IF NOT EXISTS idx_matches_duration ON matches(match_duration);

-- Create view for comprehensive match history
CREATE OR REPLACE VIEW match_history_view AS
SELECT 
    m.id as match_id,
    m.created_at,
    m.started_at,
    m.ended_at,
    m.match_duration,
    m.match_type,
    m.status,
    m.arena_map,
    p1.username as player1_username,
    p1.id as player1_id,
    m.player1_class,
    m.player1_rating_before,
    m.player1_rating_after,
    m.player1_damage_dealt,
    m.player1_damage_taken,
    p2.username as player2_username,
    p2.id as player2_id,
    m.player2_class,
    m.player2_rating_before,
    m.player2_rating_after,
    m.player2_damage_dealt,
    m.player2_damage_taken,
    pw.username as winner_username,
    m.winner_id,
    CASE 
        WHEN m.winner_id = p1.id THEN p1.username
        WHEN m.winner_id = p2.id THEN p2.username
        ELSE NULL
    END as winner_display
FROM matches m
JOIN players p1 ON m.player1_id = p1.id
JOIN players p2 ON m.player2_id = p2.id
LEFT JOIN players pw ON m.winner_id = pw.id
WHERE m.status = 'completed'
ORDER BY m.created_at DESC;

-- Create view for player leaderboard
CREATE OR REPLACE VIEW player_leaderboard_view AS
SELECT 
    p.id,
    p.username,
    p.is_anonymous,
    ps.rating,
    ps.rating_deviation,
    ps.matches_played,
    ps.wins,
    ps.losses,
    ps.draws,
    ps.highest_rating,
    ps.win_streak,
    ps.current_streak,
    ps.favorite_class,
    ps.total_damage_dealt,
    ps.total_damage_taken,
    ps.last_match_date,
    CASE 
        WHEN ps.matches_played = 0 THEN 0
        ELSE ROUND((ps.wins::DECIMAL / ps.matches_played) * 100, 2)
    END as win_rate,
    CASE 
        WHEN ps.matches_played = 0 THEN 0
        ELSE ROUND(ps.total_damage_dealt::DECIMAL / ps.matches_played, 2)
    END as avg_damage_per_match,
    ROW_NUMBER() OVER (ORDER BY ps.rating DESC, ps.matches_played DESC) as rank
FROM players p
JOIN player_stats ps ON p.id = ps.player_id
WHERE p.is_active = true
ORDER BY ps.rating DESC, ps.matches_played DESC;

-- Create functions for player statistics updates
CREATE OR REPLACE FUNCTION update_player_stats_after_match()
RETURNS TRIGGER AS $$
BEGIN
    -- Update player stats for both players
    UPDATE player_stats 
    SET 
        matches_played = matches_played + 1,
        wins = wins + CASE WHEN NEW.winner_id = NEW.player1_id THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN NEW.winner_id IS NOT NULL AND NEW.winner_id != NEW.player1_id THEN 1 ELSE 0 END,
        draws = draws + CASE WHEN NEW.winner_id IS NULL THEN 1 ELSE 0 END,
        total_damage_dealt = total_damage_dealt + COALESCE(NEW.player1_damage_dealt, 0),
        total_damage_taken = total_damage_taken + COALESCE(NEW.player1_damage_taken, 0),
        last_match_date = NEW.ended_at,
        current_streak = CASE 
            WHEN NEW.winner_id = NEW.player1_id THEN 
                CASE WHEN current_streak >= 0 THEN current_streak + 1 ELSE 1 END
            WHEN NEW.winner_id IS NOT NULL THEN 
                CASE WHEN current_streak <= 0 THEN current_streak - 1 ELSE -1 END
            ELSE 0
        END,
        win_streak = CASE 
            WHEN NEW.winner_id = NEW.player1_id THEN 
                CASE WHEN current_streak >= 0 THEN GREATEST(win_streak, current_streak + 1) ELSE win_streak END
            ELSE win_streak
        END,
        rating = COALESCE(NEW.player1_rating_after, rating),
        highest_rating = GREATEST(highest_rating, COALESCE(NEW.player1_rating_after, rating))
    WHERE player_id = NEW.player1_id;

    UPDATE player_stats 
    SET 
        matches_played = matches_played + 1,
        wins = wins + CASE WHEN NEW.winner_id = NEW.player2_id THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN NEW.winner_id IS NOT NULL AND NEW.winner_id != NEW.player2_id THEN 1 ELSE 0 END,
        draws = draws + CASE WHEN NEW.winner_id IS NULL THEN 1 ELSE 0 END,
        total_damage_dealt = total_damage_dealt + COALESCE(NEW.player2_damage_dealt, 0),
        total_damage_taken = total_damage_taken + COALESCE(NEW.player2_damage_taken, 0),
        last_match_date = NEW.ended_at,
        current_streak = CASE 
            WHEN NEW.winner_id = NEW.player2_id THEN 
                CASE WHEN current_streak >= 0 THEN current_streak + 1 ELSE 1 END
            WHEN NEW.winner_id IS NOT NULL THEN 
                CASE WHEN current_streak <= 0 THEN current_streak - 1 ELSE -1 END
            ELSE 0
        END,
        win_streak = CASE 
            WHEN NEW.winner_id = NEW.player2_id THEN 
                CASE WHEN current_streak >= 0 THEN GREATEST(win_streak, current_streak + 1) ELSE win_streak END
            ELSE win_streak
        END,
        rating = COALESCE(NEW.player2_rating_after, rating),
        highest_rating = GREATEST(highest_rating, COALESCE(NEW.player2_rating_after, rating))
    WHERE player_id = NEW.player2_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic stats updates
DROP TRIGGER IF EXISTS trigger_update_player_stats_after_match ON matches;
CREATE TRIGGER trigger_update_player_stats_after_match
    AFTER UPDATE ON matches
    FOR EACH ROW
    WHEN (OLD.status != 'completed' AND NEW.status = 'completed')
    EXECUTE FUNCTION update_player_stats_after_match();

-- Create function for player search
CREATE OR REPLACE FUNCTION search_players(search_term TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID,
    username VARCHAR(50),
    rating INTEGER,
    matches_played INTEGER,
    win_rate DECIMAL(5,2),
    is_anonymous BOOLEAN,
    last_match_date TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        ps.rating,
        ps.matches_played,
        CASE 
            WHEN ps.matches_played = 0 THEN 0::DECIMAL(5,2)
            ELSE ROUND((ps.wins::DECIMAL / ps.matches_played) * 100, 2)
        END as win_rate,
        p.is_anonymous,
        ps.last_match_date
    FROM players p
    JOIN player_stats ps ON p.id = ps.player_id
    WHERE 
        p.is_active = true 
        AND p.is_anonymous = false
        AND p.username ILIKE '%' || search_term || '%'
    ORDER BY 
        ps.rating DESC,
        ps.matches_played DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create function for cleanup tasks
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- Clean up expired sessions
    SELECT cleanup_expired_sessions() INTO temp_count;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up expired reset tokens
    SELECT cleanup_expired_reset_tokens() INTO temp_count;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up old lockouts
    SELECT cleanup_old_lockouts() INTO temp_count;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up old match events (keep last 30 days)
    DELETE FROM match_events 
    WHERE server_timestamp < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up old achievements (keep last 90 days)
    DELETE FROM player_achievements 
    WHERE earned_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;