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
import { env } from "@src/config/env.config.js";

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

// ============================================================================
// BASE NOTIFICATION SCHEMA (Channel-Agnostic)
// ============================================================================

/**
 * Base notification schema - plugins extend this with channel-specific fields
 */
export const baseNotificationSchema = z.object({
  notification_id: objectIdSchema,
  request_id: UUIDV4Schema,
  client_id: UUIDV4Schema,
  client_name: z.string().optional(),
  channel: z.string(),
  provider: z.string().optional(),
  recipient: z.record(z.string(), z.unknown()),
  content: z.record(z.string(), z.unknown()),
  variables: variablesSchema.optional(),
  webhook_url: z.url(),
  retry_count: z.number().int().min(0),
  scheduled_at: z.coerce.date().optional(),
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
  request_id: UUIDV4Schema,
  client_id: UUIDV4Schema,
  client_name: z.string().optional(),
  channel: z.string(),
  provider: z.string().optional(),
  recipient: z.record(z.string(), z.unknown()),
  content: z.record(z.string(), z.unknown()),
  variables: variablesSchema.optional(),
  webhook_url: z.url(),
  status: z.enum(NOTIFICATION_STATUS),
  scheduled_at: z.coerce.date().optional(),
  error_message: z.string().optional(),
  retry_count: z.number().int().min(0),
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
    value: z.string(),
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
    client_id: UUIDV4Schema,
    client_name: z.string().optional(),
    template_id: z.array(z.string().nullable().optional()).optional(),
    channel: z.array(z.string()).min(1, "At least one channel is required."),
    provider: z
      .union([z.string(), z.array(z.string().nullable().optional())])
      .optional(),
    recipient: z.record(z.string(), z.unknown()),
    content: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    variables: variablesSchema.optional(),
    scheduled_at: z.coerce.date().optional(),
    webhook_url: z.url(),
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
    client_id: UUIDV4Schema,
    client_name: z.string().optional(),
    channel: z.array(z.string()).min(1, "At least one channel is required."),
    template_id: z.array(z.string().nullable().optional()).optional(),
    provider: z
      .union([z.string(), z.array(z.string().nullable().optional())])
      .optional(),
    content: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    recipients: z.array(
      z.looseObject({
        request_id: UUIDV4Schema,
        user_id: z.string(),
        variables: variablesSchema.optional(),
      }),
    ).min(1, "At least one recipient is required."),
    scheduled_at: z.coerce.date().optional(),
    webhook_url: z.url(),
  })
  .refine(
    (data) => {
      // limit check
      if (
        data.recipients &&
        data.recipients.length * data.channel.length > env.MAX_BATCH_REQ_LIMIT
      ) {
        return false;
      }
      return true;
    },
    {
      message: `Batch size exceeds limit (${env.MAX_BATCH_REQ_LIMIT})`,
      path: ["recipients"],
    },
  )
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
  name: z.string(),
  template_id: z.string().optional(),
  description: z.string().optional(),
  content: z.record(z.string(), z.unknown()),
  package: z.string(),
});

export const notificationTemplateUpdateRequestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  content: z.record(z.string(), z.unknown()),
  package: z.string(),
});

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
