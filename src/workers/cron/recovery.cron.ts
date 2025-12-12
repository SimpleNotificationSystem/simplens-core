/**
 * Recovery Cron - Detects and reconciles stuck/inconsistent notification states
 * 
 * Handles "ghost deliveries" where:
 * - Notification was sent but Redis idempotency status wasn't updated
 * - Notification was sent but Kafka status wasn't published
 * - Notifications stuck in "processing" state beyond expected time
 * 
 * This provides a safety net for edge cases not covered by the main processing flow.
 * Creates alerts in the dashboard for visibility instead of just logging.
 */

import mongoose from 'mongoose';
import { env } from '@src/config/env.config.js';
import notification_model from '@src/database/models/notification.models.js';
import outbox_model from '@src/database/models/outbox.models.js';
import alert_model from '@src/database/models/alert.models.js';
import { NOTIFICATION_STATUS, NOTIFICATION_STATUS_SF, CHANNEL, ALERT_TYPE, ALERT_SEVERITY, type notification } from '@src/types/types.js';
import { getIdempotencyStatus } from '@src/processors/shared/idempotency.js';
import { publishStatus } from '@src/processors/shared/status.producer.js';
import { convert_notification_schema_to_outbox_schema } from '@src/api/utils/utils.js';
import { recoveryServiceLogger as logger } from '@src/workers/utils/logger.js';

// Recovery configuration
const STUCK_PROCESSING_THRESHOLD_MS = env.PROCESSING_TTL_SECONDS * 1000 * 2; // 2x the processing TTL
const RECOVERY_BATCH_SIZE = env.RECOVERY_BATCH_SIZE;

// Cron state
let recoveryIntervalId: NodeJS.Timeout | null = null;
let isRecovering = false;

/**
 * Create an alert for dashboard visibility
 * Checks if an unresolved alert already exists for this notification to avoid duplicates
 */
const createAlert = async (
    type: ALERT_TYPE,
    message: string,
    severity: ALERT_SEVERITY,
    notificationId?: mongoose.Types.ObjectId,
    metadata?: Record<string, unknown>
): Promise<void> => {
    try {
        // Check for existing unresolved alert for the same notification and type
        if (notificationId) {
            const existing = await alert_model.findOne({
                type,
                notification_id: notificationId,
                resolved: false
            });
            if (existing) {
                logger.debug(`Alert already exists for notification ${notificationId}`);
                return;
            }
        }

        await alert_model.create({
            type,
            notification_id: notificationId,
            message,
            severity,
            metadata,
            resolved: false
        });

        logger.info(`Created ${severity} alert: ${type} - ${message}`);
    } catch (err) {
        logger.error('Failed to create alert:', err);
    }
};


/**
 * Find notifications that are stuck in 'processing' state longer than expected
 * and reconcile their state based on Redis idempotency status
 */
const reconcileStuckProcessing = async (): Promise<{ reconciled: number; reset: number; flagged: number }> => {
    const stuckThreshold = new Date(Date.now() - STUCK_PROCESSING_THRESHOLD_MS);

    // Find notifications stuck in processing state
    const stuckNotifications = await notification_model.find({
        status: NOTIFICATION_STATUS.processing,
        updated_at: { $lt: stuckThreshold }
    }).limit(RECOVERY_BATCH_SIZE).lean();

    if (stuckNotifications.length === 0) {
        return { reconciled: 0, reset: 0, flagged: 0 };
    }

    logger.info(`Found ${stuckNotifications.length} stuck processing notifications`);

    let reconciled = 0;
    let reset = 0;
    let flagged = 0;

    for (const notification of stuckNotifications) {
        const notificationId = notification._id.toString();

        try {
            const redisStatus = await getIdempotencyStatus(notificationId);

            if (redisStatus?.status === 'delivered') {
                // Redis says delivered but MongoDB wasn't updated - reconcile (ghost delivery)
                logger.info(`Reconciling ghost delivery: ${notificationId}`);

                // Create alert for visibility - ghost delivery detected and auto-reconciled
                await createAlert(
                    ALERT_TYPE.ghost_delivery,
                    `Ghost delivery detected: Redis shows delivered but MongoDB was stuck in processing`,
                    ALERT_SEVERITY.warning,
                    notification._id,
                    {
                        channel: notification.channel,
                        request_id: notification.request_id,
                        action: 'auto_reconciled'
                    }
                );

                await notification_model.findByIdAndUpdate(notificationId, {
                    status: NOTIFICATION_STATUS.delivered,
                    updated_at: new Date()
                });

                // Also publish status to ensure webhook is called
                try {
                    await publishStatus({
                        notification_id: notification._id,
                        request_id: notification.request_id,
                        client_id: notification.client_id,
                        channel: notification.channel as CHANNEL,
                        status: NOTIFICATION_STATUS_SF.delivered,
                        message: 'Recovered: Email/Message was delivered',
                        retry_count: notification.retry_count || 0,
                        webhook_url: notification.webhook_url,
                        created_at: new Date()
                    });
                } catch (statusErr) {
                    logger.error(`Failed to publish recovery status for ${notificationId}:`, statusErr);
                }

                reconciled++;
            } else if (redisStatus?.status === 'failed' || !redisStatus) {
                // Redis says failed or no record exists - reset to pending for retry
                // Use a transaction to atomically update notification AND create outbox entry
                logger.info(`Resetting stuck notification to pending with outbox: ${notificationId}`);

                const session = await mongoose.startSession();
                try {
                    await session.withTransaction(async () => {
                        // 1. Update notification status to pending
                        await notification_model.findByIdAndUpdate(
                            notificationId,
                            {
                                status: NOTIFICATION_STATUS.pending,
                                updated_at: new Date()
                            },
                            { session }
                        );

                        // 2. Create outbox entry for retry
                        const outboxEntry = convert_notification_schema_to_outbox_schema(
                            notification as notification & { _id: mongoose.Types.ObjectId },
                            notification._id
                        );
                        await outbox_model.create([outboxEntry], { session });
                    });

                    logger.info(`Successfully reset notification ${notificationId} with new outbox entry`);
                    reset++;
                } catch (txErr) {
                    logger.error(`Transaction failed for notification ${notificationId}:`, txErr);
                } finally {
                    await session.endSession();
                }
            } else if (redisStatus?.status === 'processing') {
                // Still in processing in Redis - might be legitimately processing still
                // or might be a "ghost" where processor died mid-send
                // Flag for manual review if it's been too long
                const processingTime = Date.now() - new Date(redisStatus.updated_at).getTime();

                if (processingTime > STUCK_PROCESSING_THRESHOLD_MS * 2) {
                    // Very old processing state - this is suspicious
                    const stuckMinutes = Math.round(processingTime / 1000 / 60);
                    logger.warn(`FLAGGED: Notification ${notificationId} stuck in processing for ${stuckMinutes} minutes`);

                    // Create alert for dashboard visibility - needs manual review
                    await createAlert(
                        ALERT_TYPE.stuck_processing,
                        `Notification stuck in processing for ${stuckMinutes} minutes - may need manual review`,
                        stuckMinutes > 30 ? ALERT_SEVERITY.error : ALERT_SEVERITY.warning,
                        notification._id,
                        {
                            channel: notification.channel,
                            request_id: notification.request_id,
                            processing_minutes: stuckMinutes,
                            redis_status: 'processing'
                        }
                    );

                    flagged++;
                }
            }
        } catch (err) {
            logger.error(`Error reconciling notification ${notificationId}:`, err);
        }
    }

    return { reconciled, reset, flagged };
};

