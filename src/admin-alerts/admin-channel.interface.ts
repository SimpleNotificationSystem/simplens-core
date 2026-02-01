/**
 * Admin Channel Provider Interface
 * Defines the contract for admin notification channel implementations
 */

import type { AdminAlertType, AdminChannelType } from '@src/types/types.js';

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
 * Interface for admin alert channel providers
 * All channel implementations must implement this interface
 */
export interface AdminChannelProvider {
    readonly channelType: AdminChannelType;

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
}
