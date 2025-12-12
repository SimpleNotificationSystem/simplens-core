/**
 * Recovery Service Entry Point
 * 
 * Standalone service that runs the recovery cron to detect and reconcile
 * stuck/inconsistent notification states. This runs as a single instance
 * to avoid race conditions when workers are scaled horizontally.
 */

import { connectMongoDB } from "@src/config/db.config.js";
import { connectRedis, disconnectRedis } from "@src/config/redis.config.js";
import { startRecoveryCron, stopRecoveryCron } from "@src/workers/cron/recovery.cron.js";
import { initProducer, disconnectProducer } from "@src/workers/producers/background.producer.js";
import { recoveryServiceLogger as logger } from "@src/workers/utils/logger.js";

let isShuttingDown = false;
let dbConnection: Awaited<ReturnType<typeof connectMongoDB>> | null = null;

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
        logger.info("Shutdown already in progress...");
        return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
        // 1. Stop recovery cron
        logger.info("Stopping recovery cron...");
        await stopRecoveryCron();

        // 2. Disconnect Kafka producer (used for status publishing)
        logger.info("Disconnecting Kafka producer...");
        await disconnectProducer();

        // 3. Disconnect Redis
        logger.info("Disconnecting Redis...");
        await disconnectRedis();

        // 4. Disconnect MongoDB
        if (dbConnection) {
            logger.info("Disconnecting MongoDB...");
            await dbConnection.disconnect();
        }

        logger.success("Graceful shutdown complete");
        process.exit(0);
    } catch (err) {
        logger.error("Error during graceful shutdown:", err);
        process.exit(1);
    }
};

/**
 * Register process event handlers for graceful shutdown
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
 * Main entry point for the recovery service
 */
const main = async (): Promise<void> => {
    logger.info("================================");
    logger.info("Starting Recovery Service...");

    try {
        // 1. Connect to MongoDB
        logger.info("Connecting to MongoDB...");
        dbConnection = await connectMongoDB();
        logger.success("MongoDB connected");

        // 2. Connect to Redis (for idempotency checks)
        logger.info("Connecting to Redis...");
        await connectRedis();
        logger.success("Redis connected");

        // 3. Initialize Kafka producer (for status publishing during reconciliation)
        logger.info("Initializing Kafka producer...");
        await initProducer();
        logger.success("Kafka producer initialized");

        // 4. Start recovery cron
        logger.info("Starting recovery cron...");
        startRecoveryCron();

        logger.info("================================");
        logger.success("Recovery Service is running!");
        logger.info("================================");

        // Register shutdown handlers
        registerShutdownHandlers();
    } catch (err) {
        logger.error("Failed to start recovery service:", err);
        process.exit(1);
    }
};

// Run the service
main();
