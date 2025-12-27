/**
 * Recovery Cron - Detects stuck notifications and creates alerts for manual inspection.
 * 
 * This cron job runs at configured intervals and performs:
 * 1. Recovers stuck processing notifications (cross-references with Redis)
 * 2. Detects orphaned pending notifications
 * 3. Creates alerts for manual inspection when needed
 * 
 * Features:
 * - Health check before each run to handle database crashes gracefully
 * - Continues running even if databases are temporarily unavailable
 */

import mongoose from 'mongoose';
import { env } from '@src/config/env.config.js';
import { NOTIFICATION_STATUS, ALERT_TYPE, OUTBOX_STATUS } from '@src/types/types.js';
import notification_model from '@src/database/models/notification.models.js';
import alert_model from '@src/database/models/alert.models.js';
import status_outbox_model from '@src/database/models/status-outbox.models.js';
import { getIdempotencyStatus, setFailed } from '@src/processors/shared/idempotency.js';
import { recoveryLogger as logger } from '@src/workers/utils/logger.js';

// Health checker function type
type HealthChecker = () => Promise<boolean>;

// Cron state management
interface CronState {
    intervalId: NodeJS.Timeout | null;
    isRunning: boolean;
    shouldStop: boolean;
    healthChecker: HealthChecker | null;
    consecutiveFailures: number;
}

const MAX_CONSECUTIVE_FAILURES = 5;

const state: CronState = {
    intervalId: null,
    isRunning: false,
    shouldStop: false,
    healthChecker: null,
    consecutiveFailures: 0
};

/**
 * Recover stuck processing notifications (horizontally scalable)
 * Uses atomic claiming with worker ID to prevent race conditions
 */
