import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { authRoutes } from './controllers/authController.js';
import { playerRoutes } from './controllers/playerController.js';
import { matchmakingRoutes } from './controllers/matchmakingController.js';
import { GameHandler } from './websocket/GameHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import { securityHeaders, requestLogger } from './middleware/validation.js';
import { SessionService } from './services/sessionService.js';
import { PasswordService } from './services/passwordService.js';
import { logger } from './utils/logger.js';
import { db } from './services/database.js';
import { redis } from './services/redis.js';
import { matchmakingService, setGameHandler } from './services/matchmakingService.js';
import { gameStateService } from './services/gameStateService.js';
import { migrationService } from './services/migrations.js';
import { matchFinalizationService } from './services/matchFinalizationService.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

// Initialize services
async function initializeServices() {
  await db.connect();
  await redis.connect();
  
  // Run database migrations if connected
  if (db.isConnected()) {
    try {
      logger.info('Running database migrations...');
      await migrationService.runMigrations();
    } catch (error) {
      logger.error('Migration error (non-fatal):', error);
      // Continue even if migrations fail - the app can work with base schema
    }
  }
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5000',
    ];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
}));

// Rate limiting configurations
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP',
      retryAfter: 15 * 60 * 1000
    });
  }
});

// API-specific rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: {
    success: false,
    error: 'Too many API requests',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check rate limiting (more lenient)
const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  message: {
    success: false,
    error: 'Too many health check requests'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use(globalLimiter);
app.use('/api/', apiLimiter);
app.use('/health', healthLimiter);

// Body parsing middleware with enhanced security
app.use(express.json({ 
  limit: '1mb',
  strict: true,
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: false,
  limit: '1mb',
  parameterLimit: 20
}));

// Cookie parser middleware
app.use(cookieParser());

// Additional security middleware
app.use(requestLogger);
app.use(securityHeaders);

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    logger.warn(`Request timeout for ${req.method} ${req.path}`);
    res.status(408).json({
      success: false,
      error: 'Request timeout'
    });
  });
  next();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/matchmaking', matchmakingRoutes);

// Health check endpoint with detailed status
app.get('/health', async (req, res) => {
  try {
    const dbConnected = db.isConnected();
    const redisConnected = redis.getConnectionStatus();
    
    const health = {
      status: dbConnected && redisConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbConnected ? 'connected' : 'disconnected',
        redis: redisConnected ? 'connected' : 'disconnected',
      },
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
    };
    
    // Set status code based on health
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Metrics endpoint for monitoring
app.get('/metrics', (req, res) => {
  try {
    const gameHandler = (io as any).gameHandler;
    const stats = gameHandler ? gameHandler.getConnectionStats() : null;
    
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      websocket: stats || {
        totalConnections: 0,
        authenticatedPlayers: 0,
        activeMatches: 0,
        playersInMatches: 0,
      },
      database: {
        connected: db.isConnected(),
      },
      redis: {
        connected: redis.getConnectionStatus(),
      },
    };
    
    res.json(metrics);
  } catch (error) {
    logger.error('Metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics',
    });
  }
});

// WebSocket game handler with enhanced configuration
const gameHandler = new GameHandler(io);

// Store gameHandler reference for metrics
(io as any).gameHandler = gameHandler;

// Set gameHandler reference in matchmaking service
setGameHandler(gameHandler);

// Set gameHandler reference in game state service
gameStateService.setGameHandler(gameHandler);

// Set gameHandler reference in match finalization service
matchFinalizationService.setGameHandler(gameHandler);

// Enhanced Socket.IO configuration
io.engine.on('connection_error', (err) => {
  logger.error('Socket.IO connection error:', err);
});

// Monitor Socket.IO connections
io.engine.on('headers', (headers, req) => {
  logger.debug(`WebSocket headers from ${req.socket.remoteAddress}:`, headers);
});

// Socket.IO error handling
io.on('error', (error) => {
  logger.error('Socket.IO error:', error);
});

// Enhanced error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  // Log the error
  logger.error('Express error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.message
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'File too large'
    });
  }
  
  // Default error handler
  errorHandler(err, req, res, next);
});

// 404 handler with enhanced logging
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// Start server with enhanced initialization
async function startServer() {
  try {
    await initializeServices();
    
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 WebSocket enabled with Socket.IO`);
      logger.info(`💾 Database: ${db.isConnected() ? 'Connected' : 'Disconnected'}`);
      logger.info(`🔴 Redis: ${redis.getConnectionStatus() ? 'Connected' : 'Disconnected'}`);
      logger.info(`🛡️  Security: Rate limiting and CORS enabled`);
      logger.info(`📊 Metrics available at /metrics`);
    });
    
    // Setup periodic health checks
    setInterval(async () => {
      if (!db.isConnected()) {
        logger.warn('Database connection lost, attempting to reconnect...');
        try {
          await db.connect();
          logger.info('Database reconnected successfully');
        } catch (error) {
          logger.error('Database reconnection failed:', error);
        }
      }
      
      if (!redis.getConnectionStatus()) {
        logger.warn('Redis connection lost, attempting to reconnect...');
        try {
          await redis.connect();
          logger.info('Redis reconnected successfully');
        } catch (error) {
          logger.error('Redis reconnection failed:', error);
        }
      }
    }, 30000); // Check every 30 seconds
    
    // Setup periodic matchmaking queue processing
    setInterval(async () => {
      try {
        await matchmakingService.processQueue();
      } catch (error) {
        logger.error('Error processing matchmaking queue:', error);
      }
    }, 500); // Process queue every 500ms for faster matching
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for testing
export { app, server, io, gameHandler };

// Enhanced graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  // Stop accepting new connections
  server.close(async () => {
    try {
      // Clean up WebSocket connections
      gameHandler.cleanup();
      
      // Close database connections
      await db.close();
      logger.info('Database connection closed');
      
      // Close Redis connections
      await redis.disconnect();
      logger.info('Redis connection closed');
      
      logger.info('Server shut down gracefully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Force shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection:', { reason, promise });
  process.exit(1);
});