/**
 * Unified Processor - Main entry point for plugin-based notification processing
 * 
 * Supports dynamic MongoDB configuration, Redis Pub/Sub syncing,
 * idle standby mode when empty, and both single-channel and multi-channel modes:
 * - Single: PROCESSOR_CHANNEL=email (or --channel email)
 * - Multi:  PROCESSOR_CHANNEL=all (or omit to process all configured channels)
 */

import { connectMongoDB } from '@src/config/db.config.js';
import { dynamicConfig } from '@src/config/dynamic-config.service.js';
import { connectRedis, disconnectRedis } from '@src/config/redis.config.js';
import { initStatusProducer, disconnectStatusProducer } from '@src/processors/shared/status.producer.js';
import { initDelayedProducer, disconnectDelayedProducer } from '@src/processors/shared/delayed.producer.js';
import {
  PluginRegistry,
  PluginSyncService,
  PluginManagerService,
  NpmAuthService,
  ProviderManagerService,
  ChannelRoutingService,
  loadProvidersFromDatabase,
} from '@src/plugins/index.js';
import {
  startUnifiedConsumer,
  stopUnifiedConsumer,
  stopAllConsumers,
  getActiveConsumerChannels,
} from './unified.consumer.js';
import { unifiedProcessorLogger as logger } from './unified.logger.js';
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';
import { createHealthProbeServer } from '@src/utils/k8s-health-probe.js';
import type { HealthProbeServer } from '@src/types/types.js';
import { getRedisClient } from '@src/config/redis.config.js';

// Import the admin channel provider files here for them to self-register
import "@src/admin-alerts/channels/discord.channel.js";
import "@src/admin-alerts/channels/telegram.channel.js";

// Track active channels for shutdown
const activeChannels: string[] = [];
let isShuttingDown = false;
let dbConnection: { disconnect: () => Promise<void> } | null = null;
let probeServer: HealthProbeServer | null = null;

/**
 * Parse channel argument from CLI or environment
 */
const getChannelConfig = (): string[] | 'all' => {
  const channelArgIndex = process.argv.indexOf('--channel');
  if (channelArgIndex !== -1 && process.argv[channelArgIndex + 1]) {
    const channel = process.argv[channelArgIndex + 1];
    return channel === 'all' ? 'all' : [channel];
  }

  const envChannel = process.env.PROCESSOR_CHANNEL;
  if (envChannel) {
    return envChannel === 'all' ? 'all' : [envChannel];
  }

  return 'all';
};

/**
 * Check for new channels and start consumers if configured
 */
