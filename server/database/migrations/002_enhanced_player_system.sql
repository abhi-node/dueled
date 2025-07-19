-- Migration: Simplified Player System
-- Description: Essential tables and functions for the simplified architecture

BEGIN;

-- Simple match events table for basic game events
CREATE TABLE IF NOT EXISTS match_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    game_time INTEGER NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Basic indexes for match events
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_player_id ON match_events(player_id);
CREATE INDEX IF NOT EXISTS idx_match_events_type ON match_events(event_type);
CREATE INDEX IF NOT EXISTS idx_match_events_timestamp ON match_events(timestamp);

-- Simple view for match history
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
    m.status,
    m.created_at,
    m.started_at,
    m.ended_at
FROM matches m
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id;

-- Simple function to calculate win rate
CREATE OR REPLACE FUNCTION calculate_win_rate(player_wins INTEGER, total_matches INTEGER)
RETURNS NUMERIC(5,2) AS $$
BEGIN
    IF total_matches = 0 THEN
        RETURN 0.0;
    END IF;
    RETURN ROUND((player_wins::NUMERIC / total_matches::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql;

COMMIT;