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
import { validate, version } from 'uuid';
import { env } from "@src/config/env.config.js";

// ============================================================================
// BASE FIELD SCHEMAS
// ============================================================================

export const objectIdSchema = z.custom<mongoose.Types.ObjectId>(
    (val) => mongoose.Types.ObjectId.isValid(val as string),
    { error: "Invalid ObjectId" }
);

export const UUIDV4Schema = z.custom<UUID>(
    (val) => validate(val) && (version(val as string) == 4),
    { error: "Invalid UUIDV4" }
);

export const variablesSchema = z.record(z.string(), z.string());

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

// ============================================================================
// API REQUEST SCHEMAS
// ============================================================================

/**
 * Single notification request - channel-agnostic
 */
export const baseNotificationRequestSchema = z.object({
    request_id: UUIDV4Schema,
    client_id: UUIDV4Schema,
    client_name: z.string().optional(),
    channel: z.array(z.string()),
    provider: z.array(z.string()).optional(),
    recipient: z.record(z.string(), z.unknown()),
    content: z.record(z.string(), z.unknown()),
    variables: variablesSchema.optional(),
    scheduled_at: z.coerce.date().optional(),
    webhook_url: z.url()
}).refine(
    (data) => {
        if (Array.isArray(data.provider) && Array.isArray(data.channel)) {
            return data.provider.length === data.channel.length;
        }
        return true;
    },
    {
        message: "Provider array length must match channel array length",
        path: ["provider"]
    }
);

/**
 * Batch notification request - channel-agnostic
 */
export const baseBatchNotificationRequestSchema = z.object({
    client_id: UUIDV4Schema,
    client_name: z.string().optional(),
    channel: z.array(z.string()),
    provider: z.union([z.string(), z.array(z.string().nullable().optional())]).optional(),
    content: z.record(z.string(), z.unknown()),
    recipients: z.array(
        z.looseObject({
            request_id: UUIDV4Schema,
            user_id: z.string(),
            variables: variablesSchema.optional(),
        })
    ),
    scheduled_at: z.coerce.date().optional(),
    webhook_url: z.url()
}).refine(
    (data) => {
        // limit check
        if (data.recipients && data.recipients.length * data.channel.length > env.MAX_BATCH_REQ_LIMIT) {
            return false;
        }
        // provider length check
        if (Array.isArray(data.provider) && Array.isArray(data.channel)) {
            return data.provider.length === data.channel.length;
        }
        return true;
    },
    {
        message: `Batch size exceeds limit (${env.MAX_BATCH_REQ_LIMIT})`,
        path: ["recipients"]
    }
);

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export const validateBaseNotification = (data: unknown) => baseNotificationSchema.parse(data);
export const validateDelayedNotificationTopic = (data: unknown) => delayedNotificationTopicSchema.parse(data);
export const validateNotificationStatusTopic = (data: unknown) => notificationStatusTopicSchema.parse(data);
export const validateNotification = (data: unknown) => notificationSchema.parse(data);
export const validateOutbox = (data: unknown) => outboxSchema.parse(data);
export const validateNotificationRequest = (data: unknown) => baseNotificationRequestSchema.parse(data);
export const validateBatchNotificationRequest = (data: unknown) => baseBatchNotificationRequestSchema.parse(data);

export const safeValidateBaseNotification = (data: unknown) => baseNotificationSchema.safeParse(data);
export const safeValidateDelayedNotificationTopic = (data: unknown) => delayedNotificationTopicSchema.safeParse(data);
export const safeValidateNotificationStatusTopic = (data: unknown) => notificationStatusTopicSchema.safeParse(data);
export const safeValidateNotification = (data: unknown) => notificationSchema.safeParse(data);
export const safeValidateOutbox = (data: unknown) => outboxSchema.safeParse(data);
export const safeValidateNotificationRequest = (data: unknown) => baseNotificationRequestSchema.safeParse(data);
export const safeValidateBatchNotificationRequest = (data: unknown) => baseBatchNotificationRequestSchema.safeParse(data);
