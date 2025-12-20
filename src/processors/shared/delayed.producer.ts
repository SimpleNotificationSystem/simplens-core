/**
 * Delayed Producer - Publishes notifications for delayed retry
 */

import { Producer, Partitioners } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import { CORE_TOPICS, getTopicForChannel, type delayed_notification_topic } from '@src/types/types.js';

let producer: Producer | null = null;

/**
 * Initialize the delayed producer
 */
export const initDelayedProducer = async (): Promise<void> => {
    if (producer) {
        return;
    }

    producer = kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
        allowAutoTopicCreation: false,
    });

    await producer.connect();
};

/**
 * Calculate exponential backoff delay in milliseconds
 */
const calculateBackoffDelay = (retryCount: number): number => {
    const baseDelay = 1000; // 1 second
    const maxDelay = 300000; // 5 minutes
    return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
};

/**
 * Build delayed notification payload from any channel's notification
 */
export const buildDelayedPayload = (
    notification: Record<string, unknown>,
    channel: string,
    newRetryCount: number
): delayed_notification_topic => {
    const delay = calculateBackoffDelay(newRetryCount);

    return {
        notification_id: notification.notification_id,
        request_id: notification.request_id,
        client_id: notification.client_id,
        scheduled_at: new Date(Date.now() + delay),
        target_topic: getTopicForChannel(channel),
        payload: {
            ...notification,
            retry_count: newRetryCount
        },
        created_at: new Date()
    } as delayed_notification_topic;
};

// Alias for backward compatibility
export const buildDelayedPayloadGeneric = buildDelayedPayload;

/**
 * Publish notification to delayed_notification topic for later retry
 */
export const publishDelayed = async (payload: delayed_notification_topic): Promise<void> => {
    if (!producer) {
        throw new Error('Delayed producer not initialized. Call initDelayedProducer() first.');
    }

    await producer.send({
        topic: CORE_TOPICS.delayed_notification,
        messages: [{
            key: payload.notification_id?.toString() || '',
            value: JSON.stringify(payload)
        }],
        acks: -1,
        timeout: 30000
    });
};

/**
 * Disconnect the delayed producer
 */
export const disconnectDelayedProducer = async (): Promise<void> => {
    if (producer) {
        await producer.disconnect();
        producer = null;
    }
};
