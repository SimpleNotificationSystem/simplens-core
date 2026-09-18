/**
 * Dynamic Operational Configuration Service
 * 
 * Manages runtime system settings stored in MongoDB and live hot-reloaded
 * across all running containers via Redis Pub/Sub without process restarts.
 */

import { EventEmitter } from 'events';
import system_config_model from '@src/database/models/system-config.models.js';
import { getRedisClient } from './redis.config.js';
import { configSyncLogger as logger, setLogLevel } from '@src/workers/utils/logger.js';
import { operationalSettingsSchema } from '@src/types/schemas.js';
import type {
  OperationalSettings,
  PartialOperationalSettings,
  SystemConfigSyncAction,
  SystemConfigSyncMessage,
} from '@src/types/types.js';
import type { Redis as RedisType } from 'ioredis';

export const CONFIG_SYNC_CHANNEL = 'simplens:system:config:sync';

export const SYSTEM_DEFAULT_OPERATIONAL_SETTINGS: OperationalSettings = {
  api: {
    max_batch_req_limit: 1000,
  },
  worker: {
    outbox_poll_interval_ms: 5000,
    outbox_cleanup_interval_ms: 60000,
    outbox_batch_size: 100,
    outbox_retention_ms: 300000,
    outbox_claim_timeout_ms: 30000,
  },
  retry: {
    max_retry_count: 5,
    idempotency_ttl_seconds: 86400,
    processing_ttl_seconds: 120,
  },
  delayed: {
    delayed_poll_interval_ms: 1000,
    delayed_batch_size: 10,
    max_poller_retries: 3,
  },
  recovery: {
    recovery_poll_interval_ms: 60000,
    processing_stuck_threshold_ms: 300000,
    pending_stuck_threshold_ms: 300000,
    recovery_batch_size: 50,
    recovery_claim_timeout_ms: 60000,
    cleanup_resolved_alerts_retention_ms: 86400000,
    cleanup_processed_status_outbox_retention_ms: 86400000,
  },
  logging: {
    log_level: 'info',
    log_to_file: true,
  },
};

export class DynamicConfigService extends EventEmitter {
  private static instance: DynamicConfigService;
  private settings: OperationalSettings = { ...SYSTEM_DEFAULT_OPERATIONAL_SETTINGS };
  private isInitialized = false;
  private subClient: RedisType | null = null;
  private instanceId: string;

  private constructor() {
    super();
    this.instanceId = process.env.HOSTNAME || process.env.WORKER_ID || `instance-${Math.random().toString(36).slice(2, 9)}`;
  }

  public static getInstance(): DynamicConfigService {
    if (!DynamicConfigService.instance) {
      DynamicConfigService.instance = new DynamicConfigService();
    }
    return DynamicConfigService.instance;
  }

  /**
   * Initialize DynamicConfigService
   * @param isApiServer - If true, seeds MongoDB with default values if not present, and broadcasts.
   */
  public async initialize(isApiServer: boolean = false): Promise<void> {
    if (this.isInitialized) return;

    // 1. Subscribe to Redis sync updates
    await this.subscribeToUpdates();

    // 2. Fetch from MongoDB or seed defaults
    try {
      const doc = await system_config_model.findOne({ key: 'operational_settings' });

      if (doc?.value) {
        const parsed = operationalSettingsSchema.safeParse(doc.value);
        if (parsed.success) {
          this.settings = parsed.data;
          logger.info('Loaded operational settings from MongoDB');
        } else {
          logger.warn('Failed to parse operational settings from MongoDB, using defaults', { error: parsed.error });
          this.settings = { ...SYSTEM_DEFAULT_OPERATIONAL_SETTINGS };
        }
      } else if (isApiServer) {
        this.settings = { ...SYSTEM_DEFAULT_OPERATIONAL_SETTINGS };
        await system_config_model.create({
          key: 'operational_settings',
          value: this.settings,
        });
        logger.success('Seeded MongoDB with default operational settings');

        await this.publishSync('SETTINGS_SEEDED');
      } else {
        this.settings = { ...SYSTEM_DEFAULT_OPERATIONAL_SETTINGS };
        logger.info('No operational settings found in MongoDB yet; using default in-memory settings');
      }
    } catch (err) {
      logger.error('Error loading operational settings from MongoDB, using defaults', err);
      this.settings = { ...SYSTEM_DEFAULT_OPERATIONAL_SETTINGS };
    }

    // Apply log level to all instantiated loggers
    setLogLevel(this.settings.logging.log_level);

    this.isInitialized = true;
  }

