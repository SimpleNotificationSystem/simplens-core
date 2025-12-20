/**
 * Core Types for SimpleNS
 * 
 * These types are channel-agnostic. Channel-specific types and schemas
 * are provided by plugins via @simplens/sdk.
 */

import { z } from 'zod';

// ============================================================================
// DYNAMIC CHANNEL SUPPORT
// ============================================================================

/**
 * Channel is a dynamic string. Channels are registered by plugins at runtime.
 */
export type Channel = string;

/**
 * Get Kafka topic name for a channel
 */
export const getTopicForChannel = (channel: Channel): string => {
    return `${channel}_notification`;
};

// ============================================================================
// CORE TOPICS
// ============================================================================

/**
 * Core Kafka topics used by SimpleNS
 */
export enum CORE_TOPICS {
    delayed_notification = "delayed_notification",
    notification_status = "notification_status"
}

// ============================================================================
// STATUS ENUMS
// ============================================================================

export enum NOTIFICATION_STATUS {
    delivered = "delivered",
    pending = "pending",
    processing = "processing",
    failed = "failed"
}

export enum NOTIFICATION_STATUS_SF {
    delivered = "delivered",
    failed = "failed"
}

export enum OUTBOX_STATUS {
    pending = "pending",
    processing = "processing",
    published = "published"
}

export enum ALERT_TYPE {
    ghost_delivery = "ghost_delivery",
    stuck_processing = "stuck_processing",
    orphaned_pending = "orphaned_pending"
}

// ============================================================================
// SCHEMA IMPORTS
// ============================================================================

import {
    delayedNotificationTopicSchema,
    notificationStatusTopicSchema,
    notificationSchema,
    outboxSchema,
    alertSchema,
    statusOutboxSchema,
    baseNotificationRequestSchema,
    baseBatchNotificationRequestSchema,
    baseNotificationSchema,
} from "./schemas.js";

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type delayed_notification_topic = z.infer<typeof delayedNotificationTopicSchema>;

export type notification_status_topic = z.infer<typeof notificationStatusTopicSchema>;

export type notification = z.infer<typeof notificationSchema>;

export type outbox = z.infer<typeof outboxSchema>;

export type notification_request = z.infer<typeof baseNotificationRequestSchema>;

export type batch_notification_request = z.infer<typeof baseBatchNotificationRequestSchema>;

export type alert = z.infer<typeof alertSchema>;

export type status_outbox = z.infer<typeof statusOutboxSchema>;

export type base_notification = z.infer<typeof baseNotificationSchema>;

// ============================================================================
// GENERIC NOTIFICATION TYPE
// ============================================================================

/**
 * Base notification structure that all channels must follow.
 */
export interface GenericNotification {
    notification_id: string;
    request_id: string;
    client_id: string;
    channel: Channel;
    provider?: string;
    recipient: Record<string, unknown>;
    content: Record<string, unknown>;
    variables?: Record<string, string>;
    webhook_url: string;
    retry_count: number;
    created_at: Date;
}
