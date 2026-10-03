import { env } from "@src/config/env.config.js";
import { dynamicConfig } from "@src/config/dynamic-config.service.js";
import { OUTBOX_STATUS, type OutboxCronState } from "@src/types/types.js";
import outbox_model from "@src/database/models/outbox.models.js";
import status_outbox_model from "@src/database/models/status-outbox.models.js";
import { type status_outbox } from "@src/types/types.js";
import { sendOutboxEvents, sendStatusOutboxEvents } from "@src/workers/producers/background.producer.js";
import { cronLogger as logger } from "@src/workers/utils/logger.js";
import type { OutboxDocument } from "@src/workers/utils/validation.js";

// Cron state management
const state: OutboxCronState = {
    pollIntervalId: null,
    cleanupIntervalId: null,
    statusPollIntervalId: null,
    isPolling: false,
    isCleaningUp: false,
    isPollingStatus: false,
    shouldStop: false
};

/**
 * Atomically claim a batch of pending outbox entries for this worker.
 * Uses a 2-phase batch claim to eliminate sequential round trips and lock contention:
 * 1. Fast-path: query up to OUTBOX_BATCH_SIZE pending entries in FIFO order using index { status: 1, created_at: 1 }
 * 2. Atomically update matching pending IDs to 'processing' with claimed_by and claimed_at
 * 3. Fallback: if fewer than batch size claimed, reclaim stale entries from crashed workers
 */
const claimOutboxEntries = async (): Promise<OutboxDocument[]> => {
    const claimedEntries: OutboxDocument[] = [];
    const now = new Date();
    const batchSize = env.OUTBOX_BATCH_SIZE;

    // 1. Fast-path: Find pending entries in FIFO order
    const pendingCandidates = await outbox_model
        .find({ status: OUTBOX_STATUS.pending })
        .sort({ created_at: 1 })
        .limit(batchSize)
        .select('_id')
        .lean();

    if (pendingCandidates.length > 0) {
        const candidateIds = pendingCandidates.map(c => c._id);

        // Atomically claim entries that are still pending
        await outbox_model.updateMany(
            {
                _id: { $in: candidateIds },
                status: OUTBOX_STATUS.pending
            },
            {
                $set: {
                    status: OUTBOX_STATUS.processing,
                    claimed_by: env.WORKER_ID,
                    claimed_at: now
                }
            }
        );

        // Retrieve entries successfully claimed by this worker
        const claimed = await outbox_model.find({
            _id: { $in: candidateIds },
            claimed_by: env.WORKER_ID,
            claimed_at: now
        });

        claimedEntries.push(...claimed);
    }

    // 2. Fallback: If quota remaining, reclaim stale entries from crashed workers
    const remainingQuota = batchSize - claimedEntries.length;
    if (remainingQuota > 0) {
        const staleThreshold = new Date(now.getTime() - env.OUTBOX_CLAIM_TIMEOUT_MS);

        const staleCandidates = await outbox_model
            .find({
                status: OUTBOX_STATUS.processing,
                claimed_at: { $lt: staleThreshold }
            })
            .sort({ created_at: 1 })
            .limit(remainingQuota)
            .select('_id')
            .lean();

        if (staleCandidates.length > 0) {
            const staleIds = staleCandidates.map(c => c._id);

            await outbox_model.updateMany(
                {
                    _id: { $in: staleIds },
                    status: OUTBOX_STATUS.processing,
                    claimed_at: { $lt: staleThreshold }
                },
                {
                    $set: {
                        status: OUTBOX_STATUS.processing,
                        claimed_by: env.WORKER_ID,
                        claimed_at: now
                    }
                }
            );

            const reclaimed = await outbox_model.find({
                _id: { $in: staleIds },
                claimed_by: env.WORKER_ID,
                claimed_at: now
            });

            claimedEntries.push(...reclaimed);
        }
    }

    return claimedEntries;
};

/**
 * Poll the outbox collection for pending events and send them to Kafka.
 * Continuously drains backlog while full batches are retrieved, preventing
 * idle intervals during high ingestion load.
 */
