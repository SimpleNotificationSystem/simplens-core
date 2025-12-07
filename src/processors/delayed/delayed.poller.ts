/**
 * Delayed Poller - Polls Redis queue for due events and publishes to target topics
 * Runs on an interval to fetch events where scheduled_at <= now
 * Implements exponential backoff with max retries to prevent infinite loops
 */

import { env } from '@src/config/env.config.js';
import { fetchDueEvents, reAddToQueue, getDueEventCount } from './delayed.queue.js';
import { publishToTarget } from './target.producer.js';
import { publishDLQFailureStatus } from './dlq.status.js';
import { delayedWorkerLogger as logger } from '@src/workers/utils/logger.js';
import type { delayed_notification_topic } from '@src/types/types.js';

let pollerInterval: NodeJS.Timeout | null = null;
let isPolling = false;

/**
 * Extended event type with poller retry tracking
 */
interface DelayedEventWithRetries extends delayed_notification_topic {
    _pollerRetries?: number;
}

/**
 * Calculate exponential backoff delay
 * @param retryCount Current retry count
 * @returns Delay in milliseconds (5s, 10s, 20s, 40s, capped at 60s)
 */
const calculateBackoff = (retryCount: number): number => {
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 60000; // 60 seconds
    return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
};

/**
 * Process a single due event
 * Publishes to target topic, re-adds to queue on failure with exponential backoff
 * Sends to dead letter queue after max retries exceeded
 */
const processDueEvent = async (event: DelayedEventWithRetries): Promise<boolean> => {
    const pollerRetries = event._pollerRetries || 0;

    // Check if max poller retries exceeded
    if (pollerRetries >= env.MAX_POLLER_RETRIES) {
        const errorMessage = `Max poller retries exceeded after ${pollerRetries} attempts`;
        logger.error(`Event ${event.notification_id} exceeded max poller retries (${env.MAX_POLLER_RETRIES}), marking as failed`);

        try {
            // Publish failure status to Kafka -> MongoDB update via status worker
            await publishDLQFailureStatus(event, errorMessage);
            logger.info(`Published failure status for: ${event.notification_id}`);
        } catch (statusErr) {
            logger.error(`Failed to publish failure status:`, statusErr);
        }
        return false;
    }

    try {
        logger.info(`Processing due event: ${event.notification_id} -> ${event.target_topic} (poller retry: ${pollerRetries})`);

        // Publish payload to the target topic
        await publishToTarget(event.target_topic, event.payload);

        logger.success(`Successfully published: ${event.notification_id}`);
        return true;
    } catch (err) {
        logger.error(`Failed to publish event ${event.notification_id}:`, err);

        // Re-add to queue with exponential backoff and incremented retry count
        const newRetryCount = pollerRetries + 1;
        const backoffDelay = calculateBackoff(newRetryCount);

        try {
            const eventWithRetries: DelayedEventWithRetries = {
                ...event,
                _pollerRetries: newRetryCount
            };
            await reAddToQueue(eventWithRetries, backoffDelay);
            logger.warn(`Re-added event to queue with ${backoffDelay}ms delay (retry ${newRetryCount}/${env.MAX_POLLER_RETRIES})`);
        } catch (reAddErr) {
            logger.error(`Failed to re-add event to queue:`, reAddErr);
        }

        return false;
    }
};

/**
 * Poll for due events and process them
 * Called on each interval tick
 */
const pollForDueEvents = async (): Promise<void> => {
    if (isPolling) {
        logger.debug('Previous poll still in progress, skipping...');
        return;
    }

    isPolling = true;

    try {
        // Fetch due events atomically from Redis
        const dueEvents = await fetchDueEvents(env.DELAYED_BATCH_SIZE);

        if (dueEvents.length === 0) {
            return;
        }

        logger.info(`Processing ${dueEvents.length} due events...`);

        // Process events sequentially to maintain order and avoid overwhelming target topics
        let successCount = 0;
        let failCount = 0;

        for (const event of dueEvents) {
            const success = await processDueEvent(event);
            if (success) {
                successCount++;
            } else {
                failCount++;
            }
        }

        logger.info(`Batch complete: ${successCount} succeeded, ${failCount} failed`);

    } catch (err) {
        logger.error('Error during poll:', err);
    } finally {
        isPolling = false;
    }
};

/**
 * Start the delayed poller
 * Runs on an interval defined by DELAYED_POLL_INTERVAL_MS
 */
export const startDelayedPoller = (): void => {
    if (pollerInterval) {
        logger.warn('Delayed poller already running');
        return;
    }

    logger.info(`Starting delayed poller (interval: ${env.DELAYED_POLL_INTERVAL_MS}ms, batch: ${env.DELAYED_BATCH_SIZE})`);

    // Run immediately on start
    pollForDueEvents();

    // Then run on interval
    pollerInterval = setInterval(pollForDueEvents, env.DELAYED_POLL_INTERVAL_MS);

    logger.success('Delayed poller started');
};

/**
 * Stop the delayed poller
 */
export const stopDelayedPoller = (): void => {
    if (pollerInterval) {
        clearInterval(pollerInterval);
        pollerInterval = null;
        logger.info('Delayed poller stopped');
    }
};

/**
 * Check if poller is currently running
 */
export const isPollerActive = (): boolean => {
    return pollerInterval !== null;
};

/**
 * Get poller status for monitoring
 */
export const getPollerStatus = async (): Promise<{
    isActive: boolean;
    isPolling: boolean;
    dueEventCount: number;
}> => {
    const dueCount = await getDueEventCount();
    return {
        isActive: pollerInterval !== null,
        isPolling,
        dueEventCount: dueCount
    };
};
