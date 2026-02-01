/**
 * Encryption utilities for dashboard
 */

import crypto from 'crypto';
import { SystemConfigModel } from './models/system-config';
import { connectDB } from './db';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_CONFIG_NAME = 'admin_alert_encryption_key';

export interface EncryptedData {
    encrypted_data: string;
    iv: string;
    auth_tag: string;
}

let cachedKey: Buffer | null = null;

/**
 * Get or create encryption key
 * Priority: ENV var > MongoDB > Generate new
 */
export async function getOrCreateEncryptionKey(): Promise<Buffer> {
    if (cachedKey) return cachedKey;

    // Check env var first
    if (process.env.ADMIN_ALERT_ENCRYPTION_KEY) {
        cachedKey = Buffer.from(process.env.ADMIN_ALERT_ENCRYPTION_KEY, 'hex');
        return cachedKey;
    }

    await connectDB();

    let config = await SystemConfigModel.findOne({ key: KEY_CONFIG_NAME });
    if (!config) {
        // Generate new key
        const newKey = crypto.randomBytes(32);
        config = await SystemConfigModel.create({
            key: KEY_CONFIG_NAME,
            value: newKey.toString('hex'),
        });
    }

    cachedKey = Buffer.from(config.value, 'hex');
    return cachedKey;
}

/**
 * Encrypt plaintext using AES-256-GCM
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedData {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
        encrypted_data: encrypted,
        iv: iv.toString('hex'),
        auth_tag: cipher.getAuthTag().toString('hex'),
    };
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decrypt(data: EncryptedData, key: Buffer): string {
    const iv = Buffer.from(data.iv, 'hex');
    const authTag = Buffer.from(data.auth_tag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(data.encrypted_data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
