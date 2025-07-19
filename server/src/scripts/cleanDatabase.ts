import { db } from '../services/database.js';
import { redis } from '../services/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Clean up database for new JWT system
 */
async function cleanDatabase() {
  try {
    logger.info('Starting database cleanup...');
    
    // Clean Redis first
    logger.info('Cleaning Redis cache...');
    await redis.flushdb();
    logger.info('Redis cache cleared');
    
    // Clean database tables
    logger.info('Cleaning database tables...');
    
    // Clear matches first (due to foreign key constraints)
    await db.query('DELETE FROM matches');
    logger.info('Matches table cleared');
    
    // Clear player stats
    await db.query('DELETE FROM player_stats');
    logger.info('Player stats table cleared');
    
    // Clear players
    await db.query('DELETE FROM players');
    logger.info('Players table cleared');
    
    // Reset sequences if they exist
    try {
      await db.query('ALTER SEQUENCE players_id_seq RESTART WITH 1');
    } catch (error) {
      // Sequence might not exist, that's okay
    }
    
    logger.info('Database cleanup completed successfully');
    
    // Close connections
    await db.close();
    await redis.quit();
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during database cleanup:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanDatabase();