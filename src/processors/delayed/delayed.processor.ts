/**
 * Delayed Processor - Main entry point for the delayed notification worker
 * 
 * Architecture:
 * 1. Consumer: Reads from delayed_notification topic, stores in Redis ZSET
 * 2. Poller: Periodically fetches due events from Redis, publishes to target topics
 * 
 * Uses Redis Sorted Set as a priority queue:
 * - Score = scheduled_at timestamp
 * - Atomic Lua script prevents duplicate processing across multiple workers
 */

import { connectRedis, disconnectRedis } from '@src/config/redis.config.js';
import { initTargetProducer, disconnectTargetProducer } from './target.producer.js';
import { initDLQStatusProducer, disconnectDLQStatusProducer } from './dlq.status.js';
import { startDelayedConsumer, stopDelayedConsumer } from './delayed.consumer.js';
import { startDelayedPoller, stopDelayedPoller } from './delayed.poller.js';
import { delayedWorkerLogger as logger } from '@src/workers/utils/logger.js';

let isShuttingDown = false;

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
        logger.info('Shutdown already in progress...');
        return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
        // 1. Stop poller first (stop processing)
        logger.info('Stopping delayed poller...');
        stopDelayedPoller();

        // 2. Stop consumer (stop accepting new events)
        logger.info('Stopping delayed consumer...');
        await stopDelayedConsumer();

        // 2. Disconnect Kafka producers
        logger.info('Disconnecting target producer...');
        await disconnectTargetProducer();
        
        logger.info('Disconnecting DLQ status producer...');
        await disconnectDLQStatusProducer();

        // 4. Disconnect Redis
        logger.info('Disconnecting Redis...');
        await disconnectRedis();

        logger.success('Graceful shutdown complete');
        process.exit(0);
    } catch (err) {
        logger.error('Error during graceful shutdown:', err);
        process.exit(1);
    }
};

/**
 * Register shutdown handlers
 */
const registerShutdownHandlers = (): void => {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', async (err) => {
        logger.error('Uncaught exception:', err);
        await gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', async (reason) => {
        logger.error('Unhandled rejection:', reason);
        await gracefulShutdown('unhandledRejection');
    });
};

/**
 * Main entry point
 */
const main = async (): Promise<void> => {
    logger.info('Starting Delayed Processor...');
    console.log('================================');

    try {
        // 1. Connect to Redis (for delayed queue)
        logger.info('Connecting to Redis...');
        await connectRedis();

        // 2. Initialize Kafka producers
        logger.info('Initializing target producer...');
        await initTargetProducer();
        
        logger.info('Initializing DLQ status producer...');
        await initDLQStatusProducer();

        // 3. Start delayed consumer (reads from delayed_notification topic)
        logger.info('Starting delayed consumer...');
        await startDelayedConsumer();

        // 4. Start delayed poller (processes due events)
        logger.info('Starting delayed poller...');
        startDelayedPoller();

        console.log('================================');
        logger.success('Delayed Processor is running!');
        console.log('================================\n');

        // Register shutdown handlers
        registerShutdownHandlers();
    } catch (err) {
        logger.error('Failed to start delayed processor:', err);
        process.exit(1);
    }
};

// Run the processor
main();
