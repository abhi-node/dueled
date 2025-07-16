import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { SessionService } from '../services/sessionService.js';
import type { Player } from '@dueled/shared';

interface AuthenticatedRequest extends Request {
  user?: Player;
  sessionId?: string;
}

const sessionService = new SessionService();

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Access token required',
    });
    return;
  }

  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const user = await sessionService.validateSession(token, ipAddress);
    
    if (!user) {
      res.status(403).json({
        success: false,
        error: 'Invalid or expired session',
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    logger.warn('Session validation failed', { error });
    res.status(403).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    next();
    return;
  }

  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const user = await sessionService.validateSession(token, ipAddress);
    
    if (user) {
      req.user = user;
    }
  } catch (error) {
    logger.debug('Optional auth failed', { error });
  }

  next();
};

/**
 * Middleware to check if token needs refresh and return refresh header
 */
export const checkTokenRefresh = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token && req.user) {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];
      
      const refreshResult = await sessionService.refreshToken(token, ipAddress, userAgent);
      
      if (refreshResult.success && refreshResult.token) {
        // Set new token in response header for client to use
        res.setHeader('X-New-Token', refreshResult.token);
        res.setHeader('X-Token-Expires', refreshResult.expiresAt?.toISOString() || '');
      }
    } catch (error) {
      logger.debug('Token refresh check failed', { error });
    }
  }

  next();
};

/**
 * Middleware to rate limit authentication attempts
 */
export const authRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
};