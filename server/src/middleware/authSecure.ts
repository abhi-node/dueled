import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { verifyToken, isTokenDenyListed, JwtPayload } from '../utils/jwt.js';
import { PlayerService } from '../services/playerService.js';
import type { Player } from '@dueled/shared';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload & { player?: Player };
  sessionId?: string;
}

const playerService = new PlayerService();

/**
 * Authenticate token middleware with RS256 verification
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required',
      });
      return;
    }

    // Verify token with RS256
    const payload = verifyToken<JwtPayload>(token);
    
    // Check if token is deny-listed
    if (await isTokenDenyListed(payload.jti)) {
      res.status(401).json({
        success: false,
        error: 'Token has been revoked',
      });
      return;
    }
    
    // Optional: Load full player data
    const player = await playerService.findPlayerById(payload.sub);
    if (!player) {
      res.status(401).json({
        success: false,
        error: 'User not found',
      });
      return;
    }
    
    // Attach user info to request
    req.user = {
      ...payload,
      player: {
        id: player.id,
        username: player.username,
        isAnonymous: player.isAnonymous,
        rating: player.rating || 1000,
      }
    };
    req.sessionId = payload.sid;
    
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
      return;
    }
    
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }
    
    logger.error('Authentication error:', error);
    res.status(403).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token present
 */
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
    const payload = verifyToken<JwtPayload>(token);
    
    // Check deny list
    if (await isTokenDenyListed(payload.jti)) {
      // Token is revoked, but since this is optional auth, just continue without user
      next();
      return;
    }
    
    // Optional: Load player data
    const player = await playerService.findPlayerById(payload.sub);
    if (player) {
      req.user = {
        ...payload,
        player: {
          id: player.id,
          username: player.username,
          isAnonymous: player.isAnonymous,
          rating: player.rating || 1000,
        }
      };
      req.sessionId = payload.sid;
    }
  } catch (error) {
    // For optional auth, we don't throw errors
    logger.debug('Optional auth failed:', error);
  }

  next();
};

/**
 * Require specific role middleware
 */
export const requireRole = (role: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }
    
    if (req.user.role !== role) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }
    
    next();
  };
};

/**
 * WebSocket authentication helper
 */
export const authenticateSocketToken = async (token: string): Promise<JwtPayload | null> => {
  try {
    const payload = verifyToken<JwtPayload>(token);
    
    // Check deny list
    if (await isTokenDenyListed(payload.jti)) {
      return null;
    }
    
    return payload;
  } catch (error) {
    logger.debug('Socket authentication failed:', error);
    return null;
  }
};