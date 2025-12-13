/**
 * WhatsApp Consumer - Consumes from whatsapp_notification topic and processes messages
 */

import { Consumer, EachMessagePayload } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import {
    TOPICS,
    CHANNEL,
    NOTIFICATION_STATUS_SF,
    type whatsapp_notification,
    type notification_status_topic
} from '@src/types/types.js';
import { safeValidateWhatsappNotification } from '@src/types/schemas.js';
import { env } from '@src/config/env.config.js';
import { whatsappProcessorLogger as logger } from '@src/workers/utils/logger.js';

// Services
import { sendWhatsApp } from './whatsapp.service.js';

// Shared utilities
import { tryAcquireProcessingLock, setDelivered, setFailed } from '@src/processors/shared/idempotency.js';
import { consumeToken } from '@src/processors/shared/rate-limiter.js';
import { publishStatus } from '@src/processors/shared/status.producer.js';
import { publishDelayed, buildDelayedPayloadFromWhatsapp } from '@src/processors/shared/delayed.producer.js';

const CONSUMER_GROUP_ID = 'whatsapp-processor-group';

// Consumer state
interface ConsumerState {
    consumer: Consumer | null;
    isConsuming: boolean;
}

const state: ConsumerState = {
    consumer: null,
    isConsuming: false
};

/**
 * Process a single WhatsApp notification message
 * Returns true if processing completed successfully (commit offset)
 * Returns false if processing failed critically and should NOT commit (will be redelivered)
 */
const processWhatsAppMessage = async ({ partition, message }: EachMessagePayload): Promise<boolean> => {
    const messageOffset = message.offset;

    try {
        // 1. Parse message
        if (!message.value) {
            logger.warn(`Empty message at partition ${partition}, offset ${messageOffset}`);
            return true; // Skip empty messages, commit offset
        }

        const rawData = JSON.parse(message.value.toString());

        // 2. Validate with Zod schema
        const validationResult = safeValidateWhatsappNotification(rawData);
        if (!validationResult.success) {
            logger.error(`Invalid whatsapp notification schema at offset ${messageOffset}:`, validationResult.error.issues);
            return true; // Skip invalid messages, commit offset (don't retry bad data)
        }

        const notification = validationResult.data;
        const notificationId = notification.notification_id.toString();

        logger.info(`Processing WhatsApp notification: ${notificationId} (retry: ${notification.retry_count})`);

        // 3. Atomic idempotency check and acquire processing lock
        const lockResult = await tryAcquireProcessingLock(notificationId);
        if (!lockResult.canProcess) {
            logger.info(`Skipping duplicate notification: ${notificationId} (already processed or in progress)`);
            return true; // Already handled, commit offset
        }

        if (lockResult.isRetry) {
            logger.info(`Retrying previously failed notification: ${notificationId}`);
        }

        // 4. Rate limit check
        const rateLimitResult = await consumeToken(CHANNEL.whatsapp);

        if (!rateLimitResult.allowed) {
            logger.warn(`Rate limited for notification: ${notificationId}, retry after ${rateLimitResult.retryAfterMs}ms`);

            // Check max retry count
            const newRetryCount = notification.retry_count + 1;
            if (newRetryCount > env.MAX_RETRY_COUNT) {
                logger.error(`Max retries exceeded for notification: ${notificationId}`);
                await setFailed(notificationId);
                await publishFinalFailure(notification, 'Max retry count exceeded due to rate limiting');
                return true; // Final state reached, commit offset
            }

            // Push to delayed_notification topic for retry
            await setFailed(notificationId);
            const delayedPayload = buildDelayedPayloadFromWhatsapp(notification, newRetryCount);
            await publishDelayed(delayedPayload);
            logger.info(`Pushed to delayed queue: ${notificationId} (retry ${newRetryCount})`);
            return true; // Successfully queued for retry, commit offset
        }

        // 5. Send WhatsApp via service
        const whatsappResult = await sendWhatsApp(notification);

        if (whatsappResult.success) {
            // 6a. Success - Update Redis and publish status
            // CRITICAL: Update idempotency status IMMEDIATELY after send
            try {
                await setDelivered(notificationId);
            } catch (redisErr) {
                // Redis failed but message was sent - log but continue
                // This is a "ghost delivery" scenario - requires manual intervention
                logger.error(`Failed to update idempotency status, but message was sent: ${notificationId}`, redisErr);
            }

            // Publish status to Kafka
            try {
                await publishSuccessStatus(notification);
            } catch (kafkaErr) {
                // Status publish failed - log but commit offset since message was sent
                logger.error(`Failed to publish success status: ${notificationId}`, kafkaErr);
            }

            logger.success(`WhatsApp delivered: ${notificationId}`);
            return true; // Message sent, commit offset
        } else {
            // 6b. Failure - Check retry count and push to delayed topic
            const newRetryCount = notification.retry_count + 1;

            if (newRetryCount > env.MAX_RETRY_COUNT) {
                logger.error(`Max retries exceeded for notification: ${notificationId}`);
                await setFailed(notificationId);
                await publishFinalFailure(notification, whatsappResult.error || 'Max retry count exceeded');
                return true; // Final state reached, commit offset
            }

            // Push to delayed_notification topic for retry
            await setFailed(notificationId);
            const delayedPayload = buildDelayedPayloadFromWhatsapp(notification, newRetryCount);
            await publishDelayed(delayedPayload);
            logger.warn(`WhatsApp failed, pushed to delayed queue: ${notificationId} (retry ${newRetryCount})`);
            return true; // Successfully queued for retry, commit offset
        }

    } catch (err) {
        logger.error(`Error processing message at partition ${partition}, offset ${messageOffset}:`, err);
        // Return false to NOT commit offset - message will be redelivered
        // This handles crashes during Redis/Kafka operations
        return false;
    }
};

