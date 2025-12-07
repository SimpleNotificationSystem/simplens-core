/**
 * Delayed Producer - Publishes notifications for delayed retry
 */

import { Producer, Partitioners } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import {
    TOPICS,
    DELAYED_TOPICS,
    type delayed_notification_topic,
    type email_notification,
    type whatsapp_notification
} from '@src/types/types.js';

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
 * Calculate quadratic backoff delay in seconds
 * delay = retry_count^2 seconds
 */
const calculateBackoffDelay = (retryCount: number): number => {
    return retryCount ** 2;
};

/**
 * Build delayed notification payload from email notification
 */
export const buildDelayedPayloadFromEmail = (
    notification: email_notification,
    newRetryCount: number
): delayed_notification_topic => {
    const delaySeconds = calculateBackoffDelay(newRetryCount);

    return {
        notification_id: notification.notification_id,
        request_id: notification.request_id,
        client_id: notification.client_id,
        scheduled_at: new Date(Date.now() + delaySeconds * 1000),
        target_topic: DELAYED_TOPICS.email_notification,
        payload: {
            ...notification,
            retry_count: newRetryCount
        },
        created_at: new Date()
    };
};

/**
 * Build delayed notification payload from whatsapp notification
 */
export const buildDelayedPayloadFromWhatsapp = (
    notification: whatsapp_notification,
    newRetryCount: number
): delayed_notification_topic => {
    const delaySeconds = calculateBackoffDelay(newRetryCount);

    return {
        notification_id: notification.notification_id,
        request_id: notification.request_id,
        client_id: notification.client_id,
        scheduled_at: new Date(Date.now() + delaySeconds * 1000),
        target_topic: DELAYED_TOPICS.whatsapp_notification,
        payload: {
            ...notification,
            retry_count: newRetryCount
        },
        created_at: new Date()
    };
};

/**
 * Publish notification to delayed_notification topic for later retry
 */
export const publishDelayed = async (payload: delayed_notification_topic): Promise<void> => {
    if (!producer) {
        throw new Error('Delayed producer not initialized. Call initDelayedProducer() first.');
    }

    await producer.send({
        topic: TOPICS.delayed_notification,
        messages: [{
            key: payload.notification_id.toString(),
            value: JSON.stringify(payload)
        }]
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
