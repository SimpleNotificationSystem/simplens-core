/**
 * Email Processor - Main entry point for email processing service
 */

import { connectMongoDB } from '@src/config/db.config.js';
import { connectRedis, disconnectRedis } from '@src/config/redis.config.js';
import { initStatusProducer, disconnectStatusProducer } from '@src/processors/shared/status.producer.js';
import { initDelayedProducer, disconnectDelayedProducer } from '@src/processors/shared/delayed.producer.js';
import { initEmailTransporter, closeEmailTransporter, verifyEmailTransporter } from './email.service.js';
import { startEmailConsumer, stopEmailConsumer } from './email.consumer.js';
import { emailProcessorLogger as logger } from '@src/workers/utils/logger.js';

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
        // 1. Stop consumer first
        logger.info('Stopping email consumer...');
        await stopEmailConsumer();

        // 2. Close email transporter
        logger.info('Closing email transporter...');
        closeEmailTransporter();

        // 3. Disconnect Kafka producers
        logger.info('Disconnecting Kafka producers...');
        await disconnectStatusProducer();
        await disconnectDelayedProducer();

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
    logger.info('Starting Email Processor...');
    console.log('================================');

    try {
        // 1. Connect to Redis
        logger.info('Connecting to Redis...');
        await connectRedis();

        // 2. Initialize email transporter
        logger.info('Initializing email transporter...');
        initEmailTransporter();
        
        // Verify email credentials (optional, logs warning if fails)
        await verifyEmailTransporter();

        // 3. Initialize Kafka producers
        logger.info('Initializing Kafka producers...');
        await initStatusProducer();
        await initDelayedProducer();

        // 4. Start email consumer
        logger.info('Starting email consumer...');
        await startEmailConsumer();

        console.log('================================');
        logger.success('Email Processor is running!');
        console.log('================================\n');

        // Register shutdown handlers
        registerShutdownHandlers();
    } catch (err) {
        logger.error('Failed to start email processor:', err);
        process.exit(1);
    }
};

// Run the processor
main();
