import { logger } from './logger';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

class CacheService {
  private memoryCache = new Map<string, CacheEntry>();

  async get<T>(key: string): Promise<T | null> {
    try {
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
      this.memoryCache.set(key, {
        value: JSON.stringify(value),
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
        for (const key of this.memoryCache.keys()) {
          if (key.startsWith(prefix)) {
            this.memoryCache.delete(key);
          }
        }
      } else {
        this.memoryCache.delete(patternOrKey);
      }
    } catch (err) {
      logger.warn(`Cache delete failed for ${patternOrKey}`, err);
    }
  }

  async flush(): Promise<void> {
    this.memoryCache.clear();
  }
}

export const cache = new CacheService();
