/**
 * DLQ Status Publisher - Publishes failure status when events are sent to Dead Letter Queue
 * This ensures MongoDB is updated so admin dashboard can show failed events
 */

import { Producer, Partitioners } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import {
    TOPICS,
    CHANNEL,
    NOTIFICATION_STATUS_SF,
    DELAYED_TOPICS,
    type notification_status_topic,
    type delayed_notification_topic
} from '@src/types/types.js';
import { delayedWorkerLogger as logger } from '@src/workers/utils/logger.js';

let producer: Producer | null = null;

/**
 * Initialize the DLQ status producer
 */
export const initDLQStatusProducer = async (): Promise<void> => {
    if (producer) {
        return;
    }

    producer = kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
        allowAutoTopicCreation: false,
    });

    await producer.connect();
    logger.success('DLQ status producer connected');
};

/**
 * Publish failure status when an event is sent to DLQ
 * This updates MongoDB via the status worker so admin dashboard sees the failure
 */
export const publishDLQFailureStatus = async (
    event: delayed_notification_topic,
    errorMessage: string
): Promise<void> => {
    if (!producer) {
        throw new Error('DLQ status producer not initialized. Call initDLQStatusProducer() first.');
    }

    // Determine channel from target_topic
    const channel = event.target_topic === DELAYED_TOPICS.email_notification
        ? CHANNEL.email
        : CHANNEL.whatsapp;

    const status: notification_status_topic = {
        notification_id: event.notification_id,
        request_id: event.request_id,
        client_id: event.client_id,
        channel: channel,
        status: NOTIFICATION_STATUS_SF.failed,
        message: `DLQ: ${errorMessage}`,
        retry_count: event.payload.retry_count,
        webhook_url: event.payload.webhook_url,
        created_at: new Date()
    };

    await producer.send({
        topic: TOPICS.notification_status,
        messages: [{
            key: status.notification_id.toString(),
            value: JSON.stringify(status)
        }]
    });

    logger.info(`Published DLQ failure status to notification_status topic: ${event.notification_id}`);
};

/**
 * Disconnect the DLQ status producer
 */
export const disconnectDLQStatusProducer = async (): Promise<void> => {
    if (producer) {
        await producer.disconnect();
        producer = null;
        logger.info('DLQ status producer disconnected');
    }
};
