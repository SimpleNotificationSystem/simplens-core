/**
 * Background Producer - Publishes outbox entries to Kafka
 * Channel-agnostic - routes based on dynamic topic field
 */

import { Producer, Partitioners } from "kafkajs";
import mongoose from "mongoose";
import { kafka } from "@src/config/kafka.config.js";
import { OUTBOX_STATUS, NOTIFICATION_STATUS, CORE_TOPICS, NOTIFICATION_STATUS_SF, type notification_status_topic } from "@src/types/types.js";
import outbox_model from "@src/database/models/outbox.models.js";
import notification_model from "@src/database/models/notification.models.js";
import status_outbox_model from "@src/database/models/status-outbox.models.js";
import { type status_outbox } from "@src/types/types.js";
import { producerLogger as logger } from "@src/workers/utils/logger.js";
import { validateAndGroupByTopic, type OutboxDocument, type ValidatedOutboxEntry } from "@src/workers/utils/validation.js";
import type { SendResult } from "@src/workers/utils/types.js";

let producer: Producer | null = null;

/**
 * Initialize the Kafka producer
 */
export const initProducer = async (): Promise<void> => {
    if (producer) {
        logger.info("Producer already initialized");
        return;
    }

    producer = kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
        allowAutoTopicCreation: false,
    });

    await producer.connect();
    logger.success("Kafka producer connected");
};

/**
 * Disconnect the Kafka producer
 */
export const disconnectProducer = async (): Promise<void> => {
    if (producer) {
        await producer.disconnect();
        producer = null;
        logger.success("Kafka producer disconnected");
    }
};

/**
 * Get the producer instance
 */
export const getProducer = (): Producer => {
    if (!producer) {
        throw new Error("Producer not initialized. Call initProducer() first.");
    }
    return producer;
};

/**
 * Update outbox and notification statuses after Kafka publish
 */
const updateStatusesAfterPublish = async (
    topic: string,
    entries: ValidatedOutboxEntry[]
): Promise<void> => {
    const outboxIds = entries.map(e => e._id);
    const notificationIds = entries.map(e => e.notification_id);

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await outbox_model.updateMany(
                { _id: { $in: outboxIds } },
                { status: OUTBOX_STATUS.published, updated_at: new Date() },
                { session }
            );

            // Skip notification status update for delayed notifications
            if (topic !== CORE_TOPICS.delayed_notification) {
                await notification_model.updateMany(
                    { _id: { $in: notificationIds } },
                    { status: NOTIFICATION_STATUS.processing, updated_at: new Date() },
                    { session }
                );
            }
        });
    } finally {
        await session.endSession();
    }
};

/**
 * Send a batch of entries to a single Kafka topic
 */
const sendToTopic = async (
    topic: string,
    entries: ValidatedOutboxEntry[]
): Promise<{ success: boolean; count: number }> => {
    try {
        const messages = entries.map(entry => ({
            key: entry.notification_id?.toString() || '',
            value: JSON.stringify(entry.payload)
        }));

        await producer!.send({
            topic,
            messages,
            acks: -1,
            timeout: 30000
        });
        logger.info(`Sent ${messages.length} messages to topic: ${topic}`);

        await updateStatusesAfterPublish(topic, entries);
        logger.info(`Updated ${entries.length} outbox entries to published`);

        return { success: true, count: entries.length };
    } catch (err) {
        logger.error(`Failed to send messages to topic ${topic}:`, err);
        return { success: false, count: entries.length };
    }
};

/**
 * Send outbox events to their respective Kafka topics
 */
export const sendOutboxEvents = async (outboxEntries: OutboxDocument[]): Promise<SendResult> => {
    if (!producer) {
        throw new Error("Producer not initialized");
    }

    if (outboxEntries.length === 0) {
        return { successCount: 0, failedCount: 0 };
    }

    const { groupedByTopic, validationFailedCount } = validateAndGroupByTopic(outboxEntries);

    let successCount = 0;
    let failedCount = validationFailedCount;

    for (const [topic, entries] of groupedByTopic) {
        const result = await sendToTopic(topic, entries);
        if (result.success) {
            successCount += result.count;
        } else {
            failedCount += result.count;
        }
    }

    return { successCount, failedCount };
};

/**
 * Send status outbox events to notification_status topic
 */
export const sendStatusOutboxEvents = async (statusEntries: status_outbox[]): Promise<SendResult> => {
    if (!producer) {
        throw new Error("Producer not initialized");
    }

    if (statusEntries.length === 0) {
        return { successCount: 0, failedCount: 0 };
    }

    let successCount = 0;
    let failedCount = 0;

    for (const entry of statusEntries) {
        try {
            const notification = await notification_model.findById(entry.notification_id);

            if (!notification) {
                logger.warn(`Notification ${entry.notification_id} not found for status outbox entry`);
                failedCount++;
                continue;
            }

            const statusPayload: notification_status_topic = {
                notification_id: notification._id,
                request_id: notification.request_id,
                client_id: notification.client_id,
                channel: notification.channel,
                status: entry.status as NOTIFICATION_STATUS_SF,
                message: entry.status === 'delivered'
                    ? 'Recovered by recovery service - ghost delivery'
                    : 'Failed after recovery check',
                retry_count: notification.retry_count,
                webhook_url: notification.webhook_url,
                created_at: new Date()
            };

            await producer.send({
                topic: CORE_TOPICS.notification_status,
                messages: [{
                    key: notification._id.toString(),
                    value: JSON.stringify(statusPayload)
                }],
                acks: -1,
                timeout: 30000
            });

            await status_outbox_model.updateOne(
                { _id: entry._id },
                { processed: true, updated_at: new Date() }
            );

            logger.info(`Published status update for notification ${notification._id}: ${entry.status}`);
            successCount++;
        } catch (err) {
            logger.error(`Failed to publish status for entry ${entry._id}:`, err);
            failedCount++;
        }
    }

    return { successCount, failedCount };
};