/**
 * Build and publish success status
 */
const publishSuccessStatus = async (
    notification: whatsapp_notification
): Promise<void> => {
    const status: notification_status_topic = {
        notification_id: notification.notification_id,
        request_id: notification.request_id,
        client_id: notification.client_id,
        channel: CHANNEL.whatsapp,
        status: NOTIFICATION_STATUS_SF.delivered,
        message: 'WhatsApp message sent successfully',
        retry_count: notification.retry_count,
        webhook_url: notification.webhook_url,
        created_at: new Date()
    };

    await publishStatus(status);
};

/**
 * Build and publish final failure status (after max retries)
 */
const publishFinalFailure = async (
    notification: whatsapp_notification,
    errorMessage: string
): Promise<void> => {
    const status: notification_status_topic = {
        notification_id: notification.notification_id,
        request_id: notification.request_id,
        client_id: notification.client_id,
        channel: CHANNEL.whatsapp,
        status: NOTIFICATION_STATUS_SF.failed,
        message: errorMessage,
        retry_count: notification.retry_count,
        webhook_url: notification.webhook_url,
        created_at: new Date()
    };

    await publishStatus(status);
};

/**
 * Start the WhatsApp consumer with manual offset commit
 */
export const startWhatsAppConsumer = async (): Promise<void> => {
    if (state.consumer) {
        logger.info('WhatsApp consumer already running');
        return;
    }

    state.consumer = kafka.consumer({
        groupId: CONSUMER_GROUP_ID,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
    });

    await state.consumer.connect();
    logger.info('WhatsApp consumer connected');

    await state.consumer.subscribe({
        topic: TOPICS.whatsapp_notification,
        fromBeginning: false
    });
    logger.info(`Subscribed to topic: ${TOPICS.whatsapp_notification}`);

    state.isConsuming = true;

    // Use autoCommit: false for manual offset management
    await state.consumer.run({
        autoCommit: false,
        eachMessage: async (payload) => {
            const shouldCommit = await processWhatsAppMessage(payload);

            if (shouldCommit && state.consumer) {
                // Commit offset only after successful processing
                await state.consumer.commitOffsets([{
                    topic: payload.topic,
                    partition: payload.partition,
                    offset: (BigInt(payload.message.offset) + 1n).toString()
                }]);
            } else if (!shouldCommit) {
                // Processing failed - do not commit, message will be redelivered
                logger.warn(`Not committing offset for partition ${payload.partition}, offset ${payload.message.offset} - will be redelivered`);
            }
        }
    });

    logger.success('WhatsApp consumer started with manual offset commit');
};

/**
 * Stop the WhatsApp consumer gracefully
 */
export const stopWhatsAppConsumer = async (): Promise<void> => {
    if (!state.consumer) {
        return;
    }

    logger.info('Stopping WhatsApp consumer...');
    state.isConsuming = false;

    try {
        await state.consumer.stop();
        await state.consumer.disconnect();
        state.consumer = null;
        logger.success('WhatsApp consumer stopped');
    } catch (err) {
        logger.error('Error stopping WhatsApp consumer:', err);
        throw err;
    }
};

/**
 * Check if consumer is running
 */
export const isWhatsAppConsumerRunning = (): boolean => {
    return state.consumer !== null && state.isConsuming;
};
