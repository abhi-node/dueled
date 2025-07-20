-- Dueled Database Seed Data
-- This script inserts initial development data

-- Insert test players for development
INSERT INTO players (id, username, email, password_hash, is_anonymous) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'TestPlayer1', 'test1@dueled.dev', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6f.RXjBQpu', FALSE),
    ('550e8400-e29b-41d4-a716-446655440002', 'TestPlayer2', 'test2@dueled.dev', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6f.RXjBQpu', FALSE),
    ('550e8400-e29b-41d4-a716-446655440003', 'GuestUser1', NULL, NULL, TRUE);

-- Insert corresponding player stats
INSERT INTO player_stats (player_id, rating, matches_played, wins, losses, favorite_class) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 1250, 15, 9, 6, 'demolitionist'),
    ('550e8400-e29b-41d4-a716-446655440002', 1150, 12, 7, 5, 'buckshot'),
    ('550e8400-e29b-41d4-a716-446655440003', 1000, 0, 0, 0, NULL);

-- Insert some sample matches for development
INSERT INTO matches (
    id, 
    player1_id, 
    player2_id, 
    player1_class, 
    player2_class, 
    winner_id, 
    match_duration, 
    player1_rating_before, 
    player2_rating_before,
    player1_rating_after,
    player2_rating_after,
    status,
    started_at,
    ended_at
) VALUES
    (
        '450e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
        'demolitionist',
        'buckshot',
        '550e8400-e29b-41d4-a716-446655440001',
        180,
        1200,
        1200,
        1225,
        1175,
        'completed',
        NOW() - INTERVAL '1 hour',
        NOW() - INTERVAL '1 hour' + INTERVAL '3 minutes'
    ),
    (
        '450e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440001',
        'gunslinger',
        'demolitionist',
        '550e8400-e29b-41d4-a716-446655440002',
        145,
        1175,
        1225,
        1200,
        1200,
        'completed',
        NOW() - INTERVAL '30 minutes',
        NOW() - INTERVAL '30 minutes' + INTERVAL '2 minutes 25 seconds'
    );

-- Insert some sample match events
INSERT INTO match_events (match_id, player_id, event_type, event_data, game_time) VALUES
    ('450e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'match_start', '{"position": {"x": 150, "y": 300}}', 0),
    ('450e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'match_start', '{"position": {"x": 650, "y": 300}}', 0),
    ('450e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'move', '{"from": {"x": 150, "y": 300}, "to": {"x": 200, "y": 280}}', 1500),
    ('450e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'attack', '{"target": {"x": 600, "y": 300}, "damage": 85}', 3200),
    ('450e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'damage_taken', '{"damage": 85, "health_remaining": 65}', 3250);

-- Create a view for match history with player names
CREATE VIEW match_history_view AS
SELECT 
    m.id,
    m.created_at,
    m.match_duration,
    m.status,
    p1.username AS player1_username,
    p2.username AS player2_username,
    m.player1_class,
    m.player2_class,
    pw.username AS winner_username,
    m.player1_rating_before,
    m.player2_rating_before,
    m.player1_rating_after,
    m.player2_rating_after
FROM matches m
JOIN players p1 ON m.player1_id = p1.id
JOIN players p2 ON m.player2_id = p2.id
LEFT JOIN players pw ON m.winner_id = pw.id
ORDER BY m.created_at DESC;