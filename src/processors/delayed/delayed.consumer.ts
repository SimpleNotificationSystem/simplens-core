/**
 * Delayed Consumer - Consumes from delayed_notification topic and stores in Redis queue
 * Channel-agnostic - routes based on dynamic target_topic
 */

import { EachMessagePayload } from 'kafkajs';
import { kafka } from '@src/config/kafka.config.js';
import { CORE_TOPICS, type KafkaConsumerState } from '@src/types/types.js';
import { delayedNotificationTopicSchema } from '@src/types/schemas.js';
import { addToDelayedQueue } from './delayed.queue.js';
import { delayedWorkerLogger as logger } from '@src/workers/utils/logger.js';

const CONSUMER_GROUP_ID = 'delayed-worker-group';

const state: KafkaConsumerState = {
    consumer: null,
    isConsuming: false
};

let lastHeartbeat = Date.now();
let hasCrashed = false;
let crashReason: string | undefined = undefined;

/**
 * Process a delayed notification message
 * Returns true if message was successfully added to queue
 */
const processDelayedMessage = async ({ partition, message }: EachMessagePayload): Promise<boolean> => {
    const messageValue = message.value?.toString();

    if (!messageValue) {
        logger.warn(`Empty message received on partition ${partition}`);
        return false;
    }

    try {
        const rawData = JSON.parse(messageValue);
        const validationResult = delayedNotificationTopicSchema.safeParse(rawData);

        if (!validationResult.success) {
            logger.error('Invalid delayed notification message:', validationResult.error.message);
            return false;
        }

        const delayedEvent = validationResult.data;

        logger.info(`Received delayed notification: ${delayedEvent.notification_id} -> ${delayedEvent.target_topic}`);
        logger.info(`Scheduled for: ${delayedEvent.scheduled_at}`);

        await addToDelayedQueue(delayedEvent);
        return true;

    } catch (err) {
        logger.error('Failed to process delayed notification:', err);
        return false;
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

    lastHeartbeat = Date.now();
    hasCrashed = false;
    crashReason = undefined;

    if (typeof state.consumer.on === 'function' && state.consumer.events) {
        state.consumer.on(state.consumer.events.HEARTBEAT, () => {
            lastHeartbeat = Date.now();
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state.consumer.on(state.consumer.events.CRASH, (event: any) => {
            hasCrashed = true;
            state.isConsuming = false;
            const crashError = event?.payload?.error;
            crashReason = crashError ? String(crashError.message || crashError) : 'Unknown crash';
            logger.error(`Delayed consumer crashed: ${crashReason}`);
        });

        state.consumer.on(state.consumer.events.STOP, () => {
            state.isConsuming = false;
            logger.warn('Delayed consumer stopped event received');
        });

        state.consumer.on(state.consumer.events.DISCONNECT, () => {
            state.isConsuming = false;
            logger.warn('Delayed consumer disconnected');
        });

        state.consumer.on(state.consumer.events.CONNECT, () => {
            state.isConsuming = true;
            lastHeartbeat = Date.now();
        });
    }

    await state.consumer.subscribe({
        topic: CORE_TOPICS.delayed_notification,
        fromBeginning: false
    });
    logger.info(`Subscribed to topic: ${CORE_TOPICS.delayed_notification}`);

    state.isConsuming = true;

    await state.consumer.run({
        autoCommit: false,
        eachMessage: async (payload) => {
            lastHeartbeat = Date.now();
            try {
                const success = await processDelayedMessage(payload);

                // Only commit if added to queue successfully
                if (success) {
                    try {
                        await state.consumer!.commitOffsets([{
                            topic: payload.topic,
                            partition: payload.partition,
                            offset: (BigInt(payload.message.offset) + 1n).toString()
                        }]);
                    } catch (commitErr) {
                        logger.error(`Failed to commit offset for partition ${payload.partition}:`, commitErr);
                        // Don't throw - consumer continues
                    }
                }
            } catch (err) {
                logger.error(`Error in message handler for partition ${payload.partition}:`, err);
                // Don't commit - message will be redelivered
            }
        }
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
    hasCrashed = false;

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

/**
 * Check if delayed consumer is healthy (running, not crashed, heartbeat fresh)
 */
export const isDelayedConsumerHealthy = (maxHeartbeatStalenessMs = 90000): boolean => {
    if (!state.consumer || !state.isConsuming || hasCrashed) {
        return false;
    }
    const isStale = (Date.now() - lastHeartbeat) > maxHeartbeatStalenessMs;
    return !isStale;
};
