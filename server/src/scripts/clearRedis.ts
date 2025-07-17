import { redis } from '../services/redis.js';
import { logger } from '../utils/logger.js';

async function clearRedis() {
  try {
    logger.info('Clearing Redis cache...');
    await redis.flushdb();
    logger.info('Redis cache cleared successfully');
    await redis.quit();
    process.exit(0);
  } catch (error) {
    logger.error('Error clearing Redis:', error);
    process.exit(1);
  }
}

clearRedis();