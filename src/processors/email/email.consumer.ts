/**
 * Email Consumer - Consumes from email_notification topic and processes emails
 */

import { Consumer, EachMessagePayload } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import { 
    TOPICS, 
    CHANNEL,
    NOTIFICATION_STATUS_SF,
    type email_notification,
    type notification_status_topic
} from '@src/types/types.js';
import { safeValidateEmailNotification } from '@src/types/schemas.js';
import { env } from '@src/config/env.config.js';
import { emailProcessorLogger as logger } from '@src/workers/utils/logger.js';

// Services
import { sendEmail } from './email.service.js';

// Shared utilities
import { tryAcquireProcessingLock, setDelivered, setFailed } from '@src/processors/shared/idempotency.js';
import { consumeToken } from '@src/processors/shared/rate-limiter.js';
import { publishStatus } from '@src/processors/shared/status.producer.js';
import { publishDelayed, buildDelayedPayloadFromEmail } from '@src/processors/shared/delayed.producer.js';

const CONSUMER_GROUP_ID = 'email-processor-group';

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
 * Process a single email notification message
 */
const processEmailMessage = async ({ partition, message }: EachMessagePayload): Promise<void> => {
    const messageOffset = message.offset;
    
    try {
        // 1. Parse message
        if (!message.value) {
            logger.warn(`Empty message at partition ${partition}, offset ${messageOffset}`);
            return;
        }

        const rawData = JSON.parse(message.value.toString());

        // 2. Validate with Zod schema
        const validationResult = safeValidateEmailNotification(rawData);
        if (!validationResult.success) {
            logger.error(`Invalid email notification schema at offset ${messageOffset}:`, validationResult.error.issues);
            return;
        }

        const notification = validationResult.data;
        const notificationId = notification.notification_id.toString();

        logger.info(`Processing email notification: ${notificationId} (retry: ${notification.retry_count})`);

        // 3. Atomic idempotency check and acquire processing lock
        const lockResult = await tryAcquireProcessingLock(notificationId);
        if (!lockResult.canProcess) {
            logger.info(`Skipping duplicate notification: ${notificationId} (already processed or in progress)`);
            return;
        }
        
        if (lockResult.isRetry) {
            logger.info(`Retrying previously failed notification: ${notificationId}`);
        }

        // 4. Rate limit check
        const rateLimitResult = await consumeToken(CHANNEL.email);
        
        if (!rateLimitResult.allowed) {
            logger.warn(`Rate limited for notification: ${notificationId}, retry after ${rateLimitResult.retryAfterMs}ms`);
            
            // Check max retry count
            const newRetryCount = notification.retry_count + 1;
            if (newRetryCount > env.MAX_RETRY_COUNT) {
                logger.error(`Max retries exceeded for notification: ${notificationId}`);
                await setFailed(notificationId);
                await publishFinalFailure(notification, 'Max retry count exceeded due to rate limiting');
                return;
            }

            // Push to delayed_notification topic for retry
            await setFailed(notificationId);
            const delayedPayload = buildDelayedPayloadFromEmail(notification, newRetryCount);
            await publishDelayed(delayedPayload);
            logger.info(`Pushed to delayed queue: ${notificationId} (retry ${newRetryCount})`);
            return;
        }

        // 6. Send email via Nodemailer
        const emailResult = await sendEmail(notification);

        if (emailResult.success) {
            // 7a. Success - Update Redis and publish status
            // Handle Redis update failure gracefully - email was already sent
            try {
                await setDelivered(notificationId);
            } catch (redisErr) {
                logger.error(`Failed to update idempotency status, but email was sent: ${notificationId}`, redisErr);
            }
            await publishSuccessStatus(notification);
            logger.success(`Email delivered: ${notificationId}`);
        } else {
            // 7b. Failure - Check retry count and push to delayed topic
            const newRetryCount = notification.retry_count + 1;
            
            if (newRetryCount > env.MAX_RETRY_COUNT) {
                logger.error(`Max retries exceeded for notification: ${notificationId}`);
                await setFailed(notificationId);
                await publishFinalFailure(notification, emailResult.error || 'Max retry count exceeded');
                return;
            }

            // Push to delayed_notification topic for retry
            await setFailed(notificationId);
            const delayedPayload = buildDelayedPayloadFromEmail(notification, newRetryCount);
            await publishDelayed(delayedPayload);
            logger.warn(`Email failed, pushed to delayed queue: ${notificationId} (retry ${newRetryCount})`);
        }

    } catch (err) {
        logger.error(`Error processing message at partition ${partition}, offset ${messageOffset}:`, err);
        // Don't throw - let consumer continue with next message
    }
};

/**
 * Build and publish success status
 */
const publishSuccessStatus = async (
    notification: email_notification
): Promise<void> => {
    const status: notification_status_topic = {
        notification_id: notification.notification_id,
        request_id: notification.request_id,
        client_id: notification.client_id,
        channel: CHANNEL.email,
        status: NOTIFICATION_STATUS_SF.delivered,
        message: 'Email sent successfully',
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
    notification: email_notification,
    errorMessage: string
): Promise<void> => {
    const status: notification_status_topic = {
        notification_id: notification.notification_id,
        request_id: notification.request_id,
        client_id: notification.client_id,
        channel: CHANNEL.email,
        status: NOTIFICATION_STATUS_SF.failed,
        message: errorMessage,
        retry_count: notification.retry_count,
        webhook_url: notification.webhook_url,
        created_at: new Date()
    };

    await publishStatus(status);
};

/**
 * Start the email consumer
 */
export const startEmailConsumer = async (): Promise<void> => {
    if (state.consumer) {
        logger.info('Email consumer already running');
        return;
    }

    state.consumer = kafka.consumer({
        groupId: CONSUMER_GROUP_ID,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
    });

    await state.consumer.connect();
    logger.info('Email consumer connected');

    await state.consumer.subscribe({
        topic: TOPICS.email_notification,
        fromBeginning: false
    });
    logger.info(`Subscribed to topic: ${TOPICS.email_notification}`);

    state.isConsuming = true;

    await state.consumer.run({
        eachMessage: processEmailMessage
    });

    logger.success('Email consumer started');
};

/**
 * Stop the email consumer gracefully
 */
export const stopEmailConsumer = async (): Promise<void> => {
    if (!state.consumer) {
        return;
    }

    logger.info('Stopping email consumer...');
    state.isConsuming = false;

    try {
        await state.consumer.stop();
        await state.consumer.disconnect();
        state.consumer = null;
        logger.success('Email consumer stopped');
    } catch (err) {
        logger.error('Error stopping email consumer:', err);
        throw err;
    }
};

/**
 * Check if consumer is running
 */
export const isEmailConsumerRunning = (): boolean => {
    return state.consumer !== null && state.isConsuming;
};
