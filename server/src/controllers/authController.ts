import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';
import { PlayerService } from '../services/playerService.js';
import { redis } from '../services/redis.js';
import { 
  createSession, 
  refreshAccessToken, 
  destroySession, 
  verifyToken, 
  JwtPayload 
} from '../utils/jwt.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authSecure.js';
import type { AuthRequest, AuthResponse, Player } from '@dueled/shared';

const router = Router();
const playerService = new PlayerService();

// Rate limiting for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs (increased for development)
  message: 'Too many authentication attempts from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for login attempts
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per windowMs (increased for development)
  message: 'Too many login attempts from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

// More lenient rate limiting for anonymous sessions
const anonymousRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 anonymous sessions per windowMs
  message: 'Too many anonymous session requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

// Token refresh rate limiting (more lenient than login)
const refreshRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 refresh attempts per windowMs
  message: 'Too many token refresh requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Log security events for audit purposes
 */
const logSecurityEvent = (event: string, details: any, req: Request) => {
  logger.info(`SECURITY_EVENT: ${event}`, {
    ...details,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  });
};

/**
 * Check if an IP is rate limited or suspicious
 */
const checkSuspiciousActivity = async (ip: string, event: string): Promise<boolean> => {
  try {
    const key = `suspicious_activity:${ip}:${event}`;
    const count = await redis.incr(key);
    
    if (count === 1) {
      await redis.expire(key, 3600); // 1 hour
    }
    
    return count > 20; // More than 20 attempts per hour is suspicious
  } catch (error) {
    logger.warn('Error checking suspicious activity:', error);
    return false;
  }
};

/**
 * Validate password strength
 */
const validatePasswordStrength = (password: string): { isValid: boolean; message?: string } => {
  if (password.length < 8) {
    return { isValid: false, message: 'Password must be at least 8 characters long' };
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one lowercase letter' };
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one uppercase letter' };
  }
  
  if (!/(?=.*\d)/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one number' };
  }
  
  return { isValid: true };
};

// Cookie options for refresh token
const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

