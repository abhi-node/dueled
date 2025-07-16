import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './database.js';
import { logger } from '../utils/logger.js';

export interface PasswordResetToken {
  id: string;
  playerId: string;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

export interface AccountLockout {
  playerId: string;
  failedAttempts: number;
  lockedUntil?: Date;
  lastAttempt: Date;
}

export interface PasswordStrengthResult {
  isValid: boolean;
  score: number; // 0-4 (weak to strong)
  feedback: string[];
}

export class PasswordService {
  private readonly SALT_ROUNDS = 12;
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
  private readonly RESET_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

  /**
   * Hash a password with salt
   */
  async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.SALT_ROUNDS);
    } catch (error) {
      logger.error('Error hashing password:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Error verifying password:', error);
      return false;
    }
  }

  /**
   * Check password strength
   */
  checkPasswordStrength(password: string): PasswordStrengthResult {
    const feedback: string[] = [];
    let score = 0;

    // Length check
    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
    } else if (password.length >= 12) {
      score += 1;
    }

    // Character variety checks
    if (!/[a-z]/.test(password)) {
      feedback.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    if (!/[A-Z]/.test(password)) {
      feedback.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    if (!/\d/.test(password)) {
      feedback.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    if (!/[@$!%*?&]/.test(password)) {
      feedback.push('Password must contain at least one special character (@$!%*?&)');
    } else {
      score += 1;
    }

    // Common password patterns
    const commonPatterns = [
      /123456/,
      /password/i,
      /qwerty/i,
      /admin/i,
      /letmein/i
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        feedback.push('Password contains common patterns that are easily guessed');
        score = Math.max(0, score - 1);
        break;
      }
    }

    // Sequential characters
    if (/(.)\1{2,}/.test(password)) {
      feedback.push('Password should not contain repeated characters');
      score = Math.max(0, score - 1);
    }

    const isValid = feedback.length === 0 && score >= 4;

    return {
      isValid,
      score: Math.min(score, 4),
      feedback
    };
  }

  /**
   * Record failed login attempt and check for lockout
   */
  async recordFailedAttempt(playerId: string): Promise<AccountLockout> {
    try {
      if (!db.isConnected()) {
        logger.warn('Database not available, cannot track failed attempts');
        return {
          playerId,
          failedAttempts: 1,
          lastAttempt: new Date()
        };
      }

      // Check existing lockout record
      const existingResult = await db.query(
        `SELECT * FROM account_lockouts WHERE player_id = $1`,
        [playerId]
      );

      const now = new Date();
      let lockout: AccountLockout;

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        const failedAttempts = existing.failed_attempts + 1;
        
        // Check if still locked
        const isLocked = existing.locked_until && new Date(existing.locked_until) > now;
        
        if (isLocked) {
          lockout = {
            playerId,
            failedAttempts: existing.failed_attempts,
            lockedUntil: new Date(existing.locked_until),
            lastAttempt: now
          };
        } else {
          // Update failed attempts
          const lockedUntil = failedAttempts >= this.MAX_FAILED_ATTEMPTS 
            ? new Date(now.getTime() + this.LOCKOUT_DURATION)
            : null;

          await db.query(
            `UPDATE account_lockouts 
             SET failed_attempts = $2, last_attempt = $3, locked_until = $4
             WHERE player_id = $1`,
            [playerId, failedAttempts, now, lockedUntil]
          );

          lockout = {
            playerId,
            failedAttempts,
            lockedUntil: lockedUntil || undefined,
            lastAttempt: now
          };
        }
      } else {
        // Create new lockout record
        const lockedUntil = this.MAX_FAILED_ATTEMPTS <= 1 
          ? new Date(now.getTime() + this.LOCKOUT_DURATION)
          : null;

        await db.query(
          `INSERT INTO account_lockouts (player_id, failed_attempts, last_attempt, locked_until)
           VALUES ($1, $2, $3, $4)`,
          [playerId, 1, now, lockedUntil]
        );

        lockout = {
          playerId,
          failedAttempts: 1,
          lockedUntil: lockedUntil || undefined,
          lastAttempt: now
        };
      }

      if (lockout.lockedUntil) {
        logger.warn(`Account locked for player ${playerId}`, {
          failedAttempts: lockout.failedAttempts,
          lockedUntil: lockout.lockedUntil
        });
      }

      return lockout;
    } catch (error) {
      logger.error('Error recording failed attempt:', error);
      throw new Error('Failed to record login attempt');
    }
  }

  /**
   * Check if account is locked
   */
  async isAccountLocked(playerId: string): Promise<boolean> {
    try {
      if (!db.isConnected()) {
        return false;
      }

      const result = await db.query(
        `SELECT locked_until FROM account_lockouts 
         WHERE player_id = $1 AND locked_until > NOW()`,
        [playerId]
      );

      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking account lockout:', error);
      return false;
    }
  }

  /**
   * Reset failed attempts after successful login
   */
  async resetFailedAttempts(playerId: string): Promise<void> {
    try {
      if (!db.isConnected()) {
        return;
      }

      await db.query(
        `DELETE FROM account_lockouts WHERE player_id = $1`,
        [playerId]
      );

      logger.debug(`Reset failed attempts for player ${playerId}`);
    } catch (error) {
      logger.error('Error resetting failed attempts:', error);
    }
  }

  /**
   * Generate password reset token
   */
  async generateResetToken(playerId: string): Promise<string> {
    try {
      if (!db.isConnected()) {
        throw new Error('Database not available');
      }

      // Invalidate any existing tokens
      await db.query(
        `UPDATE password_reset_tokens SET used = true WHERE player_id = $1 AND used = false`,
        [playerId]
      );

      // Generate new token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + this.RESET_TOKEN_EXPIRY);

      await db.query(
        `INSERT INTO password_reset_tokens (player_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [playerId, token, expiresAt]
      );

      logger.info(`Password reset token generated for player ${playerId}`);
      return token;
    } catch (error) {
      logger.error('Error generating reset token:', error);
      throw new Error('Failed to generate reset token');
    }
  }

  /**
   * Validate password reset token
   */
  async validateResetToken(token: string): Promise<string | null> {
    try {
      if (!db.isConnected()) {
        return null;
      }

      const result = await db.query(
        `SELECT player_id FROM password_reset_tokens 
         WHERE token = $1 AND expires_at > NOW() AND used = false`,
        [token]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].player_id;
    } catch (error) {
      logger.error('Error validating reset token:', error);
      return null;
    }
  }

  /**
   * Use password reset token (mark as used)
   */
  async useResetToken(token: string): Promise<boolean> {
    try {
      if (!db.isConnected()) {
        return false;
      }

      const result = await db.query(
        `UPDATE password_reset_tokens 
         SET used = true, used_at = NOW()
         WHERE token = $1 AND expires_at > NOW() AND used = false`,
        [token]
      );

      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error using reset token:', error);
      return false;
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    playerId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!db.isConnected()) {
        return { success: false, error: 'Database not available' };
      }

      // Get current password hash
      const userResult = await db.query(
        `SELECT password_hash FROM players WHERE id = $1`,
        [playerId]
      );

      if (userResult.rows.length === 0) {
        return { success: false, error: 'User not found' };
      }

      // Verify current password
      const isCurrentValid = await this.verifyPassword(
        currentPassword, 
        userResult.rows[0].password_hash
      );

      if (!isCurrentValid) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Check new password strength
      const strengthResult = this.checkPasswordStrength(newPassword);
      if (!strengthResult.isValid) {
        return { 
          success: false, 
          error: `Password requirements not met: ${strengthResult.feedback.join(', ')}` 
        };
      }

      // Hash new password
      const newHash = await this.hashPassword(newPassword);

      // Update password
      await db.query(
        `UPDATE players SET password_hash = $2 WHERE id = $1`,
        [playerId, newHash]
      );

      // Reset any failed attempts
      await this.resetFailedAttempts(playerId);

      logger.info(`Password changed for player ${playerId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error changing password:', error);
      return { success: false, error: 'Failed to change password' };
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(
    token: string, 
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate token
      const playerId = await this.validateResetToken(token);
      if (!playerId) {
        return { success: false, error: 'Invalid or expired reset token' };
      }

      // Check password strength
      const strengthResult = this.checkPasswordStrength(newPassword);
      if (!strengthResult.isValid) {
        return { 
          success: false, 
          error: `Password requirements not met: ${strengthResult.feedback.join(', ')}` 
        };
      }

      // Hash new password
      const newHash = await this.hashPassword(newPassword);

      // Update password
      await db.query(
        `UPDATE players SET password_hash = $2 WHERE id = $1`,
        [playerId, newHash]
      );

      // Mark token as used
      await this.useResetToken(token);

      // Reset any failed attempts
      await this.resetFailedAttempts(playerId);

      logger.info(`Password reset completed for player ${playerId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error resetting password:', error);
      return { success: false, error: 'Failed to reset password' };
    }
  }

  /**
   * Clean up expired reset tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      if (!db.isConnected()) {
        return 0;
      }

      const result = await db.query(
        `DELETE FROM password_reset_tokens WHERE expires_at < NOW()`
      );

      if (result.rowCount > 0) {
        logger.info(`Cleaned up ${result.rowCount} expired password reset tokens`);
      }

      return result.rowCount;
    } catch (error) {
      logger.error('Error cleaning up expired tokens:', error);
      return 0;
    }
  }
}