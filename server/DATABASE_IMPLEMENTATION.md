# Database Schema and Player Services Implementation

## Overview
This document outlines the comprehensive database schema and player services implementation for Week 3 of Phase 1 MVP for the Dueled project.

## Database Schema Implementation

### 1. Enhanced Players Table
The existing players table has been enhanced with proper indexes and constraints:

```sql
-- Core player fields
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
username VARCHAR(50) UNIQUE
email VARCHAR(100) UNIQUE  
password_hash VARCHAR(255)
is_anonymous BOOLEAN DEFAULT FALSE
created_at TIMESTAMP DEFAULT NOW()
last_login TIMESTAMP
is_active BOOLEAN DEFAULT TRUE
```

### 2. Enhanced Player Stats Table
Comprehensive player statistics with Glicko-2 rating system:

```sql
-- Player statistics with Glicko-2 rating
player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE
rating INTEGER DEFAULT 1000
rating_deviation INTEGER DEFAULT 350
rating_volatility DECIMAL(8,6) DEFAULT 0.06
matches_played INTEGER DEFAULT 0
wins INTEGER DEFAULT 0
losses INTEGER DEFAULT 0
draws INTEGER DEFAULT 0
favorite_class VARCHAR(20)
total_damage_dealt BIGINT DEFAULT 0
total_damage_taken BIGINT DEFAULT 0
total_playtime_seconds INTEGER DEFAULT 0
highest_rating INTEGER DEFAULT 1000
win_streak INTEGER DEFAULT 0
current_streak INTEGER DEFAULT 0
last_match_date TIMESTAMP
average_match_duration INTEGER DEFAULT 0
damage_per_match DECIMAL(10,2) DEFAULT 0.00
accuracy_percentage DECIMAL(5,2) DEFAULT 0.00
preferred_play_style VARCHAR(20)
class_stats JSONB DEFAULT '{}'
```

### 3. Enhanced Matches Table
Comprehensive match tracking:

```sql
-- Match information
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
player1_id UUID REFERENCES players(id)
player2_id UUID REFERENCES players(id)
player1_class VARCHAR(20) NOT NULL
player2_class VARCHAR(20) NOT NULL
winner_id UUID REFERENCES players(id)
match_duration INTEGER -- in seconds
arena_map VARCHAR(50) DEFAULT 'default_arena'
match_type VARCHAR(20) DEFAULT 'ranked'
player1_rating_before INTEGER
player2_rating_before INTEGER
player1_rating_after INTEGER
player2_rating_after INTEGER
player1_damage_dealt INTEGER DEFAULT 0
player2_damage_dealt INTEGER DEFAULT 0
player1_damage_taken INTEGER DEFAULT 0
player2_damage_taken INTEGER DEFAULT 0
total_actions INTEGER DEFAULT 0
match_data JSONB DEFAULT '{}'
status VARCHAR(20) DEFAULT 'completed'
created_at TIMESTAMP DEFAULT NOW()
started_at TIMESTAMP
ended_at TIMESTAMP
```

### 4. Enhanced Match Events Table
Detailed event tracking for replay system and anti-cheat:

```sql
-- Match events for replay and analysis
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE
player_id UUID REFERENCES players(id)
event_type VARCHAR(50) NOT NULL
event_data JSONB NOT NULL DEFAULT '{}'
game_time INTEGER NOT NULL -- milliseconds since match start
server_timestamp TIMESTAMP DEFAULT NOW()
position_x DECIMAL(10,2)
position_y DECIMAL(10,2)
target_id UUID REFERENCES players(id)
damage_amount INTEGER
is_critical BOOLEAN DEFAULT FALSE
ability_used VARCHAR(50)
sequence_number INTEGER NOT NULL
```

### 5. New Supporting Tables

#### Player Achievements
```sql
-- Player achievements system
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE
achievement_type VARCHAR(50) NOT NULL
achievement_data JSONB DEFAULT '{}'
earned_at TIMESTAMP DEFAULT NOW()
match_id UUID REFERENCES matches(id)
```