/**
 * Find pending notifications in MongoDB that have been waiting too long
 * This catches cases where outbox polling might have missed something
 */
const detectOrphanedPending = async (): Promise<number> => {
    const orphanThreshold = new Date(Date.now() - env.ORPHAN_THRESHOLD_MS);

    const orphanedCount = await notification_model.countDocuments({
        status: NOTIFICATION_STATUS.pending,
        created_at: { $lt: orphanThreshold }
    });

    if (orphanedCount > 0) {
        const thresholdMinutes = Math.round(env.ORPHAN_THRESHOLD_MS / 60000);
        logger.warn(`Found ${orphanedCount} orphaned pending notifications older than ${thresholdMinutes} minutes`);

        // Create alert only if count is concerning
        if (orphanedCount >= env.ORPHAN_ALERT_THRESHOLD) {
            await createAlert(
                ALERT_TYPE.orphaned_pending,
                `${orphanedCount} notifications stuck in pending state for over ${thresholdMinutes} minutes - check outbox polling`,
                orphanedCount > env.ORPHAN_CRITICAL_THRESHOLD ? ALERT_SEVERITY.critical : ALERT_SEVERITY.warning,
                undefined, // No specific notification
                {
                    orphaned_count: orphanedCount,
                    threshold_minutes: thresholdMinutes
                }
            );
        }
    }

    return orphanedCount;
};

/**
 * Main recovery job - runs periodically to detect and fix inconsistencies
 */
const runRecovery = async (): Promise<void> => {
    if (isRecovering) {
        logger.debug('Previous recovery still in progress, skipping...');
        return;
    }

    isRecovering = true;

    try {
        logger.debug('Running recovery check...');

        // 1. Reconcile stuck processing notifications
        const { reconciled, reset, flagged } = await reconcileStuckProcessing();

        if (reconciled > 0 || reset > 0 || flagged > 0) {
            logger.info(`Recovery complete: ${reconciled} reconciled, ${reset} reset, ${flagged} flagged`);
        }

        // 2. Detect orphaned pending notifications
        const orphaned = await detectOrphanedPending();

        if (orphaned > env.ORPHAN_CRITICAL_THRESHOLD) {
            logger.error(`HIGH ALERT: ${orphaned} orphaned pending notifications - check outbox polling`);
        }

    } catch (err) {
        logger.error('Error during recovery:', err);
    } finally {
        isRecovering = false;
    }
};

/**
 * Start the recovery cron job
 * Runs every 2 minutes to check for stuck notifications
 */
export const startRecoveryCron = (): void => {
    if (recoveryIntervalId) {
        logger.info('Recovery cron already running');
        return;
    }

    const intervalMs = env.RECOVERY_CRON_INTERVAL_MS;

    logger.info(`Starting recovery cron (interval: ${intervalMs / 1000}s)`);

    // Run immediately on start
    runRecovery();

    // Then run on interval
    recoveryIntervalId = setInterval(runRecovery, intervalMs);

    logger.success('Recovery cron started');
};

/**
 * Stop the recovery cron job
 */
export const stopRecoveryCron = async (): Promise<void> => {
    if (recoveryIntervalId) {
        clearInterval(recoveryIntervalId);
        recoveryIntervalId = null;
        logger.info('Recovery cron stopped');
    }

    // Wait for any in-progress recovery to complete
    while (isRecovering) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};

/**
 * Check if recovery cron is running
 */
export const isRecoveryCronRunning = (): boolean => {
    return recoveryIntervalId !== null;
};

/**
 * Manually trigger a recovery run (for testing/admin purposes)
 */
export const triggerManualRecovery = async (): Promise<{
    reconciled: number;
    reset: number;
    flagged: number;
    orphaned: number;
}> => {
    const result = await reconcileStuckProcessing();
    const orphaned = await detectOrphanedPending();

    return { ...result, orphaned };
};
