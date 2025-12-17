/**
 * Recovery Service Entry Point
 * 
 * Standalone service that runs the recovery cron job to detect and recover
 * stuck notifications, creating alerts for manual inspection when needed.
 * 
 * Features:
 * - Auto-reconnect to MongoDB and Redis on connection loss
 * - Health checks before each recovery run
 * - Graceful degradation when databases are unavailable
 * 
 * Run with: npm run recovery (production) or npm run recovery:dev (development)
 */

import mongoose from 'mongoose';
import { env } from '@src/config/env.config.js';
import { connectRedis, disconnectRedis, getRedisClient } from '@src/config/redis.config.js';
import { startRecoveryCron, stopRecoveryCron, setHealthChecker } from './recovery.cron.js';
import { recoveryLogger as logger, flushLogs } from '@src/workers/utils/logger.js';

let isShuttingDown = false;
let mongoReconnecting = false;
let redisReconnecting = false;

const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Connect to MongoDB with retry logic
 */
const connectMongo = async (attempt = 1): Promise<boolean> => {
    if (isShuttingDown) return false;

    try {
        if (mongoose.connection.readyState === 1) {
            return true; // Already connected
        }

        logger.info(`Connecting to MongoDB... (attempt ${attempt})`);
        await mongoose.connect(env.MONGO_URI);
        logger.success('Connected to MongoDB');

        // Set up connection event handlers
        mongoose.connection.on('disconnected', () => {
            if (!isShuttingDown) {
                logger.warn('MongoDB disconnected, will attempt reconnect...');
                handleMongoReconnect();
            }
        });

        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error:', err);
        });

        return true;
    } catch (err) {
        logger.error(`MongoDB connection failed (attempt ${attempt}):`, err);

        if (attempt < MAX_RECONNECT_ATTEMPTS && !isShuttingDown) {
            logger.info(`Retrying MongoDB connection in ${RECONNECT_DELAY_MS}ms...`);
            await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
            return connectMongo(attempt + 1);
        }

        return false;
    }
};

/**
 * Handle MongoDB reconnection
 */
const handleMongoReconnect = async (): Promise<void> => {
    if (mongoReconnecting || isShuttingDown) return;

    mongoReconnecting = true;

    try {
        await connectMongo();
    } finally {
        mongoReconnecting = false;
    }
};

/**
 * Connect to Redis with retry logic
 */
const connectRedisWithRetry = async (attempt = 1): Promise<boolean> => {
    if (isShuttingDown) return false;

    try {
        await connectRedis();
        logger.success('Connected to Redis');
        return true;
    } catch (err) {
        logger.error(`Redis connection failed (attempt ${attempt}):`, err);

        if (attempt < MAX_RECONNECT_ATTEMPTS && !isShuttingDown) {
            logger.info(`Retrying Redis connection in ${RECONNECT_DELAY_MS}ms...`);
            await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
            return connectRedisWithRetry(attempt + 1);
        }

        return false;
    }
};

/**
 * Handle Redis reconnection
 */
const handleRedisReconnect = async (): Promise<void> => {
    if (redisReconnecting || isShuttingDown) return;

    redisReconnecting = true;

    try {
        await connectRedisWithRetry();
    } finally {
        redisReconnecting = false;
    }
};

/**
 * Check if MongoDB is healthy
 */
const isMongoHealthy = (): boolean => {
    return mongoose.connection.readyState === 1;
};

/**
 * Check if Redis is healthy
 */
const isRedisHealthy = async (): Promise<boolean> => {
    try {
        const client = getRedisClient();
        if (client.status !== 'ready') {
            return false;
        }
        await client.ping();
        return true;
    } catch {
        return false;
    }
};

/**
 * Health check function for recovery cron
 * Returns true if both MongoDB and Redis are healthy
 */
const checkHealth = async (): Promise<boolean> => {
    const mongoHealthy = isMongoHealthy();
    const redisHealthy = await isRedisHealthy();

    if (!mongoHealthy) {
        logger.warn('MongoDB is not healthy, attempting reconnect...');
        handleMongoReconnect();
    }

    if (!redisHealthy) {
        logger.warn('Redis is not healthy, attempting reconnect...');
        handleRedisReconnect();
    }

    return mongoHealthy && redisHealthy;
};

/**
 * Disconnect from MongoDB
 */
const disconnectMongo = async (): Promise<void> => {
    try {
        logger.info('Disconnecting from MongoDB...');
        await mongoose.disconnect();
        logger.success('Disconnected from MongoDB');
    } catch (err) {
        logger.error('Error disconnecting from MongoDB:', err);
    }
};

/**
 * Graceful shutdown handler
 */
const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
        // Stop the recovery cron first
        await stopRecoveryCron();

        // Close connections
        await disconnectRedis();
        await disconnectMongo();

        // Flush logs before exit
        await flushLogs();

        logger.success('Recovery service shutdown complete');
        process.exit(0);
    } catch (err) {
        logger.error('Error during shutdown:', err);
        process.exit(1);
    }
};

/**
 * Main startup function
 */
const main = async (): Promise<void> => {
    logger.info('Starting Recovery Service...');
    logger.info(`Worker ID: ${env.WORKER_ID}`);
    logger.info(`Environment: ${env.NODE_ENV}`);

    // Connect to databases with retry
    const mongoConnected = await connectMongo();
    const redisConnected = await connectRedisWithRetry();

    if (!mongoConnected || !redisConnected) {
        logger.error('Failed to connect to required databases after retries');
        logger.info('Recovery service will start anyway and retry connections...');
    }

    // Set health checker for recovery cron
    setHealthChecker(checkHealth);

    // Start the recovery cron (it will check health before each run)
    startRecoveryCron();

    logger.success('Recovery Service is running');
    logger.info(`Recovery interval: ${env.RECOVERY_POLL_INTERVAL_MS}ms`);
    logger.info(`Processing stuck threshold: ${env.PROCESSING_STUCK_THRESHOLD_MS}ms`);
    logger.info(`Pending stuck threshold: ${env.PENDING_STUCK_THRESHOLD_MS}ms`);

    // Register signal handlers for graceful shutdown
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught exception:', err);
        // Don't exit - let the service continue and try to recover
    });

    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled rejection:', reason);
        // Don't exit - let the service continue and try to recover
    });
};

// Start the service
main();