const recoverStuckProcessing = async (): Promise<void> => {
    const now = new Date();
    const threshold = new Date(now.getTime() - env.PROCESSING_STUCK_THRESHOLD_MS);
    const staleClaimThreshold = new Date(now.getTime() - env.RECOVERY_CLAIM_TIMEOUT_MS);

    let processedCount = 0;

    for (let i = 0; i < env.RECOVERY_BATCH_SIZE; i++) {
        // Atomically claim a stuck notification
        const notification = await notification_model.findOneAndUpdate(
            {
                status: NOTIFICATION_STATUS.processing,
                updated_at: { $lt: threshold },
                $or: [
                    { recovery_claimed_by: null },
                    { recovery_claimed_at: { $lt: staleClaimThreshold } }
                ]
            },
            {
                $set: {
                    recovery_claimed_by: env.WORKER_ID,
                    recovery_claimed_at: now
                }
            },
            { new: true }
        );

        if (!notification) break;

        processedCount++;
        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                // Get Redis status
                const redisStatus = await getIdempotencyStatus(notification._id.toString());

                if (redisStatus?.status === 'delivered') {
                    // GHOST DELIVERY - Redis says delivered but DB says processing
                    logger.info(`Ghost delivery detected for ${notification._id}`);

                    await notification_model.updateOne(
                        { _id: notification._id },
                        {
                            status: NOTIFICATION_STATUS.delivered,
                            recovery_claimed_by: null,
                            recovery_claimed_at: null
                        },
                        { session }
                    );

                    await status_outbox_model.create([{
                        notification_id: notification._id,
                        status: 'delivered',
                        processed: false
                    }], { session });

                } else if (redisStatus?.status === 'failed') {
                    if (notification.retry_count >= env.MAX_RETRY_COUNT) {
                        // EXHAUSTED RETRIES
                        logger.info(`Notification ${notification._id} exhausted retries (${notification.retry_count})`);

                        await notification_model.updateOne(
                            { _id: notification._id },
                            {
                                status: NOTIFICATION_STATUS.failed,
                                error_message: 'Recovered by recovery service - max retries exceeded',
                                recovery_claimed_by: null,
                                recovery_claimed_at: null
                            },
                            { session }
                        );

                        await status_outbox_model.create([{
                            notification_id: notification._id,
                            status: 'failed',
                            processed: false
                        }], { session });

                    } else {
                        // RETRY COUNT NOT EXHAUSTED BUT REDIS SAYS FAILED
                        // Create alert for manual retry via dashboard
                        logger.warn(`Creating alert for failed notification ${notification._id} (retry: ${notification.retry_count}/${env.MAX_RETRY_COUNT})`);

                        await alert_model.updateOne(
                            { notification_id: notification._id, alert_type: ALERT_TYPE.stuck_processing },
                            {
                                $set: { resolved: false },
                                $setOnInsert: {
                                    reason: `Notification failed but has retries remaining (${notification.retry_count}/${env.MAX_RETRY_COUNT}). Admin can retry via dashboard.`,
                                    redis_status: redisStatus?.status || null,
                                    db_status: notification.status,
                                    retry_count: notification.retry_count
                                }
                            },
                            { upsert: true, session }
                        );

                        // Clear claim and touch updated_at to prevent reprocessing
                        await notification_model.updateOne(
                            { _id: notification._id },
                            {
                                recovery_claimed_by: null,
                                recovery_claimed_at: null,
                                updated_at: new Date() // Touch to prevent immediate reprocessing
                            },
                            { session }
                        );
                    }

                } else {
                    // STUCK - Redis says processing or no record
                    // Create alert for manual inspection
                    logger.warn(`Creating alert for stuck notification ${notification._id}`);

                    await alert_model.updateOne(
                        { notification_id: notification._id, alert_type: ALERT_TYPE.stuck_processing },
                        {
                            $set: { resolved: false },
                            $setOnInsert: {
                                reason: 'Notification stuck in processing with no resolution in Redis',
                                redis_status: redisStatus?.status || null,
                                db_status: notification.status,
                                retry_count: notification.retry_count
                            }
                        },
                        { upsert: true, session }
                    );

                    // Clear claim and touch updated_at to prevent reprocessing
                    await notification_model.updateOne(
                        { _id: notification._id },
                        {
                            recovery_claimed_by: null,
                            recovery_claimed_at: null,
                            updated_at: new Date() // Touch to prevent immediate reprocessing
                        },
                        { session }
                    );
                }
            });
        } catch (err) {
            logger.error(`Error recovering notification ${notification._id}:`, err);
            // Clear claim on error
            await notification_model.updateOne(
                { _id: notification._id },
                { recovery_claimed_by: null, recovery_claimed_at: null }
            );
        } finally {
            await session.endSession();
        }
    }

    if (processedCount > 0) {
        logger.info(`Processed ${processedCount} stuck processing notifications (worker: ${env.WORKER_ID})`);
    }
};

/**
 * Detect orphaned pending notifications (horizontally scalable)
 * Uses atomic claiming with worker ID to prevent race conditions
 * 
 * Handles scheduled notifications:
 * - Excludes notifications with scheduled_at in the future (they're waiting, not orphaned)
 * - For past scheduled notifications: uses scheduled_at + threshold to detect orphans
 * - For non-scheduled notifications: uses updated_at + threshold as before
 */
