/**
 * Admin Channel Provider Interface
 * Defines the contract for admin notification channel implementations
 */

import type { AdminAlertType, AdminChannelType } from '@src/types/types.js';

/**
 * Severity colors for Discord embeds
 */
export const SEVERITY_COLORS = {
    info: 3447003,      // Blue
    warning: 16776960,  // Yellow  
    critical: 15158332, // Red
} as const;

/**
 * Emoji prefixes for different alert types
 */
export const ALERT_EMOJIS: Record<string, string> = {
    failed_notification: '❌',
    service_health: '🔴',
    stuck_processing: '⏳',
    orphaned_pending: '👻',
    ghost_delivery: '👻',
};

/**
 * Result of a channel operation
 */
export interface ChannelResult {
    success: boolean;
    error?: string;
}

/**
 * Metadata attached to alerts for rich formatting
 */
export interface AlertMetadata {
    alertType?: AdminAlertType;
    severity?: 'info' | 'warning' | 'critical';
    timestamp?: Date;
    notificationId?: string;
    channel?: string;
    errorMessage?: string;
}

/**
 * Credential field definition for dynamic form generation
 * Used by dashboard to render provider-specific configuration forms
 */
export interface CredentialField {
    /** Field name (used as key in config object) */
    name: string;
    /** Field type for input rendering */
    type: 'string' | 'url' | 'secret';
    /** Display label for the field */
    label: string;
    /** Placeholder text for input */
    placeholder?: string;
    /** Help text / description */
    description?: string;
    /** Whether field is required */
    required: boolean;
    /** Regex pattern for validation */
    pattern?: string;
}

/**
 * Interface for admin alert channel providers
 * All channel implementations must implement this interface
 */
export interface AdminChannelProvider {
    /** The channel type identifier */
    readonly channelType: AdminChannelType;
    
    /** Display name for UI */
    readonly displayName: string;

    /**
     * Send an alert message through this channel
     * @param message - The alert message to send
     * @param metadata - Optional metadata for rich formatting
     */
    send(message: string, metadata?: AlertMetadata): Promise<ChannelResult>;

    /**
     * Test the channel connection
     * @returns Result indicating if the connection test was successful
     */
    testConnection(): Promise<ChannelResult>;

    /**
     * Get credential schema for dynamic form generation
     * @returns Array of credential field definitions
     */
    getCredentialSchema(): CredentialField[];
}

