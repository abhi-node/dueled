import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Database migration service for managing schema changes
 */
export class MigrationService {
  private readonly migrationsPath = join(process.cwd(), 'database', 'migrations');

  /**
   * Initialize migrations table if it doesn't exist
   */
  async initializeMigrationsTable(): Promise<void> {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('Migrations table initialized');
    } catch (error) {
      logger.error('Failed to initialize migrations table:', error);
      throw error;
    }
  }

  /**
   * Get list of executed migrations
   */
  async getExecutedMigrations(): Promise<string[]> {
    try {
      const result = await db.query('SELECT filename FROM migrations ORDER BY id');
      return result.rows.map((row: any) => row.filename);
    } catch (error) {
      logger.error('Failed to get executed migrations:', error);
      throw error;
    }
  }

  /**
   * Get pending migrations that haven't been executed
   */
  async getPendingMigrations(): Promise<string[]> {
    try {
      const allMigrations = readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      const executedMigrations = await this.getExecutedMigrations();
      
      return allMigrations.filter(migration => !executedMigrations.includes(migration));
    } catch (error) {
      logger.error('Failed to get pending migrations:', error);
      throw error;
    }
  }

  /**
   * Execute a single migration file
   */
  async executeMigration(filename: string): Promise<void> {
    try {
      const migrationPath = join(this.migrationsPath, filename);
      const migrationSQL = readFileSync(migrationPath, 'utf8');

      // Execute migration in a transaction
      await db.query('BEGIN');
      
      try {
        // Execute the migration SQL
        await db.query(migrationSQL);
        
        // Record the migration as executed
        await db.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [filename]
        );
        
        await db.query('COMMIT');
        logger.info(`Migration executed successfully: ${filename}`);
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to execute migration ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    try {
      if (!db.isConnected()) {
        throw new Error('Database not connected');
      }

      await this.initializeMigrationsTable();
      
      const pendingMigrations = await this.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations to run');
        return;
      }

      logger.info(`Running ${pendingMigrations.length} pending migrations`);
      
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }
      
      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration process failed:', error);
      throw error;
    }
  }

  /**
   * Create a new migration file
   */
  createMigration(name: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${timestamp}_${name}.sql`;
    const migrationPath = join(this.migrationsPath, filename);
    
    const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}
-- Description: Add description here

BEGIN;

-- Add your migration SQL here


COMMIT;
`;
    
    try {
      require('fs').writeFileSync(migrationPath, template);
      logger.info(`Migration file created: ${filename}`);
      return filename;
    } catch (error) {
      logger.error(`Failed to create migration file: ${filename}`, error);
      throw error;
    }
  }

  /**
   * Check migration status
   */
  async getStatus(): Promise<{
    executed: string[];
    pending: string[];
    total: number;
  }> {
    try {
      const executed = await this.getExecutedMigrations();
      const pending = await this.getPendingMigrations();
      
      return {
        executed,
        pending,
        total: executed.length + pending.length
      };
    } catch (error) {
      logger.error('Failed to get migration status:', error);
      throw error;
    }
  }
}

export const migrationService = new MigrationService();