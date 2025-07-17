import { redis } from '../services/redis.js';
import { db } from '../services/database.js';
import { logger } from '../utils/logger.js';

async function cleanupDatabase() {
  try {
    logger.info('Starting complete database cleanup...');
    
    // Connect to Redis first
    logger.info('Connecting to Redis...');
    await redis.connect();
    
    // Flush Redis completely
    logger.info('Flushing Redis database...');
    await redis.flushdb();
    
    // Close Redis connection
    await redis.quit();
    
    // Clean PostgreSQL database
    logger.info('Cleaning PostgreSQL database...');
    
    // Connect to database first
    await db.connect();
    
    // Drop all tables in proper order (respecting foreign key constraints)
    logger.info('Dropping all tables...');
    
    // First drop tables that reference others
    await db.query('DROP TABLE IF EXISTS match_events CASCADE;');
    await db.query('DROP TABLE IF EXISTS matches CASCADE;');
    await db.query('DROP TABLE IF EXISTS player_stats CASCADE;');
    await db.query('DROP TABLE IF EXISTS players CASCADE;');
    
    logger.info('All tables dropped');
    
    // Recreate tables from schema
    logger.info('Recreating tables from schema...');
    
    // Enable UUID extension
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    
    // Create players table
    await db.query(`
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
    `);
    
    // Create player_stats table
    await db.query(`
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
    `);
    
    // Create matches table
    await db.query(`
      CREATE TABLE matches (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        player1_id UUID REFERENCES players(id),
        player2_id UUID REFERENCES players(id),
        player1_class VARCHAR(20) NOT NULL,
        player2_class VARCHAR(20) NOT NULL,
        winner_id UUID REFERENCES players(id),
        match_duration INTEGER,
        arena_map VARCHAR(50) DEFAULT 'default_arena',
        player1_rating_before INTEGER,
        player2_rating_before INTEGER,
        player1_rating_after INTEGER,
        player2_rating_after INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        match_data JSONB
      );
    `);
    
    logger.info('All tables recreated successfully');
    
    // Close database connection
    await db.close();
    
    logger.info('✅ Database cleanup completed successfully!');
    logger.info('✅ Redis cache cleared');
    logger.info('✅ PostgreSQL tables dropped and recreated');
    logger.info('✅ System is ready for new JWT authentication');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ Error during database cleanup:', error);
    process.exit(1);
  }
}

cleanupDatabase();