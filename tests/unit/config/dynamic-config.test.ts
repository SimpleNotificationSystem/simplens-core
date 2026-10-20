import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  operationalSettingsSchema,
  partialOperationalSettingsSchema,
  adminSetupSchema,
  adminLoginSchema,
} from '@src/types/schemas.js';
import {
  dynamicConfig,
  SYSTEM_DEFAULT_OPERATIONAL_SETTINGS,
} from '@src/config/dynamic-config.service.js';
import { env } from '@src/config/env.config.js';

vi.mock('@src/config/redis.config.js', () => ({
  getRedisClient: vi.fn(() => ({
    publish: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(() => ({
      status: 'ready',
      connect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
      on: vi.fn(),
    })),
  })),
}));

vi.mock('@src/database/models/system-config.models.js', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));

describe('Dynamic Operational Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Schema Validations', () => {
    it('should validate SYSTEM_DEFAULT_OPERATIONAL_SETTINGS against schema', () => {
      const parsed = operationalSettingsSchema.safeParse(SYSTEM_DEFAULT_OPERATIONAL_SETTINGS);
      expect(parsed.success).toBe(true);
    });

    it('should reject out-of-bound batch sizes', () => {
      const invalid = {
        ...SYSTEM_DEFAULT_OPERATIONAL_SETTINGS,
        worker: {
          ...SYSTEM_DEFAULT_OPERATIONAL_SETTINGS.worker,
          outbox_batch_size: 0, // min is 1
        },
      };
      const parsed = operationalSettingsSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('should reject invalid log levels', () => {
      const invalid = {
        ...SYSTEM_DEFAULT_OPERATIONAL_SETTINGS,
        logging: {
          log_level: 'verbose', // invalid enum
          log_to_file: true,
        },
      };
      const parsed = operationalSettingsSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('should allow valid partial operational settings', () => {
      const partial = {
        worker: {
          outbox_batch_size: 250,
        },
        logging: {
          log_level: 'debug' as const,
        },
      };
      const parsed = partialOperationalSettingsSchema.safeParse(partial);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.worker?.outbox_batch_size).toBe(250);
    });

    it('should validate admin setup requirements', () => {
      expect(adminSetupSchema.safeParse({ username: 'ad', password: '123' }).success).toBe(false);
      expect(adminSetupSchema.safeParse({ username: 'admin', password: 'short' }).success).toBe(false);
      expect(adminSetupSchema.safeParse({ username: 'admin', password: 'securepassword123' }).success).toBe(true);
    });

    it('should validate admin login payload', () => {
      expect(adminLoginSchema.safeParse({ username: '', password: '' }).success).toBe(false);
      expect(adminLoginSchema.safeParse({ username: 'admin', password: 'password123' }).success).toBe(true);
    });
  });

  describe('DynamicConfigService and Env Getters', () => {
    it('should return default settings initially', () => {
      const all = dynamicConfig.getAll();
      expect(all.worker.outbox_batch_size).toBeDefined();
      expect(dynamicConfig.get('worker').outbox_batch_size).toBe(all.worker.outbox_batch_size);
    });

    it('should dynamically update settings and reflect via env getters', async () => {
      let changeFired = false;
      const listener = () => {
        changeFired = true;
      };
      dynamicConfig.on('change', listener);

      await dynamicConfig.updateSettings({
        worker: {
          outbox_batch_size: 42,
        },
        retry: {
          rate_limit_retry_delay_ms: 3000,
        },
        logging: {
          log_level: 'debug',
        },
      });

      expect(dynamicConfig.get('worker').outbox_batch_size).toBe(42);
      expect(dynamicConfig.get('retry').rate_limit_retry_delay_ms).toBe(3000);
      expect(env.OUTBOX_BATCH_SIZE).toBe(42);
      expect(env.RATE_LIMIT_RETRY_DELAY_MS).toBe(3000);
      expect(env.LOG_LEVEL).toBe('debug');
      expect(changeFired).toBe(true);

      dynamicConfig.off('change', listener);
    });

    it('should reset settings to system defaults', async () => {
      await dynamicConfig.resetSettings();
      expect(dynamicConfig.get('worker').outbox_batch_size).toBe(SYSTEM_DEFAULT_OPERATIONAL_SETTINGS.worker.outbox_batch_size);
      expect(dynamicConfig.get('retry').rate_limit_retry_delay_ms).toBe(5000);
      expect(env.OUTBOX_BATCH_SIZE).toBe(SYSTEM_DEFAULT_OPERATIONAL_SETTINGS.worker.outbox_batch_size);
      expect(env.RATE_LIMIT_RETRY_DELAY_MS).toBe(5000);
      expect(env.LOG_LEVEL).toBe(SYSTEM_DEFAULT_OPERATIONAL_SETTINGS.logging.log_level);
    });
  });
});
