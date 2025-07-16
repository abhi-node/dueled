import { db } from '../services/database.js';
import { migrationService } from '../services/migrations.js';
import { logger } from '../utils/logger.js';

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    // Connect to database
    await db.connect();
    
    // Run migrations
    await migrationService.runMigrations();
    
    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await db.close();
    process.exit(0);
  }
}

runMigrations();