const detectOrphanedPending = async (): Promise<void> => {
    const now = new Date();
    const threshold = new Date(now.getTime() - env.PENDING_STUCK_THRESHOLD_MS);
    const staleClaimThreshold = new Date(now.getTime() - env.RECOVERY_CLAIM_TIMEOUT_MS);

    let processedCount = 0;

    for (let i = 0; i < env.RECOVERY_BATCH_SIZE; i++) {
        // Atomically claim an orphaned notification
        // Query logic:
        // 1. Non-scheduled notifications: updated_at older than threshold
        // 2. Scheduled notifications: scheduled_at has passed AND scheduled_at + threshold has passed
        // 3. Exclude future scheduled notifications (they're waiting, not orphaned)
        const notification = await notification_model.findOneAndUpdate(
            {
                status: NOTIFICATION_STATUS.pending,
                $and: [
                    // Timing conditions based on whether notification is scheduled or not
                    {
                        $or: [
                            // Non-scheduled notifications: use updated_at threshold
                            {
                                scheduled_at: { $exists: false },
                                updated_at: { $lt: threshold }
                            },
                            {
                                scheduled_at: null,
                                updated_at: { $lt: threshold }
                            },
                            // Scheduled notifications: scheduled_at must be in the past AND
                            // enough time must have passed since scheduled_at for it to be considered orphaned
                            {
                                scheduled_at: { $lte: threshold }
                            }
                        ]
                    },
                    // Claiming logic (prevent race conditions between recovery workers)
                    {
                        $or: [
                            { recovery_claimed_by: null },
                            { recovery_claimed_at: { $lt: staleClaimThreshold } }
                        ]
                    }
                ]
            },
            {
                $set: {
                    recovery_claimed_by: env.WORKER_ID,
                    recovery_claimed_at: now
                }
            },
            { new: true }
        );

        if (!notification) break;

        processedCount++;

        try {
            // Create alert for manual inspection
            await alert_model.updateOne(
                { notification_id: notification._id, alert_type: ALERT_TYPE.orphaned_pending },
                {
                    $set: { resolved: false },
                    $setOnInsert: {
                        reason: 'Notification stuck in pending state - may not have been published to outbox',
                        redis_status: null,
                        db_status: notification.status,
                        retry_count: notification.retry_count
                    }
                },
                { upsert: true }
            );

            logger.warn(`Created alert for orphaned pending notification ${notification._id}`);

            // Clear claim after processing
            await notification_model.updateOne(
                { _id: notification._id },
                { recovery_claimed_by: null, recovery_claimed_at: null }
            );
        } catch (err) {
            logger.error(`Error creating alert for ${notification._id}:`, err);
            // Clear claim on error
            await notification_model.updateOne(
                { _id: notification._id },
                { recovery_claimed_by: null, recovery_claimed_at: null }
            );
        }
    }

    if (processedCount > 0) {
        logger.info(`Processed ${processedCount} orphaned pending notifications (worker: ${env.WORKER_ID})`);
    }
};

/**
 * Cleanup resolved alerts older than retention period
 */
const cleanupResolvedAlerts = async (): Promise<void> => {
    const threshold = new Date(Date.now() - env.CLEANUP_RESOLVED_ALERTS_RETENTION_MS);

    const result = await alert_model.deleteMany({
        resolved: true,
        resolved_at: { $lt: threshold }
    });

    if (result.deletedCount > 0) {
        logger.info(`🧹 Cleaned up ${result.deletedCount} resolved alerts`);
    }
};

/**
 * Cleanup processed status outbox entries older than retention period
 */
const cleanupProcessedStatusOutbox = async (): Promise<void> => {
    const threshold = new Date(Date.now() - env.CLEANUP_PROCESSED_STATUS_OUTBOX_RETENTION_MS);

    const result = await status_outbox_model.deleteMany({
        processed: true,
        updated_at: { $lt: threshold }
    });

    if (result.deletedCount > 0) {
        logger.info(`🧹 Cleaned up ${result.deletedCount} processed status outbox entries`);
    }
};

/**
 * Auto-resolve alerts for delivered notifications (horizontally scalable)
 * Uses atomic claiming with worker ID to prevent race conditions
 */
