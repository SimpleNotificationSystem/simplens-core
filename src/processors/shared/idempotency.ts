/**
 * Idempotency checking using Redis
 * Prevents duplicate processing of the same notification
 * Uses atomic Lua scripts to prevent race conditions
 */

import { getRedisClient } from '@src/config/redis.config.js';
import { env } from '@src/config/env.config.js';

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
 * Lua script for atomic check-and-set to acquire processing lock
 * Prevents race condition where two workers both pass canProcess() check
 * 
 * Returns:
 * - 1 if lock acquired (can process)
 * - 0 if already delivered or processing (skip)
 * - 2 if was failed (retry allowed, lock acquired)
 */
const ACQUIRE_PROCESSING_SCRIPT = `
local key = KEYS[1]
local processing_record = ARGV[1]
local processing_ttl = tonumber(ARGV[2])

local data = redis.call('GET', key)

if data then
    local record = cjson.decode(data)
    if record.status == 'delivered' then
        return 0  -- Already delivered, skip
    elseif record.status == 'processing' then
        return 0  -- Already being processed, skip
    end
    -- status == 'failed', allow retry
end

-- Acquire lock by setting status to 'processing'
redis.call('SETEX', key, processing_ttl, processing_record)
return data and 2 or 1  -- 2 = retry, 1 = first time
`;

/**
 * Atomically check if notification can be processed and acquire processing lock
 * This combines canProcess() and setProcessing() into a single atomic operation
 * 
 * Returns:
 * - { canProcess: true, isRetry: false } - First time processing, lock acquired
 * - { canProcess: true, isRetry: true } - Retry after failure, lock acquired
 * - { canProcess: false } - Already delivered or being processed
 */
export const tryAcquireProcessingLock = async (notificationId: string): Promise<{
    canProcess: boolean;
    isRetry?: boolean;
}> => {
    const redis = getRedisClient();
    const key = buildKey(notificationId);
    
    const processingRecord: IdempotencyRecord = {
        status: 'processing',
        updated_at: new Date().toISOString()
    };
    
    const result = await redis.eval(
        ACQUIRE_PROCESSING_SCRIPT,
        1,
        key,
        JSON.stringify(processingRecord),
        env.PROCESSING_TTL_SECONDS.toString()
    ) as number;
    
    if (result === 0) {
        return { canProcess: false };
    }
    
    return { 
        canProcess: true, 
        isRetry: result === 2 
    };
};

/**
 * @deprecated Use tryAcquireProcessingLock() for atomic check-and-set
 * Check if notification can be processed (non-atomic, kept for backward compatibility)
 */
export const canProcess = async (notificationId: string): Promise<boolean> => {
    const redis = getRedisClient();
    const key = buildKey(notificationId);
    
    const data = await redis.get(key);
    
    if (!data) {
        return true;
    }
    
    try {
        const record: IdempotencyRecord = JSON.parse(data);
        return record.status === 'failed';
    } catch {
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
 * @deprecated Use tryAcquireProcessingLock() for atomic check-and-set
 * Set status to 'processing' (non-atomic, kept for backward compatibility)
 */
export const setProcessing = async (notificationId: string): Promise<void> => {
    const redis = getRedisClient();
    const key = buildKey(notificationId);
    
    const record: IdempotencyRecord = {
        status: 'processing',
        updated_at: new Date().toISOString()
    };
    
    await redis.setex(key, env.PROCESSING_TTL_SECONDS, JSON.stringify(record));
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