const pollOutbox = async (): Promise<void> => {
    if (state.isPolling || state.shouldStop) return;

    state.isPolling = true;

    try {
        while (!state.shouldStop) {
            // Atomically claim entries for this worker
            const claimedEntries = await claimOutboxEntries();

            if (claimedEntries.length === 0) break;

            logger.info(`Claimed ${claimedEntries.length} outbox entries (worker: ${env.WORKER_ID})`);

            const result = await sendOutboxEvents(claimedEntries);
            logger.info(`Processed: ${result.successCount} success, ${result.failedCount} failed`);

            // If we claimed fewer than batch size, queue is drained for now
            if (claimedEntries.length < env.OUTBOX_BATCH_SIZE) {
                break;
            }
        }
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
    while (state.isPolling || state.isCleaningUp || state.isPollingStatus) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};

/**
 * Atomically claim a batch of pending status outbox entries for this worker.
 * Uses 2-phase atomic batch claim to avoid sequential findOneAndUpdate round trips.
 */
const claimStatusOutboxEntries = async (): Promise<status_outbox[]> => {
    const claimedEntries: status_outbox[] = [];
    const now = new Date();
    const batchSize = env.OUTBOX_BATCH_SIZE;

    // 1. Fast-path: Find unprocessed status outbox entries
    const pendingCandidates = await status_outbox_model
        .find({ processed: false, claimed_by: null })
        .sort({ created_at: 1 })
        .limit(batchSize)
        .select('_id')
        .lean();

    if (pendingCandidates.length > 0) {
        const candidateIds = pendingCandidates.map(c => c._id);

        await status_outbox_model.updateMany(
            {
                _id: { $in: candidateIds },
                processed: false,
                claimed_by: null
            },
            {
                $set: {
                    claimed_by: env.WORKER_ID,
                    claimed_at: now
                }
            }
        );

        const claimed = await status_outbox_model.find({
            _id: { $in: candidateIds },
            claimed_by: env.WORKER_ID,
            claimed_at: now
        });

        claimedEntries.push(...claimed);
    }

    // 2. Fallback: Check for stale processing entries
    const remainingQuota = batchSize - claimedEntries.length;
    if (remainingQuota > 0) {
        const staleThreshold = new Date(now.getTime() - env.OUTBOX_CLAIM_TIMEOUT_MS);

        const staleCandidates = await status_outbox_model
            .find({
                processed: false,
                claimed_at: { $lt: staleThreshold }
            })
            .sort({ created_at: 1 })
            .limit(remainingQuota)
            .select('_id')
            .lean();

        if (staleCandidates.length > 0) {
            const staleIds = staleCandidates.map(c => c._id);

            await status_outbox_model.updateMany(
                {
                    _id: { $in: staleIds },
                    processed: false,
                    claimed_at: { $lt: staleThreshold }
                },
                {
                    $set: {
                        claimed_by: env.WORKER_ID,
                        claimed_at: now
                    }
                }
            );

            const reclaimed = await status_outbox_model.find({
                _id: { $in: staleIds },
                claimed_by: env.WORKER_ID,
                claimed_at: now
            });

            claimedEntries.push(...reclaimed);
        }
    }

    return claimedEntries;
};

/**
 * Poll and process status outbox entries.
 * Continuously drains backlog while full batches are retrieved.
 */
const pollStatusOutbox = async (): Promise<void> => {
    if (state.isPollingStatus || state.shouldStop) return;

    state.isPollingStatus = true;

    try {
        while (!state.shouldStop) {
            const claimedEntries = await claimStatusOutboxEntries();
            if (claimedEntries.length === 0) {
                break;
            }

            logger.info(`Claimed ${claimedEntries.length} status outbox entries (worker: ${env.WORKER_ID})`);

            const result = await sendStatusOutboxEvents(claimedEntries);
            logger.info(`Status outbox: ${result.successCount} success, ${result.failedCount} failed`);

            if (claimedEntries.length < env.OUTBOX_BATCH_SIZE) {
                break;
            }
        }
    } catch (err) {
        logger.error("Error polling status outbox:", err);
    } finally {
        state.isPollingStatus = false;
    }
};

/**
 * Start the cron jobs for polling and cleanup
 */
export const startCronJobs = (): void => {
    if (state.pollIntervalId || state.cleanupIntervalId || state.statusPollIntervalId) {
        logger.info("Cron jobs already running");
        return;
    }

    state.shouldStop = false;

    // Start polling loop
    logger.info(`Starting outbox poll loop (every ${env.OUTBOX_POLL_INTERVAL_MS}ms)`);
    state.pollIntervalId = setInterval(pollOutbox, env.OUTBOX_POLL_INTERVAL_MS);
    pollOutbox(); // Run immediately

    // Start status outbox polling loop
    logger.info(`Starting status outbox poll loop (every ${env.OUTBOX_POLL_INTERVAL_MS}ms)`);
    state.statusPollIntervalId = setInterval(pollStatusOutbox, env.OUTBOX_POLL_INTERVAL_MS);

    // Start cleanup loop
    logger.info(`Starting cleanup loop (every ${env.OUTBOX_CLEANUP_INTERVAL_MS}ms)`);
    state.cleanupIntervalId = setInterval(cleanupPublishedEvents, env.OUTBOX_CLEANUP_INTERVAL_MS);

    logger.success("Cron jobs started");
};

// Listen for dynamic configuration updates and hot-adjust intervals
dynamicConfig.on('change', () => {
    if (state.shouldStop) return;

    if (state.pollIntervalId) {
        clearInterval(state.pollIntervalId);
        state.pollIntervalId = setInterval(pollOutbox, env.OUTBOX_POLL_INTERVAL_MS);
        logger.info(`Adjusted outbox poll interval to ${env.OUTBOX_POLL_INTERVAL_MS}ms`);
    }

    if (state.statusPollIntervalId) {
        clearInterval(state.statusPollIntervalId);
        state.statusPollIntervalId = setInterval(pollStatusOutbox, env.OUTBOX_POLL_INTERVAL_MS);
        logger.info(`Adjusted status outbox poll interval to ${env.OUTBOX_POLL_INTERVAL_MS}ms`);
    }

    if (state.cleanupIntervalId) {
        clearInterval(state.cleanupIntervalId);
        state.cleanupIntervalId = setInterval(cleanupPublishedEvents, env.OUTBOX_CLEANUP_INTERVAL_MS);
        logger.info(`Adjusted outbox cleanup interval to ${env.OUTBOX_CLEANUP_INTERVAL_MS}ms`);
    }
});

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

    if (state.statusPollIntervalId) {
        clearInterval(state.statusPollIntervalId);
        state.statusPollIntervalId = null;
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
    return state.pollIntervalId !== null || state.cleanupIntervalId !== null || state.statusPollIntervalId !== null;
};
