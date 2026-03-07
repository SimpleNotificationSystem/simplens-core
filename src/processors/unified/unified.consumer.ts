/**
 * Unified Consumer - Generic Kafka consumer that delegates to loaded plugins
 * 
 * Handles:
 * - Message parsing and validation
 * - Idempotency checks
 * - Rate limiting (uses plugin config)
 * - Sending via plugin router (with auto-fallback)
 * - Status publishing
 * - Retry queue management
 */

import { Consumer, EachMessagePayload } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import { NOTIFICATION_STATUS_SF } from '@src/types/types.js';
import { env } from '@src/config/env.config.js';
import { unifiedProcessorLogger as logger } from './unified.logger.js';

// Plugin system
import {
    sendWithFallback,
    PluginRegistry,
    resolveFallbackProviderId,
    validateNotificationForProvider
} from '@src/plugins/index.js';
import type { BaseNotification, DeliveryResult } from '@src/plugins/interfaces/provider.types.js';

// Shared utilities
import { tryAcquireProcessingLock, setDelivered, setFailed, setRateLimited } from '@src/processors/shared/idempotency.js';
import { consumeToken } from '@src/processors/shared/rate-limiter.js';
import { publishStatus } from '@src/processors/shared/status.producer.js';
import { publishDelayed, buildDelayedPayloadGeneric } from '@src/processors/shared/delayed.producer.js';
import { handleSchemaValidationFailure } from '../shared/schema-failure-handler.js';
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';
import status_outbox_model from '@src/database/models/status-outbox.models.js';
// Track active consumers by channel
const consumers: Map<string, Consumer> = new Map();
const consumingState: Map<string, boolean> = new Map();

/**
 * Get Kafka topic name for a channel
 */
const getTopicForChannel = (channel: string): string => {
    return `${channel}_notification`;
};

/**
 * Get consumer group ID for a channel
 */
const getConsumerGroupId = (channel: string): string => {
    return `${channel}-processor-group`;
};

/**
 * Build and publish success status
 */
