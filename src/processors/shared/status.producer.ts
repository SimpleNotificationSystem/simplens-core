/**
 * Status Producer - Publishes notification status updates to Kafka
 */

import { Producer, Partitioners } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import { TOPICS, type notification_status_topic } from '@src/types/types.js';

let producer: Producer | null = null;

/**
 * Initialize the status producer
 */
export const initStatusProducer = async (): Promise<void> => {
    if (producer) {
        return;
    }

    producer = kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
        allowAutoTopicCreation: true,
    });

    await producer.connect();
};

/**
 * Publish status update to notification_status topic
 */
export const publishStatus = async (status: notification_status_topic): Promise<void> => {
    if (!producer) {
        throw new Error('Status producer not initialized. Call initStatusProducer() first.');
    }

    await producer.send({
        topic: TOPICS.notification_status,
        messages: [{
            key: status.notification_id.toString(),
            value: JSON.stringify(status)
        }]
    });
};

/**
 * Disconnect the status producer
 */
export const disconnectStatusProducer = async (): Promise<void> => {
    if (producer) {
        await producer.disconnect();
        producer = null;
    }
};
