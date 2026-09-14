/**
 * Plugin System Redis Pub/Sub Synchronization Service
 * 
 * Synchronizes plugin installations, provider changes, and channel routing
 * across all running API and notification_processor containers in real time.
 */

import { randomUUID } from 'crypto';
import type { Redis as RedisType } from 'ioredis';
import { getRedisClient } from '@src/config/redis.config.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';
import type { PluginSyncAction, PluginSyncHandler, PluginSyncMessage, PluginSyncPayload } from '@src/types/types.js';

export const PLUGIN_SYNC_CHANNEL = 'simplens:plugin_system:sync';

export class PluginSyncServiceClass {
  private static instance: PluginSyncServiceClass;
  private instanceId: string;
  private subClient: RedisType | null = null;
  private isSubscribed = false;
  private handlers: Map<PluginSyncAction | '*', PluginSyncHandler[]> = new Map();
  private installMutex: Promise<void> = Promise.resolve();

  private constructor() {
    this.instanceId = process.env.HOSTNAME || process.env.WORKER_ID || `instance-${randomUUID().slice(0, 8)}`;
  }

  public static getInstance(): PluginSyncServiceClass {
    if (!PluginSyncServiceClass.instance) {
      PluginSyncServiceClass.instance = new PluginSyncServiceClass();
    }
    return PluginSyncServiceClass.instance;
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Run an asynchronous task with in-process mutex locking
   * Useful for protecting the .plugins/ folder during npm install/uninstall
   */
  public async runWithLock<T>(task: () => Promise<T>): Promise<T> {
    let release: () => void = () => {};
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    const currentLock = this.installMutex;
    this.installMutex = nextLock;

    await currentLock;
    try {
      return await task();
    } finally {
      release();
    }
  }

  /**
   * Register an event handler for a specific action (or '*' for all actions)
   */
  public on(action: PluginSyncAction | '*', handler: PluginSyncHandler): void {
    const list = this.handlers.get(action) || [];
    list.push(handler);
    this.handlers.set(action, list);
  }

  /**
   * Publish an event to the Redis synchronization channel
   */
  public async publish(action: PluginSyncAction, payload: PluginSyncPayload = {}): Promise<void> {
    try {
      const redis = getRedisClient();
      const message: PluginSyncMessage = {
        event_id: randomUUID(),
        source_instance_id: this.instanceId,
        timestamp: new Date().toISOString(),
        action,
        payload,
      };

      await redis.publish(PLUGIN_SYNC_CHANNEL, JSON.stringify(message));
      logger.info(`Published sync event [${action}] to ${PLUGIN_SYNC_CHANNEL}`);
    } catch (err) {
      logger.error(`Failed to publish sync event [${action}] to Redis`, err);
    }
  }

  /**
   * Initialize and start the Redis subscriber
   */
  public async startSubscriber(): Promise<void> {
    if (this.isSubscribed) {
      return;
    }

    try {
      const baseClient = getRedisClient();
      this.subClient = baseClient.duplicate();

      await this.subClient.connect();
      await this.subClient.subscribe(PLUGIN_SYNC_CHANNEL);
      this.isSubscribed = true;

      this.subClient.on('message', async (channel, messageStr) => {
        if (channel !== PLUGIN_SYNC_CHANNEL) return;

        try {
          const message: PluginSyncMessage = JSON.parse(messageStr);

          // Skip events emitted by this instance to prevent loops
          if (message.source_instance_id === this.instanceId) {
            logger.debug(`Ignoring sync event [${message.action}] from self (${this.instanceId})`);
            return;
          }

          logger.info(`Received sync event [${message.action}] from ${message.source_instance_id}`);

          // Execute action-specific handlers
          const specificHandlers = this.handlers.get(message.action) || [];
          for (const handler of specificHandlers) {
            try {
              await handler(message);
            } catch (handlerErr) {
              logger.error(`Error in sync handler for [${message.action}]:`, handlerErr);
            }
          }

          // Execute wildcard handlers
          const wildcardHandlers = this.handlers.get('*') || [];
          for (const handler of wildcardHandlers) {
            try {
              await handler(message);
            } catch (handlerErr) {
              logger.error(`Error in wildcard sync handler:`, handlerErr);
            }
          }
        } catch (parseErr) {
          logger.error('Failed to parse sync message from Redis:', parseErr);
        }
      });

      logger.success(`Subscribed to plugin sync channel: ${PLUGIN_SYNC_CHANNEL}`);
    } catch (err) {
      logger.error('Failed to initialize Redis subscriber for plugin sync:', err);
    }
  }

  /**
   * Disconnect the subscriber
   */
  public async stopSubscriber(): Promise<void> {
    if (this.subClient) {
      try {
        await this.subClient.unsubscribe(PLUGIN_SYNC_CHANNEL);
        await this.subClient.quit();
      } catch (err) {
        logger.error('Error stopping plugin sync subscriber:', err);
      } finally {
        this.subClient = null;
        this.isSubscribed = false;
      }
    }
  }
}

export const PluginSyncService = PluginSyncServiceClass.getInstance();
