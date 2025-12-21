/**
 * Unified Processor - Main entry point for plugin-based notification processing
 * 
 * Supports both single-channel and multi-channel modes:
 * - Single: PROCESSOR_CHANNEL=email (or --channel email)
 * - Multi:  PROCESSOR_CHANNEL=all (or omit to process all configured channels)
 */

import { connectRedis, disconnectRedis } from '@src/config/redis.config.js';
import { initStatusProducer, disconnectStatusProducer } from '@src/processors/shared/status.producer.js';
import { initDelayedProducer, disconnectDelayedProducer } from '@src/processors/shared/delayed.producer.js';
import { loadProvidersFromEnv, PluginRegistry } from '@src/plugins/index.js';
import { startUnifiedConsumer, stopUnifiedConsumer, stopAllConsumers } from './unified.consumer.js';
import { unifiedProcessorLogger as logger } from './unified.logger.js';

// Track active channels for shutdown
let activeChannels: string[] = [];
let isShuttingDown = false;

/**
 * Parse channel argument from CLI or environment
 */
const getChannelConfig = (): string[] | 'all' => {
    // Check CLI args first: --channel email
    const channelArgIndex = process.argv.indexOf('--channel');
    if (channelArgIndex !== -1 && process.argv[channelArgIndex + 1]) {
        const channel = process.argv[channelArgIndex + 1];
        return channel === 'all' ? 'all' : [channel];
    }

    // Fall back to environment variable
    const envChannel = process.env.PROCESSOR_CHANNEL;
    if (envChannel) {
        return envChannel === 'all' ? 'all' : [envChannel];
    }

    // Default: process all channels
    return 'all';
};

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
        // 1. Stop all consumers
        logger.info('Stopping consumers...');
        await stopAllConsumers();

        // 2. Shutdown plugins
        logger.info('Shutting down plugins...');
        await PluginRegistry.shutdownAll();

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
    logger.info('================================');
    logger.info('Starting Unified Processor...');

    try {
        // 1. Connect to Redis
        logger.info('Connecting to Redis...');
        await connectRedis();

        // 2. Load plugins from configuration
        logger.info('Loading plugins from configuration...');
        await loadProvidersFromEnv();

        const loadedChannels = PluginRegistry.getChannels();
        if (loadedChannels.length === 0) {
            logger.warn('No plugins loaded! Check simplens.config.yaml');
        } else {
            logger.info(`Loaded plugins for channels: ${loadedChannels.join(', ')}`);
        }

        // 3. Initialize Kafka producers
        logger.info('Initializing Kafka producers...');
        await initStatusProducer();
        await initDelayedProducer();

        // 4. Determine which channels to process
        const channelConfig = getChannelConfig();
        let channelsToProcess: string[];

        if (channelConfig === 'all') {
            channelsToProcess = loadedChannels;
            logger.info('Running in multi-channel mode (all channels)');
        } else {
            // Validate requested channels
            channelsToProcess = channelConfig.filter(ch => {
                if (!loadedChannels.includes(ch)) {
                    logger.warn(`Channel '${ch}' not found in loaded plugins, skipping`);
                    return false;
                }
                return true;
            });
            logger.info(`Running in single-channel mode: ${channelsToProcess.join(', ')}`);
        }

        if (channelsToProcess.length === 0) {
            logger.error('No valid channels to process! Exiting...');
            process.exit(1);
        }

        // 5. Start consumers for each channel
        for (const channel of channelsToProcess) {
            logger.info(`Starting consumer for channel: ${channel}`);
            await startUnifiedConsumer(channel);
            activeChannels.push(channel);
        }

        // 6. Register shutdown handlers
        registerShutdownHandlers();

        logger.info('================================');
        logger.success(`Unified Processor is running! Channels: ${activeChannels.join(', ')}`);

    } catch (err) {
        logger.error('Failed to start Unified Processor:', err);
        process.exit(1);
    }
};

// Start the processor
main();