  public get<K extends keyof OperationalSettings>(group: K): OperationalSettings[K] {
    return this.settings[group];
  }

  public getAll(): OperationalSettings {
    return { ...this.settings };
  }

  public async updateSettings(newSettings: PartialOperationalSettings): Promise<OperationalSettings> {
    const merged = {
      api: { ...this.settings.api, ...(newSettings.api || {}) },
      worker: { ...this.settings.worker, ...(newSettings.worker || {}) },
      retry: { ...this.settings.retry, ...(newSettings.retry || {}) },
      delayed: { ...this.settings.delayed, ...(newSettings.delayed || {}) },
      recovery: { ...this.settings.recovery, ...(newSettings.recovery || {}) },
      logging: { ...this.settings.logging, ...(newSettings.logging || {}) },
    };

    const validated = operationalSettingsSchema.parse(merged);

    await system_config_model.findOneAndUpdate(
      { key: 'operational_settings' },
      { value: validated },
      { upsert: true, returnDocument: 'after' }
    );

    this.settings = validated;
    setLogLevel(this.settings.logging.log_level);

    this.emit('change', this.settings);

    // Broadcast sync event to all instances via Redis Pub/Sub
    await this.publishSync('SETTINGS_UPDATED', newSettings);

    return this.settings;
  }

  public async resetSettings(): Promise<OperationalSettings> {
    const validated = operationalSettingsSchema.parse(SYSTEM_DEFAULT_OPERATIONAL_SETTINGS);

    await system_config_model.findOneAndUpdate(
      { key: 'operational_settings' },
      { value: validated },
      { upsert: true, returnDocument: 'after' }
    );

    this.settings = validated;
    setLogLevel(this.settings.logging.log_level);

    this.emit('change', this.settings);

    await this.publishSync('SETTINGS_RESET');

    return this.settings;
  }

  public async loadFromDatabase(): Promise<void> {
    try {
      const doc = await system_config_model.findOne({ key: 'operational_settings' });
      if (doc?.value) {
        const parsed = operationalSettingsSchema.safeParse(doc.value);
        if (parsed.success) {
          this.settings = parsed.data;
          setLogLevel(this.settings.logging.log_level);
          this.emit('change', this.settings);
        }
      }
    } catch (err) {
      logger.error('Failed to reload operational settings from MongoDB', err);
    }
  }

  private async publishSync(action: SystemConfigSyncAction, payload?: PartialOperationalSettings): Promise<void> {
    try {
      const redis = getRedisClient();
      const message: SystemConfigSyncMessage = {
        action,
        source_instance_id: this.instanceId,
        timestamp: new Date().toISOString(),
        payload,
      };
      await redis.publish(CONFIG_SYNC_CHANNEL, JSON.stringify(message));
      logger.info(`Published config sync event [${action}] to ${CONFIG_SYNC_CHANNEL}`);
    } catch (err) {
      logger.error(`Failed to broadcast settings sync event [${action}] to Redis`, err);
    }
  }

  private async subscribeToUpdates(): Promise<void> {
    try {
      const baseClient = getRedisClient();
      this.subClient = baseClient.duplicate();

      // If client status is not ready/connecting, connect
      if (this.subClient.status !== 'ready' && this.subClient.status !== 'connecting') {
        await this.subClient.connect().catch(() => {});
      }

      await this.subClient.subscribe(CONFIG_SYNC_CHANNEL);

      this.subClient.on('message', async (channel, messageStr) => {
        if (channel !== CONFIG_SYNC_CHANNEL) return;

        try {
          const message: SystemConfigSyncMessage = JSON.parse(messageStr);

          // Skip self-originated updates
          if (message.source_instance_id === this.instanceId) {
            return;
          }

          logger.info(`Received config sync event [${message.action}] from ${message.source_instance_id}`);
          await this.loadFromDatabase();
        } catch (err) {
          logger.error('Failed to process settings sync message from Redis', err);
        }
      });
    } catch (err) {
      logger.warn('Failed to subscribe to Redis config sync channel, running with in-memory settings', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  public async close(): Promise<void> {
    if (this.subClient) {
      try {
        await this.subClient.unsubscribe(CONFIG_SYNC_CHANNEL);
        await this.subClient.quit();
      } catch {
        // Ignore disconnect errors during teardown
      }
      this.subClient = null;
    }
    this.isInitialized = false;
    this.removeAllListeners();
  }
}

export const dynamicConfig = DynamicConfigService.getInstance();
