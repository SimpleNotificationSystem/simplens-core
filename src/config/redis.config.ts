/**
 * Redis client configuration
 */

import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import { env } from './env.config.js';
import { redisLogger as logger } from '@src/workers/utils/logger.js';

let redis: RedisType | null = null;

/**
 * Get or create Redis client instance
 */
export const getRedisClient = (): RedisType => {
    if (!redis) {
        redis = new Redis.default(env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => {
                if (times > 3) {
                    logger.error(`Redis connection failed after ${times} attempts`);
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 200, 2000);
                logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
                return delay;
            },
            lazyConnect: true,
        });

        redis.on('connect', () => {
            logger.success('Redis connected');
        });

        redis.on('error', (err: Error) => {
            logger.error('Redis error:', err);
        });

        redis.on('close', () => {
            logger.info('Redis connection closed');
        });
    }

    return redis;
};

/**
 * Connect to Redis
 */
export const connectRedis = async (): Promise<RedisType> => {
    const client = getRedisClient();
    await client.connect();
    return client;
};

/**
 * Disconnect from Redis
 */
export const disconnectRedis = async (): Promise<void> => {
    if (redis) {
        await redis.quit();
        redis = null;
        logger.success('Redis disconnected');
    }
};

/**
 * Check Redis health
 */
export const isRedisHealthy = async (): Promise<boolean> => {
    try {
        const client = getRedisClient();
        const result = await client.ping();
        return result === 'PONG';
    } catch {
        return false;
    }
};

export { redis };
