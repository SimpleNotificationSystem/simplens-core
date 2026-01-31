import { Consumer, EachMessagePayload } from "kafkajs";
import { kafka } from "@src/config/kafka.config.js";
import { CORE_TOPICS, NOTIFICATION_STATUS, NOTIFICATION_STATUS_SF, type notification_status_topic } from "@src/types/types.js";
import { safeValidateNotificationStatusTopic } from "@src/types/schemas.js";
import notification_model from "@src/database/models/notification.models.js";
import { consumerLogger as logger } from "@src/workers/utils/logger.js";

const CONSUMER_GROUP_ID = "notification-status-group";

// Webhook configuration
const WEBHOOK_TIMEOUT_MS = 30000; // 30 seconds

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
 * Send webhook callback to client's webhook_url
 * Single attempt - logs success or error, no action taken on failure
 */
const sendWebhookCallback = (
    webhookUrl: string,
    payload: ReturnType<typeof buildWebhookPayload>,
    notificationId: string
): void => {
    logger.info(`Sending webhook to ${webhookUrl} for ${notificationId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
    })
        .then(response => {
            clearTimeout(timeoutId);
            if (response.ok) {
                logger.success(`Webhook delivered for ${notificationId}`);
            } else {
                logger.error(`Webhook failed for ${notificationId}: ${response.status} ${response.statusText}`);
            }
        })
        .catch(err => {
            clearTimeout(timeoutId);
            const errorMessage = err instanceof Error ? err.message : String(err);
            const errorName = err instanceof Error ? err.name : 'Unknown';

            if (err instanceof Error && err.name === 'AbortError') {
                logger.error(`Webhook timeout after ${WEBHOOK_TIMEOUT_MS}ms for ${notificationId}`);
            } else {
                logger.error(`Webhook error for ${notificationId}: ${errorName} - ${errorMessage}`);
            }
        });
};

/**
 * Result of processing a status message
 */
interface ProcessResult {
    dbUpdated: boolean;
    webhookUrl?: string;
    webhookPayload?: ReturnType<typeof buildWebhookPayload>;
    notificationId?: string;
}

/**
 * Process a single status message
 * Returns result indicating if DB was updated and webhook info
 */
const processStatusMessage = async ({ partition, message }: EachMessagePayload): Promise<ProcessResult> => {
    try {
        if (!message.value) {
            logger.warn("Received empty message, skipping");
            return { dbUpdated: false };
        }

        const statusData = JSON.parse(message.value.toString());
        const validationResult = safeValidateNotificationStatusTopic(statusData);

        if (!validationResult.success) {
            logger.error("Invalid status message schema:", validationResult.error.issues);
            return { dbUpdated: false };
        }

        const data = validationResult.data;
        logger.info(`Received status update: notification_id=${data.notification_id}, status=${data.status}`);

        const newStatus = mapToNotificationStatus(data.status);
        const updateData: Record<string, unknown> = {
            status: newStatus,
            retry_count: data.retry_count,
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

            // Return success with webhook info
            return {
                dbUpdated: true,
                webhookUrl: data.webhook_url,
                webhookPayload: data.webhook_url ? buildWebhookPayload(data) : undefined,
                notificationId: data.notification_id.toString()
            };
        } else {
            logger.warn(`Notification ${data.notification_id} not found`);
            return { dbUpdated: false };
        }
    } catch (err) {
        logger.error(`Error processing status message from partition ${partition}:`, err);
        return { dbUpdated: false };
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
        topic: CORE_TOPICS.notification_status,
        fromBeginning: false
    });
    logger.info(`Subscribed to topic: ${CORE_TOPICS.notification_status}`);

    state.isConsuming = true;

    await state.consumer.run({
        autoCommit: false,
        eachMessage: async (payload) => {
            try {
                const result = await processStatusMessage(payload);

                // Only commit if MongoDB update succeeded
                if (result.dbUpdated) {
                    try {
                        await state.consumer!.commitOffsets([{
                            topic: payload.topic,
                            partition: payload.partition,
                            offset: (BigInt(payload.message.offset) + 1n).toString()
                        }]);
                    } catch (commitErr) {
                        logger.error(`Failed to commit offset for partition ${payload.partition}:`, commitErr);
                        // Don't throw - consumer continues
                    }

                    // Send webhook after commit (fire-and-forget)
                    if (result.webhookUrl && result.webhookPayload && result.notificationId) {
                        sendWebhookCallback(result.webhookUrl, result.webhookPayload, result.notificationId);
                    } else if (!result.webhookUrl) {
                        logger.warn(`No webhook_url provided for notification ${result.notificationId}`);
                    }
                }
            } catch (err) {
                logger.error(`Error in message handler for partition ${payload.partition}:`, err);
                // Don't commit - message will be redelivered
            }
        }
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
