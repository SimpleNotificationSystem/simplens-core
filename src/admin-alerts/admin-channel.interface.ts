/**
 * Admin Channel Provider Interface
 * Defines the contract for admin notification channel implementations
 */

export type {
    AdminChannelProvider,
    AlertMetadata,
    ChannelResult,
    CredentialField,
} from '@src/types/types.js';

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

