/**
 * Provider Types
 * 
 * Type definitions for SimpleNS provider plugins.
 * These mirror the @simplens/sdk interfaces for use within the core.
 */

import { z } from 'zod';

/**
 * Delivery result from sending a notification
 */
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

/**
 * Provider configuration passed during initialization
 */
export interface ProviderConfig {
    id: string;
    credentials: Record<string, string>;
    options?: Record<string, unknown>;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
    maxTokens: number;
    refillRate: number;
}

/**
 * Provider manifest - metadata about the provider
 */
export interface ProviderManifest {
    name: string;
    version: string;
    channel: string;
    displayName: string;
    description: string;
    author: string;
    homepage?: string;
    requiredCredentials: string[];
    optionalConfig?: string[];
}

/**
 * Base notification fields common to all channels
 */
export interface BaseNotification {
    notification_id: string;
    request_id: string;
    client_id: string;
    channel: string;
    provider?: string;
    recipient: Record<string, unknown>;
    content: Record<string, unknown>;
    variables?: Record<string, string>;
    webhook_url: string;
    retry_count: number;
    created_at: Date;
}

/**
 * SimpleNS Provider Interface
 */
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
