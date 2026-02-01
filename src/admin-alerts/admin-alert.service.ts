/**
 * Admin Alert Service
 * Orchestrates sending alerts to configured channels
 * Uses channel registry for extensibility
 */

import type { AdminAlertType } from '@src/types/types.js';
import type { AlertMetadata } from './admin-channel.interface.js';
import admin_channel_model from '@src/database/models/admin-channel.models.js';
import { getOrCreateEncryptionKey } from './key-manager.js';
import { decrypt } from '@src/utils/encryption.utils.js';
import { getChannelProvider } from './channel-registry.js';
import { createLogger } from '@src/workers/utils/logger.js';

const logger = createLogger('worker');

/**
 * Throttle map to prevent alert storms
 * Maps alertType -> lastSentTimestamp
 */
const throttleMap = new Map<string, number>();
const THROTTLE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes //Later add this in .env

/**
 * Map alert types to their corresponding filter field names
 */
const ALERT_FILTER_MAP: Record<AdminAlertType, string> = {
    failed_notification: 'failed_notifications',
    service_health: 'service_health',
    stuck_processing: 'stuck_processing',
    orphaned_pending: 'orphaned_pending',
    ghost_delivery: 'ghost_delivery',
};

/**
 * Admin Alert Service
 * Sends alerts to all configured and enabled channels
 */
export class AdminAlertService {
    /**
     * Send alert to all enabled channels
     * Non-blocking, fire-and-forget pattern
     * @param alertType - Type of alert being sent
     * @param message - Alert message content
     * @param metadata - Optional metadata for rich formatting
     */
    static async sendAlert(
        alertType: AdminAlertType,
        message: string,
        metadata?: Partial<AlertMetadata>
    ): Promise<void> {
        try {
            // Throttle check - prevent alert storms
            const lastSent = throttleMap.get(alertType) || 0;
            if (Date.now() - lastSent < THROTTLE_WINDOW_MS) {
                logger.debug(`Admin alert throttled: ${alertType}`);
                return;
            }

            // Query enabled channels with matching filter
            const filterField = `alert_filters.${ALERT_FILTER_MAP[alertType]}`;
            const channels = await admin_channel_model.find({
                enabled: true,
                [filterField]: true,
            });

            // No channels configured - silent no-op (backwards compatible)
            if (channels.length === 0) {
                return;
            }

            // Get encryption key (auto-creates if needed)
            const encryptionKey = await getOrCreateEncryptionKey();

            // Send to each configured channel
            for (const channelConfig of channels) {
                try {
                    // Decrypt channel config
                    const decryptedConfig = decrypt(channelConfig.config, encryptionKey);
                    const config = JSON.parse(decryptedConfig);

                    // Use registry to get provider instance
                    const provider = getChannelProvider(channelConfig.channel_type, config);

                    // Send the alert
                    const result = await provider.send(message, {
                        alertType,
                        severity: metadata?.severity || 'warning',
                        timestamp: new Date(),
                        ...metadata,
                    });

                    if (!result.success) {
                        logger.error(
                            `Admin alert failed via ${channelConfig.name}: ${result.error}`
                        );
                    }
                } catch (err) {
                    logger.error(
                        `Error sending admin alert via ${channelConfig.name}:`,
                        err
                    );
                }
            }

            // Update throttle timestamp
            throttleMap.set(alertType, Date.now());
        } catch (err) {
            // Never throw - admin alerts are non-critical to core functionality
            logger.error('AdminAlertService.sendAlert failed:', err);
        }
    }
}
