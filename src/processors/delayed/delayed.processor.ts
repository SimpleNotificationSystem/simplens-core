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
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';

//Import the admin channel provider files here for them to self-register
import "@src/admin-alerts/channels/discord.channel.js";
import "@src/admin-alerts/channels/telegram.channel.js";

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

        void AdminAlertService.sendAlert('service_health',
            `🔴 UNCAUGHT EXCEPTION - Delayed Processor\n` +
            `Error: ${err instanceof Error ? err.message : String(err)}\n` +
            `Stack: ${err instanceof Error ? err.stack?.slice(0, 200) : 'N/A'}\n` +
            `Action: Check processor logs. Process is shutting down.`,
            { severity: 'critical' });

        await gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', async (reason) => {
        logger.error('Unhandled rejection:', reason);

        void AdminAlertService.sendAlert('service_health',
            `🔴 UNHANDLED REJECTION - Delayed Processor\n` +
            `Reason: ${reason instanceof Error ? reason.message : String(reason)}\n` +
            `Action: Check processor logs. Process is shutting down.`,
            { severity: 'critical' });

        await gracefulShutdown('unhandledRejection');
    });
};

/**
 * Main entry point
 */
const main = async (): Promise<void> => {
    logger.info('================================');
    logger.info('Starting Delayed Processor...');

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

        logger.info('================================');
        logger.success('Delayed Processor is running!');
        logger.info('================================');

        // Register shutdown handlers
        registerShutdownHandlers();
    } catch (err) {
        logger.error('Failed to start delayed processor:', err);

        void AdminAlertService.sendAlert('service_health',
            `🔴 STARTUP FAILURE - Delayed Processor\n` +
            `Error: ${err instanceof Error ? err.message : String(err)}\n` +
            `Action: Check processor logs. Verify Redis and Kafka connectivity.`,
            { severity: 'critical' });

        process.exit(1);
    }
};

// Run the processor
main();
