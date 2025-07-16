import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';

/**
 * Generic validation error handler
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => {
      if (error.type === 'field') {
        return `${error.path}: ${error.msg}`;
      }
      return error.msg;
    });

    logger.warn('Validation failed:', {
      path: req.path,
      errors: errorMessages,
      ip: req.ip
    });

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorMessages
    });
    return;
  }

  next();
};

/**
 * Password strength validation
 */
export const validatePasswordStrength = (fieldName: string = 'password') => {
  return body(fieldName)
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character');
};

/**
 * Username validation
 */
export const validateUsername = (fieldName: string = 'username') => {
  return body(fieldName)
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    .trim();
};

/**
 * Email validation
 */
export const validateEmail = (fieldName: string = 'email') => {
  return body(fieldName)
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail()
    .isLength({ max: 254 })
    .withMessage('Email must be less than 254 characters');
};

/**
 * UUID validation
 */
export const validateUUID = (fieldName: string, location: 'body' | 'param' | 'query' = 'param') => {
  const validator = location === 'body' ? body(fieldName) :
                   location === 'param' ? param(fieldName) :
                   query(fieldName);
  
  return validator
    .isUUID(4)
    .withMessage(`${fieldName} must be a valid UUID`);
};

/**
 * Sanitize user input
 */
export const sanitizeInput = (fieldName: string) => {
  return body(fieldName)
    .trim()
    .escape();
};

/**
 * Rate limiting configurations
 */
export const rateLimits = {
  // Authentication endpoints - stricter limits
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
      success: false,
      error: 'Too many authentication attempts. Please try again in 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded for auth endpoint', {
        ip: req.ip,
        path: req.path,
        userAgent: req.headers['user-agent']
      });
      res.status(429).json({
        success: false,
        error: 'Too many authentication attempts. Please try again in 15 minutes.'
      });
    }
  }),

  // General API endpoints
  api: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: {
      success: false,
      error: 'Too many requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded for API endpoint', {
        ip: req.ip,
        path: req.path,
        userAgent: req.headers['user-agent']
      });
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.'
      });
    }
  }),

  // Password reset - very strict
  passwordReset: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 attempts per hour
    message: {
      success: false,
      error: 'Too many password reset attempts. Please try again in 1 hour.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded for password reset', {
        ip: req.ip,
        email: req.body.email,
        userAgent: req.headers['user-agent']
      });
      res.status(429).json({
        success: false,
        error: 'Too many password reset attempts. Please try again in 1 hour.'
      });
    }
  }),

  // Registration
  register: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 registrations per hour per IP
    message: {
      success: false,
      error: 'Too many registration attempts. Please try again in 1 hour.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded for registration', {
        ip: req.ip,
        username: req.body.username,
        userAgent: req.headers['user-agent']
      });
      res.status(429).json({
        success: false,
        error: 'Too many registration attempts. Please try again in 1 hour.'
      });
    }
  })
};

/**
 * Validation rules for authentication endpoints
 */
export const authValidation = {
  register: [
    validateUsername(),
    validateEmail(),
    validatePasswordStrength(),
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Password confirmation does not match password');
        }
        return true;
      }),
    handleValidationErrors
  ],

  login: [
    body('username')
      .notEmpty()
      .withMessage('Username is required')
      .trim(),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    handleValidationErrors
  ],

  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    validatePasswordStrength('newPassword'),
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Password confirmation does not match new password');
        }
        return true;
      }),
    handleValidationErrors
  ],

  resetPassword: [
    validateEmail(),
    handleValidationErrors
  ],

  confirmResetPassword: [
    body('token')
      .notEmpty()
      .withMessage('Reset token is required')
      .isLength({ min: 32, max: 64 })
      .withMessage('Invalid reset token format'),
    validatePasswordStrength('newPassword'),
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Password confirmation does not match new password');
        }
        return true;
      }),
    handleValidationErrors
  ]
};

/**
 * Validation rules for player endpoints
 */
export const playerValidation = {
  updateProfile: [
    body('username')
      .optional()
      .isLength({ min: 3, max: 20 })
      .withMessage('Username must be between 3 and 20 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Must be a valid email address')
      .normalizeEmail(),
    body('favoriteClass')
      .optional()
      .isIn(['berserker', 'mage', 'bomber', 'archer'])
      .withMessage('Invalid class type'),
    handleValidationErrors
  ],

  getStats: [
    validateUUID('playerId'),
    handleValidationErrors
  ]
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' ws: wss:; " +
    "frame-ancestors 'none'"
  );

  next();
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  // Log request
  logger.info('Request received', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: (req as any).user?.id
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): any {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userId: (req as any).user?.id
    });

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};