// Register endpoint
router.post(
  '/register',
  authRateLimit,
  [
    body('username')
      .isLength({ min: 3, max: 20 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-20 characters and contain only letters, numbers, and underscores')
      .trim(),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Passwords do not match');
        }
        return true;
      }),
  ],
  async (req: Request<{}, AuthResponse, AuthRequest>, res: Response<AuthResponse>) => {
    try {
      // Check for suspicious activity
      const isSuspicious = await checkSuspiciousActivity(req.ip || 'unknown', 'register');
      if (isSuspicious) {
        logSecurityEvent('SUSPICIOUS_REGISTRATION_ACTIVITY', { ip: req.ip }, req);
        return res.status(429).json({
          success: false,
          error: 'Too many registration attempts. Please try again later.',
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logSecurityEvent('REGISTRATION_VALIDATION_FAILED', { 
          errors: errors.array(),
          username: req.body.username 
        }, req);
        return res.status(400).json({
          success: false,
          error: 'Validation failed: ' + errors.array().map(e => e.msg).join(', '),
        });
      }

      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        logSecurityEvent('REGISTRATION_MISSING_FIELDS', { username, email: !!email }, req);
        return res.status(400).json({
          success: false,
          error: 'Username, email, and password are required',
        });
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        logSecurityEvent('WEAK_PASSWORD_ATTEMPT', { username }, req);
        return res.status(400).json({
          success: false,
          error: passwordValidation.message,
        });
      }

      // Check if user already exists
      const existingUser = await playerService.findPlayerByUsername(username);

      if (existingUser) {
        logSecurityEvent('DUPLICATE_USERNAME_REGISTRATION', { username }, req);
        return res.status(409).json({
          success: false,
          error: 'Username already exists',
        });
      }

      // Check if email already exists
      const existingEmail = await playerService.findPlayerByEmail(email);
      if (existingEmail) {
        logSecurityEvent('DUPLICATE_EMAIL_REGISTRATION', { email }, req);
        return res.status(409).json({
          success: false,
          error: 'Email already registered',
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create new user
      const newUser = await playerService.createPlayer({
        username,
        email,
        passwordHash: hashedPassword,
        isAnonymous: false,
      });

      // Create session with JWT tokens
      const session = await createSession(newUser.id, 'user');

      logSecurityEvent('USER_REGISTERED', { 
        username: newUser.username,
        email: newUser.email || 'N/A',
        isAnonymous: newUser.isAnonymous,
        sessionId: session.sessionId
      }, req);
      
      logger.info(`New user registered: ${username}`);

      // Set refresh token as HttpOnly cookie
      res.cookie('rt', session.refreshToken, refreshTokenCookieOptions);

      res.status(201).json({
        success: true,
        token: session.accessToken,
        player: newUser,
      });
    } catch (error: any) {
      logSecurityEvent('REGISTRATION_ERROR', { 
        error: error.message,
        username: req.body.username 
      }, req);
      logger.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Registration failed',
      });
    }
  }
);

// Login endpoint
router.post(
  '/login',
  loginRateLimit,
  [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username is required'),
    body('password')
      .exists()
      .notEmpty()
      .withMessage('Password is required'),
  ],
  async (req: Request<{}, AuthResponse, AuthRequest>, res: Response<AuthResponse>) => {
    try {
      // Check for suspicious activity
      const isSuspicious = await checkSuspiciousActivity(req.ip || 'unknown', 'login');
      if (isSuspicious) {
        logSecurityEvent('SUSPICIOUS_LOGIN_ACTIVITY', { ip: req.ip }, req);
        return res.status(429).json({
          success: false,
          error: 'Too many login attempts. Please try again later.',
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logSecurityEvent('LOGIN_VALIDATION_FAILED', { 
          errors: errors.array(),
          username: req.body.username 
        }, req);
        return res.status(400).json({
          success: false,
          error: 'Validation failed: ' + errors.array().map(e => e.msg).join(', '),
        });
      }

      const { username, password } = req.body;

      if (!username || !password) {
        logSecurityEvent('LOGIN_MISSING_CREDENTIALS', { username: !!username }, req);
        return res.status(400).json({
          success: false,
          error: 'Username and password are required',
        });
      }

      // Find user
      const user = await playerService.findPlayerByUsername(username);

      if (!user) {
        logSecurityEvent('LOGIN_USER_NOT_FOUND', { username }, req);
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        logSecurityEvent('LOGIN_INVALID_PASSWORD', { username }, req);
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Create player data
      const playerData: Player = {
        id: user.id,
        username: user.username,
        isAnonymous: user.is_anonymous,
        rating: user.rating || 1000,
      };

      // Create session with JWT tokens
      const session = await createSession(user.id, 'user');

      logSecurityEvent('USER_LOGIN_SUCCESS', { 
        username: playerData.username,
        isAnonymous: playerData.isAnonymous,
        sessionId: session.sessionId
      }, req);
      
      logger.info(`User logged in: ${username}`);

      // Set refresh token as HttpOnly cookie
      res.cookie('rt', session.refreshToken, refreshTokenCookieOptions);

      res.json({
        success: true,
        token: session.accessToken,
        player: playerData,
      });
    } catch (error: any) {
      logSecurityEvent('LOGIN_ERROR', { 
        error: error.message,
        username: req.body.username 
      }, req);
      logger.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed',
      });
    }
  }
);

// Anonymous session endpoint
router.post('/anonymous', anonymousRateLimit, async (req: Request<{}, AuthResponse>, res: Response<AuthResponse>) => {
  try {
    // Check for suspicious activity
    const isSuspicious = await checkSuspiciousActivity(req.ip || 'unknown', 'anonymous');
    if (isSuspicious) {
      logSecurityEvent('SUSPICIOUS_ANONYMOUS_ACTIVITY', { ip: req.ip }, req);
      return res.status(429).json({
        success: false,
        error: 'Too many anonymous session requests. Please try again later.',
      });
    }

    const guestUsername = `Guest${Math.floor(Math.random() * 10000)}`;
    
    const anonymousUser = await playerService.createPlayer({
      username: guestUsername,
      isAnonymous: true,
    });

    // Create session for anonymous user
    const session = await createSession(anonymousUser.id, 'user');

    logger.info(`Anonymous user created: ${anonymousUser.username} with session: ${session.sessionId}`);

    // Set refresh token as HttpOnly cookie
    res.cookie('rt', session.refreshToken, refreshTokenCookieOptions);

    res.json({
      success: true,
      token: session.accessToken,
      player: anonymousUser,
    });
  } catch (error) {
    logger.error('Anonymous session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create anonymous session',
    });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }
    
    // Destroy session (revokes refresh token and optionally deny-lists access token)
    await destroySession(req.sessionId, req.user.jti);
    
    logSecurityEvent('USER_LOGOUT', { 
      username: req.user.player?.username || 'unknown',
      sessionId: req.sessionId
    }, req);
    
    logger.info(`User logged out: ${req.user.player?.username || req.user.sub}`);
    
    // Clear refresh token cookie
    res.clearCookie('rt', refreshTokenCookieOptions);
    
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
    });
  }
});

