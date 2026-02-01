/**
 * Discord Webhook Channel Provider
 * Self-registers with the channel registry on import
 */

import type {
    AdminChannelProvider,
    ChannelResult,
    AlertMetadata,
    CredentialField,
} from '../admin-channel.interface.js';
import type { discord_config } from '@src/types/types.js';
import { registerChannelProvider } from '../channel-registry.js';

/**
 * Severity colors for Discord embeds
 */
const SEVERITY_COLORS = {
    info: 3447003,      // Blue
    warning: 16776960,  // Yellow  
    critical: 15158332, // Red
} as const;

/**
 * Emoji prefixes for different alert types
 */
const ALERT_EMOJIS: Record<string, string> = {
    failed_notification: '❌',
    service_health: '🔴',
    stuck_processing: '⏳',
    orphaned_pending: '👻',
    ghost_delivery: '👻',
};

/**
 * Discord webhook channel implementation
 */
export class DiscordChannel implements AdminChannelProvider {
    readonly channelType = 'discord' as const;
    readonly displayName = 'Discord';

    constructor(private webhookUrl: string) {}

    getCredentialSchema(): CredentialField[] {
        return [{
            name: 'webhook_url',
            type: 'url',
            label: 'Discord Webhook URL',
            placeholder: 'https://discord.com/api/webhooks/...',
            description: 'Create a webhook in Server Settings → Integrations → Webhooks',
            required: true,
            pattern: '^https://discord\\.com/api/webhooks/.+',
        }];
    }

    async send(message: string, metadata?: AlertMetadata): Promise<ChannelResult> {
        try {
            const emoji = metadata?.alertType
                ? ALERT_EMOJIS[metadata.alertType] || '🔔'
                : '🔔';
            const color = metadata?.severity
                ? SEVERITY_COLORS[metadata.severity]
                : SEVERITY_COLORS.info;

            // Build fields for rich embed
            const fields: Array<{ name: string; value: string; inline: boolean }> = [];
            if (metadata?.notificationId) {
                fields.push({
                    name: 'Notification ID',
                    value: metadata.notificationId,
                    inline: true,
                });
            }
            if (metadata?.channel) {
                fields.push({
                    name: 'Channel',
                    value: metadata.channel,
                    inline: true,
                });
            }
            if (metadata?.errorMessage) {
                fields.push({
                    name: 'Error',
                    value: metadata.errorMessage.slice(0, 200),
                    inline: false,
                });
            }

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [
                        {
                            title: `${emoji} ${this.formatAlertType(metadata?.alertType)}`,
                            description: message,
                            color,
                            fields: fields.length > 0 ? fields : undefined,
                            timestamp: (metadata?.timestamp || new Date()).toISOString(),
                            footer: { text: 'SimpleNS Admin Alert' },
                        },
                    ],
                }),
            });

            if (!response.ok) {
                return {
                    success: false,
                    error: `Discord API error: ${response.status}`,
                };
            }

            return { success: true };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    }

    async testConnection(): Promise<ChannelResult> {
        return this.send('✅ Test message from SimpleNS Admin Alerts', {
            alertType: 'service_health',
            severity: 'info',
            timestamp: new Date(),
        });
    }

    /**
     * Format alert type for display in embed title
     */
    private formatAlertType(type?: string): string {
        if (!type) return 'Admin Alert';
        return type
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }
}

// Self-register on module load
registerChannelProvider('discord', (config: unknown) => {
    const { webhook_url } = config as discord_config;
    return new DiscordChannel(webhook_url);
});
