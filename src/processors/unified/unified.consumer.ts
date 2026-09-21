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

import { Consumer, EachMessagePayload, ConsumerCrashEvent } from 'kafkajs';
import { kafka, ensureChannelTopic } from '@src/config/kafka.config.js';
import { NOTIFICATION_STATUS_SF } from '@src/types/types.js';
import { env } from '@src/config/env.config.js';
import { unifiedProcessorLogger as logger } from './unified.logger.js';

// Plugin system
import {
    sendWithFallback,
    PluginRegistry,
    getProviderCascade,
    resolveFallbackProviderId,
    validateNotificationForProvider
} from '@src/plugins/index.js';
import type {
    BaseNotification,
    DeliveryResult,
    RateLimitResult,
    ConsumerHealthState,
    ConsumerHealthCheckResult,
    ConsumerHealthDetails
} from '@src/types/types.js';

// Shared utilities
import { tryAcquireProcessingLock, setDelivered, setFailed, setRateLimited } from '@src/processors/shared/idempotency.js';
import { consumeToken } from '@src/processors/shared/rate-limiter.js';
import { publishStatus } from '@src/processors/shared/status.producer.js';
import { publishDelayed, buildDelayedPayloadGeneric } from '@src/processors/shared/delayed.producer.js';
import { handleSchemaValidationFailure } from '../shared/schema-failure-handler.js';
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';
import status_outbox_model from '@src/database/models/status-outbox.models.js';

// Re-export consumer health types
export type { ConsumerHealthState, ConsumerHealthCheckResult, ConsumerHealthDetails };