const publishSuccessStatus = async (
    notification: BaseNotification,
    channel: string,
    messageId?: string
): Promise<void> => {
    // Use type assertion to satisfy strict types
    const status = {
        notification_id: notification.notification_id,
        request_id: notification.request_id,
        client_id: notification.client_id,
        channel: channel,
        status: NOTIFICATION_STATUS_SF.delivered,
        message: messageId ? `Delivered via ${messageId}` : 'Notification sent successfully',
        retry_count: notification.retry_count,
        webhook_url: notification.webhook_url,
        created_at: new Date()
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await publishStatus(status as any);
};

/**
 * Build and publish failure status
 */
const publishFailureStatus = async (
    notification: BaseNotification,
    channel: string,
    errorMessage: string
): Promise<void> => {
    const status = {
        notification_id: notification.notification_id,
        request_id: notification.request_id,
        client_id: notification.client_id,
        channel: channel,
        status: NOTIFICATION_STATUS_SF.failed,
        message: errorMessage,
        retry_count: notification.retry_count,
        webhook_url: notification.webhook_url,
        created_at: new Date()
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await publishStatus(status as any);
};

/**
 * Hand off a retry-exhausted notification to the fallback provider via delayed queue.
 * This gives the fallback provider its own retry budget while preserving normal backoff.
 */
export const scheduleFallbackProviderHandoff = async (
    channel: string,
    notification: BaseNotification,
    currentProviderId: string | undefined,
    errorMessage: string
): Promise<boolean> => {
    const fallbackProviderId = resolveFallbackProviderId(channel, currentProviderId);

    if (!fallbackProviderId) {
        return false;
    }

    const fallbackNotification: BaseNotification = {
        ...notification,
        provider: fallbackProviderId,
    };

    const validationResult = validateNotificationForProvider<BaseNotification>(
        fallbackProviderId,
        fallbackNotification
    );

    if (!validationResult.success) {
        logger.error(
            `[${channel}] Fallback handoff validation failed: ${notification.notification_id} - ${validationResult.error}`
        );
        return false;
    }

    await setFailed(notification.notification_id.toString(), notification.retry_count);
    const delayedPayload = buildDelayedPayloadGeneric(
        validationResult.data as unknown as Record<string, unknown>,
        channel,
        0
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await publishDelayed(delayedPayload as any);

    void AdminAlertService.sendAlert(
        'service_health',
        `INFO: RETRY BUDGET EXHAUSTED, SWITCHING TO FALLBACK\n` +
        `Notification ID: ${notification.notification_id}\n` +
        `Channel: ${channel}\n` +
        `Primary provider: ${currentProviderId || 'default'}\n` +
        `Fallback provider: ${fallbackProviderId}\n` +
        `Error: ${errorMessage}\n` +
        `Action: Investigate the primary provider if this handoff becomes frequent.`,
        { severity: 'warning', notificationId: notification.notification_id, channel }
    );

    logger.warn(
        `[${channel}] Retry budget exhausted for provider ${currentProviderId || 'default'}, ` +
        `scheduled fallback handoff to ${fallbackProviderId}: ${notification.notification_id}`
    );
    return true;
};

/**
 * Process a single notification message
 * Returns true if processing completed (commit offset)
 * Returns false if critical failure (don't commit, will be redelivered)
 */
const processMessage = async (
    channel: string,
    { partition, message }: EachMessagePayload
): Promise<boolean> => {
    const messageOffset = message.offset;

    try {
        // 1. Parse message
        if (!message.value) {
            logger.warn(`[${channel}] Empty message at partition ${partition}, offset ${messageOffset}`);
            return true; // Skip empty messages
        }

        const rawData = JSON.parse(message.value.toString());

        // 2. Validate with plugin schema
        const providerId = rawData.provider || PluginRegistry.getDefaultProviderId(channel);

        // Debug logging
        logger.debug(`Channel: ${channel}, Raw provider: ${rawData.provider}, Resolved providerId: ${providerId}`);

        const provider = providerId
            ? PluginRegistry.get(providerId)
            : PluginRegistry.getDefaultProvider(channel);

        if (!provider) {
            const msg = rawData.provider
                ? `Provider '${rawData.provider}' not found`
                : 'No provider available for channel';
            logger.error(`[${channel}] ${msg}`);
            
            // Mark as failed and publish failure status (defense-in-depth)
            const notificationId = rawData?.notification_id?.toString();
            if (notificationId) {
                void AdminAlertService.sendAlert('failed_notification',
                    `🔴 PROVIDER NOT FOUND\n` +
                    `Notification ID: ${notificationId}\n` +
                    `Channel: ${channel}\n` +
                    `Requested provider: ${rawData.provider || 'default'}\n` +
                    `Error: ${msg}\n` +
                    `Action: Check simplens.config.yaml. Verify provider is installed and configured.`,
                    { severity: 'critical', notificationId, channel });

                await setFailed(notificationId, rawData.retry_count || 0);
                await publishFailureStatus({
                    notification_id: rawData.notification_id,
                    request_id: rawData.request_id,
                    client_id: rawData.client_id,
                    channel: channel,
                    retry_count: rawData.retry_count || 0,
                    webhook_url: rawData.webhook_url
                } as BaseNotification, channel, msg);
            }
            return true; // Commit offset after marking as failed
        }

        const schema = provider.getNotificationSchema();
        const validationResult = schema.safeParse(rawData);

        if (!validationResult.success) {
            logger.error(`[${channel}] Invalid notification schema at offset ${messageOffset}:`,
                validationResult.error.issues);

            // Extract notification_id if it exists to properly mark as failed
            const notificationId = rawData?.notification_id?.toString();

            if (notificationId) {
                await handleSchemaValidationFailure(
                    notificationId,
                    channel,
                    rawData,
                    validationResult.error
                );
            } else {
                logger.warn(`[${channel}] Cannot mark as failed - no notification_id in malformed payload`);
            }

            return true; // Skip invalid messages
        }

        const notification = validationResult.data as BaseNotification;
        const notificationId = notification.notification_id.toString();

        logger.info(`[${channel}] Processing notification: ${notificationId} (retry: ${notification.retry_count})`);

        // 3. Idempotency check - acquire processing lock
        const lockResult = await tryAcquireProcessingLock(notificationId, validationResult.data.retry_count);
        if (!lockResult.canProcess) {
            logger.info(`[${channel}] Skipping duplicate: ${notificationId}`);
            return true; // Already handled
        }

        if (lockResult.isRetry) {
            logger.info(`[${channel}] Retrying previously failed: ${notificationId}`);
        }

        // 4. Rate limit check - uses provider ID for per-provider rate limiting
        const rateLimitResult = await consumeToken(providerId!);

        if (!rateLimitResult.allowed) {
            logger.warn(`[${channel}] Rate limited: ${notificationId}, retry after ${rateLimitResult.retryAfterMs}ms`);

            const newRetryCount = notification.retry_count + 1;
            if (newRetryCount > env.MAX_RETRY_COUNT) {
                const currentProviderId = notification.provider || PluginRegistry.getDefaultProviderId(channel);
                const handoffScheduled = await scheduleFallbackProviderHandoff(
                    channel,
                    notification,
                    currentProviderId,
                    `Rate limited after ${env.MAX_RETRY_COUNT} retries`
                );

                if (handoffScheduled) {
                    return true;
                }

                logger.error(`[${channel}] Max retries exceeded (rate limited): ${notificationId}`);

                void AdminAlertService.sendAlert('failed_notification',
                    `❌ MAX RETRIES EXCEEDED (RATE LIMITED)\n` +
                    `Notification ID: ${notificationId}\n` +
                    `Channel: ${channel}\n` +
                    `Provider: ${currentProviderId || providerId || 'default'}\n` +
                    `Root cause: Provider rate limit exhausted after ${env.MAX_RETRY_COUNT} retries\n` +
                    `Action: Check provider rate limits in simplens.config.yaml. Consider increasing limits or adding fallback provider.`,
                    { severity: 'critical', notificationId, channel });

                await setFailed(notificationId, validationResult.data.retry_count);
                await publishFailureStatus(notification, channel, 'Max retry count exceeded (rate limiting)');
                return true;
            }

            // Push to delayed queue using rate limiter's retryAfterMs
            await setRateLimited(notificationId, validationResult.data.retry_count);
            const delayedPayload = buildDelayedPayloadGeneric(
                notification as unknown as Record<string, unknown>,
                channel,
                newRetryCount,
                rateLimitResult.retryAfterMs // Use exact delay from rate limiter
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await publishDelayed(delayedPayload as any);
            logger.info(`[${channel}] Rate limited, scheduled retry in ${rateLimitResult.retryAfterMs}ms: ${notificationId} (retry ${newRetryCount})`);
            return true;
        }

        // 5. Send via plugin router (with auto-fallback)
        const result: DeliveryResult = await sendWithFallback(channel, notification);

        if (result.success) {
            // 6a. Success
            try {
                await setDelivered(notificationId, validationResult.data.retry_count);
            } catch (redisErr) {
                // Redis failed but notification sent - "ghost delivery" scenario
                logger.error(`[${channel}] Failed to update idempotency, but notification was sent: ${notificationId}`, redisErr);

                void AdminAlertService.sendAlert('ghost_delivery',
                    `⚠️ REDIS UPDATE FAILED AFTER DELIVERY\n` +
                    `Notification ID: ${notificationId}\n` +
                    `Channel: ${channel}\n` +
                    `Status: Notification was SENT but idempotency key update failed\n` +
                    `Root cause: Redis may be unreachable\n` +
                    `Action: Check Redis connectivity. Recovery cron will auto-resolve.`,
                    { severity: 'warning', notificationId, channel });
            }

            try {
                await publishSuccessStatus(notification, channel, result.messageId);
            } catch (kafkaErr) {
                logger.error(`[${channel}] Failed to publish success status: ${notificationId}`, kafkaErr);
                
                // Fallback: create status_outbox entry for the background worker to pick up
                try {
                    await status_outbox_model.create({
                        notification_id: notificationId,
                        status: 'delivered',
                        processed: false
                    });
                    logger.info(`[${channel}] Created status_outbox fallback for: ${notificationId}`);
                } catch (outboxErr) {
                    logger.error(`[${channel}] Failed to create status_outbox fallback: ${notificationId}`, outboxErr);
                    
                    void AdminAlertService.sendAlert('ghost_delivery',
                        `🔴 STATUS UPDATE COMPLETELY FAILED\n` +
                        `Notification ID: ${notificationId}\n` +
                        `Channel: ${channel}\n` +
                        `Kafka publish failed, status_outbox creation also failed\n` +
                        `Root cause: Check Kafka and MongoDB connectivity\n` +
                        `Action: Recovery cron will auto-resolve via ghost delivery detection.`,
                        { severity: 'critical', notificationId, channel });
                }
            }

            logger.success(`[${channel}] Delivered: ${notificationId}`);
            return true;
        }
        else if (result.success === false && result.error?.retryable === false) {
            const errorCode = result.error?.code || 'NON_RETRYABLE_FAILURE';
            const errorMessage = result.error?.message || 'Non-retryable provider error';

            logger.error(`[${channel}] Non-retryable failure: ${notificationId} (${errorCode}) - ${errorMessage}`);

            void AdminAlertService.sendAlert('failed_notification',
                `❌ NON-RETRYABLE PROVIDER FAILURE\n` +
                `Notification ID: ${notificationId}\n` +
                `Channel: ${channel}\n` +
                `Error code: ${errorCode}\n` +
                `Error: ${errorMessage}\n` +
                `Action: Check provider configuration and connectivity. Review simplens.config.yaml.`,
                { severity: 'critical', notificationId, channel });

            await setFailed(notificationId, validationResult.data.retry_count);
            await publishFailureStatus(notification, channel, errorMessage);

            // Commit kafka offset after persisting failed state + status
            return true;
        }
        else {
            // 6b. Failure - check if retryable
            const newRetryCount = notification.retry_count + 1;
            const currentProviderId = notification.provider || PluginRegistry.getDefaultProviderId(channel);

            if (result.error?.retryable && newRetryCount > env.MAX_RETRY_COUNT) {
                const handoffScheduled = await scheduleFallbackProviderHandoff(
                    channel,
                    notification,
                    currentProviderId,
                    result.error?.message || 'Unknown retryable error'
                );

                if (handoffScheduled) {
                    return true;
                }
            }

            if (!result.error?.retryable || newRetryCount > env.MAX_RETRY_COUNT) {
                logger.error(`[${channel}] Final failure: ${notificationId} - ${result.error?.message}`);

                void AdminAlertService.sendAlert('failed_notification',
                    `❌ NOTIFICATION PERMANENTLY FAILED\n` +
                    `Notification ID: ${notificationId}\n` +
                    `Channel: ${channel}\n` +
                    `Error: ${result.error?.message}\n` +
                    `Retryable: ${result.error?.retryable}\n` +
                    `Action: Check provider configuration. Review error in notification details via dashboard.`,
                    { severity: 'critical', notificationId, channel });

                await setFailed(notificationId, validationResult.data.retry_count);
                await publishFailureStatus(notification, channel, result.error?.message || 'Unknown error');
                return true;
            }

            // Push to delayed queue for retry
            await setFailed(notificationId, validationResult.data.retry_count);
            const delayedPayload = buildDelayedPayloadGeneric(
                notification as unknown as Record<string, unknown>,
                channel,
                newRetryCount
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await publishDelayed(delayedPayload as any);
            logger.warn(`[${channel}] Failed, pushed to delayed queue: ${notificationId} (retry ${newRetryCount})`);
            return true;
        }

    } catch (err) {
        logger.error(`[${channel}] Error processing message at partition ${partition}, offset ${messageOffset}:`, err);
        // Return false to NOT commit offset - message will be redelivered
        return false;
    }
};

/**
 * Start consumer for a specific channel
 */
export const startUnifiedConsumer = async (channel: string): Promise<void> => {
    if (consumers.has(channel)) {
        logger.warn(`[${channel}] Consumer already running`);
        return;
    }

    const topic = getTopicForChannel(channel);
    const groupId = getConsumerGroupId(channel);

    logger.info(`[${channel}] Creating consumer for topic: ${topic}, group: ${groupId}`);

    const consumer = kafka.consumer({
        groupId,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
    });
    
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    consumers.set(channel, consumer);
    consumingState.set(channel, true);

    await consumer.run({
        autoCommit: false,
        eachMessage: async (payload) => {
            try{
                if (!consumingState.get(channel)) {
                    return; // Consumer is stopping
                }
    
                const shouldCommit = await processMessage(channel, payload);
    
                if (shouldCommit) {
                    await consumer.commitOffsets([{
                        topic: payload.topic,
                        partition: payload.partition,
                        offset: (BigInt(payload.message.offset) + 1n).toString()
                    }]);
                }
            }catch(err){
                logger.error(`[${channel}] Error in eachMessage handler at partition ${payload.partition}, offset ${payload.message.offset}:`, err);
                // Don't commit - message will be redelivered
                // Consider: if this is a poison message, it could loop forever on rebalance
            }
        }
    });

    logger.success(`[${channel}] Consumer started`);
};

/**
 * Stop consumer for a specific channel
 */
export const stopUnifiedConsumer = async (channel: string): Promise<void> => {
    const consumer = consumers.get(channel);
    if (!consumer) {
        return;
    }

    logger.info(`[${channel}] Stopping consumer...`);
    consumingState.set(channel, false);

    try {
        await consumer.stop();
        await consumer.disconnect();
        consumers.delete(channel);
        consumingState.delete(channel);
        logger.info(`[${channel}] Consumer stopped`);
    } catch (err) {
        logger.error(`[${channel}] Error stopping consumer:`, err);
    }
};

/**
 * Stop all active consumers
 */
export const stopAllConsumers = async (): Promise<void> => {
    const channels = Array.from(consumers.keys());
    for (const channel of channels) {
        await stopUnifiedConsumer(channel);
    }
};
