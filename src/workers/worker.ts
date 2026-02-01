import { connectMongoDB } from "@src/config/db.config.js";
import { initProducer, disconnectProducer } from "@src/workers/producers/background.producer.js";
import { startCronJobs, stopCronJobs } from "@src/workers/cron/background.cron.js";
import { startStatusConsumer, stopStatusConsumer } from "@src/workers/consumers/status.consumer.js";
import { workerLogger as logger } from "@src/workers/utils/logger.js";
import { AdminAlertService } from "@src/admin-alerts/admin-alert.service.js";

//Import the admin channel provider files here for them to self-register
import "@src/admin-alerts/channels/discord.channel.js";
import "@src/admin-alerts/channels/telegram.channel.js";

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
        // 1. Stop cron jobs first (stop producing new work)
        logger.info("Stopping cron jobs...");
        await stopCronJobs();

        // 2. Stop the status consumer
        logger.info("Stopping status consumer...");
        await stopStatusConsumer();

        // 3. Disconnect Kafka producer
        logger.info("Disconnecting Kafka producer...");
        await disconnectProducer();

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

        void AdminAlertService.sendAlert('service_health',
            `🔴 UNCAUGHT EXCEPTION - Background Worker\n` +
            `Error: ${err instanceof Error ? err.message : String(err)}\n` +
            `Stack: ${err instanceof Error ? err.stack?.slice(0, 200) : 'N/A'}\n` +
            `Action: Check worker logs. Process is shutting down.`,
            { severity: 'critical' });

        await gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', async (reason) => {
        logger.error('Unhandled rejection:', reason);

        void AdminAlertService.sendAlert('service_health',
            `🔴 UNHANDLED REJECTION - Background Worker\n` +
            `Reason: ${reason instanceof Error ? reason.message : String(reason)}\n` +
            `Action: Check worker logs. Process is shutting down.`,
            { severity: 'critical' });

        await gracefulShutdown('unhandledRejection');
    });
};

/**
 * Main entry point for the background worker
 */
const main = async (): Promise<void> => {
    logger.info("================================");
    logger.info("Starting Background Worker...");

    try {
        // 1. Connect to MongoDB
        logger.info("Connecting to MongoDB...");
        dbConnection = await connectMongoDB();
        logger.success("MongoDB connected");

        // 2. Initialize Kafka producer
        logger.info("Initializing Kafka producer...");
        await initProducer();

        // 3. Start status consumer
        logger.info("Starting status consumer...");
        await startStatusConsumer();

        // 4. Start cron jobs (poll + cleanup)
        logger.info("Starting cron jobs...");
        startCronJobs();

        logger.info("================================");
        logger.success("Background Worker is running!");
        logger.info("================================");

        // Register shutdown handlers
        registerShutdownHandlers();
    } catch (err) {
        logger.error("Failed to start background worker:", err);

        void AdminAlertService.sendAlert('service_health',
            `🔴 STARTUP FAILURE - Background Worker\n` +
            `Error: ${err instanceof Error ? err.message : String(err)}\n` +
            `Action: Check worker logs. Verify MongoDB and Kafka connectivity.`,
            { severity: 'critical' });

        process.exit(1);
    }
};

// Run the worker
main();

