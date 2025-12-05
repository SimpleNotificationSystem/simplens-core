import { Consumer, EachMessagePayload } from "kafkajs";
import { kafka } from "@src/config/kafka.config.js";
import { TOPICS, NOTIFICATION_STATUS, NOTIFICATION_STATUS_SF, type notification_status_topic } from "@src/types/types.js";
import { safeValidateNotificationStatusTopic } from "@src/types/schemas.js";
import notification_model from "@src/database/models/notification.models.js";
import { consumerLogger as logger } from "@src/workers/utils/logger.js";

const CONSUMER_GROUP_ID = "notification-status-group";

// Webhook configuration
const WEBHOOK_TIMEOUT_MS = 30000; // 30 seconds
const WEBHOOK_MAX_RETRIES = 3;
const WEBHOOK_RETRY_DELAY_MS = 1000; // 1 second base delay

// Consumer state management
interface ConsumerState {
    consumer: Consumer | null;
    isConsuming: boolean;
}

const state: ConsumerState = {
    consumer: null,
    isConsuming: false
};

/**
 * Map status from external format to internal notification status
 */
const mapToNotificationStatus = (externalStatus: NOTIFICATION_STATUS_SF): NOTIFICATION_STATUS => {
    return externalStatus === NOTIFICATION_STATUS_SF.delivered
        ? NOTIFICATION_STATUS.delivered
        : NOTIFICATION_STATUS.failed;
};

/**
 * Build webhook payload from status data
 */
const buildWebhookPayload = (data: notification_status_topic) => ({
    request_id: data.request_id,
    client_id: data.client_id,
    notification_id: data.notification_id.toString(),
    status: data.status === NOTIFICATION_STATUS_SF.delivered ? "DELIVERED" : "FAILED",
    channel: data.channel,
    message: data.message,
    occurred_at: data.created_at.toISOString()
});

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Send webhook callback to client's webhook_url
 * Implements retry logic with exponential backoff for 5xx errors
 */
const sendWebhookCallback = async (
    webhookUrl: string,
    payload: ReturnType<typeof buildWebhookPayload>,
    notificationId: string
): Promise<boolean> => {
    logger.info(`Sending webhook to ${webhookUrl} for ${notificationId}`);
    
    for (let attempt = 1; attempt <= WEBHOOK_MAX_RETRIES; attempt++) {
        try {
            logger.info(`Webhook attempt ${attempt}/${WEBHOOK_MAX_RETRIES} for ${notificationId}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Attempt': attempt.toString()
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            logger.info(`Webhook response status: ${response.status} for ${notificationId}`);

            if (response.ok) {
                logger.success(`Webhook delivered for ${notificationId} (attempt ${attempt})`);
                return true;
            }

            // Retry on 5xx errors
            if (response.status >= 500 && attempt < WEBHOOK_MAX_RETRIES) {
                const delay = WEBHOOK_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                logger.warn(`Webhook returned ${response.status} for ${notificationId}, retrying in ${delay}ms (attempt ${attempt}/${WEBHOOK_MAX_RETRIES})`);
                await sleep(delay);
                continue;
            }

            // Don't retry on 4xx errors
            if (response.status >= 400 && response.status < 500) {
                logger.error(`Webhook rejected for ${notificationId}: ${response.status} ${response.statusText}`);
                return false;
            }

            logger.error(`Webhook failed for ${notificationId}: ${response.status} ${response.statusText}`);
            return false;

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const errorName = err instanceof Error ? err.name : 'Unknown';
            
            logger.error(`Webhook error for ${notificationId} (attempt ${attempt}/${WEBHOOK_MAX_RETRIES}): ${errorName} - ${errorMessage}`);
            
            if (err instanceof Error && err.name === 'AbortError') {
                logger.error(`Webhook timeout after ${WEBHOOK_TIMEOUT_MS}ms for ${notificationId}`);
            }

            // Retry on network errors
            if (attempt < WEBHOOK_MAX_RETRIES) {
                const delay = WEBHOOK_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                logger.info(`Retrying webhook in ${delay}ms...`);
                await sleep(delay);
                continue;
            }

            return false;
        }
    }

    return false;
};

/**
 * Process a single status message
 */
const processStatusMessage = async ({ partition, message }: EachMessagePayload): Promise<void> => {
    try {
        if (!message.value) {
            logger.warn("Received empty message, skipping");
            return;
        }

        const statusData = JSON.parse(message.value.toString());
        const validationResult = safeValidateNotificationStatusTopic(statusData);

        if (!validationResult.success) {
            logger.error("Invalid status message schema:", validationResult.error.issues);
            return;
        }

        const data = validationResult.data;
        logger.info(`Received status update: notification_id=${data.notification_id}, status=${data.status}`);

        const newStatus = mapToNotificationStatus(data.status);
        const updateData: Record<string, unknown> = {
            status: newStatus,
            updated_at: new Date()
        };

        // Store error message if failed
        if (newStatus === NOTIFICATION_STATUS.failed) {
            updateData.error_message = data.message;
        }

        const result = await notification_model.findByIdAndUpdate(
            data.notification_id,
            updateData,
            { new: true }
        );

        if (result) {
            logger.success(`Updated notification ${data.notification_id} to status: ${newStatus}`);
            
            // Send webhook callback to notify client about status change
            logger.info(`Webhook URL from status message: ${data.webhook_url || '(not provided)'}`);
            
            if (data.webhook_url) {
                const webhookPayload = buildWebhookPayload(data);
                const webhookSent = await sendWebhookCallback(
                    data.webhook_url,
                    webhookPayload,
                    data.notification_id.toString()
                );
                
                if (!webhookSent) {
                    logger.warn(`Failed to deliver webhook for ${data.notification_id} after ${WEBHOOK_MAX_RETRIES} attempts`);
                    // Note: We don't fail the status update if webhook fails
                    // The notification status is already updated in MongoDB
                }
            } else {
                logger.warn(`No webhook_url provided for notification ${data.notification_id}`);
            }
        } else {
            logger.warn(`Notification ${data.notification_id} not found`);
        }
    } catch (err) {
        logger.error(`Error processing status message from partition ${partition}:`, err);
        // Don't throw - let the consumer continue processing other messages
    }
};

/**
 * Initialize and start the status consumer
 */
export const startStatusConsumer = async (): Promise<void> => {
    if (state.consumer) {
        logger.info("Status consumer already running");
        return;
    }

    state.consumer = kafka.consumer({
        groupId: CONSUMER_GROUP_ID,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
    });

    await state.consumer.connect();
    logger.info("Status consumer connected");

    await state.consumer.subscribe({
        topic: TOPICS.notification_status,
        fromBeginning: false
    });
    logger.info(`Subscribed to topic: ${TOPICS.notification_status}`);

    state.isConsuming = true;

    await state.consumer.run({
        eachMessage: processStatusMessage
    });

    logger.success("Status consumer started");
};

/**
 * Stop the status consumer gracefully
 */
export const stopStatusConsumer = async (): Promise<void> => {
    if (!state.consumer) return;

    logger.info("Stopping status consumer...");
    state.isConsuming = false;

    try {
        await state.consumer.stop();
        await state.consumer.disconnect();
        state.consumer = null;
        logger.success("Status consumer stopped");
    } catch (err) {
        logger.error("Error stopping status consumer:", err);
        throw err;
    }
};

/**
 * Check if the consumer is running
 */
export const isStatusConsumerRunning = (): boolean => {
    return state.consumer !== null && state.isConsuming;
};
