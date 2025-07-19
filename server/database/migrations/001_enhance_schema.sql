-- Migration: Simple Schema Enhancement
-- Description: Add basic constraints and indexes for the simplified architecture

-- Add basic constraints to players table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_username_length') THEN
        ALTER TABLE players ADD CONSTRAINT chk_username_length 
        CHECK (username IS NULL OR (LENGTH(username) >= 3 AND LENGTH(username) <= 50));
    END IF;
END
$$;

-- Add basic constraints to player_stats table  
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rating_range') THEN
        ALTER TABLE player_stats ADD CONSTRAINT chk_rating_range 
        CHECK (rating >= 0 AND rating <= 5000);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_matches_non_negative') THEN
        ALTER TABLE player_stats ADD CONSTRAINT chk_matches_non_negative 
        CHECK (matches_played >= 0 AND wins >= 0 AND losses >= 0);
    END IF;
END
$$;

-- Add basic constraints to matches table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_player_different') THEN
        ALTER TABLE matches ADD CONSTRAINT chk_player_different 
        CHECK (player1_id != player2_id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_valid_status') THEN
        ALTER TABLE matches ADD CONSTRAINT chk_valid_status 
        CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled'));
    END IF;
END
$$;

-- Add basic indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_username_active ON players(username) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_player_stats_rating ON player_stats(rating);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches(created_at);