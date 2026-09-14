/**
 * Unit Tests for Key-Pair Envelope Encryption Manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateRSAKeyPair,
  encryptCredentials,
  decryptCredentials,
  clearKeyPairCache,
} from '../../../src/plugins/crypto/keypair-manager.js';
import system_config_model from '../../../src/database/models/system-config.models.js';

describe('Key-Pair Envelope Encryption Manager', () => {
  beforeEach(() => {
    clearKeyPairCache();
    vi.restoreAllMocks();
  });

  describe('generateRSAKeyPair', () => {
    it('should generate valid RSA 2048-bit public and private PEM keys', () => {
      const keyPair = generateRSAKeyPair();
      expect(keyPair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keyPair.publicKey).toContain('-----END PUBLIC KEY-----');
      expect(keyPair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
      expect(keyPair.privateKey).toContain('-----END PRIVATE KEY-----');
    });
  });

  describe('encryptCredentials & decryptCredentials', () => {
    it('should encrypt and decrypt credentials successfully with mock database', async () => {
      const mockKeyPair = generateRSAKeyPair();

      // Mock MongoDB system_config_model
      vi.spyOn(system_config_model, 'findOne').mockImplementation(async (query: any) => {
        if (query.key === 'plugin_credentials_public_key') {
          return { key: 'plugin_credentials_public_key', value: mockKeyPair.publicKey } as any;
        }
        if (query.key === 'plugin_credentials_private_key') {
          return { key: 'plugin_credentials_private_key', value: mockKeyPair.privateKey } as any;
        }
        return null;
      });

      const credentials = {
        GMAIL_USER: 'test@gmail.com',
        GMAIL_APP_PASSWORD: 'app-password-secret-123',
        API_TOKEN: 'token_xyz_987654321',
      };

      const encrypted = await encryptCredentials(credentials);

      expect(encrypted).toHaveProperty('encrypted_data');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('auth_tag');
      expect(encrypted).toHaveProperty('encrypted_dek');

      expect(typeof encrypted.encrypted_data).toBe('string');
      expect(typeof encrypted.iv).toBe('string');
      expect(typeof encrypted.auth_tag).toBe('string');
      expect(typeof encrypted.encrypted_dek).toBe('string');

      // Now decrypt
      const decrypted = await decryptCredentials(encrypted);
      expect(decrypted).toEqual(credentials);
    });

    it('should generate new keys and save them if not found in database or env', async () => {
      const storedConfigs = new Map<string, string>();

      vi.spyOn(system_config_model, 'findOne').mockImplementation(async (query: any) => {
        const val = storedConfigs.get(query.key);
        return val ? ({ key: query.key, value: val } as any) : null;
      });

      vi.spyOn(system_config_model, 'findOneAndUpdate').mockImplementation(async (query: any, update: any) => {
        storedConfigs.set(query.key, update.value);
        return { key: query.key, value: update.value } as any;
      });

      const creds = { API_KEY: 'super_secret' };
      const encrypted = await encryptCredentials(creds);

      expect(storedConfigs.has('plugin_credentials_public_key')).toBe(true);
      expect(storedConfigs.has('plugin_credentials_private_key')).toBe(true);

      const decrypted = await decryptCredentials(encrypted);
      expect(decrypted).toEqual(creds);
    });

    it('should handle large credential payloads through hybrid AES envelope', async () => {
      const mockKeyPair = generateRSAKeyPair();

      vi.spyOn(system_config_model, 'findOne').mockImplementation(async (query: any) => {
        if (query.key === 'plugin_credentials_public_key') {
          return { key: 'plugin_credentials_public_key', value: mockKeyPair.publicKey } as any;
        }
        if (query.key === 'plugin_credentials_private_key') {
          return { key: 'plugin_credentials_private_key', value: mockKeyPair.privateKey } as any;
        }
        return null;
      });

      // 10KB payload (exceeds direct RSA-2048 OAEP limit of ~214 bytes)
      const largeCredentials = {
        SERVICE_ACCOUNT_JSON: JSON.stringify({
          type: 'service_account',
          private_key: '-----BEGIN PRIVATE KEY-----\n' + 'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...'.repeat(150) + '\n-----END PRIVATE KEY-----',
        }),
      };

      const encrypted = await encryptCredentials(largeCredentials);
      const decrypted = await decryptCredentials(encrypted);

      expect(decrypted).toEqual(largeCredentials);
    });
  });
});
