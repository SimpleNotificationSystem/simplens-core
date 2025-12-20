/**
 * Target Producer - Publishes delayed notifications to their target topics
 * Channel-agnostic - routes to dynamic topic based on target_topic field
 */

import { Producer, Partitioners } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import { delayedWorkerLogger as logger } from '@src/workers/utils/logger.js';

let producer: Producer | null = null;

/**
 * Initialize the target producer
 */
export const initTargetProducer = async (): Promise<void> => {
    if (producer) {
        logger.warn('Target producer already initialized');
        return;
    }

    producer = kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
        allowAutoTopicCreation: false,
    });

    await producer.connect();
    logger.success('Target producer connected');
};

/**
 * Publish a notification to its target topic
 */
export const publishToTarget = async (
    targetTopic: string,
    payload: Record<string, unknown>
): Promise<void> => {
    if (!producer) {
        throw new Error('Target producer not initialized. Call initTargetProducer() first.');
    }

    const notificationId = payload.notification_id?.toString() || '';

    await producer.send({
        topic: targetTopic,
        messages: [
            {
                key: notificationId,
                value: JSON.stringify(payload)
            }
        ]
    });

    logger.success(`Published to ${targetTopic}: ${notificationId}`);
};

/**
 * Disconnect the target producer
 */
export const disconnectTargetProducer = async (): Promise<void> => {
    if (producer) {
        await producer.disconnect();
        producer = null;
        logger.info('Target producer disconnected');
    }
};
