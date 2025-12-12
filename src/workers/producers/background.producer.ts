import { Producer, Partitioners } from "kafkajs";
import mongoose from "mongoose";
import { kafka } from "@src/config/kafka.config.js";
import { OUTBOX_STATUS, NOTIFICATION_STATUS, OUTBOX_TOPICS } from "@src/types/types.js";
import outbox_model from "@src/database/models/outbox.models.js";
import notification_model from "@src/database/models/notification.models.js";
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
 * Get the producer instance (throws if not initialized)
 */
export const getProducer = (): Producer => {
    if (!producer) {
        throw new Error("Producer not initialized. Call initProducer() first.");
    }
    return producer;
};

/**
 * Update outbox and notification statuses atomically after Kafka publish
 */
const updateStatusesAfterPublish = async (
    topic: OUTBOX_TOPICS,
    entries: ValidatedOutboxEntry[]
): Promise<void> => {
    const outboxIds = entries.map(e => e._id);
    const notificationIds = entries.map(e => e.notification_id);

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            // Mark outbox entries as published
            await outbox_model.updateMany(
                { _id: { $in: outboxIds } },
                { status: OUTBOX_STATUS.published, updated_at: new Date() },
                { session }
            );

            // Update notification status to processing (skip for delayed notifications)
            if (topic !== OUTBOX_TOPICS.delayed_notification) {
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
    topic: OUTBOX_TOPICS,
    entries: ValidatedOutboxEntry[]
): Promise<{ success: boolean; count: number }> => {
    try {
        const messages = entries.map(entry => ({
            key: entry.notification_id.toString(),
            value: JSON.stringify(entry.payload)
        }));

        // Use acks: -1 for durability - wait for all in-sync replicas
        await producer!.send({
            topic,
            messages,
            acks: -1,  // Wait for all replicas to acknowledge
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
 * and update outbox + notification statuses atomically
 */
export const sendOutboxEvents = async (outboxEntries: OutboxDocument[]): Promise<SendResult> => {
    if (!producer) {
        throw new Error("Producer not initialized");
    }

    if (outboxEntries.length === 0) {
        return { successCount: 0, failedCount: 0 };
    }

    // Validate and group entries by topic
    const { groupedByTopic, validationFailedCount } = validateAndGroupByTopic(outboxEntries);

    let successCount = 0;
    let failedCount = validationFailedCount;

    // Process each topic group
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