// Refresh token endpoint
router.post('/refresh', refreshRateLimit, async (req: Request, res: Response<AuthResponse>) => {
  try {
    // Get refresh token from cookie
    const refreshToken = req.cookies.rt;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required',
      });
    }

    // Check for optional new session request (for multi-tab support)
    const createNewSession = req.query.newSession === 'true';

    let newAccessToken: string | null;
    let newRefreshToken: string | undefined;
    let sessionId: string | undefined;

    if (createNewSession) {
      // Create entirely new session for this tab/device
      try {
        const rtPayload = verifyToken<{ sub: string }>(refreshToken);
        const session = await createSession(rtPayload.sub, 'user');
        
        newAccessToken = session.accessToken;
        newRefreshToken = session.refreshToken;
        sessionId = session.sessionId;
        
        logSecurityEvent('NEW_SESSION_CREATED', { 
          userId: rtPayload.sub,
          newSessionId: sessionId
        }, req);
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
        });
      }
    } else {
      // Standard refresh - reuse same session
      newAccessToken = await refreshAccessToken(refreshToken);
    }

    if (!newAccessToken) {
      return res.status(401).json({
        success: false,
        error: 'Failed to refresh token',
      });
    }

    // Decode the new token to get user info
    const payload = verifyToken<JwtPayload>(newAccessToken);
    
    // Get fresh user data
    const user = await playerService.findPlayerById(payload.sub);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }

    const playerData: Player = {
      id: user.id,
      username: user.username,
      isAnonymous: user.isAnonymous,
      rating: user.rating || 1000,
    };

    // Set new refresh token cookie if we created a new session
    if (newRefreshToken) {
      res.cookie('rt', newRefreshToken, refreshTokenCookieOptions);
    }

    res.json({
      success: true,
      token: newAccessToken,
      player: playerData,
      sessionId: sessionId || payload.sid,
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Token refresh failed',
    });
  }
});

// Get current user endpoint
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.player) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    res.json({
      success: true,
      player: req.user.player,
      sessionId: req.sessionId,
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get current user',
    });
  }
});

// Update profile endpoint
router.put('/profile', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
      });
    }

    try {
      const secret = process.env.JWT_SECRET || 'default-secret';
      const decoded = jwt.verify(token, secret) as any;
      
      const user = await playerService.findPlayerById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found',
        });
      }

      // For now, just return the user data without updating
      // In a real implementation, you'd update the user in the database
      const playerData: Player = {
        id: user.id,
        username: user.username,
        isAnonymous: user.isAnonymous,
        rating: user.rating || 1000,
      };

      logger.info(`Profile update requested for user: ${user.username}`);

      res.json({
        success: true,
        player: playerData,
      });
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
});

// Password reset request endpoint
router.post('/password-reset', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // For now, just acknowledge the request
    // In a production app, you'd send an actual email
    logger.info(`Password reset requested for email: ${email}`);

    res.json({
      success: true,
      message: 'Password reset email sent (simulated)',
    });
  } catch (error) {
    logger.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
    });
  }
});

// Password reset confirm endpoint
router.post('/password-reset/confirm', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required',
      });
    }

    // For now, just acknowledge the request
    // In a production app, you'd verify the token and update the password
    logger.info(`Password reset confirmation attempted with token: ${token}`);

    res.json({
      success: true,
      message: 'Password reset successful (simulated)',
    });
  } catch (error) {
    logger.error('Password reset confirm error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
    });
  }
});

// Security status endpoint for monitoring
router.get('/security-status', async (req: Request, res: Response) => {
  try {
    const ip = req.ip || 'unknown';
    const stats = {
      ip,
      timestamp: new Date().toISOString(),
      rateLimitStatus: {
        auth: 'normal', // Would check actual rate limit status
        login: 'normal',
        anonymous: 'normal'
      },
      suspiciousActivity: {
        register: await checkSuspiciousActivity(ip, 'register'),
        login: await checkSuspiciousActivity(ip, 'login'),
        anonymous: await checkSuspiciousActivity(ip, 'anonymous')
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Security status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get security status'
    });
  }
});

export { router as authRoutes };