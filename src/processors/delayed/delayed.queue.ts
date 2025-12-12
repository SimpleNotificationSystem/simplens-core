/**
 * Delayed Queue - Redis Sorted Set based priority queue for scheduled notifications
 * Uses ZSET with scheduled_at timestamp as score for efficient time-based retrieval
 * 
 * Implements two-phase processing to prevent message loss:
 * 1. Claim: Atomically mark events as claimed (without removing from queue)
 * 2. Confirm: Remove claimed events only after successful processing
 */

import { getRedisClient } from '@src/config/redis.config.js';
import { env } from '@src/config/env.config.js';
import { delayedWorkerLogger as logger } from '@src/workers/utils/logger.js';
import type { delayed_notification_topic } from '@src/types/types.js';

// Redis keys
const DELAYED_QUEUE_KEY = 'delayed_queue';
const CLAIM_PREFIX = 'delayed_claim';

// Claim timeout in seconds (how long a claim is valid before it can be reclaimed)
const CLAIM_TIMEOUT_SECONDS = 60;

/**
 * Add an event to the delayed queue
 * Uses ZADD with scheduled_at timestamp as score
 */
export const addToDelayedQueue = async (event: delayed_notification_topic): Promise<void> => {
    const redis = getRedisClient();

    // Use scheduled_at timestamp as score (milliseconds for precision)
    const score = new Date(event.scheduled_at).getTime();
    const member = JSON.stringify(event);

    await redis.zadd(DELAYED_QUEUE_KEY, score, member);

    logger.info(`Added event to delayed queue: ${event.notification_id} scheduled for ${event.scheduled_at}`);
};

/**
 * Lua script for atomic claim of due events
 * Claims events without removing them from the queue
 * Uses separate claim keys to track which worker claimed each event
 * 
 * Returns events that were successfully claimed by this worker
 */
const CLAIM_DUE_EVENTS_SCRIPT = `
local queue_key = KEYS[1]
local claim_prefix = KEYS[2]
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local worker_id = ARGV[3]
local claim_timeout = tonumber(ARGV[4])

-- Get events where score <= now (due for processing)
local events = redis.call('ZRANGEBYSCORE', queue_key, '-inf', now, 'LIMIT', 0, limit)

local claimed = {}
for i, event in ipairs(events) do
    -- Parse to get notification_id for claim key
    local parsed = cjson.decode(event)
    local claim_key = claim_prefix .. ':' .. tostring(parsed.notification_id)
    
    -- Try to claim this event (NX = only if not already claimed)
    local set_result = redis.call('SET', claim_key, worker_id, 'NX', 'EX', claim_timeout)
    
    if set_result then
        -- Successfully claimed
        table.insert(claimed, event)
    end
end

return claimed
`;

/**
 * Lua script for confirming processed events
 * Removes the event from the queue and clears the claim
 * Only removes if this worker holds the claim
 */
const CONFIRM_PROCESSED_SCRIPT = `
local queue_key = KEYS[1]
local claim_key = KEYS[2]
local event = ARGV[1]
local worker_id = ARGV[2]

-- Verify we still hold the claim
local claimed_by = redis.call('GET', claim_key)
if claimed_by == worker_id then
    -- Remove from sorted set
    redis.call('ZREM', queue_key, event)
    -- Remove claim
    redis.call('DEL', claim_key)
    return 1
end

return 0  -- Someone else claimed it or claim expired
`;

/**
 * Lua script for releasing a claim without confirming
 * Used when processing fails and we want to allow immediate retry
 */
const RELEASE_CLAIM_SCRIPT = `
local claim_key = KEYS[1]
local worker_id = ARGV[1]

local claimed_by = redis.call('GET', claim_key)
if claimed_by == worker_id then
    redis.call('DEL', claim_key)
    return 1
end

return 0
`;

/**
 * Claim due events from the delayed queue atomically
 * Events remain in the queue but are locked for this worker
 * 
 * @param limit Maximum number of events to claim
 * @returns Array of claimed delayed_notification_topic events
 */
