/**
 * Unit Tests for NpmAuthService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NpmAuthService,
  extractScope,
  toNpmrcTokenLine,
  NPM_AUTH_CONFIG_KEY,
} from '../../../src/plugins/services/npm-auth.service.js';
import system_config_model from '../../../src/database/models/system-config.models.js';
import * as keyManager from '../../../src/admin-alerts/key-manager.js';
import { encrypt } from '../../../src/utils/encryption.utils.js';
import { PluginSyncService } from '../../../src/plugins/sync/plugin-sync.service.js';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
  };
});

describe('NpmAuthService', () => {
  const mockEncryptionKey = Buffer.alloc(32, 7);

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(keyManager, 'getOrCreateEncryptionKey').mockResolvedValue(mockEncryptionKey);
    vi.spyOn(PluginSyncService, 'publish').mockResolvedValue(undefined);
  });

  describe('extractScope', () => {
    it('should extract scope from scoped package name', () => {
      expect(extractScope('@simplens/resend')).toBe('@simplens');
      expect(extractScope('@myenterprise/custom-sms')).toBe('@myenterprise');
      expect(extractScope('@org-name/sub-pkg')).toBe('@org-name');
    });

    it('should return undefined for unscoped package names', () => {
      expect(extractScope('nodemailer-gmail')).toBeUndefined();
      expect(extractScope('custom-plugin')).toBeUndefined();
    });
  });

  describe('toNpmrcTokenLine', () => {
    it('should correctly format standard npmjs URL', () => {
      const line = toNpmrcTokenLine('https://registry.npmjs.org/', 'npm_test123');
      expect(line).toBe('//registry.npmjs.org/:_authToken=npm_test123');
    });

    it('should correctly format enterprise registry URL', () => {
      const line = toNpmrcTokenLine('https://npm.enterprise.corp/', 'npm_corp_token');
      expect(line).toBe('//npm.enterprise.corp/:_authToken=npm_corp_token');
    });

    it('should handle URLs without trailing slash', () => {
      const line = toNpmrcTokenLine('https://npm.enterprise.corp', 'npm_corp_token');
      expect(line).toBe('//npm.enterprise.corp/:_authToken=npm_corp_token');
    });
  });

  describe('getAuthStatus & getDecryptedToken', () => {
    it('should return is_configured false when no token is stored and no ENV var exists', async () => {
      delete process.env.NPM_TOKEN;
      delete process.env.NPM_AUTH_TOKEN;
      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      } as any);

      const status = await NpmAuthService.getAuthStatus();
      expect(status.is_configured).toBe(false);
      expect(status.masked_token).toBeUndefined();
    });

    it('should decrypt stored token and mask it for status display', async () => {
      const plainToken = 'npm_1234567890abcdef123456';
      const encrypted = encrypt(plainToken, mockEncryptionKey);

      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          key: NPM_AUTH_CONFIG_KEY,
          value: {
            encrypted_token: encrypted,
            registry_url: 'https://registry.npmjs.org/',
          },
        }),
      } as any);

      const status = await NpmAuthService.getAuthStatus();
      expect(status.is_configured).toBe(true);
      expect(status.registry_url).toBe('https://registry.npmjs.org/');
      expect(status.masked_token).toContain('****');
      expect(status.masked_token?.startsWith('npm_')).toBe(true);
      expect(status.masked_token?.endsWith('3456')).toBe(true);
    });
  });

  describe('saveNpmAuth & deleteNpmAuth', () => {
    it('should encrypt token, upsert in DB, and broadcast sync event', async () => {
      const upsertSpy = vi.spyOn(system_config_model, 'findOneAndUpdate').mockResolvedValue({} as any);
      vi.spyOn(NpmAuthService, 'syncNpmrc').mockResolvedValue(undefined);
      vi.spyOn(NpmAuthService, 'getAuthStatus').mockResolvedValue({
        is_configured: true,
        registry_url: 'https://npm.enterprise.corp/',
        masked_token: 'npm_****1234',
      });

      const res = await NpmAuthService.saveNpmAuth('npm_my_secret_token', 'https://npm.enterprise.corp/');

      expect(upsertSpy).toHaveBeenCalledWith(
        { key: NPM_AUTH_CONFIG_KEY },
        expect.objectContaining({
          key: NPM_AUTH_CONFIG_KEY,
          value: expect.objectContaining({
            registry_url: 'https://npm.enterprise.corp/',
          }),
        }),
        { upsert: true, new: true }
      );
      expect(PluginSyncService.publish).toHaveBeenCalledWith('NPM_AUTH_UPDATED', {});
      expect(res.is_configured).toBe(true);
    });

    it('should delete from DB and broadcast sync event', async () => {
      const deleteSpy = vi.spyOn(system_config_model, 'deleteOne').mockResolvedValue({} as any);
      vi.spyOn(NpmAuthService, 'syncNpmrc').mockResolvedValue(undefined);

      await NpmAuthService.deleteNpmAuth();

      expect(deleteSpy).toHaveBeenCalledWith({ key: NPM_AUTH_CONFIG_KEY });
      expect(PluginSyncService.publish).toHaveBeenCalledWith('NPM_AUTH_UPDATED', {});
    });
  });
});