#### Player Match Performance
```sql
-- Detailed match performance metrics
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE
player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE
class_played VARCHAR(20) NOT NULL
damage_dealt INTEGER DEFAULT 0
damage_taken INTEGER DEFAULT 0
healing_done INTEGER DEFAULT 0
abilities_used INTEGER DEFAULT 0
accuracy_percentage DECIMAL(5,2) DEFAULT 0.00
time_alive INTEGER DEFAULT 0 -- seconds
distance_moved DECIMAL(10,2) DEFAULT 0.00
critical_hits INTEGER DEFAULT 0
kills INTEGER DEFAULT 0
deaths INTEGER DEFAULT 0
performance_score DECIMAL(10,2) DEFAULT 0.00
mvp_score DECIMAL(10,2) DEFAULT 0.00
```

#### Player Class Stats
```sql
-- Class-specific statistics
player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE
class_type VARCHAR(20) NOT NULL
matches_played INTEGER DEFAULT 0
wins INTEGER DEFAULT 0
losses INTEGER DEFAULT 0
draws INTEGER DEFAULT 0
total_damage_dealt BIGINT DEFAULT 0
total_damage_taken BIGINT DEFAULT 0
total_healing_done BIGINT DEFAULT 0
favorite_ability VARCHAR(50)
average_match_duration INTEGER DEFAULT 0
best_performance_score DECIMAL(10,2) DEFAULT 0.00
last_played TIMESTAMP
PRIMARY KEY (player_id, class_type)
```

## Database Migration System

### Migration Files
- `001_enhance_schema.sql` - Basic schema enhancements
- `002_enhanced_player_system.sql` - Comprehensive player system implementation

### Migration Service
The migration service (`src/services/migrations.ts`) provides:
- Automatic migration tracking
- Transaction-based migration execution
- Rollback capability
- Migration status reporting

### Running Migrations
```bash
# Using the migration script
npx tsx src/scripts/runMigrations.ts

# Or through the service
import { migrationService } from './services/migrations.js';
await migrationService.runMigrations();
```

## Player Services Implementation

### Core Service Classes

#### PlayerService (`src/services/playerService.ts`)
Comprehensive player management with the following methods:

**Profile Management:**
- `createPlayer()` - Create new player with Glicko-2 rating initialization
- `getPlayerProfile()` - Get comprehensive player profile with statistics
- `updatePlayer()` - Update player profile with validation
- `deletePlayer()` - Soft delete player (set inactive)

**Statistics Tracking:**
- `updatePlayerStats()` - Update player statistics after matches
- `getPlayerStats()` - Get player statistics (legacy method)
- `recordMatchPerformance()` - Record detailed match performance
- `getPlayerClassStats()` - Get class-specific statistics

**Match History:**
- `getMatchHistory()` - Get paginated match history with filtering
- `getRecentMatches()` - Get recent matches (legacy method)

**Rating System:**
- `updatePlayerRating()` - Update player rating using Glicko-2 system
- `applyRatingDecay()` - Apply rating decay for inactive players

**Search & Discovery:**
- `searchPlayers()` - Search players by username
- `getUsernameSuggestions()` - Get autocomplete suggestions
- `getLeaderboard()` - Get ranked leaderboard with filtering

**Analytics:**
- `getPlayerAnalytics()` - Get comprehensive player analytics
- `calculatePerformanceScore()` - Calculate match performance scores

#### RatingService (`src/services/ratingService.ts`)
Glicko-2 rating system implementation with:
- New player rating initialization
- Rating updates after matches
- Rating decay for inactive players
- Confidence intervals
- Match balance checking

### API Endpoints

#### Player Controller (`src/controllers/playerController.ts`)
Enhanced API endpoints with comprehensive validation:

