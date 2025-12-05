/**
 * Idempotency checking using Redis
 * Prevents duplicate processing of the same notification
 */

import { getRedisClient } from '@src/config/redis.config.js';
import { env } from '@src/config/env.config.js';
import { NOTIFICATION_STATUS_SF } from '@src/types/types.js';

// Redis key prefix for idempotency
const IDEMPOTENCY_PREFIX = 'idempotency';

// Idempotency record stored in Redis
interface IdempotencyRecord {
    status: 'processing' | 'delivered' | 'failed';
    updated_at: string;
}

/**
 * Build Redis key for idempotency check
 */
const buildKey = (notificationId: string): string => {
    return `${IDEMPOTENCY_PREFIX}:${notificationId}`;
};

/**
 * Check if notification can be processed
 * Returns true if:
 * - No record exists (first time processing)
 * - Record exists with status='failed' (retry allowed)
 * 
 * Returns false if:
 * - Record exists with status='delivered' (already successful)
 * - Record exists with status='processing' (currently being processed)
 */
export const canProcess = async (notificationId: string): Promise<boolean> => {
    const redis = getRedisClient();
    const key = buildKey(notificationId);
    
    const data = await redis.get(key);
    
    if (!data) {
        // No record exists - first time processing
        return true;
    }
    
    try {
        const record: IdempotencyRecord = JSON.parse(data);
        // Only allow processing if previous attempt failed
        return record.status === 'failed';
    } catch {
        // Invalid data in Redis - allow processing
        return true;
    }
};

/**
 * Get current idempotency status for a notification
 */
export const getIdempotencyStatus = async (notificationId: string): Promise<IdempotencyRecord | null> => {
    const redis = getRedisClient();
    const key = buildKey(notificationId);
    
    const data = await redis.get(key);
    
    if (!data) {
        return null;
    }
    
    try {
        return JSON.parse(data) as IdempotencyRecord;
    } catch {
        return null;
    }
};

/**
 * Set status to 'processing' - prevents duplicate in-flight processing
 */
export const setProcessing = async (notificationId: string): Promise<void> => {
    const redis = getRedisClient();
    const key = buildKey(notificationId);
    
    const record: IdempotencyRecord = {
        status: 'processing',
        updated_at: new Date().toISOString()
    };
    
    // Short TTL for processing status (in case processor crashes)
    await redis.setex(key, 60, JSON.stringify(record));
};

/**
 * Set status to 'delivered' - marks notification as successfully processed
 */
export const setDelivered = async (notificationId: string): Promise<void> => {
    const redis = getRedisClient();
    const key = buildKey(notificationId);
    
    const record: IdempotencyRecord = {
        status: 'delivered',
        updated_at: new Date().toISOString()
    };
    
    // Long TTL for delivered status
    await redis.setex(key, env.IDEMPOTENCY_TTL_SECONDS, JSON.stringify(record));
};

/**
 * Set status to 'failed' - allows retry processing
 */
export const setFailed = async (notificationId: string): Promise<void> => {
    const redis = getRedisClient();
    const key = buildKey(notificationId);
    
    const record: IdempotencyRecord = {
        status: 'failed',
        updated_at: new Date().toISOString()
    };
    
    // Long TTL for failed status (allows retries)
    await redis.setex(key, env.IDEMPOTENCY_TTL_SECONDS, JSON.stringify(record));
};
