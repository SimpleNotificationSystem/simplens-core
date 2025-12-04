import { Consumer, EachMessagePayload } from "kafkajs";
import { kafka } from "@src/config/kafka.config.js";
import { TOPICS, NOTIFICATION_STATUS, NOTIFICATION_STATUS_SF } from "@src/types/types.js";
import { safeValidateNotificationStatusTopic } from "@src/types/schemas.js";
import notification_model from "@src/database/models/notification.models.js";
import { consumerLogger as logger } from "@src/workers/utils/logger.js";

const CONSUMER_GROUP_ID = "notification-status-group";

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
        } else {
            logger.warn(`Notification ${data.notification_id} not found`);
        }

        // TODO (future): Call webhook_url to notify client about status change
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
