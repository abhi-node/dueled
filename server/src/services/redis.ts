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
      logger.warn('Falling back to in-memory storage for session management');
      this.connected = false;
    }
  }

  async set(key: string, value: string, expireInSeconds?: number): Promise<void> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, skipping set operation');
      return;
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
      logger.warn('Redis not available, returning null');
      return null;
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
      logger.warn('Redis not available, skipping delete operation');
      return;
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
      logger.warn('Redis not available, returning 0 for incr');
      return 0;
    }

    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('Redis incr error:', error);
      return 0;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, skipping expire operation');
      return false;
    }

    try {
      const result = await this.client.expire(key, seconds);
      return result;
    } catch (error) {
      logger.error('Redis expire error:', error);
      return false;
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, skipping setex operation');
      return;
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
      logger.warn('Redis not available, returning 0 for zadd');
      return 0;
    }

    try {
      return await this.client.zAdd(key, { score, value: member });
    } catch (error) {
      logger.error('Redis zadd error:', error);
      return 0;
    }
  }

  async zrem(key: string, member: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for zrem');
      return 0;
    }

    try {
      return await this.client.zRem(key, member);
    } catch (error) {
      logger.error('Redis zrem error:', error);
      return 0;
    }
  }

  async zrange(key: string, start: number, stop: number, withScores: boolean = false): Promise<string[] | { value: string; score: number }[]> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning empty array for zrange');
      return [];
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
      return [];
    }
  }

  async zrangebyscore(key: string, min: number, max: number, withScores: boolean = false): Promise<string[] | { value: string; score: number }[]> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning empty array for zrangebyscore');
      return [];
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
      return [];
    }
  }

  async zcard(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for zcard');
      return 0;
    }

    try {
      return await this.client.zCard(key);
    } catch (error) {
      logger.error('Redis zcard error:', error);
      return 0;
    }
  }

  async zscore(key: string, member: string): Promise<number | null> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning null for zscore');
      return null;
    }

    try {
      return await this.client.zScore(key, member);
    } catch (error) {
      logger.error('Redis zscore error:', error);
      return null;
    }
  }

  async zrank(key: string, member: string): Promise<number | null> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning null for zrank');
      return null;
    }

    try {
      return await this.client.zRank(key, member);
    } catch (error) {
      logger.error('Redis zrank error:', error);
      return null;
    }
  }

  // Hash operations for storing complex data
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for hset');
      return 0;
    }

    try {
      return await this.client.hSet(key, field, value);
    } catch (error) {
      logger.error('Redis hset error:', error);
      return 0;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning null for hget');
      return null;
    }

    try {
      return (await this.client.hGet(key, field)) || null;
    } catch (error) {
      logger.error('Redis hget error:', error);
      return null;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning empty object for hgetall');
      return {};
    }

    try {
      return await this.client.hGetAll(key);
    } catch (error) {
      logger.error('Redis hgetall error:', error);
      return {};
    }
  }

  async hdel(key: string, field: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for hdel');
      return 0;
    }

    try {
      return await this.client.hDel(key, field);
    } catch (error) {
      logger.error('Redis hdel error:', error);
      return 0;
    }
  }

  // List operations for event queuing
  async lpush(key: string, value: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for lpush');
      return 0;
    }

    try {
      return await this.client.lPush(key, value);
    } catch (error) {
      logger.error('Redis lpush error:', error);
      return 0;
    }
  }

  async rpop(key: string): Promise<string | null> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning null for rpop');
      return null;
    }

    try {
      return await this.client.rPop(key);
    } catch (error) {
      logger.error('Redis rpop error:', error);
      return null;
    }
  }

  async llen(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for llen');
      return 0;
    }

    try {
      return await this.client.lLen(key);
    } catch (error) {
      logger.error('Redis llen error:', error);
      return 0;
    }
  }

  // Set operations for tracking active connections
  async sadd(key: string, member: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for sadd');
      return 0;
    }

    try {
      return await this.client.sAdd(key, member);
    } catch (error) {
      logger.error('Redis sadd error:', error);
      return 0;
    }
  }

  async srem(key: string, member: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for srem');
      return 0;
    }

    try {
      return await this.client.sRem(key, member);
    } catch (error) {
      logger.error('Redis srem error:', error);
      return 0;
    }
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning empty array for smembers');
      return [];
    }

    try {
      return await this.client.sMembers(key);
    } catch (error) {
      logger.error('Redis smembers error:', error);
      return [];
    }
  }

  async scard(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for scard');
      return 0;
    }

    try {
      return await this.client.sCard(key);
    } catch (error) {
      logger.error('Redis scard error:', error);
      return 0;
    }
  }

  // Utility methods
  async exists(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning 0 for exists');
      return 0;
    }

    try {
      return await this.client.exists(key);
    } catch (error) {
      logger.error('Redis exists error:', error);
      return 0;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available, returning empty array for keys');
      return [];
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis keys error:', error);
      return [];
    }
  }

  getConnectionStatus(): boolean {
    return this.connected;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const redis = new RedisService();