**Profile Endpoints:**
- `GET /api/players/profile` - Get authenticated player profile
- `GET /api/players/:id/profile` - Get public player profile
- `PUT /api/players/profile` - Update player profile

**Statistics Endpoints:**
- `GET /api/players/stats` - Get player statistics (cached)
- `GET /api/players/class-stats` - Get class-specific statistics
- `GET /api/players/:id/class-stats` - Get public class statistics

**Match History Endpoints:**
- `GET /api/players/matches` - Get match history with filtering and pagination

**Discovery Endpoints:**
- `GET /api/players/leaderboard` - Get leaderboard with filtering
- `GET /api/players/search` - Search players by username
- `GET /api/players/suggestions` - Get username autocomplete suggestions

**Analytics Endpoints:**
- `GET /api/players/analytics` - Get comprehensive player analytics

### Input Validation

All endpoints include comprehensive validation using `express-validator`:

```typescript
// Profile validation
body('username')
  .optional()
  .isLength({ min: 3, max: 20 })
  .matches(/^[a-zA-Z0-9_-]+$/)

// Query parameter validation
query('limit').optional().isInt({ min: 1, max: 100 })
query('classFilter').optional().isIn(['berserker', 'mage', 'bomber', 'archer'])
```

### Rate Limiting

Different rate limits for different endpoint types:
- General endpoints: 50 requests per 15 minutes
- Search endpoints: 20 requests per 5 minutes

### Caching Strategy

Player statistics are cached in Redis with:
- 5-minute cache duration
- Cache invalidation on updates
- Fallback to database on cache miss

## Database Views and Functions

### Database Views

#### Match History View
```sql
CREATE OR REPLACE VIEW match_history_view AS
SELECT 
    m.id as match_id,
    m.created_at, m.started_at, m.ended_at,
    m.match_duration, m.match_type, m.status, m.arena_map,
    p1.username as player1_username, p1.id as player1_id,
    m.player1_class, m.player1_rating_before, m.player1_rating_after,
    m.player1_damage_dealt, m.player1_damage_taken,
    p2.username as player2_username, p2.id as player2_id,
    m.player2_class, m.player2_rating_before, m.player2_rating_after,
    m.player2_damage_dealt, m.player2_damage_taken,
    pw.username as winner_username, m.winner_id
FROM matches m
JOIN players p1 ON m.player1_id = p1.id
JOIN players p2 ON m.player2_id = p2.id
LEFT JOIN players pw ON m.winner_id = pw.id
WHERE m.status = 'completed'
ORDER BY m.created_at DESC;
```

#### Player Leaderboard View
```sql
CREATE OR REPLACE VIEW player_leaderboard_view AS
SELECT 
    p.id, p.username, p.is_anonymous,
    ps.rating, ps.rating_deviation, ps.matches_played,
    ps.wins, ps.losses, ps.draws, ps.highest_rating,
    ps.win_streak, ps.current_streak, ps.favorite_class,
    ps.total_damage_dealt, ps.total_damage_taken,
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
```

### Database Functions

#### Player Search Function
```sql
CREATE OR REPLACE FUNCTION search_players(search_term TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID, username VARCHAR(50), rating INTEGER,
    matches_played INTEGER, win_rate DECIMAL(5,2),
    is_anonymous BOOLEAN, last_match_date TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id, p.username, ps.rating, ps.matches_played,
        CASE 
            WHEN ps.matches_played = 0 THEN 0::DECIMAL(5,2)
            ELSE ROUND((ps.wins::DECIMAL / ps.matches_played) * 100, 2)
        END as win_rate,
        p.is_anonymous, ps.last_match_date
    FROM players p
    JOIN player_stats ps ON p.id = ps.player_id
    WHERE 
        p.is_active = true 
        AND p.is_anonymous = false
        AND p.username ILIKE '%' || search_term || '%'
    ORDER BY ps.rating DESC, ps.matches_played DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
```

