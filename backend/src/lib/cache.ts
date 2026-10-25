import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

class CacheService {
  private redis: Redis | null = null;
  private isRedisReady: boolean = false;
  private memoryCache = new Map<string, CacheEntry>();

  constructor() {
    if (config.redisUrl) {
      try {
        this.redis = new Redis(config.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: (times) => {
            if (times > 3) return null; // Stop retrying after 3 attempts and fall back to memory
            return Math.min(times * 200, 2000);
          },
        });

        this.redis.on('connect', () => {
          this.isRedisReady = true;
          logger.info(`Redis cache connected to ${config.redisUrl.replace(/:[^:]*@/, ':****@')}`);
        });

        this.redis.on('ready', () => {
          this.isRedisReady = true;
        });

        this.redis.on('error', (err) => {
          this.isRedisReady = false;
          logger.warn('Redis cache unavailable, gracefully using in-memory L1 cache', err.message);
        });

        this.redis.on('close', () => {
          this.isRedisReady = false;
        });

        // Trigger connection attempt
        this.redis.connect().catch((err) => {
          this.isRedisReady = false;
          logger.warn('Initial Redis connection failed, utilizing in-memory cache', err.message);
        });
      } catch (err: any) {
        this.isRedisReady = false;
        logger.warn('Redis initialization failed, falling back to memory cache', err.message);
      }
    } else {
      logger.info('REDIS_URL not configured. Operating in high-speed in-memory cache mode.');
    }
  }

  isUsingRedis(): boolean {
    return this.isRedisReady && this.redis !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isRedisReady && this.redis) {
        const val = await this.redis.get(key);
        if (val) {
          return JSON.parse(val) as T;
        }
      }

      // In-memory L1 check or fallback
      const entry = this.memoryCache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key);
        return null;
      }
      return JSON.parse(entry.value) as T;
    } catch (err) {
      logger.warn(`Cache get failed for key ${key}`, err);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number = 30): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      if (this.isRedisReady && this.redis) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
      }

      // Always populate local memory cache as L1
      this.memoryCache.set(key, {
        value: serialized,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    } catch (err) {
      logger.warn(`Cache set failed for key ${key}`, err);
    }
  }

  async del(patternOrKey: string): Promise<void> {
    try {
      if (patternOrKey.endsWith('*')) {
        const prefix = patternOrKey.slice(0, -1);

        // Delete from Redis using SCAN
        if (this.isRedisReady && this.redis) {
          let cursor = '0';
          do {
            const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', patternOrKey, 'COUNT', 50);
            cursor = nextCursor;
            if (keys.length > 0) {
              await this.redis.del(...keys);
            }
          } while (cursor !== '0');
        }

        // Delete from in-memory cache
        for (const key of this.memoryCache.keys()) {
          if (key.startsWith(prefix)) {
            this.memoryCache.delete(key);
          }
        }
      } else {
        if (this.isRedisReady && this.redis) {
          await this.redis.del(patternOrKey);
        }
        this.memoryCache.delete(patternOrKey);
      }
    } catch (err) {
      logger.warn(`Cache delete failed for ${patternOrKey}`, err);
    }
  }

  async flush(): Promise<void> {
    try {
      if (this.isRedisReady && this.redis) {
        await this.redis.flushdb();
      }
      this.memoryCache.clear();
    } catch (err) {
      logger.warn('Cache flush failed', err);
    }
  }
}

export const cache = new CacheService();
