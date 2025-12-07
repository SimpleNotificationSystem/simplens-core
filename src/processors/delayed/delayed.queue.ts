/**
 * Delayed Queue - Redis Sorted Set based priority queue for scheduled notifications
 * Uses ZSET with scheduled_at timestamp as score for efficient time-based retrieval
 */

import { getRedisClient } from '@src/config/redis.config.js';
import { delayedWorkerLogger as logger } from '@src/workers/utils/logger.js';
import type { delayed_notification_topic } from '@src/types/types.js';

// Redis key for the delayed queue
const DELAYED_QUEUE_KEY = 'delayed_queue';

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
 * Lua script for atomic fetch and remove of due events
 * This ensures multiple delayed workers don't pick up the same events
 * 
 * Returns events where score <= now and removes them atomically
 */
const FETCH_DUE_EVENTS_SCRIPT = `
local key = KEYS[1]
local now = ARGV[1]
local limit = ARGV[2]

-- Get events where score <= now (due for processing)
local events = redis.call('ZRANGEBYSCORE', key, '-inf', now, 'LIMIT', 0, limit)

if #events > 0 then
    -- Remove fetched events atomically to prevent duplicate processing
    redis.call('ZREM', key, unpack(events))
end

return events
`;

/**
 * Fetch and remove due events from the delayed queue atomically
 * Uses Lua script to prevent race conditions between multiple workers
 * 
 * @param limit Maximum number of events to fetch
 * @returns Array of delayed_notification_topic events
 */
export const fetchDueEvents = async (limit: number): Promise<delayed_notification_topic[]> => {
    const redis = getRedisClient();
    const now = Date.now();

    const results = await redis.eval(
        FETCH_DUE_EVENTS_SCRIPT,
        1,
        DELAYED_QUEUE_KEY,
        now.toString(),
        limit.toString()
    ) as string[];

    if (results.length === 0) {
        return [];
    }

    logger.info(`Fetched ${results.length} due events from delayed queue`);

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
 * Adds a small delay to prevent immediate retry loops
 */
export const reAddToQueue = async (
    event: delayed_notification_topic,
    delayMs: number = 5000
): Promise<void> => {
    const redis = getRedisClient();

    // Schedule for now + delay
    const score = Date.now() + delayMs;
    const member = JSON.stringify(event);

    await redis.zadd(DELAYED_QUEUE_KEY, score, member);

    logger.warn(`Re-added event to delayed queue: ${event.notification_id} (retry in ${delayMs}ms)`);
};


