/**
 * Core Schemas for SimpleNS
 *
 * These are channel-agnostic base schemas.
 * Channel-specific schemas are provided by plugins.
 */

import { z } from "zod";
import mongoose from "mongoose";
import {
  NOTIFICATION_STATUS,
  OUTBOX_STATUS,
  NOTIFICATION_STATUS_SF,
  ALERT_TYPE,
} from "./types.js";
import type { UUID } from "crypto";
import { validate, version } from "uuid";

// ============================================================================
// BASE FIELD SCHEMAS
// ============================================================================

export const objectIdSchema = z.custom<mongoose.Types.ObjectId>(
  (val) => mongoose.Types.ObjectId.isValid(val as string),
  { error: "Invalid ObjectId" },
);

export const UUIDV4Schema = z.custom<UUID>(
  (val) => validate(val) && version(val as string) == 4,
  { error: "Invalid UUIDV4" },
);

export const variablesSchema = z.record(z.string(), z.string());

const hasNonEmptyTemplateIds = (
  templateIds?: (string | null | undefined)[],
) => Array.isArray(templateIds) && templateIds.some((id) => Boolean(id));

const hasNonEmptyContent = (
  content?: Record<string, Record<string, string>>,
) => !!content && Object.keys(content).length > 0;

export const providerAttemptSchema = z.object({
  provider: z.string(),
  status: z.enum(['delivered', 'failed', 'rate_limited']),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
  retryable: z.boolean().optional(),
  attempted_at: z.coerce.date(),
  duration_ms: z.number().optional(),
  response: z.unknown().optional(),
});

const notificationPayloadFields = {
  request_id: UUIDV4Schema,
  client_id: UUIDV4Schema,
  client_name: z.string().optional(),
  channel: z.string(),
  provider: z.string().optional(),
  provider_history: z.array(providerAttemptSchema).optional(),
  recipient: z.record(z.string(), z.unknown()),
  content: z.record(z.string(), z.unknown()),
  variables: variablesSchema.optional(),
  webhook_url: z.url(),
  scheduled_at: z.coerce.date().optional(),
};

const notificationRequestFields = {
  client_id: UUIDV4Schema,
  client_name: z.string().optional(),
  channel: z.array(z.string()).min(1, "At least one channel is required."),
  template_id: z.array(z.string().nullable().optional()).optional(),
  provider: z
    .union([z.string(), z.array(z.string().nullable().optional())])
    .optional(),
  content: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  scheduled_at: z.coerce.date().optional(),
  webhook_url: z.url(),
};

const notificationTemplateFields = {
  name: z.string(),
  description: z.string().optional(),
  content: z.record(z.string(), z.unknown()),
  package: z.string(),
};

// ============================================================================
// BASE NOTIFICATION SCHEMA (Channel-Agnostic)
// ============================================================================

/**
 * Base notification schema - plugins extend this with channel-specific fields
 */
export const baseNotificationSchema = z.object({
  notification_id: objectIdSchema,
  ...notificationPayloadFields,
  retry_count: z.number().int().min(0),
  created_at: z.coerce.date(),
});

// ============================================================================
// CORE TOPIC SCHEMAS
// ============================================================================

/**
 * Delayed notification - supports any channel
 */
export const delayedNotificationTopicSchema = z.object({
  notification_id: objectIdSchema,
  request_id: UUIDV4Schema,
  client_id: UUIDV4Schema,
  scheduled_at: z.coerce.date(),
  target_topic: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.coerce.date(),
});

/**
 * Notification status - channel-agnostic
 */
export const notificationStatusTopicSchema = z.object({
  notification_id: objectIdSchema,
  request_id: UUIDV4Schema,
  client_id: UUIDV4Schema,
  channel: z.string(),
  provider: z.string().optional(),
  provider_history: z.array(providerAttemptSchema).optional(),
  status: z.enum(NOTIFICATION_STATUS_SF),
  message: z.string(),
  retry_count: z.number().int().min(0),
  webhook_url: z.url(),
  created_at: z.coerce.date(),
});

// ============================================================================
// DATABASE SCHEMAS
// ============================================================================

/**
 * Notification record in MongoDB
 */
