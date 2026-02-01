/**
 * Encryption Key Manager
 * Auto-generates and caches encryption key from MongoDB
 */

import { env } from '@src/config/env.config.js';
import system_config_model from '@src/database/models/system-config.models.js';
import { generateEncryptionKey } from '@src/utils/encryption.utils.js';

const KEY_CONFIG_NAME = 'admin_alert_encryption_key';
let cachedKey: Buffer | null = null;

/**
 * Get or create encryption key
 * Priority: ENV var > MongoDB > Generate new
 */
export async function getOrCreateEncryptionKey(): Promise<Buffer> {
    // Return cached key if available
    if (cachedKey) {
        return cachedKey;
    }

    // Check environment variable first (optional override)
    if (env.ADMIN_ALERT_ENCRYPTION_KEY) {
        cachedKey = Buffer.from(env.ADMIN_ALERT_ENCRYPTION_KEY, 'hex');
        return cachedKey;
    }

    // Check MongoDB for existing key
    let config = await system_config_model.findOne({ key: KEY_CONFIG_NAME });

    if (!config) {
        // Generate new key and store in MongoDB
        const newKey = generateEncryptionKey();
        config = await system_config_model.create({
            key: KEY_CONFIG_NAME,
            value: newKey.toString('hex'),
        });
    }

    cachedKey = Buffer.from(config.value, 'hex');
    return cachedKey;
}

/**
 * Clear cached key (for testing purposes)
 */
export function clearKeyCache(): void {
    cachedKey = null;
}
