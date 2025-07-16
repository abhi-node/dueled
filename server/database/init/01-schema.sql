-- Dueled Database Schema
-- This script initializes the database schema for the Dueled game

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Players table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_anonymous BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Player stats table
CREATE TABLE player_stats (
    player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    rating INTEGER DEFAULT 1000,
    matches_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    favorite_class VARCHAR(20),
    total_damage_dealt BIGINT DEFAULT 0,
    total_damage_taken BIGINT DEFAULT 0,
    total_playtime_seconds INTEGER DEFAULT 0,
    highest_rating INTEGER DEFAULT 1000,
    win_streak INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Matches table
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player1_id UUID REFERENCES players(id),
    player2_id UUID REFERENCES players(id),
    player1_class VARCHAR(20) NOT NULL,
    player2_class VARCHAR(20) NOT NULL,
    winner_id UUID REFERENCES players(id),
    match_duration INTEGER, -- in seconds
    arena_map VARCHAR(50) DEFAULT 'default_arena',
    player1_rating_before INTEGER,
    player2_rating_before INTEGER,
    player1_rating_after INTEGER,
    player2_rating_after INTEGER,
    status VARCHAR(20) DEFAULT 'completed', -- waiting, in_progress, completed, cancelled
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    ended_at TIMESTAMP
);

-- Match events table (for replay system and anti-cheat)
CREATE TABLE match_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id),
    event_type VARCHAR(50) NOT NULL, -- move, attack, use_ability, damage_taken, etc.
    event_data JSONB,
    game_time INTEGER, -- milliseconds since match start
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Sessions table (for JWT token management)
CREATE TABLE player_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Indexes for performance
CREATE INDEX idx_players_username ON players(username);
CREATE INDEX idx_players_email ON players(email);
CREATE INDEX idx_players_created_at ON players(created_at);

CREATE INDEX idx_player_stats_rating ON player_stats(rating);
CREATE INDEX idx_player_stats_matches_played ON player_stats(matches_played);

CREATE INDEX idx_matches_players ON matches(player1_id, player2_id);
CREATE INDEX idx_matches_winner ON matches(winner_id);
CREATE INDEX idx_matches_created_at ON matches(created_at);
CREATE INDEX idx_matches_status ON matches(status);

CREATE INDEX idx_match_events_match_id ON match_events(match_id);
CREATE INDEX idx_match_events_player_id ON match_events(player_id);
CREATE INDEX idx_match_events_timestamp ON match_events(timestamp);
CREATE INDEX idx_match_events_game_time ON match_events(game_time);

CREATE INDEX idx_sessions_player_id ON player_sessions(player_id);
CREATE INDEX idx_sessions_token_hash ON player_sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON player_sessions(expires_at);

-- Triggers for automatic updates
CREATE OR REPLACE FUNCTION update_player_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_player_stats_updated_at
    BEFORE UPDATE ON player_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_player_stats_updated_at();

-- Password reset tokens table
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Account lockouts table
CREATE TABLE account_lockouts (
    player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    failed_attempts INTEGER DEFAULT 0,
    last_attempt TIMESTAMP DEFAULT NOW(),
    locked_until TIMESTAMP
);

-- Indexes for password reset and lockout tables
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_player_id ON password_reset_tokens(player_id);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

CREATE INDEX idx_account_lockouts_locked_until ON account_lockouts(locked_until);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM player_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired password reset tokens
CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM password_reset_tokens WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old account lockouts
CREATE OR REPLACE FUNCTION cleanup_old_lockouts()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM account_lockouts 
    WHERE locked_until IS NULL 
       OR locked_until < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;