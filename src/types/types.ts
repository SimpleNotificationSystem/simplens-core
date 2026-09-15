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

export type RefillInterval = 'second' | 'minute' | 'hour' | 'day';

export interface DeliveryResult {
    success: boolean;
    messageId?: string;
    providerResponse?: unknown;
    error?: {
        code: string;
        message: string;
        retryable: boolean;
    };
}

export interface ProviderConfig {
    id: string;
    credentials: Record<string, string>;
    options?: ProviderOptions;
}

export interface SimpleNSProvider<TNotification extends BaseNotification = BaseNotification> {
    readonly manifest: ProviderManifest;

    getNotificationSchema(): z.ZodSchema<TNotification>;
    getRecipientSchema(): z.ZodObject<Record<string, z.ZodTypeAny>>;
    getContentSchema(): z.ZodObject<Record<string, z.ZodTypeAny>>;
    getRateLimitConfig(): RateLimitConfig;

    initialize(config: ProviderConfig): Promise<void>;
    healthCheck(): Promise<boolean>;
    send(notification: TNotification): Promise<DeliveryResult>;
    shutdown(): Promise<void>;
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
    // Admin channel schemas
    adminChannelSchema,
    systemConfigSchema,
    encryptedConfigSchema,
    alertFiltersSchema,
    discordConfigSchema,
    telegramConfigSchema,
    ADMIN_CHANNEL_TYPE,
    ADMIN_ALERT_TYPE,
    notificationTemplateSchema,
    // Plugin & Provider schemas
    encryptedCredentialsSchema,
    providerManifestSchema,
    providerConfigOptionsSchema,
    providerConfigEntrySchema,
    pluginSchema,
    providerSchema,
    channelRoutingSchema,
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

export type BaseNotification = Omit<base_notification, 'notification_id'> & {
    notification_id: string;
};
export type ProviderManifest = provider_manifest;
export type RateLimitConfig = {
    maxTokens: number;
    refillRate: number;
    refillInterval?: RefillInterval;
};

export interface RateLimitResult {
    allowed: boolean;
    remainingTokens: number;
    retryAfterMs?: number;
    queuePosition?: number;
}

export type HealthChecker = () => Promise<boolean>;

// ============================================================================
// ADMIN NOTIFICATION CHANNEL TYPES
// ============================================================================

export type admin_channel = z.infer<typeof adminChannelSchema>;
export type system_config = z.infer<typeof systemConfigSchema>;
export type encrypted_config = z.infer<typeof encryptedConfigSchema>;
export type alert_filters = z.infer<typeof alertFiltersSchema>;
export type discord_config = z.infer<typeof discordConfigSchema>;
export type telegram_config = z.infer<typeof telegramConfigSchema>;
export type AdminChannelType = (typeof ADMIN_CHANNEL_TYPE)[number];
export type AdminAlertType = (typeof ADMIN_ALERT_TYPE)[number];
export type notification_template = z.infer<typeof notificationTemplateSchema>;

// ============================================================================
// PLUGIN & PROVIDER MANAGEMENT TYPES
// ============================================================================

export type encrypted_credentials = z.infer<typeof encryptedCredentialsSchema>;
export type provider_manifest = z.infer<typeof providerManifestSchema>;
export type plugin_document = z.infer<typeof pluginSchema>;
export type provider_document = z.infer<typeof providerSchema>;
export type channel_routing_document = z.infer<typeof channelRoutingSchema>;

export interface KafkaConsumerState {
    consumer: import('kafkajs').Consumer | null;
    isConsuming: boolean;
}

export interface OutboxCronState {
    pollIntervalId: NodeJS.Timeout | null;
    cleanupIntervalId: NodeJS.Timeout | null;
    statusPollIntervalId: NodeJS.Timeout | null;
    isPolling: boolean;
    isCleaningUp: boolean;
    isPollingStatus: boolean;
    shouldStop: boolean;
}

export interface RecoveryCronState {
    intervalId: NodeJS.Timeout | null;
    isRunning: boolean;
    shouldStop: boolean;
    healthChecker: HealthChecker | null;
    consecutiveFailures: number;
}

export interface ChannelResult {
    success: boolean;
    error?: string;
}

export interface AlertMetadata {
    alertType?: AdminAlertType;
    severity?: 'info' | 'warning' | 'critical';
    timestamp?: Date;
    notificationId?: string;
    channel?: string;
    errorMessage?: string;
}

export interface CredentialField {
    name: string;
    type: 'string' | 'url' | 'secret';
    label: string;
    placeholder?: string;
    description?: string;
    required: boolean;
    pattern?: string;
}

export interface AdminChannelProvider {
    readonly channelType: AdminChannelType;
    readonly displayName: string;
    send(message: string, metadata?: AlertMetadata): Promise<ChannelResult>;
    testConnection(): Promise<ChannelResult>;
    getCredentialSchema(): CredentialField[];
}

export interface AdminChannelMeta {
    channelType: AdminChannelType;
    displayName: string;
    credentialFields: CredentialField[];
}

export interface RegisteredProvider {
    provider: SimpleNSProvider;
    id: string;
    priority: number;
}

export interface ChannelConfig {
    default: string;
    fallback?: string | string[];
}

export interface FieldDefinition {
    name: string;
    type: 'string' | 'email' | 'phone' | 'text' | 'number' | 'boolean';
    required: boolean;
    description?: string;
}

export interface ProviderMetadata {
    id: string;
    name: string;
    displayName: string;
    description?: string;
    priority: number;
    recipientFields: FieldDefinition[];
    contentFields: FieldDefinition[];
}

export interface ChannelMetadata {
    providers: ProviderMetadata[];
    default?: string;
    fallback?: string | string[];
}

export interface PluginMetadata {
    channels: Record<string, ChannelMetadata>;
}

export type ProviderRateLimitOptions = z.infer<typeof providerConfigOptionsSchema>['rateLimit'];
export type ProviderOptions = z.infer<typeof providerConfigOptionsSchema>;

export type ProviderConfigEntry = z.infer<typeof providerConfigEntrySchema>;

export type plugin_catalog_entry = {
    name: string;
    package: string;
    description: string;
    versions?: string[];
};
export type YamlProviderEntry = ProviderConfigEntry;

export interface YamlConfig {
    providers?: YamlProviderEntry[];
    channels?: Record<string, {
        default: string;
        fallback?: string | string[];
        partitions?: number;
    }>;
}

export type ProviderEntry = ProviderConfigEntry & {
    credentials: Record<string, string>;
};

export interface SimpleNSConfig {
    providers: ProviderEntry[];
    channels?: Record<string, {
        default: string;
        fallback?: string;
    }>;
}

export interface ProviderResponseDto {
    _id?: string;
    id: string;
    plugin_name: string;
    channel: string;
    enabled: boolean;
    options?: ProviderOptions;
    credentials_configured: boolean;
    created_at?: Date;
    updated_at?: Date;
}

export type PluginSyncAction =
    | 'PLUGIN_INSTALLED'
    | 'PLUGIN_UNINSTALLED'
    | 'PLUGIN_VERSION_CHANGED'
    | 'PROVIDER_UPSERTED'
    | 'PROVIDER_DELETED'
    | 'CHANNEL_ROUTING_UPDATED'
    | 'SYSTEM_RELOAD';

export interface PluginSyncPayload {
    plugin_name?: string;
    version?: string;
    provider_id?: string;
    channel?: string;
    [key: string]: unknown;
}

export interface PluginSyncMessage {
    event_id: string;
    source_instance_id: string;
    timestamp: string;
    action: PluginSyncAction;
    payload: PluginSyncPayload;
}

export type PluginSyncHandler = (message: PluginSyncMessage) => Promise<void>;

export interface DelayedEventWithRetries extends delayed_notification_topic {
    _pollerRetries?: number;
}

export interface IdempotencyRecord {
    status: 'processing' | 'delivered' | 'failed' | 'rate_limited';
    retry_count: number;
    updated_at: string;
}

export interface StatusProcessResult {
    dbUpdated: boolean;
    webhookUrl?: string;
    webhookPayload?: WebhookPayload;
    notificationId?: string;
}

export interface WebhookPayload {
    request_id: string;
    client_id: string;
    notification_id: string;
    status: string;
    channel: string;
    message: string;
    occurred_at: string;
}

export type ServiceContext =
    | 'api'
    | 'producer'
    | 'consumer'
    | 'cron'
    | 'worker'
    | 'delayedWorker'
    | 'unifiedProcessor'
    | 'redis'
    | 'recoveryService'
    | 'adminAlert'
    | 'pluginLoader'
    | 'pluginRegistry'
    | 'rateLimiter';

export interface LogMeta {
    notificationId?: string;
    requestId?: string;
    clientId?: string;
    channel?: string;
    workerId?: string;
    topic?: string;
    partition?: number;
    [key: string]: unknown;
}

export interface Logger {
    info: (message: string, meta?: LogMeta) => void;
    warn: (message: string, meta?: LogMeta) => void;
    error: (message: string, meta?: LogMeta | unknown) => void;
    debug: (message: string, meta?: LogMeta) => void;
    success: (message: string, meta?: LogMeta) => void;
}

export interface SendResult {
    successCount: number;
    failedCount: number;
}

export interface ProcessingStats {
    processed: number;
    success: number;
    failed: number;
}

export interface ValidatedOutboxEntry {
    _id: import('mongoose').Types.ObjectId;
    notification_id: import('mongoose').Types.ObjectId | string;
    topic: string;
    payload: Record<string, unknown>;
    status: string;
}
