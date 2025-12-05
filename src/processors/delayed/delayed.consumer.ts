/**
 * Delayed Consumer - Consumes from delayed_notification topic and stores in Redis queue
 * Events are stored in a Redis ZSET with scheduled_at as the score
 */

import { Consumer, EachMessagePayload } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import { TOPICS } from '@src/types/types.js';
import { delayedNotificationTopicSchema } from '@src/types/schemas.js';
import { addToDelayedQueue } from './delayed.queue.js';
import { delayedWorkerLogger as logger } from '@src/workers/utils/logger.js';

const CONSUMER_GROUP_ID = 'delayed-worker-group';

interface ConsumerState {
    consumer: Consumer | null;
    isConsuming: boolean;
}

const state: ConsumerState = {
    consumer: null,
    isConsuming: false
};

/**
 * Process a delayed notification message
 * Validates the message and stores it in the Redis delayed queue
 */
const processDelayedMessage = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
    const messageValue = message.value?.toString();
    
    if (!messageValue) {
        logger.warn(`Empty message received on partition ${partition}`);
        return;
    }

    try {
        // Parse and validate the message
        const rawData = JSON.parse(messageValue);
        const validationResult = delayedNotificationTopicSchema.safeParse(rawData);

        if (!validationResult.success) {
            logger.error('Invalid delayed notification message:', validationResult.error.message);
            return; // Skip invalid messages
        }

        const delayedEvent = validationResult.data;

        logger.info(`Received delayed notification: ${delayedEvent.notification_id} -> ${delayedEvent.target_topic}`);
        logger.info(`Scheduled for: ${delayedEvent.scheduled_at}`);

        // Add to Redis delayed queue
        await addToDelayedQueue(delayedEvent);

    } catch (err) {
        logger.error('Failed to process delayed notification:', err);
    }
};

/**
 * Start the delayed notification consumer
 */
export const startDelayedConsumer = async (): Promise<void> => {
    if (state.consumer) {
        logger.warn('Delayed consumer already running');
        return;
    }

    state.consumer = kafka.consumer({
        groupId: CONSUMER_GROUP_ID,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
    });

    await state.consumer.connect();
    logger.success('Delayed consumer connected');

    await state.consumer.subscribe({
        topic: TOPICS.delayed_notification,
        fromBeginning: false
    });
    logger.info(`Subscribed to topic: ${TOPICS.delayed_notification}`);

    state.isConsuming = true;

    await state.consumer.run({
        eachMessage: processDelayedMessage
    });

    logger.success('Delayed consumer is running');
};

/**
 * Stop the delayed notification consumer
 */
export const stopDelayedConsumer = async (): Promise<void> => {
    if (!state.consumer) {
        return;
    }

    state.isConsuming = false;

    try {
        await state.consumer.stop();
        await state.consumer.disconnect();
        state.consumer = null;
        logger.info('Delayed consumer stopped');
    } catch (err) {
        logger.error('Error stopping delayed consumer:', err);
        throw err;
    }
};

/**
 * Check if consumer is currently active
 */
export const isConsumerActive = (): boolean => {
    return state.isConsuming && state.consumer !== null;
};
