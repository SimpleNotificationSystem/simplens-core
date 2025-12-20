/**
 * DLQ Status Publisher - Publishes failure status when events are sent to Dead Letter Queue
 * Channel-agnostic - extracts channel from target_topic
 */

import { Producer, Partitioners } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import {
    CORE_TOPICS,
    NOTIFICATION_STATUS_SF,
    type notification_status_topic,
    type delayed_notification_topic
} from '@src/types/types.js';
import { delayedWorkerLogger as logger } from '@src/workers/utils/logger.js';

let producer: Producer | null = null;

/**
 * Extract channel from target_topic (e.g., "email_notification" -> "email")
 */
const extractChannelFromTopic = (targetTopic: string): string => {
    return targetTopic.replace('_notification', '');
};

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
 */
export const publishDLQFailureStatus = async (
    event: delayed_notification_topic,
    errorMessage: string
): Promise<void> => {
    if (!producer) {
        throw new Error('DLQ status producer not initialized. Call initDLQStatusProducer() first.');
    }

    // Extract channel from target_topic dynamically
    const channel = extractChannelFromTopic(event.target_topic);
    const payload = event.payload as Record<string, unknown>;

    const status: notification_status_topic = {
        notification_id: event.notification_id,
        request_id: event.request_id,
        client_id: event.client_id,
        channel: channel,
        status: NOTIFICATION_STATUS_SF.failed,
        message: `DLQ: ${errorMessage}`,
        retry_count: (payload.retry_count as number) || 0,
        webhook_url: (payload.webhook_url as string) || '',
        created_at: new Date()
    };

    await producer.send({
        topic: CORE_TOPICS.notification_status,
        messages: [{
            key: status.notification_id?.toString() || '',
            value: JSON.stringify(status)
        }]
    });

    logger.info(`Published DLQ failure status: ${event.notification_id}`);
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
