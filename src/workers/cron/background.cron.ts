import { env } from "@src/config/env.config.js";
import { OUTBOX_STATUS } from "@src/types/types.js";
import outbox_model from "@src/database/models/outbox.models.js";
import { sendOutboxEvents } from "@src/workers/producers/background.producer.js";
import { cronLogger as logger } from "@src/workers/utils/logger.js";
import type { OutboxDocument } from "@src/workers/utils/validation.js";

// Cron state management
interface CronState {
    pollIntervalId: NodeJS.Timeout | null;
    cleanupIntervalId: NodeJS.Timeout | null;
    isPolling: boolean;
    isCleaningUp: boolean;
    shouldStop: boolean;
}

const state: CronState = {
    pollIntervalId: null,
    cleanupIntervalId: null,
    isPolling: false,
    isCleaningUp: false,
    shouldStop: false
};

/**
 * Atomically claim a batch of pending outbox entries for this worker.
 * Uses findOneAndUpdate in a loop to ensure no two workers claim the same event.
 * Also reclaims stale entries from crashed workers.
 */
const claimOutboxEntries = async (): Promise<OutboxDocument[]> => {
    const claimedEntries: OutboxDocument[] = [];
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - env.OUTBOX_CLAIM_TIMEOUT_MS);

    // Claim entries one at a time atomically (or use bulkWrite for better performance)
    for (let i = 0; i < env.OUTBOX_BATCH_SIZE; i++) {
        // Try to claim a pending entry, or reclaim a stale processing entry
        const entry = await outbox_model.findOneAndUpdate(
            {
                $or: [
                    // Unclaimed pending entries
                    { status: OUTBOX_STATUS.pending },
                    // Stale entries from crashed workers (claimed but not processed in time)
                    { 
                        status: OUTBOX_STATUS.processing,
                        claimed_at: { $lt: staleThreshold }
                    }
                ]
            },
            {
                $set: {
                    status: OUTBOX_STATUS.processing,
                    claimed_by: env.WORKER_ID,
                    claimed_at: now
                }
            },
            {
                new: true,
                sort: { created_at: 1 } // FIFO order
            }
        );

        if (!entry) break; // No more entries to claim
        claimedEntries.push(entry);
    }

    return claimedEntries;
};

/**
 * Poll the outbox collection for pending events and send them to Kafka
 */
const pollOutbox = async (): Promise<void> => {
    if (state.isPolling || state.shouldStop) return;

    state.isPolling = true;

    try {
        // Atomically claim entries for this worker
        const claimedEntries = await claimOutboxEntries();

        if (claimedEntries.length === 0) return;

        logger.info(`Claimed ${claimedEntries.length} outbox entries (worker: ${env.WORKER_ID})`);

        const result = await sendOutboxEvents(claimedEntries);
        logger.info(`Processed: ${result.successCount} success, ${result.failedCount} failed`);
    } catch (err) {
        logger.error("Error polling outbox:", err);
    } finally {
        state.isPolling = false;
    }
};

/**
 * Cleanup published outbox entries older than retention period
 */
const cleanupPublishedEvents = async (): Promise<void> => {
    if (state.isCleaningUp || state.shouldStop) return;

    state.isCleaningUp = true;

    try {
        const cutoffTime = new Date(Date.now() - env.OUTBOX_RETENTION_MS);

        const result = await outbox_model.deleteMany({
            status: OUTBOX_STATUS.published,
            updated_at: { $lt: cutoffTime }
        });

        if (result.deletedCount > 0) {
            logger.info(`🧹 Cleaned up ${result.deletedCount} published outbox entries`);
        }
    } catch (err) {
        logger.error("Error cleaning up outbox:", err);
    } finally {
        state.isCleaningUp = false;
    }
};

/**
 * Wait for ongoing operations to complete
 */
const waitForOperationsToComplete = async (): Promise<void> => {
    while (state.isPolling || state.isCleaningUp) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};

/**
 * Start the cron jobs for polling and cleanup
 */
export const startCronJobs = (): void => {
    if (state.pollIntervalId || state.cleanupIntervalId) {
        logger.info("Cron jobs already running");
        return;
    }

    state.shouldStop = false;

    // Start polling loop
    logger.info(`Starting outbox poll loop (every ${env.OUTBOX_POLL_INTERVAL_MS}ms)`);
    state.pollIntervalId = setInterval(pollOutbox, env.OUTBOX_POLL_INTERVAL_MS);
    pollOutbox(); // Run immediately

    // Start cleanup loop
    logger.info(`Starting cleanup loop (every ${env.OUTBOX_CLEANUP_INTERVAL_MS}ms)`);
    state.cleanupIntervalId = setInterval(cleanupPublishedEvents, env.OUTBOX_CLEANUP_INTERVAL_MS);

    logger.success("Cron jobs started");
};

/**
 * Stop the cron jobs gracefully
 */
export const stopCronJobs = async (): Promise<void> => {
    logger.info("Stopping cron jobs...");
    
    state.shouldStop = true;

    if (state.pollIntervalId) {
        clearInterval(state.pollIntervalId);
        state.pollIntervalId = null;
    }

    if (state.cleanupIntervalId) {
        clearInterval(state.cleanupIntervalId);
        state.cleanupIntervalId = null;
    }

    await waitForOperationsToComplete();
    logger.success("Cron jobs stopped");
};

/**
 * Check if cron jobs are running
 */
export const isCronRunning = (): boolean => {
    return state.pollIntervalId !== null || state.cleanupIntervalId !== null;
};
