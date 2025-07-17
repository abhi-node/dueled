import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';

class RedisService {
  private client: RedisClientType | null = null;
  private connected = false;

  async connect(): Promise<void> {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.connected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.connected = true;
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Redis connection failed:', error);
      throw new Error('Redis connection required for JWT system. Please ensure Redis is running.');
    }
  }

  async set(key: string, value: string, expireInSeconds?: number): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      if (expireInSeconds) {
        await this.client.setEx(key, expireInSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error('Redis set error:', error);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Redis delete error:', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      this.connected = false;
      logger.info('Redis client disconnected');
    }
  }

  async incr(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('Redis incr error:', error);
      throw error;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      const result = await this.client.expire(key, seconds);
      return result;
    } catch (error) {
      logger.error('Redis expire error:', error);
      throw error;
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      await this.client.setEx(key, seconds, value);
    } catch (error) {
      logger.error('Redis setex error:', error);
    }
  }

  // Sorted Set operations for matchmaking queue
  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.zAdd(key, { score, value: member });
    } catch (error) {
      logger.error('Redis zadd error:', error);
      throw error;
    }
  }

  async zrem(key: string, member: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.zRem(key, member);
    } catch (error) {
      logger.error('Redis zrem error:', error);
      throw error;
    }
  }

  async zrange(key: string, start: number, stop: number, withScores: boolean = false): Promise<string[] | { value: string; score: number }[]> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      if (withScores) {
        const result = await this.client.zRangeWithScores(key, start, stop);
        return result.map(item => ({ value: item.value, score: item.score }));
      } else {
        return await this.client.zRange(key, start, stop);
      }
    } catch (error) {
      logger.error('Redis zrange error:', error);
      throw error;
    }
  }

  async zrangebyscore(key: string, min: number, max: number, withScores: boolean = false): Promise<string[] | { value: string; score: number }[]> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      if (withScores) {
        const result = await this.client.zRangeByScoreWithScores(key, min, max);
        return result.map(item => ({ value: item.value, score: item.score }));
      } else {
        return await this.client.zRangeByScore(key, min, max);
      }
    } catch (error) {
      logger.error('Redis zrangebyscore error:', error);
      throw error;
    }
  }

  async zcard(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.zCard(key);
    } catch (error) {
      logger.error('Redis zcard error:', error);
      throw error;
    }
  }

  async zscore(key: string, member: string): Promise<number | null> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.zScore(key, member);
    } catch (error) {
      logger.error('Redis zscore error:', error);
      throw error;
    }
  }

  async zrank(key: string, member: string): Promise<number | null> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.zRank(key, member);
    } catch (error) {
      logger.error('Redis zrank error:', error);
      throw error;
    }
  }

  // Hash operations for storing complex data
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.hSet(key, field, value);
    } catch (error) {
      logger.error('Redis hset error:', error);
      throw error;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return (await this.client.hGet(key, field)) || null;
    } catch (error) {
      logger.error('Redis hget error:', error);
      throw error;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.hGetAll(key);
    } catch (error) {
      logger.error('Redis hgetall error:', error);
      throw error;
    }
  }

  async hdel(key: string, field: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.hDel(key, field);
    } catch (error) {
      logger.error('Redis hdel error:', error);
      throw error;
    }
  }

  // List operations for event queuing
  async lpush(key: string, value: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.lPush(key, value);
    } catch (error) {
      logger.error('Redis lpush error:', error);
      throw error;
    }
  }

  async rpop(key: string): Promise<string | null> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.rPop(key);
    } catch (error) {
      logger.error('Redis rpop error:', error);
      throw error;
    }
  }

  async llen(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.lLen(key);
    } catch (error) {
      logger.error('Redis llen error:', error);
      throw error;
    }
  }

  // Set operations for tracking active connections
  async sadd(key: string, member: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.sAdd(key, member);
    } catch (error) {
      logger.error('Redis sadd error:', error);
      throw error;
    }
  }

  async srem(key: string, member: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.sRem(key, member);
    } catch (error) {
      logger.error('Redis srem error:', error);
      throw error;
    }
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.sMembers(key);
    } catch (error) {
      logger.error('Redis smembers error:', error);
      throw error;
    }
  }

  async scard(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.sCard(key);
    } catch (error) {
      logger.error('Redis scard error:', error);
      throw error;
    }
  }

  // Utility methods
  async exists(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.exists(key);
    } catch (error) {
      logger.error('Redis exists error:', error);
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis keys error:', error);
      throw error;
    }
  }

  getConnectionStatus(): boolean {
    return this.connected;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async flushdb(): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('Redis not connected');
    }

    try {
      await this.client.flushDb();
      logger.info('Redis database flushed');
    } catch (error) {
      logger.error('Redis flushdb error:', error);
      throw error;
    }
  }

  async quit(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
      logger.info('Redis client quit');
    }
  }
}

export const redis = new RedisService();