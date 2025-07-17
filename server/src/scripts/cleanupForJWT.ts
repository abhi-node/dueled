import { redis } from '../services/redis.js';
import { logger } from '../utils/logger.js';

async function cleanupForJWT() {
  try {
    logger.info('Cleaning up system for new JWT authentication...');
    
    // Connect to Redis
    logger.info('Connecting to Redis...');
    await redis.connect();
    
    if (!redis.isConnected()) {
      throw new Error('Failed to connect to Redis');
    }
    
    // Flush Redis completely
    logger.info('Flushing Redis database...');
    await redis.flushdb();
    
    // Close Redis connection
    await redis.quit();
    
    logger.info('✅ Redis cleanup completed successfully!');
    logger.info('✅ All cached sessions, tokens, and queue data cleared');
    logger.info('✅ System is ready for new JWT authentication');
    
    // Note about database
    logger.info('📝 Note: Database cleanup may be needed separately');
    logger.info('📝 Consider manually clearing user tables if needed');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupForJWT();