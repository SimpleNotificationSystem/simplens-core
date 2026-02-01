/**
 * Encryption utilities for sensitive data using AES-256-GCM
 */

import crypto from 'crypto';
import type { encrypted_config } from '@src/types/types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt plaintext using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @param key - 32-byte encryption key
 * @returns Encrypted data with IV and auth tag
 */
export function encrypt(plaintext: string, key: Buffer): encrypted_config {
    if (key.length !== 32) {
        throw new Error('Encryption key must be 32 bytes');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH
    });

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
 * @param data - Encrypted data object with IV and auth tag
 * @param key - 32-byte encryption key
 * @returns Decrypted plaintext
 */
export function decrypt(data: encrypted_config, key: Buffer): string {
    if (key.length !== 32) {
        throw new Error('Encryption key must be 32 bytes');
    }

    const iv = Buffer.from(data.iv, 'hex');
    const authTag = Buffer.from(data.auth_tag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(data.encrypted_data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Generate a new 32-byte encryption key
 * @returns Buffer containing 32 random bytes
 */
export function generateEncryptionKey(): Buffer {
    return crypto.randomBytes(32);
}
