/**
 * Unit Tests for Encryption Utilities
 * Tests encrypt/decrypt functions and key generation
 */

import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, generateEncryptionKey } from '../../../src/utils/encryption.utils.js';

describe('Encryption Utilities', () => {
    describe('generateEncryptionKey', () => {
        it('should generate a 32-byte key', () => {
            const key = generateEncryptionKey();
            expect(key).toBeInstanceOf(Buffer);
            expect(key.length).toBe(32);
        });

        it('should generate unique keys each time', () => {
            const key1 = generateEncryptionKey();
            const key2 = generateEncryptionKey();
            expect(key1.equals(key2)).toBe(false);
        });
    });

    describe('encrypt', () => {
        it('should encrypt plaintext and return encrypted data structure', () => {
            const key = generateEncryptionKey();
            const plaintext = 'secret data';

            const result = encrypt(plaintext, key);

            expect(result).toHaveProperty('encrypted_data');
            expect(result).toHaveProperty('iv');
            expect(result).toHaveProperty('auth_tag');
            expect(typeof result.encrypted_data).toBe('string');
            expect(typeof result.iv).toBe('string');
            expect(typeof result.auth_tag).toBe('string');
        });

        it('should produce different ciphertexts for same plaintext (different IVs)', () => {
            const key = generateEncryptionKey();
            const plaintext = 'same data';

            const result1 = encrypt(plaintext, key);
            const result2 = encrypt(plaintext, key);

            expect(result1.encrypted_data).not.toBe(result2.encrypted_data);
            expect(result1.iv).not.toBe(result2.iv);
        });

        it('should throw error for invalid key length', () => {
            const invalidKey = Buffer.from('short');
            const plaintext = 'test';

            expect(() => encrypt(plaintext, invalidKey)).toThrow('Encryption key must be 32 bytes');
        });

        it('should handle empty string', () => {
            const key = generateEncryptionKey();
            const plaintext = '';

            const result = encrypt(plaintext, key);

            expect(result.encrypted_data).toBeDefined();
        });

        it('should handle unicode characters', () => {
            const key = generateEncryptionKey();
            const plaintext = 'Hello 世界 🎉';

            const result = encrypt(plaintext, key);
            const decrypted = decrypt(result, key);

            expect(decrypted).toBe(plaintext);
        });

        it('should handle JSON strings', () => {
            const key = generateEncryptionKey();
            const data = { webhook_url: 'https://discord.com/api/webhooks/123/abc' };
            const plaintext = JSON.stringify(data);

            const result = encrypt(plaintext, key);
            const decrypted = decrypt(result, key);

            expect(JSON.parse(decrypted)).toEqual(data);
        });
    });

    describe('decrypt', () => {
        it('should decrypt encrypted data back to original plaintext', () => {
            const key = generateEncryptionKey();
            const plaintext = 'secret webhook url';

            const encrypted = encrypt(plaintext, key);
            const decrypted = decrypt(encrypted, key);

            expect(decrypted).toBe(plaintext);
        });

        it('should throw error for invalid key', () => {
            const key1 = generateEncryptionKey();
            const key2 = generateEncryptionKey();
            const plaintext = 'test data';

            const encrypted = encrypt(plaintext, key1);

            expect(() => decrypt(encrypted, key2)).toThrow();
        });

        it('should throw error for tampered encrypted data', () => {
            const key = generateEncryptionKey();
            const plaintext = 'test data';

            const encrypted = encrypt(plaintext, key);
            // Tamper with the encrypted data
            encrypted.encrypted_data = encrypted.encrypted_data.slice(0, -2) + 'xx';

            expect(() => decrypt(encrypted, key)).toThrow();
        });

        it('should throw error for tampered auth tag', () => {
            const key = generateEncryptionKey();
            const plaintext = 'test data';

            const encrypted = encrypt(plaintext, key);
            // Tamper with the auth tag
            encrypted.auth_tag = 'tampered123456789012345678901234';

            expect(() => decrypt(encrypted, key)).toThrow();
        });

        it('should throw error for invalid key length', () => {
            const key = generateEncryptionKey();
            const plaintext = 'test data';
            const encrypted = encrypt(plaintext, key);
            const invalidKey = Buffer.from('short');

            expect(() => decrypt(encrypted, invalidKey)).toThrow('Encryption key must be 32 bytes');
        });
    });
});
