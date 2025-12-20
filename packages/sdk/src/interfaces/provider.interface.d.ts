/**
 * @simplens/sdk - Provider Interface
 *
 * All notification providers must implement this interface.
 * Providers are developed as separate npm packages.
 */
import { z } from 'zod';
/**
 * Delivery result from sending a notification
 */
export interface DeliveryResult {
    /** Whether the notification was sent successfully */
    success: boolean;
    /** Provider-specific message ID */
    messageId?: string;
    /** Raw response from the provider (for debugging) */
    providerResponse?: unknown;
    /** Error details if failed */
    error?: {
        /** Error code */
        code: string;
        /** Human-readable error message */
        message: string;
        /** Whether this error can be retried */
        retryable: boolean;
    };
}
/**
 * Provider configuration passed during initialization
 */
export interface ProviderConfig {
    /** Unique identifier for this provider instance */
    id: string;
    /** Provider credentials (API keys, tokens, etc.) */
    credentials: Record<string, string>;
    /** Optional provider-specific settings */
    options?: Record<string, unknown>;
}
/**
 * Rate limit configuration for the provider
 */
export interface RateLimitConfig {
    /** Maximum tokens in the bucket */
    maxTokens: number;
    /** Tokens added per second */
    refillRate: number;
}
/**
 * Provider manifest - metadata about the provider
 */
export interface ProviderManifest {
    /** Provider package name (e.g., '@simplens/gmail') */
    name: string;
    /** Semantic version */
    version: string;
    /** Channel type: 'email' | 'sms' | 'push' | 'whatsapp' | 'chat' */
    channel: string;
    /** Human-readable name (e.g., 'Gmail via Nodemailer') */
    displayName: string;
    /** Provider description */
    description: string;
    /** Author/maintainer */
    author: string;
    /** Homepage/docs URL */
    homepage?: string;
    /** Required credential field names */
    requiredCredentials: string[];
    /** Optional configuration field names */
    optionalConfig?: string[];
}
/**
 * Base notification fields common to all channels
 */
export interface BaseNotification {
    /** MongoDB ObjectId as string */
    notification_id: string;
    /** UUID v4 request identifier */
    request_id: string;
    /** UUID v4 client identifier */
    client_id: string;
    /** Channel name */
    channel: string;
    /** Recipient information */
    recipient: Record<string, unknown>;
    /** Message content */
    content: Record<string, unknown>;
    /** Template variables for substitution */
    variables?: Record<string, string>;
    /** Webhook URL for status callbacks */
    webhook_url: string;
    /** Current retry count */
    retry_count: number;
    /** Notification creation timestamp */
    created_at: Date;
}
/**
 * SimpleNS Provider Interface
 *
 * Every notification provider must implement this interface.
 * Providers handle the actual delivery of notifications via
 * external APIs (SendGrid, Twilio, etc.).
 *
 * SimpleNS core handles:
 * - Rate limiting
 * - Retry with exponential backoff
 * - Idempotency
 * - Recovery
 * - Status tracking
 * - Webhook callbacks
 *
 * Providers handle:
 * - Actual delivery via external API
 * - Provider-specific authentication
 * - Message formatting for the provider
 */
export interface SimpleNSProvider<TNotification extends BaseNotification = BaseNotification> {
    /**
     * Provider manifest with metadata
     */
    readonly manifest: ProviderManifest;
    /**
     * Get Zod schema for validating notification payloads
     * Used by SimpleNS to validate messages before delivery
     */
    getNotificationSchema(): z.ZodSchema<TNotification>;
    /**
     * Get Zod schema for recipient fields required by this provider
     * Example: { email: z.string().email() } for email providers
     */
    getRecipientSchema(): z.ZodObject<Record<string, z.ZodTypeAny>>;
    /**
     * Get Zod schema for content fields
     * Example: { subject: z.string(), html: z.string() } for email
     */
    getContentSchema(): z.ZodObject<Record<string, z.ZodTypeAny>>;
    /**
     * Get rate limiting configuration for this provider
     * SimpleNS uses this to control send rate
     */
    getRateLimitConfig(): RateLimitConfig;
    /**
     * Initialize the provider with credentials
     * Called once when SimpleNS loads the provider
     *
     * @param config - Provider configuration with credentials
     */
    initialize(config: ProviderConfig): Promise<void>;
    /**
     * Verify the provider is properly configured
     * Called after initialize() for health checks
     *
     * @returns true if provider is healthy and can send
     */
    healthCheck(): Promise<boolean>;
    /**
     * Send a notification through this provider
     * This is where the actual delivery happens
     *
     * @param notification - The validated notification payload
     * @returns DeliveryResult with success/failure information
     */
    send(notification: TNotification): Promise<DeliveryResult>;
    /**
     * Clean up resources when SimpleNS shuts down
     * Close connections, clear timers, etc.
     */
    shutdown(): Promise<void>;
}