const syncActiveConsumers = async (): Promise<void> => {
  if (isShuttingDown) return;

  const loadedChannels = PluginRegistry.getChannels();
  const currentRunning = getActiveConsumerChannels();
  const channelConfig = getChannelConfig();

  for (const channel of loadedChannels) {
    const shouldRun =
      channelConfig === 'all' || (Array.isArray(channelConfig) && channelConfig.includes(channel));

    if (shouldRun && !currentRunning.includes(channel)) {
      try {
        logger.info(`Starting dynamic consumer for new channel: ${channel}`);
        await startUnifiedConsumer(channel);
        if (!activeChannels.includes(channel)) {
          activeChannels.push(channel);
        }
      } catch (err) {
        logger.error(`Failed to dynamically start consumer for channel '${channel}':`, err);
      }
    }
  }

  // If a channel was removed from PluginRegistry, stop its consumer
  for (const runningChannel of currentRunning) {
    if (!loadedChannels.includes(runningChannel)) {
      logger.info(`Stopping consumer for removed channel: ${runningChannel}`);
      await stopUnifiedConsumer(runningChannel);
      const index = activeChannels.indexOf(runningChannel);
      if (index !== -1) {
        activeChannels.splice(index, 1);
      }
    }
  }
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

    // 5. Disconnect MongoDB
    if (dbConnection) {
      logger.info('Disconnecting MongoDB...');
      await dbConnection.disconnect();
    }

    // 6. Stop health probe server
    if (probeServer) {
      await probeServer.stop();
    }

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

    void AdminAlertService.sendAlert(
      'service_health',
      `🔴 UNCAUGHT EXCEPTION - Unified Processor\n` +
        `Channels: ${activeChannels.join(', ')}\n` +
        `Error: ${err instanceof Error ? err.message : String(err)}\n` +
        `Stack: ${err instanceof Error ? err.stack?.slice(0, 200) : 'N/A'}\n` +
        `Action: Check processor logs. Process is shutting down.`,
      { severity: 'critical' }
    );

    await gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', async (reason) => {
    logger.error('Unhandled rejection:', reason);

    void AdminAlertService.sendAlert(
      'service_health',
      `🔴 UNHANDLED REJECTION - Unified Processor\n` +
        `Channels: ${activeChannels.join(', ')}\n` +
        `Reason: ${reason instanceof Error ? reason.message : String(reason)}\n` +
        `Action: Check processor logs. Process is shutting down.`,
      { severity: 'critical' }
    );

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
    // 1. Connect to MongoDB
    logger.info('Connecting to MongoDB...');
    dbConnection = await connectMongoDB();
    logger.success('Successfully connected to MongoDB');

    // Initialize Dynamic Configuration
    await dynamicConfig.initialize(false);

    // 2. Connect to Redis
    logger.info('Connecting to Redis...');
    await connectRedis();

    // 3. Initialize Redis Pub/Sub synchronization
    await PluginSyncService.startSubscriber();
    NpmAuthService.registerSyncHandlers();
    await NpmAuthService.syncNpmrc();
    PluginManagerService.registerSyncHandlers();
    ProviderManagerService.registerSyncHandlers();
    ChannelRoutingService.registerSyncHandlers();

    // Sync consumers when reload or channel route changes occur
    PluginSyncService.on('SYSTEM_RELOAD', async () => {
      logger.info('Received SYSTEM_RELOAD. Reloading providers from MongoDB...');
      await loadProvidersFromDatabase({ initialize: true });
      await syncActiveConsumers();
    });

    PluginSyncService.on('CHANNEL_ROUTING_UPDATED', async () => {
      await syncActiveConsumers();
    });

    PluginSyncService.on('PROVIDER_UPSERTED', async () => {
      await syncActiveConsumers();
    });

    // 4. Load plugins and providers from MongoDB
    logger.info('Loading providers from MongoDB...');
    await loadProvidersFromDatabase({ initialize: true });

    const loadedChannels = PluginRegistry.getChannels();
    if (loadedChannels.length === 0) {
      logger.warn('No providers configured in MongoDB yet. Processor entering idle standby mode...');
    } else {
      logger.info(`Loaded plugins for channels: ${loadedChannels.join(', ')}`);
    }

    // 5. Initialize Kafka producers
    logger.info('Initializing Kafka producers...');
    await initStatusProducer();
    await initDelayedProducer();

    // 6. Determine which channels to process
    const channelConfig = getChannelConfig();
    let channelsToProcess: string[] = [];

    if (channelConfig === 'all') {
      channelsToProcess = loadedChannels;
      logger.info('Configured for multi-channel mode (all channels)');
    } else {
      channelsToProcess = channelConfig.filter((ch) => {
        if (!loadedChannels.includes(ch)) {
          logger.warn(`Channel '${ch}' not found in loaded plugins, skipping`);
          return false;
        }
        return true;
      });
      logger.info(`Configured for single-channel mode: ${channelsToProcess.join(', ')}`);
    }

    // 7. Start consumers for each channel (or wait in standby mode)
    if (channelsToProcess.length === 0) {
      logger.info('Unified Processor is in idle standby mode waiting for channel and provider configuration.');
    } else {
      for (const channel of channelsToProcess) {
        logger.info(`Starting consumer for channel: ${channel}`);
        await startUnifiedConsumer(channel);
        activeChannels.push(channel);
      }
      logger.success(`Unified Processor is running! Active channels: ${activeChannels.join(', ')}`);
    }

    // 8. Start health probe server for Kubernetes
    probeServer = createHealthProbeServer({
      serviceName: 'unified-processor',
      readinessChecks: [
        { name: 'mongodb', check: () => dbConnection !== null },
        { name: 'redis', check: () => {
          try {
            return getRedisClient().status === 'ready';
          } catch {
            return false;
          }
        }}
      ],
      livenessChecks: [
        { name: 'process', check: () => true }
      ]
    });
    await probeServer.start();

    // 9. Register shutdown handlers
    registerShutdownHandlers();

    logger.info('================================');
  } catch (err) {
    logger.error('Failed to start Unified Processor:', err);

    void AdminAlertService.sendAlert(
      'service_health',
      `🔴 STARTUP FAILURE - Unified Processor\n` +
        `Error: ${err instanceof Error ? err.message : String(err)}\n` +
        `Action: Check processor logs. Verify Redis, MongoDB, and Kafka connectivity.`,
      { severity: 'critical' }
    );

    process.exit(1);
  }
};

// Start the processor
main();