export const notificationSchema = z.object({
  ...notificationPayloadFields,
  status: z.enum(NOTIFICATION_STATUS),
  error_message: z.string().optional(),
  retry_count: z.number().int().min(0),
  api_key_id: z.string().nullable().optional(),
  // Recovery claiming fields for horizontal scalability
  recovery_claimed_by: z.string().nullable().optional(),
  recovery_claimed_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

/**
 * Outbox entry for reliable delivery
 */
export const outboxSchema = z.object({
  notification_id: objectIdSchema,
  topic: z.string(),
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(OUTBOX_STATUS),
  claimed_by: z.string().nullable().optional(),
  claimed_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

/**
 * Alert schema
 */
export const alertSchema = z.object({
  notification_id: objectIdSchema,
  alert_type: z.enum(ALERT_TYPE),
  reason: z.string(),
  redis_status: z.string().nullable().optional(),
  db_status: z.enum(NOTIFICATION_STATUS),
  retry_count: z.number().int().min(0),
  resolved: z.boolean().default(false),
  resolved_at: z.coerce.date().nullable().optional(),
  // Recovery claiming fields for horizontal scalability
  recovery_claimed_by: z.string().nullable().optional(),
  recovery_claimed_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

/**
 * Status outbox
 */
export const statusOutboxSchema = z.object({
  _id: objectIdSchema,
  notification_id: objectIdSchema,
  status: z.enum(NOTIFICATION_STATUS_SF),
  provider: z.string().optional(),
  provider_history: z.array(providerAttemptSchema).optional(),
  processed: z.boolean().default(false),
  claimed_by: z.string().nullable().optional(),
  claimed_at: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

/**
 * Notification Template
 */
export const notificationTemplateSchema = z.object({
  _id: objectIdSchema,
  name: z.string(),
  template_id: z.string(),
  description: z.string().optional(),
  content: z.record(z.string(), z.unknown()),
  package: z.string(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

// ============================================================================
// ADMIN NOTIFICATION CHANNEL SCHEMAS
// ============================================================================

/**
 * Admin alert channel types
 */
export const ADMIN_CHANNEL_TYPE = ['discord', 'telegram', 'email', 'slack'] as const;

/**
 * Admin alert types for filtering
 */
export const ADMIN_ALERT_TYPE = [
    'failed_notification',
    'service_health',
    'stuck_processing',
    'orphaned_pending',
    'ghost_delivery'
] as const;

/**
 * Encrypted config schema - used for storing sensitive channel credentials
 */
export const encryptedConfigSchema = z.object({
    encrypted_data: z.string(),
    iv: z.string(),
    auth_tag: z.string(),
});

/**
 * Alert filters schema - controls which alert types a channel receives
 */
export const alertFiltersSchema = z.object({
    failed_notifications: z.boolean().default(true),
    service_health: z.boolean().default(true),
    stuck_processing: z.boolean().default(true),
    orphaned_pending: z.boolean().default(true),
    ghost_delivery: z.boolean().default(false),
});

/**
 * Admin notification channel schema
 */
export const adminChannelSchema = z.object({
    channel_type: z.enum(ADMIN_CHANNEL_TYPE),
    name: z.string().min(1).max(100),
    enabled: z.boolean().default(true),
    config: encryptedConfigSchema,
    alert_filters: alertFiltersSchema,
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * System config schema - for storing system-wide config like encryption keys
 */
export const systemConfigSchema = z.object({
    key: z.string(),
    value: z.unknown(),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * Key-pair envelope encrypted credentials schema
 */
export const encryptedCredentialsSchema = z.object({
    encrypted_data: z.string(),
    iv: z.string(),
    auth_tag: z.string(),
    encrypted_dek: z.string(),
});

/**
 * Provider manifest schema for plugins
 */
export const providerManifestSchema = z.object({
    name: z.string(),
    version: z.string(),
    channel: z.string(),
    displayName: z.string(),
    description: z.string(),
    author: z.string().optional(),
    homepage: z.string().optional(),
    requiredCredentials: z.array(z.string()),
    optionalConfig: z.array(z.string()).optional(),
});

  /** Options supplied by a YAML/JSON provider configuration entry. */
  export const providerConfigOptionsSchema = z.object({
    priority: z.number().int().optional(),
    rateLimit: z.object({
      maxTokens: z.number().nonnegative().optional(),
      refillRate: z.number().nonnegative().optional(),
      refillInterval: z.enum(['second', 'minute', 'hour', 'day']).optional(),
    }).optional(),
  }).catchall(z.unknown());

  /** Provider entry as read from YAML/JSON configuration. */
  export const providerConfigEntrySchema = z.object({
    package: z.string().min(1),
    version: z.string().optional(),
    id: z.string().min(1),
    credentials: z.record(z.string(), z.string()).optional(),
    optionalConfig: z.record(z.string(), z.string()).optional(),
    options: providerConfigOptionsSchema.optional(),
  });

/**
 * Plugin document schema
 */
export const pluginSchema = z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    status: z.enum(['installed', 'installing', 'failed']),
    error: z.string().optional(),
    manifest: providerManifestSchema,
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * Provider document schema
 */
export const providerSchema = z.object({
    id: z.string().min(1),
    plugin_name: z.string().min(1),
    channel: z.string().min(1),
    enabled: z.boolean().default(true),
    credentials: encryptedCredentialsSchema,
  options: providerConfigOptionsSchema.optional(),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * Channel routing document schema
 */
export const channelRoutingSchema = z.object({
    channel: z.string().min(1),
    default_provider_id: z.string().min(1),
    fallback_provider_ids: z.array(z.string()).default([]),
    partitions: z.number().int().min(1).default(6),
    created_at: z.coerce.date().optional(),
    updated_at: z.coerce.date().optional(),
});

/**
 * Discord config schema - for validation before encryption
 */
export const discordConfigSchema = z.object({
    webhook_url: z.string().url().refine(
        (url) => url.startsWith('https://discord.com/api/webhooks/'),
        { message: 'Must be a valid Discord webhook URL' }
    ),
});

/**
 * Telegram config schema
 */
export const telegramConfigSchema = z.object({
    bot_token: z.string().regex(/^[0-9]+:[a-zA-Z0-9_-]+$/, 'Invalid Telegram Bot Token'),
    chat_id: z.string().regex(/^-?[0-9]+$/, 'Invalid Chat ID'),
});

// ============================================================================
// API REQUEST SCHEMAS
// ============================================================================

/**
 * Single notification request - channel-agnostic
 */
export const baseNotificationRequestSchema = z
  .object({
    request_id: UUIDV4Schema,
    ...notificationRequestFields,
    recipient: z.record(z.string(), z.unknown()),
    variables: variablesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (
      !hasNonEmptyTemplateIds(data.template_id) &&
      !hasNonEmptyContent(data.content)
    ) {
      for (const path of ["template_id", "content"] as const) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Either a non-empty template_id array or non-empty content must be present.",
          path: [path],
        });
      }
    }
  });

/**
 * Batch notification request - channel-agnostic
 */
export const baseBatchNotificationRequestSchema = z
  .object({
    ...notificationRequestFields,
    recipients: z.array(
      z.looseObject({
        request_id: UUIDV4Schema,
        user_id: z.string(),
        variables: variablesSchema.optional(),
      }),
    ).min(1, "At least one recipient is required."),
  })
  .superRefine((data, ctx) => {
    const maxLimit =
      typeof process !== "undefined" && process.env.MAX_BATCH_REQ_LIMIT
        ? parseInt(process.env.MAX_BATCH_REQ_LIMIT)
        : 1000;
    if (
      data.recipients &&
      data.recipients.length * data.channel.length > maxLimit
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Batch size exceeds limit (${maxLimit})`,
        path: ["recipients"],
      });
    }
  })
  .superRefine((data, ctx) => {
    if (
      !hasNonEmptyTemplateIds(data.template_id) &&
      !hasNonEmptyContent(data.content)
    ) {
      for (const path of ["template_id", "content"] as const) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Either a non-empty template_id array or non-empty content must be present.",
          path: [path],
        });
      }
    }
  });

/*
Notification Template Request Schema
*/
export const notificationTemplateRequestSchema = z.object({
  ...notificationTemplateFields,
  template_id: z.string().optional(),
});

export const notificationTemplateUpdateRequestSchema = z.object(notificationTemplateFields);

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export const validateBaseNotification = (data: unknown) =>
  baseNotificationSchema.parse(data);
export const validateDelayedNotificationTopic = (data: unknown) =>
  delayedNotificationTopicSchema.parse(data);
export const validateNotificationStatusTopic = (data: unknown) =>
  notificationStatusTopicSchema.parse(data);
export const validateNotification = (data: unknown) =>
  notificationSchema.parse(data);
export const validateOutbox = (data: unknown) => outboxSchema.parse(data);
export const validateNotificationRequest = (data: unknown) =>
  baseNotificationRequestSchema.parse(data);
export const validateBatchNotificationRequest = (data: unknown) =>
  baseBatchNotificationRequestSchema.parse(data);
export const validateNotificationTemplate = (data: unknown) =>
  notificationTemplateSchema.parse(data);
export const validateNotificationTemplateRequestSchema = (data: unknown) =>
  notificationTemplateRequestSchema.parse(data);
export const validateNotificationTemplateUpdateRequestSchema = (data: unknown) =>
  notificationTemplateUpdateRequestSchema.parse(data);

export const safeValidateBaseNotification = (data: unknown) =>
  baseNotificationSchema.safeParse(data);
export const safeValidateDelayedNotificationTopic = (data: unknown) =>
  delayedNotificationTopicSchema.safeParse(data);
export const safeValidateNotificationStatusTopic = (data: unknown) =>
  notificationStatusTopicSchema.safeParse(data);
export const safeValidateNotification = (data: unknown) =>
  notificationSchema.safeParse(data);
export const safeValidateOutbox = (data: unknown) =>
  outboxSchema.safeParse(data);
export const safeValidateNotificationRequest = (data: unknown) =>
  baseNotificationRequestSchema.safeParse(data);
export const safeValidateBatchNotificationRequest = (data: unknown) =>
  baseBatchNotificationRequestSchema.safeParse(data);
export const safeValidateNotificationTemplate = (data: unknown) =>
  notificationTemplateSchema.safeParse(data);
export const safeValidateNotificationTemplateRequestSchema = (data: unknown) =>
  notificationTemplateRequestSchema.safeParse(data);
export const safeValidateNotificationTemplateUpdateRequestSchema = (data: unknown) =>
  notificationTemplateUpdateRequestSchema.safeParse(data);

// ============================================================================
// DYNAMIC OPERATIONAL SETTINGS & ADMIN AUTH SCHEMAS
// ============================================================================

export const operationalSettingsSchema = z.object({
  api: z.object({
    max_batch_req_limit: z.number().int().min(10).max(10000).default(1000),
  }),
  worker: z.object({
    outbox_poll_interval_ms: z.number().int().min(500).max(60000).default(5000),
    outbox_cleanup_interval_ms: z.number().int().min(5000).max(600000).default(60000),
    outbox_batch_size: z.number().int().min(1).max(2000).default(100),
    outbox_retention_ms: z.number().int().min(10000).max(86400000).default(300000),
    outbox_claim_timeout_ms: z.number().int().min(5000).max(300000).default(30000),
  }),
  retry: z.object({
    max_retry_count: z.number().int().min(1).max(30).default(5),
    idempotency_ttl_seconds: z.number().int().min(60).max(2592000).default(86400),
    processing_ttl_seconds: z.number().int().min(10).max(1800).default(120),
    rate_limit_retry_delay_ms: z.number().int().min(100).max(60000).default(5000),
  }),
  delayed: z.object({
    delayed_poll_interval_ms: z.number().int().min(200).max(30000).default(1000),
    delayed_batch_size: z.number().int().min(1).max(500).default(10),
    max_poller_retries: z.number().int().min(1).max(10).default(3),
  }),
  recovery: z.object({
    recovery_poll_interval_ms: z.number().int().min(5000).max(600000).default(60000),
    processing_stuck_threshold_ms: z.number().int().min(10000).max(3600000).default(300000),
    pending_stuck_threshold_ms: z.number().int().min(10000).max(3600000).default(300000),
    recovery_batch_size: z.number().int().min(1).max(500).default(50),
    recovery_claim_timeout_ms: z.number().int().min(5000).max(300000).default(60000),
    cleanup_resolved_alerts_retention_ms: z.number().int().min(60000).max(2592000000).default(86400000),
    cleanup_processed_status_outbox_retention_ms: z.number().int().min(60000).max(2592000000).default(86400000),
  }),
  logging: z.object({
    log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    log_to_file: z.boolean().default(true),
  }),
});

export const partialOperationalSettingsSchema = z.object({
  api: operationalSettingsSchema.shape.api.partial().optional(),
  worker: operationalSettingsSchema.shape.worker.partial().optional(),
  retry: operationalSettingsSchema.shape.retry.partial().optional(),
  delayed: operationalSettingsSchema.shape.delayed.partial().optional(),
  recovery: operationalSettingsSchema.shape.recovery.partial().optional(),
  logging: operationalSettingsSchema.shape.logging.partial().optional(),
});

export const adminSetupSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(50, "Username cannot exceed 50 characters"),
  password: z.string().min(8, "Password must be at least 8 characters").max(64, "Password cannot exceed 64 characters"),
});

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * npm registry configuration schema for individual custom registries/scopes
 */
export const npmRegistryConfigSchema = z.object({
  id: z.string().optional(),
  scope: z.string().trim().optional(),
  registry_url: z.string().url("Invalid registry URL").default("https://registry.npmjs.org/"),
  token: z.string().min(1, "npm token cannot be empty"),
});

/**
 * npm registry status item for public/dashboard display
 */
export const npmRegistryStatusSchema = z.object({
  id: z.string(),
  scope: z.string().optional(),
  registry_url: z.string(),
  masked_token: z.string(),
  updated_at: z.string(),
});

/**
 * npm registry authentication config schema
 */
export const npmAuthConfigSchema = z.object({
  token: z.string().min(1, "npm token cannot be empty"),
  registry_url: z.string().url("Invalid registry URL").default("https://registry.npmjs.org/"),
  scope: z.string().trim().optional(),
});

/**
 * npm registry auth status schema (safe to return to UI with masked token and registry list)
 */
export const npmAuthStatusSchema = z.object({
  is_configured: z.boolean(),
  registries: z.array(npmRegistryStatusSchema).default([]),
  default_registry: z.string().optional(),
  masked_token: z.string().optional(),
});

/**
 * Payload schema for installing a plugin package
 */
export const installPluginPayloadSchema = z.object({
  package: z.string().min(1, "Package name is required"),
  version: z.string().optional(),
  auth: z.object({
    token: z.string().optional(),
    registry_url: z.string().url("Invalid registry URL").optional(),
    scope: z.string().optional(),
    save_token: z.boolean().default(true),
  }).optional(),
});

/**
 * Provider rate limit configuration schema
 */
export const providerRateLimitConfigDetailsSchema = z.object({
  max_tokens: z.number(),
  refill_rate: z.number(),
  refill_interval: z.enum(['second', 'minute', 'hour', 'day']),
  normalized_refill_rate: z.number(),
});

/**
 * Provider rate limit real-time status schema
 */
export const providerRateLimitRealtimeStatusSchema = z.object({
  remaining_tokens: z.number(),
  used_tokens: z.number(),
  usage_percentage: z.number(),
  is_exhausted: z.boolean(),
  resets_in_ms: z.number(),
  full_refill_in_ms: z.number(),
  last_refill_at: z.coerce.date().nullable(),
  last_exhausted_at: z.coerce.date().nullable(),
  exhausted_count: z.number(),
});

/**
 * Provider rate limit status item schema
 */
export const providerRateLimitStatusSchema = z.object({
  provider_id: z.string(),
  channel: z.string(),
  plugin_name: z.string(),
  display_name: z.string().optional(),
  enabled: z.boolean(),
  config: providerRateLimitConfigDetailsSchema,
  status: providerRateLimitRealtimeStatusSchema,
});

/**
 * Provider rate limit summary schema
 */
export const providerRateLimitSummarySchema = z.object({
  total_providers: z.number(),
  exhausted_providers: z.number(),
  healthy_providers: z.number(),
});

/**
 * Provider rate limit list response schema
 */
export const providerRateLimitListResponseSchema = z.object({
  providers: z.array(providerRateLimitStatusSchema),
  summary: providerRateLimitSummarySchema,
});

// ============================================================================
// API KEY & ADMIN AUTH SCHEMAS
// ============================================================================

export const apiKeyUsageSchema = z.object({
  total_requests: z.number().int().min(0).default(0),
  total_notifications: z.number().int().min(0).default(0),
  by_channel: z.record(z.string(), z.number().int().min(0)).default({}),
  last_used_at: z.coerce.date().nullable().optional(),
});

export const apiKeyStatusSchema = z.enum(['active', 'revoked']);

export const apiKeyDocSchema = z.object({
  key_id: z.string(),
  name: z.string(),
  key_prefix: z.string(),
  key_hash: z.string(),
  status: apiKeyStatusSchema,
  expires_at: z.coerce.date().nullable().optional(),
  usage: apiKeyUsageSchema,
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100),
  expires_at: z.coerce.date().optional(),
});

export const apiKeyResponseSchema = z.object({
  key_id: z.string(),
  name: z.string(),
  key_prefix: z.string(),
  status: apiKeyStatusSchema,
  expires_at: z.coerce.date().nullable().optional(),
  usage: apiKeyUsageSchema,
  created_at: z.coerce.date(),
});

export const createApiKeyResponseSchema = z.object({
  key: apiKeyResponseSchema,
  raw_key: z.string(),
});