export const claimDueEvents = async (limit: number): Promise<delayed_notification_topic[]> => {
    const redis = getRedisClient();
    const now = Date.now();

    const results = await redis.eval(
        CLAIM_DUE_EVENTS_SCRIPT,
        2,
        DELAYED_QUEUE_KEY,
        CLAIM_PREFIX,
        now.toString(),
        limit.toString(),
        env.WORKER_ID,
        CLAIM_TIMEOUT_SECONDS.toString()
    ) as string[];

    if (results.length === 0) {
        return [];
    }

    logger.info(`Claimed ${results.length} due events from delayed queue`);

    // Parse JSON strings back to objects
    const events: delayed_notification_topic[] = [];
    for (const result of results) {
        try {
            const event = JSON.parse(result) as delayed_notification_topic;
            events.push(event);
        } catch (err) {
            logger.error('Failed to parse delayed event:', err);
        }
    }

    return events;
};

/**
 * Confirm a processed event - removes from queue and clears claim
 * Should only be called AFTER successful publish to target topic
 * 
 * @param event The event that was successfully processed
 * @returns true if confirmed, false if claim was lost
 */
export const confirmProcessed = async (event: delayed_notification_topic): Promise<boolean> => {
    const redis = getRedisClient();
    const claimKey = `${CLAIM_PREFIX}:${event.notification_id}`;

    const result = await redis.eval(
        CONFIRM_PROCESSED_SCRIPT,
        2,
        DELAYED_QUEUE_KEY,
        claimKey,
        JSON.stringify(event),
        env.WORKER_ID
    ) as number;

    return result === 1;
};

/**
 * Release a claim without confirming - allows other workers to process
 * Used when processing fails but we don't want to wait for claim timeout
 * 
 * @param notificationId The notification ID to release
 * @returns true if released, false if claim was already released/expired
 */
export const releaseClaim = async (notificationId: string): Promise<boolean> => {
    const redis = getRedisClient();
    const claimKey = `${CLAIM_PREFIX}:${notificationId}`;

    const result = await redis.eval(
        RELEASE_CLAIM_SCRIPT,
        1,
        claimKey,
        env.WORKER_ID
    ) as number;

    return result === 1;
};

/**
 * @deprecated Use claimDueEvents() and confirmProcessed() for two-phase processing
 * This function is kept for backward compatibility but should not be used
 */
export const fetchDueEvents = async (limit: number): Promise<delayed_notification_topic[]> => {
    // Redirect to new two-phase approach
    logger.warn('fetchDueEvents is deprecated - use claimDueEvents() and confirmProcessed() instead');
    return claimDueEvents(limit);
};

/**
 * Get count of events in the delayed queue
 * Useful for monitoring
 */
export const getQueueSize = async (): Promise<number> => {
    const redis = getRedisClient();
    return redis.zcard(DELAYED_QUEUE_KEY);
};

/**
 * Get count of due events (not yet fetched)
 * Useful for monitoring backlog
 */
export const getDueEventCount = async (): Promise<number> => {
    const redis = getRedisClient();
    const now = Date.now();
    return redis.zcount(DELAYED_QUEUE_KEY, '-inf', now.toString());
};

/**
 * Re-add an event to the queue (for retry on failure)
 * Also releases any claim held by this worker
 */
export const reAddToQueue = async (
    event: delayed_notification_topic,
    delayMs: number = 5000
): Promise<void> => {
    const redis = getRedisClient();
    const claimKey = `${CLAIM_PREFIX}:${event.notification_id}`;

    // Release any existing claim
    await redis.del(claimKey);

    // Schedule for now + delay
    const score = Date.now() + delayMs;
    const member = JSON.stringify(event);

    await redis.zadd(DELAYED_QUEUE_KEY, score, member);

    logger.warn(`Re-added event to delayed queue: ${event.notification_id} (retry in ${delayMs}ms)`);
};