const autoResolveDeliveredAlerts = async (): Promise<void> => {
    const now = new Date();
    const staleClaimThreshold = new Date(now.getTime() - env.RECOVERY_CLAIM_TIMEOUT_MS);

    let resolvedCount = 0;

    for (let i = 0; i < env.RECOVERY_BATCH_SIZE; i++) {
        // Atomically claim an unresolved alert
        const alert = await alert_model.findOneAndUpdate(
            {
                resolved: false,
                $or: [
                    { recovery_claimed_by: null },
                    { recovery_claimed_at: { $lt: staleClaimThreshold } }
                ]
            },
            {
                $set: {
                    recovery_claimed_by: env.WORKER_ID,
                    recovery_claimed_at: now
                }
            },
            { new: true }
        );

        if (!alert) break;

        try {
            // Check notification status
            const notification = await notification_model.findById(alert.notification_id);

            if (notification?.status === NOTIFICATION_STATUS.delivered || notification?.status === NOTIFICATION_STATUS.failed) {
                // Auto-resolve the alert
                await alert_model.findByIdAndUpdate(alert._id, {
                    resolved: true,
                    resolved_at: new Date(),
                    recovery_claimed_by: null,
                    recovery_claimed_at: null
                });
                resolvedCount++;
            } else {
                // Clear claim if not resolving
                await alert_model.findByIdAndUpdate(alert._id, {
                    recovery_claimed_by: null,
                    recovery_claimed_at: null
                });
            }
        } catch (err) {
            logger.error(`Error checking alert ${alert._id}:`, err);
            // Clear claim on error
            await alert_model.findByIdAndUpdate(alert._id, {
                recovery_claimed_by: null,
                recovery_claimed_at: null
            });
        }
    }

    if (resolvedCount > 0) {
        logger.info(`✅ Auto-resolved ${resolvedCount} alerts for delivered or failed notifications (worker: ${env.WORKER_ID})`);
    } else {
        logger.debug(`Auto-resolve: checked alerts, none had delivered notifications`);
    }
};

/**
 * Main recovery job
 */
const runRecovery = async (): Promise<void> => {
    if (state.isRunning || state.shouldStop) return;

    state.isRunning = true;

    try {
        // Check health before running if health checker is set
        if (state.healthChecker) {
            const isHealthy = await state.healthChecker();
            if (!isHealthy) {
                state.consecutiveFailures++;

                if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    logger.warn(`Recovery skipped - databases unhealthy (${state.consecutiveFailures} consecutive failures)`);
                } else {
                    logger.debug(`Recovery skipped - waiting for database reconnection (${state.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
                }
                return;
            }
        }

        // Reset failure count on successful health check
        state.consecutiveFailures = 0;

        logger.debug('Running recovery check...');

        await recoverStuckProcessing();
        await detectOrphanedPending();

        // Auto-resolve alerts for delivered notifications
        await autoResolveDeliveredAlerts();

        // Cleanup old resolved alerts and processed status outbox entries
        await cleanupResolvedAlerts();
        await cleanupProcessedStatusOutbox();

    } catch (err) {
        state.consecutiveFailures++;
        logger.error('Error running recovery:', err);
    } finally {
        state.isRunning = false;
    }
};

/**
 * Set the health checker function
 */
export const setHealthChecker = (checker: HealthChecker): void => {
    state.healthChecker = checker;
};

/**
 * Wait for ongoing operations to complete
 */
const waitForOperationsToComplete = async (): Promise<void> => {
    while (state.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};

/**
 * Start the recovery cron job
 */
export const startRecoveryCron = (): void => {
    if (state.intervalId) {
        logger.info('Recovery cron already running');
        return;
    }

    state.shouldStop = false;

    logger.info(`Starting recovery cron (every ${env.RECOVERY_POLL_INTERVAL_MS}ms)`);
    state.intervalId = setInterval(runRecovery, env.RECOVERY_POLL_INTERVAL_MS);
    runRecovery(); // Run immediately

    logger.success('Recovery cron started');
};

/**
 * Stop the recovery cron job gracefully
 */
export const stopRecoveryCron = async (): Promise<void> => {
    logger.info('Stopping recovery cron...');

    state.shouldStop = true;

    if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = null;
    }

    await waitForOperationsToComplete();
    logger.success('Recovery cron stopped');
};

/**
 * Check if recovery cron is running
 */
export const isRecoveryCronRunning = (): boolean => {
    return state.intervalId !== null;
};