// State tracking for graceful shutdown & health
const consumers: Map<string, Consumer> = new Map();
const consumingState: Map<string, boolean> = new Map();
const consumerHealthState: Map<string, ConsumerHealthState> = new Map();

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
        provider: notification.provider,
        provider_history: notification.provider_history,
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
        provider: notification.provider,
        provider_history: notification.provider_history,
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
    errorMessage: string,
    delayMs?: number
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
    const delayedPayload = delayMs !== undefined
        ? buildDelayedPayloadGeneric(
            validationResult.data as unknown as Record<string, unknown>,
            channel,
            0,
            delayMs
        )
        : buildDelayedPayloadGeneric(
            validationResult.data as unknown as Record<string, unknown>,
            channel,
            0
        );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await publishDelayed(delayedPayload as any);

    const isRateLimit = errorMessage.toLowerCase().includes('rate limit');
    const alertTitle = isRateLimit
        ? `INFO: RATE LIMIT EXCEEDED, SWITCHING TO FALLBACK\n`
        : `INFO: RETRY BUDGET EXHAUSTED, SWITCHING TO FALLBACK\n`;

    void AdminAlertService.sendAlert(
        'service_health',
        alertTitle +
        `Notification ID: ${notification.notification_id}\n` +
        `Channel: ${channel}\n` +
        `Primary provider: ${currentProviderId || 'default'}\n` +
        `Fallback provider: ${fallbackProviderId}\n` +
        `Error: ${errorMessage}\n` +
        `Action: Investigate the primary provider if this handoff becomes frequent.`,
        { severity: 'warning', notificationId: notification.notification_id, channel }
    );

    logger.warn(
        `[${channel}] Fallback handoff scheduled for provider ${currentProviderId || 'default'} to ${fallbackProviderId}: ${notification.notification_id}`
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
        if (!notification.provider_history) {
            notification.provider_history = [];
        }
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

        // 4. Rate limit check across the provider cascade
        const cascade = getProviderCascade(channel, rawData.provider);
        let selectedProviderId: string | null = null;
        let lastRateLimitResult: RateLimitResult | null = null;

        for (let i = 0; i < cascade.length; i++) {
            const candidateId = cascade[i];
            const rateLimitResult = await consumeToken(candidateId);

            if (rateLimitResult.allowed) {
                selectedProviderId = candidateId;
                if (i > 0) {
                    logger.info(`[${channel}] Cascade failover: '${cascade[0]}' rate-limited, using fallback '${candidateId}': ${notificationId}`);
                    void AdminAlertService.sendAlert('service_health',
                        `ℹ️ RATE LIMIT CASCADE: USING FALLBACK (${i + 1}/${cascade.length})\n` +
                        `Channel: ${channel}\n` +
                        `Notification ID: ${notificationId}\n` +
                        `Rate-limited providers: ${cascade.slice(0, i).join(', ')}\n` +
                        `Active fallback: ${candidateId}\n` +
                        `Action: Check primary provider rate limits if this persists.`,
                        { severity: 'info', notificationId, channel });
                }
                break;
            } else {
                lastRateLimitResult = rateLimitResult;
                const retryDelay = rateLimitResult.retryAfterMs ?? env.RATE_LIMIT_RETRY_DELAY_MS;
                notification.provider_history.push({
                    provider: candidateId,
                    status: 'rate_limited',
                    error_code: 'RATE_LIMITED',
                    error_message: `Provider '${candidateId}' rate limit exceeded (retry after ${retryDelay}ms)`,
                    retryable: true,
                    attempted_at: new Date()
                });
                logger.warn(`[${channel}] Provider '${candidateId}' rate limited (${i + 1}/${cascade.length}): ${notificationId}`);
            }
        }

        if (!selectedProviderId) {
            // All providers in cascade are rate-limited
            logger.warn(`[${channel}] All providers in cascade rate-limited: ${notificationId}`);

            const newRetryCount = notification.retry_count + 1;
            if (newRetryCount > env.MAX_RETRY_COUNT) {
                const currentProviderId = notification.provider || PluginRegistry.getDefaultProviderId(channel);
                logger.error(`[${channel}] Max retries exceeded (all cascade providers rate limited): ${notificationId}`);

                void AdminAlertService.sendAlert('failed_notification',
                    `❌ MAX RETRIES EXCEEDED (RATE LIMITED)\n` +
                    `Notification ID: ${notificationId}\n` +
                    `Channel: ${channel}\n` +
                    `Provider: ${currentProviderId || providerId || 'default'}\n` +
                    `Root cause: All cascade providers rate limit exhausted after ${env.MAX_RETRY_COUNT} retries\n` +
                    `Action: Check provider rate limits in simplens.config.yaml. Consider increasing limits or adding fallback provider.`,
                    { severity: 'critical', notificationId, channel });

                await setFailed(notificationId, validationResult.data.retry_count);
                await publishFailureStatus(notification, channel, 'Max retry count exceeded (rate limiting)');
                return true;
            }

            // Push to delayed queue using fixed retry delay from rate limiter
            await setRateLimited(notificationId, validationResult.data.retry_count);
            const retryDelay = lastRateLimitResult?.retryAfterMs ?? env.RATE_LIMIT_RETRY_DELAY_MS;
            const delayedPayload = buildDelayedPayloadGeneric(
                notification as unknown as Record<string, unknown>,
                channel,
                newRetryCount,
                retryDelay
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await publishDelayed(delayedPayload as any);
            logger.info(`[${channel}] Rate limited, scheduled retry in ${retryDelay}ms: ${notificationId} (retry ${newRetryCount})`);
            return true;
        }

        // If selected fallback provider differs from original provider, update notification provider
        if (selectedProviderId !== notification.provider) {
            notification.provider = selectedProviderId;
        }

        // 5. Send via plugin router (with auto-fallback)
        const result: DeliveryResult = await sendWithFallback(channel, notification);

        // Merge router dispatch attempts into provider_history
        if (result.attempts && result.attempts.length > 0) {
            notification.provider_history.push(...result.attempts);
        }

        // Update notification provider if result specifies the delivering/failing provider
        if (result.provider && result.provider !== notification.provider) {
            notification.provider = result.provider;
        }

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
                        status: NOTIFICATION_STATUS_SF.delivered,
                        provider: notification.provider,
                        provider_history: notification.provider_history,
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

    // Ensure the Kafka topic exists before attempting to subscribe
    await ensureChannelTopic(channel);

    const topic = getTopicForChannel(channel);
    const groupId = getConsumerGroupId(channel);

    logger.info(`[${channel}] Creating consumer for topic: ${topic}, group: ${groupId}`);

    const consumer = kafka.consumer({
        groupId,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
    });

    const health: ConsumerHealthState = {
        channel,
        isRunning: false,
        hasCrashed: false,
        lastHeartbeat: Date.now(),
    };
    consumerHealthState.set(channel, health);

    // Register Kafka lifecycle and crash event listeners
    if (typeof consumer.on === 'function' && consumer.events) {
        consumer.on(consumer.events.HEARTBEAT, () => {
            const h = consumerHealthState.get(channel);
            if (h) {
                h.lastHeartbeat = Date.now();
            }
        });

        consumer.on(consumer.events.CRASH, async (event: ConsumerCrashEvent) => {
            const h = consumerHealthState.get(channel);
            const crashError = event?.payload?.error;
            const errorMsg = crashError ? String(crashError.message || crashError) : 'Unknown crash';
            if (h) {
                h.hasCrashed = true;
                h.isRunning = false;
                h.crashReason = errorMsg;
            }
            logger.error(`[${channel}] Consumer CRASHED: ${errorMsg}`, crashError);

            void AdminAlertService.sendAlert(
                'service_health',
                `🔴 KAFKA CONSUMER CRASHED - Unified Processor\n` +
                `Channel: ${channel}\n` +
                `Group: ${groupId}\n` +
                `Restartable: ${Boolean(event?.payload?.restart)}\n` +
                `Error: ${errorMsg}\n` +
                `Action: Kubernetes liveness probe will detect failure and restart container.`,
                { severity: 'critical' }
            );
        });

        consumer.on(consumer.events.STOP, () => {
            const h = consumerHealthState.get(channel);
            if (h) {
                h.isRunning = false;
            }
            logger.warn(`[${channel}] Consumer stopped event received`);
        });

        consumer.on(consumer.events.DISCONNECT, () => {
            const h = consumerHealthState.get(channel);
            if (h) {
                h.isRunning = false;
            }
            logger.warn(`[${channel}] Consumer disconnected`);
        });

        consumer.on(consumer.events.CONNECT, () => {
            const h = consumerHealthState.get(channel);
            if (h) {
                h.isRunning = true;
                h.lastHeartbeat = Date.now();
            }
        });
    }
    
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

                const h = consumerHealthState.get(channel);
                if (h) {
                    h.lastHeartbeat = Date.now();
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

    health.isRunning = true;
    health.lastHeartbeat = Date.now();

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
    const health = consumerHealthState.get(channel);
    if (health) {
        health.isRunning = false;
    }

    try {
        await consumer.stop();
        await consumer.disconnect();
        consumers.delete(channel);
        consumingState.delete(channel);
        consumerHealthState.delete(channel);
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

/**
 * Get list of currently running consumer channels
 */
export const getActiveConsumerChannels = (): string[] => {
    return Array.from(consumers.keys());
};

/**
 * Check whether consumers for specified channels (or all active consumers) are healthy.
 * 
 * @param expectedChannels Optional list of channels expected to be running.
 * @param maxHeartbeatStalenessMs Max ms since last heartbeat before marking stalled (default 90s).
 */
export const areUnifiedConsumersHealthy = (
    expectedChannels?: string[],
    maxHeartbeatStalenessMs = 90000
): ConsumerHealthCheckResult => {
    const details: Record<string, ConsumerHealthDetails> = {};
    const now = Date.now();
    let allHealthy = true;

    const channelsToCheck = expectedChannels && expectedChannels.length > 0
        ? expectedChannels
        : Array.from(consumers.keys());

    // In standby mode (no channels expected/running), considered healthy
    if (channelsToCheck.length === 0) {
        return { healthy: true, details: {} };
    }

    for (const channel of channelsToCheck) {
        const health = consumerHealthState.get(channel);
        const consumer = consumers.get(channel);

        if (!health || !consumer) {
            details[channel] = {
                running: false,
                crashed: false,
                error: 'Consumer not initialized or missing',
                secondsSinceHeartbeat: -1
            };
            allHealthy = false;
            continue;
        }

        const secondsSinceHeartbeat = Math.round((now - health.lastHeartbeat) / 1000);

        if (health.hasCrashed) {
            details[channel] = {
                running: false,
                crashed: true,
                error: health.crashReason || 'Consumer crashed',
                secondsSinceHeartbeat
            };
            allHealthy = false;
            continue;
        }

        if (!health.isRunning) {
            details[channel] = {
                running: false,
                crashed: false,
                error: 'Consumer is stopped or disconnected',
                secondsSinceHeartbeat
            };
            allHealthy = false;
            continue;
        }

        if (now - health.lastHeartbeat > maxHeartbeatStalenessMs) {
            details[channel] = {
                running: true,
                crashed: false,
                error: `Heartbeat stalled (${secondsSinceHeartbeat}s ago)`,
                secondsSinceHeartbeat
            };
            allHealthy = false;
            continue;
        }

        details[channel] = {
            running: true,
            crashed: false,
            secondsSinceHeartbeat
        };
    }

    return { healthy: allHealthy, details };
};
