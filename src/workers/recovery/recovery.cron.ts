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
import { dynamicConfig } from '@src/config/dynamic-config.service.js';
import { NOTIFICATION_STATUS, ALERT_TYPE, type HealthChecker, type RecoveryCronState } from '@src/types/types.js';
import notification_model from '@src/database/models/notification.models.js';
import alert_model from '@src/database/models/alert.models.js';
import status_outbox_model from '@src/database/models/status-outbox.models.js';
import file_attachment_model from '@src/database/models/file-attachment.models.js';
import channel_routing_model from '@src/database/models/channel-routing.models.js';
import { PluginRegistry } from '@src/plugins/loader/registry.js';
import { StorageService } from '@src/storage/storage.service.js';
import { getIdempotencyStatus } from '@src/processors/shared/idempotency.js';
import { recoveryLogger as logger } from '@src/workers/utils/logger.js';
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';
import { NOTIFICATION_STATUS_SF } from '@src/types/types.js';

const MAX_CONSECUTIVE_FAILURES = 5;

// Cron state management
const state: RecoveryCronState = {
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
            { returnDocument: 'after' }
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

                    void AdminAlertService.sendAlert('ghost_delivery',
                        `🔄 GHOST DELIVERY DETECTED\n` +
                        `Notification ID: ${notification._id}\n` +
                        `Redis shows: delivered | MongoDB shows: processing\n` +
                        `Root cause: Redis update succeeded but MongoDB transaction failed\n` +
                        `Action: Auto-resolved by recovery. Check MongoDB connectivity if recurring.`,
                        { severity: 'warning', notificationId: notification._id.toString() });

                    await notification_model.updateOne(
                        { _id: notification._id },
                        {
                            status: NOTIFICATION_STATUS.delivered,
                            retry_count: redisStatus.retry_count,
                            recovery_claimed_by: null,
                            recovery_claimed_at: null
                        },
                        { session }
                    );

                    await status_outbox_model.create([{
                        notification_id: notification._id,
                        status: NOTIFICATION_STATUS_SF.delivered,
                        processed: false
                    }], { session });

                } else if (redisStatus?.status === 'failed' || redisStatus?.status === 'rate_limited') {
                    if (redisStatus.retry_count >= env.MAX_RETRY_COUNT) {
                        // EXHAUSTED RETRIES
                        logger.info(`Notification ${notification._id} exhausted retries (${redisStatus.retry_count})`);

                        void AdminAlertService.sendAlert('failed_notification',
                            `❌ NOTIFICATION FAILED - MAX RETRIES EXHAUSTED\n` +
                            `Notification ID: ${notification._id}\n` +
                            `Retry count: ${redisStatus.retry_count}/${env.MAX_RETRY_COUNT}\n` +
                            `Status: ${redisStatus.status}\n` +
                            `Recovered by: Recovery Service\n` +
                            `Action: Review notification in dashboard. Check provider logs for failure reason.`,
                            { severity: 'critical', notificationId: notification._id.toString() });

                        await notification_model.updateOne(
                            { _id: notification._id },
                            {
                                status: NOTIFICATION_STATUS.failed,
                                retry_count: redisStatus.retry_count,
                                error_message: 'Recovered by recovery service - max retries exceeded',
                                recovery_claimed_by: null,
                                recovery_claimed_at: null
                            },
                            { session }
                        );

                        await status_outbox_model.create([{
                            notification_id: notification._id,
                            status: NOTIFICATION_STATUS_SF.failed,
                            processed: false
                        }], { session });

                    } else {
                        // RETRY COUNT NOT EXHAUSTED BUT REDIS SAYS FAILED
                        // Create alert for manual retry via dashboard
                        logger.warn(`Creating alert for failed notification ${notification._id} (retry: ${redisStatus.retry_count}/${env.MAX_RETRY_COUNT})`);

                        void AdminAlertService.sendAlert('stuck_processing',
                            `⚠️ NOTIFICATION STUCK WITH RETRIES\n` +
                            `Notification ID: ${notification._id}\n` +
                            `Retry count: ${redisStatus.retry_count}/${env.MAX_RETRY_COUNT}\n` +
                            `Status: ${redisStatus.status}\n` +
                            `Action: Can retry via dashboard at /alerts or wait for auto-retry.`,
                            { severity: 'warning', notificationId: notification._id.toString() });

                        await alert_model.updateOne(
                            { notification_id: notification._id, alert_type: ALERT_TYPE.stuck_processing },
                            {
                                $set: { resolved: false },
                                $setOnInsert: {
                                    reason: `Notification ${redisStatus.status === 'failed' ? `failed but has retries remaining (${redisStatus.retry_count}/${env.MAX_RETRY_COUNT}). Admin can retry via dashboard.`: "rate-limited. Will be retried later automatically."}`,
                                    redis_status: redisStatus?.status || 'not_found',
                                    db_status: notification.status,
                                    retry_count: redisStatus.retry_count
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

                    void AdminAlertService.sendAlert('stuck_processing',
                        `🚨 NOTIFICATION STUCK - NO REDIS STATUS\n` +
                        `Notification ID: ${notification._id}\n` +
                        `MongoDB status: ${notification.status}\n` +
                        `Redis status: ${redisStatus?.status || 'not_found'}\n` +
                        `Root cause: Processor may have crashed mid-processing or Redis key expired\n` +
                        `Action: Check processor logs. Manual retry via dashboard may be needed.`,
                        { severity: 'critical', notificationId: notification._id.toString() });

                    await alert_model.updateOne(
                        { notification_id: notification._id, alert_type: ALERT_TYPE.stuck_processing },
                        {
                            $set: { resolved: false },
                            $setOnInsert: {
                                reason: 'Notification stuck in processing with no resolution in Redis',
                                redis_status: redisStatus?.status || 'not_found',
                                db_status: notification.status,
                                retry_count: redisStatus?.retry_count || 0
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
            { returnDocument: 'after' }
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
                        redis_status: 'not_found',
                        db_status: notification.status,
                        retry_count: notification.retry_count
                    }
                },
                { upsert: true }
            );

            logger.warn(`Created alert for orphaned pending notification ${notification._id}`);

            void AdminAlertService.sendAlert('orphaned_pending',
                `📭 ORPHANED PENDING NOTIFICATION\n` +
                `Notification ID: ${notification._id}\n` +
                `Created: ${notification.created_at}\n` +
                `Stuck duration: ${env.PENDING_STUCK_THRESHOLD_MS / 1000}s+\n` +
                `Root cause: May not have been published to outbox or Kafka\n` +
                `Action: Check outbox table. Verify background worker is running.`,
                { severity: 'warning', notificationId: notification._id.toString() });

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
 * Discover all active channel identifiers from notifications collection, channel routings, and plugin registry.
 */
const discoverActiveChannels = async (): Promise<string[]> => {
    try {
        const [notificationChannels, routingChannels] = await Promise.all([
            notification_model.distinct('channel').catch(() => [] as string[]),
            channel_routing_model.distinct('channel').catch(() => [] as string[]),
        ]);
        const registryChannels = PluginRegistry?.getChannels ? PluginRegistry.getChannels() : [];
        return Array.from(new Set([...notificationChannels, ...routingChannels, ...registryChannels].filter(Boolean)));
    } catch (err) {
        logger.error('Failed to discover active channels for retention cleanup:', err);
        return [];
    }
};

/**
 * Builds a dynamic MongoDB query to match notifications referencing a file attachment.
 * Supports root-level attachments as well as channel-scoped content for any arbitrary channel.
 */
const buildNotificationAttachmentQuery = (fileId: string, channels: string[]) => {
    const orConditions: Record<string, unknown>[] = [
        { 'content.attachments.fileId': fileId },
        { 'content.attachments.id': fileId },
    ];

    for (const channel of channels) {
        if (!channel) continue;
        orConditions.push(
            { [`content.${channel}.attachments.fileId`]: fileId },
            { [`content.${channel}.attachments.id`]: fileId },
        );
    }

    return { $or: orConditions };
};

/**
 * Cleanup file attachments once all referencing notifications are delivered and retention has elapsed.
 * Also cleans up orphaned file uploads older than the retention threshold.
 */
const cleanupDeliveredFileAttachments = async (): Promise<void> => {
    try {
        const retentionMs = env.CLEANUP_DELIVERED_ATTACHMENTS_RETENTION_MS;
        if (!retentionMs || retentionMs <= 0) {
            return;
        }

        const threshold = new Date(Date.now() - retentionMs);

        // Find candidate attachments created on or before the retention cutoff
        const candidateFiles = await file_attachment_model.find({
            created_at: { $lte: threshold }
        }).select('file_id filename created_at').lean();

        if (!candidateFiles || candidateFiles.length === 0) {
            return;
        }

        // Dynamically discover all active channels across notifications, routings, and plugins
        const activeChannels = await discoverActiveChannels();

        let deletedCount = 0;

        for (const file of candidateFiles) {
            // Find all notifications referencing this file_id across root and arbitrary channels
            const attachmentQuery = buildNotificationAttachmentQuery(file.file_id, activeChannels);
            const matchingNotifications = await notification_model.find(attachmentQuery)
                .select('status updated_at created_at')
                .lean();

            let shouldDelete = false;

            if (matchingNotifications.length === 0) {
                // Orphaned file upload older than retention period
                shouldDelete = true;
            } else {
                // Check if ALL referencing notifications are delivered
                const allDelivered = matchingNotifications.every(
                    (n) => n.status === NOTIFICATION_STATUS.delivered
                );

                if (allDelivered) {
                    const latestDeliveredAt = Math.max(
                        ...matchingNotifications.map((n) => new Date(n.updated_at || n.created_at || Date.now()).getTime())
                    );
                    if (Date.now() - latestDeliveredAt >= retentionMs) {
                        shouldDelete = true;
                    }
                }
            }

            if (shouldDelete) {
                try {
                    await StorageService.deleteFile(file.file_id);
                    deletedCount++;
                } catch (delErr) {
                    logger.error(`Failed to delete expired file attachment ${file.file_id} (${file.filename}):`, delErr);
                }
            }
        }

        if (deletedCount > 0) {
            logger.info(`🧹 Cleaned up ${deletedCount} delivered/orphaned file attachments older than retention period (${retentionMs}ms)`);
        }
    } catch (err) {
        logger.error('Error during file attachments retention cleanup:', err);
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
            { returnDocument: 'after' }
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

        // Cleanup old resolved alerts, processed status outbox, and delivered file attachments
        await cleanupResolvedAlerts();
        await cleanupProcessedStatusOutbox();
        await cleanupDeliveredFileAttachments();

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

// Listen for dynamic configuration updates and hot-adjust recovery interval
dynamicConfig.on('change', () => {
    if (state.shouldStop) return;
    if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = setInterval(runRecovery, env.RECOVERY_POLL_INTERVAL_MS);
        logger.info(`Adjusted recovery cron interval to ${env.RECOVERY_POLL_INTERVAL_MS}ms`);
    }
});

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
