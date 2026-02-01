/**
 * Telegram Channel Provider
 * Self-registers with the channel registry on import
 */

import type {
    AdminChannelProvider,
    ChannelResult,
    AlertMetadata,
    CredentialField
} from '../admin-channel.interface.js';
import {ALERT_EMOJIS } from '../admin-channel.interface.js';
import type { telegram_config } from '@src/types/types.js';
import { registerChannelProvider } from '../channel-registry.js';

/**
 * Telegram admin channel implementation
 */
export class TelegramChannel implements AdminChannelProvider {
    readonly channelType = 'telegram' as const;
    readonly displayName = 'Telegram';

    constructor(private botToken: string, private chatId: string) {}

    getCredentialSchema(): CredentialField[] {
        return [
            {
                name: 'bot_token',
                type: 'secret',
                label: 'Bot Token',
                placeholder: '123456789:ABCdefGhI...',
                description: 'From @BotFather',
                required: true,
                pattern: '^[0-9]+:[a-zA-Z0-9_-]+$'
            },
            {
                name: 'chat_id',
                type: 'string', // text input, not just numbers in UI, can be negative
                label: 'Chat ID',
                placeholder: '-1001234567890',
                description: 'Channel or Group ID',
                required: true,
                pattern: '^-?[0-9]+$'
            }
        ];
    }

    async send(message: string, metadata?: AlertMetadata): Promise<ChannelResult> {
        try {
            const emoji = metadata?.alertType
                ? ALERT_EMOJIS[metadata.alertType] || '🔔'
                : '🔔';
            
            // Map severity to colored circle emojis since Telegram doesn't support colored embeds
            const severityIcon = this.getSeverityIcon(metadata?.severity);

            const formattedMessage = `<b>${severityIcon} ${emoji} ${this.formatAlertType(metadata?.alertType)}</b>\n\n${this.escapeHtml(message)}`;
            
            let details = '';
            if (metadata?.notificationId) {
                details += `<b>ID:</b> <code>${metadata.notificationId}</code>\n`;
            }
            if (metadata?.channel) {
                details += `<b>Channel:</b> ${metadata.channel}\n`;
            }
            if (metadata?.errorMessage) {
                details += `<b>Error:</b> <pre>${this.escapeHtml(metadata.errorMessage.slice(0, 200))}</pre>\n`;
            }

            const fullText = details ? `${formattedMessage}\n\n${details}` : formattedMessage;

            const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: fullText,
                    parse_mode: 'HTML',
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                return {
                    success: false,
                    error: `Telegram API error: ${response.status} - ${JSON.stringify(errorData)}`
                };
            }

            return { success: true };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error'
            };
        }
    }

    async testConnection(): Promise<ChannelResult> {
        return this.send('✅ Test message from SimpleNS Admin Alerts', {
            alertType: 'service_health',
            severity: 'info',
            timestamp: new Date()
        });
    }

    private getSeverityIcon(severity?: 'info' | 'warning' | 'critical'): string {
        switch (severity) {
            case 'warning': return '🟡';
            case 'critical': return '🔴';
            case 'info':
            default: return '🔵';
        }
    }

    private formatAlertType(type?: string): string {
        if (!type) return 'Admin Alert';
        return type
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
}

// Self-register on module load
registerChannelProvider('telegram', (config: unknown) => {
    // Graceful handling for metadata extraction (empty config)
    const conf = (config || {}) as Partial<telegram_config>;
    return new TelegramChannel(conf.bot_token || '', conf.chat_id || '');
});