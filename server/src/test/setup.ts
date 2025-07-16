// Jest setup file
// Setup global test environment
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.REDIS_URL = 'redis://localhost:6379';