#### Stats Update Trigger
```sql
CREATE OR REPLACE FUNCTION update_player_stats_after_match()
RETURNS TRIGGER AS $$
BEGIN
    -- Update player stats for both players after match completion
    -- (Implementation details in migration file)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### Cleanup Function
```sql
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Clean up expired sessions, tokens, and old data
    -- (Implementation details in migration file)
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

## Performance Optimizations

### Indexes
Comprehensive indexing strategy for optimal query performance:

```sql
-- Player indexes
CREATE INDEX idx_players_username ON players(username);
CREATE INDEX idx_players_email ON players(email);
CREATE INDEX idx_players_created_at ON players(created_at);

-- Player stats indexes
CREATE INDEX idx_player_stats_rating ON player_stats(rating);
CREATE INDEX idx_player_stats_rating_deviation ON player_stats(rating, rating_deviation);
CREATE INDEX idx_player_stats_matches_played ON player_stats(matches_played);
CREATE INDEX idx_player_stats_last_match ON player_stats(last_match_date);

-- Match indexes
CREATE INDEX idx_matches_players ON matches(player1_id, player2_id);
CREATE INDEX idx_matches_winner ON matches(winner_id);
CREATE INDEX idx_matches_created_at ON matches(created_at);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_type ON matches(match_type);
CREATE INDEX idx_matches_duration ON matches(match_duration);

-- Match events indexes
CREATE INDEX idx_match_events_match_player ON match_events(match_id, player_id);
CREATE INDEX idx_match_events_type ON match_events(event_type);
CREATE INDEX idx_match_events_game_time ON match_events(match_id, game_time);
CREATE INDEX idx_match_events_sequence ON match_events(match_id, sequence_number);
```

### Query Optimization
- Use of proper JOINs instead of subqueries
- Pagination with LIMIT and OFFSET
- Filtered queries with WHERE clauses
- Efficient aggregation functions

### Caching Strategy
- Redis caching for frequently accessed data
- Cache invalidation on updates
- Configurable cache TTL values

## Security Considerations

### Input Validation
- Comprehensive validation using express-validator
- Sanitization of user inputs
- Type checking and constraints

### Rate Limiting
- Different limits for different endpoint types
- IP-based rate limiting
- Protection against abuse

### Data Protection
- Soft deletion for player accounts
- Sensitive data filtering for public endpoints
- Proper access controls

### Authentication & Authorization
- JWT token-based authentication
- Role-based access control
- Session management

## Error Handling

### Database Errors
- Connection failure fallback
- Transaction rollback on errors
- Comprehensive error logging

### API Errors
- Consistent error response format
- HTTP status code adherence
- Detailed error messages for debugging

### Service Errors
- Graceful degradation
- Fallback mechanisms
- Retry logic where appropriate

## Testing Strategy

### Unit Tests
- Service method testing
- Database query testing
- Rating calculation testing

### Integration Tests
- API endpoint testing
- Database integration testing
- Cache integration testing

### Performance Tests
- Load testing for endpoints
- Database performance testing
- Cache performance testing

## Deployment Considerations

### Database Setup
1. Run initial schema setup
2. Execute migrations in order
3. Verify indexes are created
4. Run data cleanup functions

### Environment Configuration
```env
DATABASE_URL=postgresql://user:pass@host:port/database
REDIS_URL=redis://host:port
JWT_SECRET=your-jwt-secret
```

### Monitoring
- Database query performance monitoring
- Cache hit/miss ratios
- API response times
- Error rate tracking

## Future Enhancements

### Short-term (Next Phase)
- Real-time player status tracking
- Achievement system expansion
- Advanced analytics dashboard
- Performance optimization

### Long-term
- Machine learning for match prediction
- Advanced anti-cheat systems
- Social features integration
- Tournament system

This comprehensive implementation provides a robust foundation for the player management system in the Dueled game, with proper scalability, security, and performance considerations built in from the start.