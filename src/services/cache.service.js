const Redis = require('ioredis');
const logger = require('../config/logger');

/**
 * Redis Caching Service for Production Performance
 * Provides caching layer for frequently accessed data
 */

class CacheService {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.defaultTTL = 300; // 5 minutes default
    this.keyPrefix = 'beige:';
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        enableOfflineQueue: false
      };

      // Use Redis URL if provided
      if (process.env.REDIS_URL) {
        this.redis = new Redis(process.env.REDIS_URL, {
          ...redisConfig,
          maxRetriesPerRequest: 3
        });
      } else {
        this.redis = new Redis(redisConfig);
      }

      // Event handlers
      this.redis.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected successfully');
      });

      this.redis.on('error', (error) => {
        this.isConnected = false;
        logger.error('Redis connection error:', error);
      });

      this.redis.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
      });

      this.redis.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
      });

      // Test connection
      await this.redis.ping();

      logger.info('Cache service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize cache service:', error);
      this.isConnected = false;
    }
  }

  /**
   * Generate cache key with prefix
   */
  generateKey(key) {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (!this.isConnected) {
      logger.warn('Cache not available, skipping get operation');
      return null;
    }

    try {
      const cacheKey = this.generateKey(key);
      const value = await this.redis.get(cacheKey);

      if (value) {
        logger.debug(`Cache hit: ${key}`);
        return JSON.parse(value);
      }

      logger.debug(`Cache miss: ${key}`);
      return null;

    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.isConnected) {
      logger.warn('Cache not available, skipping set operation');
      return false;
    }

    try {
      const cacheKey = this.generateKey(key);
      const serializedValue = JSON.stringify(value);

      if (ttl > 0) {
        await this.redis.setex(cacheKey, ttl, serializedValue);
      } else {
        await this.redis.set(cacheKey, serializedValue);
      }

      logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
      return true;

    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(key);
      const result = await this.redis.del(cacheKey);

      logger.debug(`Cache delete: ${key}`);
      return result > 0;

    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern) {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const searchPattern = this.generateKey(pattern);
      const keys = await this.redis.keys(searchPattern);

      if (keys.length > 0) {
        const result = await this.redis.del(...keys);
        logger.debug(`Cache pattern delete: ${pattern} (${keys.length} keys)`);
        return result;
      }

      return 0;

    } catch (error) {
      logger.error(`Cache pattern delete error for pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(key);
      const exists = await this.redis.exists(cacheKey);
      return exists === 1;

    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set cache expiration time
   */
  async expire(key, ttl) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(key);
      const result = await this.redis.expire(cacheKey, ttl);
      return result === 1;

    } catch (error) {
      logger.error(`Cache expire error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get multiple values at once
   */
  async mget(keys) {
    if (!this.isConnected) {
      return {};
    }

    try {
      const cacheKeys = keys.map(key => this.generateKey(key));
      const values = await this.redis.mget(...cacheKeys);

      const result = {};
      keys.forEach((key, index) => {
        if (values[index]) {
          try {
            result[key] = JSON.parse(values[index]);
          } catch (parseError) {
            logger.error(`Cache parse error for key ${key}:`, parseError);
            result[key] = null;
          }
        } else {
          result[key] = null;
        }
      });

      return result;

    } catch (error) {
      logger.error('Cache mget error:', error);
      return {};
    }
  }

  /**
   * Increment numeric value
   */
  async incr(key, amount = 1) {
    if (!this.isConnected) {
      return null;
    }

    try {
      const cacheKey = this.generateKey(key);
      let result;

      if (amount === 1) {
        result = await this.redis.incr(cacheKey);
      } else {
        result = await this.redis.incrby(cacheKey, amount);
      }

      return result;

    } catch (error) {
      logger.error(`Cache incr error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Cache with automatic refresh
   */
  async getOrSet(key, fetchFunction, ttl = this.defaultTTL) {
    // Try to get from cache first
    let value = await this.get(key);

    if (value !== null) {
      return value;
    }

    // If not in cache, fetch the data
    try {
      value = await fetchFunction();

      // Store in cache
      await this.set(key, value, ttl);

      return value;

    } catch (error) {
      logger.error(`Cache getOrSet error for key ${key}:`, error);
      throw error; // Re-throw the original error
    }
  }

  /**
   * Cache user booking statistics
   */
  async cacheUserStats(userId, stats) {
    const key = `user:${userId}:stats`;
    return await this.set(key, stats, 300); // 5 minutes
  }

  /**
   * Get user booking statistics from cache
   */
  async getUserStats(userId) {
    const key = `user:${userId}:stats`;
    return await this.get(key);
  }

  /**
   * Invalidate user-related cache
   */
  async invalidateUserCache(userId) {
    const patterns = [
      `user:${userId}:*`,
      'bookings:overall:*',
      'bookings:daily:*',
      'bookings:recent',
      'bookings:upcoming'
    ];

    for (const pattern of patterns) {
      await this.delPattern(pattern);
    }

    logger.info(`Invalidated cache for user: ${userId}`);
  }

  /**
   * Cache booking data
   */
  async cacheBooking(bookingId, bookingData) {
    const key = `booking:${bookingId}`;
    return await this.set(key, bookingData, 600); // 10 minutes
  }

  /**
   * Get booking from cache
   */
  async getBooking(bookingId) {
    const key = `booking:${bookingId}`;
    return await this.get(key);
  }

  /**
   * Cache dashboard data
   */
  async cacheDashboardData(userId, dashboardData) {
    const key = `dashboard:${userId}`;
    return await this.set(key, dashboardData, 300); // 5 minutes
  }

  /**
   * Get dashboard data from cache
   */
  async getDashboardData(userId) {
    const key = `dashboard:${userId}`;
    return await this.get(key);
  }

  /**
   * Cache API response
   */
  async cacheApiResponse(endpoint, params, response) {
    const paramString = JSON.stringify(params || {});
    const key = `api:${endpoint}:${Buffer.from(paramString).toString('base64')}`;
    return await this.set(key, response, 180); // 3 minutes for API responses
  }

  /**
   * Get cached API response
   */
  async getCachedApiResponse(endpoint, params) {
    const paramString = JSON.stringify(params || {});
    const key = `api:${endpoint}:${Buffer.from(paramString).toString('base64')}`;
    return await this.get(key);
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isConnected) {
      return null;
    }

    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      const stats = await this.redis.info('stats');

      // Parse memory info
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memory = memoryMatch ? memoryMatch[1].trim() : 'Unknown';

      // Parse keyspace info
      const dbMatch = keyspace.match(/db0:keys=(\d+),expires=(\d+)/);
      const keys = dbMatch ? parseInt(dbMatch[1]) : 0;
      const expiring = dbMatch ? parseInt(dbMatch[2]) : 0;

      // Parse stats
      const hitsMatch = stats.match(/keyspace_hits:(\d+)/);
      const missesMatch = stats.match(/keyspace_misses:(\d+)/);
      const hits = hitsMatch ? parseInt(hitsMatch[1]) : 0;
      const misses = missesMatch ? parseInt(missesMatch[1]) : 0;

      const hitRate = hits + misses > 0 ? (hits / (hits + misses) * 100).toFixed(2) : '0.00';

      return {
        connected: this.isConnected,
        memory,
        keys,
        expiring,
        hits,
        misses,
        hitRate: `${hitRate}%`
      };

    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.isConnected) {
      return { status: 'disconnected', latency: null };
    }

    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return {
        status: 'connected',
        latency: `${latency}ms`
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        latency: null
      };
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      logger.info('Cache service disconnected');
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;