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
 * Recover stuck processing notifications
 */
const recoverStuckProcessing = async (): Promise<void> => {
    const threshold = new Date(Date.now() - env.PROCESSING_STUCK_THRESHOLD_MS);

    // Find stuck notifications
    const stuckNotifications = await notification_model.find({
        status: NOTIFICATION_STATUS.processing,
        updated_at: { $lt: threshold }
    }).limit(env.RECOVERY_BATCH_SIZE);

    if (stuckNotifications.length === 0) {
        return;
    }

    logger.info(`Found ${stuckNotifications.length} stuck processing notifications`);

    for (const notification of stuckNotifications) {
        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                // Re-fetch with lock to prevent race conditions
                const locked = await notification_model.findOneAndUpdate(
                    {
                        _id: notification._id,
                        status: NOTIFICATION_STATUS.processing,
                        updated_at: { $lt: threshold }
                    },
                    { $set: { updated_at: new Date() } }, // Touch to claim
                    { session, new: true }
                );

                if (!locked) {
                    logger.debug(`Notification ${notification._id} already recovered by another instance`);
                    return;
                }

                // Get Redis status
                const redisStatus = await getIdempotencyStatus(notification._id.toString());

                if (redisStatus?.status === 'delivered') {
                    // GHOST DELIVERY - Redis says delivered but DB says processing
                    logger.info(`Ghost delivery detected for ${notification._id}`);

                    await notification_model.updateOne(
                        { _id: notification._id },
                        { status: NOTIFICATION_STATUS.delivered },
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
                                error_message: 'Recovered by recovery service - max retries exceeded'
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
                }
            });
        } catch (err) {
            logger.error(`Error recovering notification ${notification._id}:`, err);
        } finally {
            await session.endSession();
        }
    }
};

/**
 * Detect orphaned pending notifications
 */
const detectOrphanedPending = async (): Promise<void> => {
    const threshold = new Date(Date.now() - env.PENDING_STUCK_THRESHOLD_MS);

    // Find stuck pending notifications
    const orphanedNotifications = await notification_model.find({
        status: NOTIFICATION_STATUS.pending,
        updated_at: { $lt: threshold }
    }).limit(env.RECOVERY_BATCH_SIZE);

    if (orphanedNotifications.length === 0) {
        return;
    }

    logger.info(`Found ${orphanedNotifications.length} orphaned pending notifications`);

    for (const notification of orphanedNotifications) {
        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                // Re-fetch with lock to prevent race conditions
                const locked = await notification_model.findOneAndUpdate(
                    {
                        _id: notification._id,
                        status: NOTIFICATION_STATUS.pending,
                        updated_at: { $lt: threshold }
                    },
                    { $set: { updated_at: new Date() } }, // Touch to claim
                    { session, new: true }
                );

                if (!locked) {
                    return;
                }

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
                    { upsert: true, session }
                );

                logger.warn(`Created alert for orphaned pending notification ${notification._id}`);
            });
        } catch (err) {
            logger.error(`Error creating alert for ${notification._id}:`, err);
        } finally {
            await session.endSession();
        }
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
