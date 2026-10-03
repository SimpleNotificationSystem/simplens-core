/**
 * Unit Tests for NpmAuthService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NpmAuthService,
  extractScope,
  toNpmrcTokenLine,
  normalizeRegistryUrl,
  generateRegistryId,
  maskToken,
  NPM_AUTH_CONFIG_KEY,
  NPMRC_PATH,
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
    it('should extract scope from scoped package name and lowercase it', () => {
      expect(extractScope('@simplens/resend')).toBe('@simplens');
      expect(extractScope('@MyEnterprise/custom-sms')).toBe('@myenterprise');
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

  describe('normalizeRegistryUrl & generateRegistryId & maskToken', () => {
    it('should normalize URLs with trailing slash', () => {
      expect(normalizeRegistryUrl('https://npm.corp.com')).toBe('https://npm.corp.com/');
      expect(normalizeRegistryUrl('')).toBe('https://registry.npmjs.org/');
    });

    it('should generate consistent registry identifiers', () => {
      expect(generateRegistryId('@myorg')).toBe('scope:@myorg');
      expect(generateRegistryId(undefined, 'https://npm.corp.com/')).toBe('url:npm.corp.com');
      expect(generateRegistryId(undefined, 'https://registry.npmjs.org/')).toBe('default');
    });

    it('should mask tokens properly', () => {
      expect(maskToken('npm_1234567890abcdef')).toBe('npm_****cdef');
      expect(maskToken('short')).toBe('****');
    });
  });

  describe('getAuthStatus & getDecryptedRegistries', () => {
    it('should return is_configured false when no registries exist and no ENV var exists', async () => {
      delete process.env.NPM_TOKEN;
      delete process.env.NPM_AUTH_TOKEN;
      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      } as any);

      const status = await NpmAuthService.getAuthStatus();
      expect(status.is_configured).toBe(false);
      expect(status.registries).toHaveLength(0);
    });

    it('should migrate legacy single-token document and return status with masked token', async () => {
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
      expect(status.registries).toHaveLength(1);
      expect(status.registries[0].masked_token).toContain('****');
      expect(status.registries[0].masked_token.startsWith('npm_')).toBe(true);
    });

    it('should return multiple configured registries with masked tokens', async () => {
      const tokenA = encrypt('npm_corp_aaa_token_1234', mockEncryptionKey);
      const tokenB = encrypt('npm_corp_bbb_token_5678', mockEncryptionKey);

      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          key: NPM_AUTH_CONFIG_KEY,
          value: {
            registries: [
              {
                id: 'scope:@corp-a',
                scope: '@corp-a',
                registry_url: 'https://npm.corp-a.com/',
                encrypted_token: tokenA,
                updated_at: new Date().toISOString(),
              },
              {
                id: 'scope:@corp-b',
                scope: '@corp-b',
                registry_url: 'https://npm.corp-b.com/',
                encrypted_token: tokenB,
                updated_at: new Date().toISOString(),
              },
            ],
          },
        }),
      } as any);

      const status = await NpmAuthService.getAuthStatus();
      expect(status.is_configured).toBe(true);
      expect(status.registries).toHaveLength(2);
      expect(status.registries[0].scope).toBe('@corp-a');
      expect(status.registries[1].scope).toBe('@corp-b');
      expect(status.registries[0].masked_token).toBe('npm_****1234');
      expect(status.registries[1].masked_token).toBe('npm_****5678');
    });
  });

  describe('findMatchingAuth', () => {
    it('should match by scope when package name matches a registered scope', async () => {
      const tokenA = encrypt('token_for_corp_a', mockEncryptionKey);
      const tokenB = encrypt('token_for_corp_b', mockEncryptionKey);

      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          key: NPM_AUTH_CONFIG_KEY,
          value: {
            registries: [
              {
                id: 'scope:@corp-a',
                scope: '@corp-a',
                registry_url: 'https://npm.corp-a.com/',
                encrypted_token: tokenA,
                updated_at: new Date().toISOString(),
              },
              {
                id: 'scope:@corp-b',
                scope: '@corp-b',
                registry_url: 'https://npm.corp-b.com/',
                encrypted_token: tokenB,
                updated_at: new Date().toISOString(),
              },
            ],
          },
        }),
      } as any);

      const match = await NpmAuthService.findMatchingAuth('@corp-a/email-provider');
      expect(match).not.toBeNull();
      expect(match?.scope).toBe('@corp-a');
      expect(match?.token).toBe('token_for_corp_a');
      expect(match?.registry_url).toBe('https://npm.corp-a.com/');
    });

    it('should match by registry host when custom registry URL is specified', async () => {
      const tokenCustom = encrypt('token_for_nexus', mockEncryptionKey);

      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          key: NPM_AUTH_CONFIG_KEY,
          value: {
            registries: [
              {
                id: 'url:nexus.internal.com',
                registry_url: 'https://nexus.internal.com/repository/npm/',
                encrypted_token: tokenCustom,
                updated_at: new Date().toISOString(),
              },
            ],
          },
        }),
      } as any);

      const match = await NpmAuthService.findMatchingAuth('unscoped-pkg', 'https://nexus.internal.com/repository/npm/');
      expect(match).not.toBeNull();
      expect(match?.token).toBe('token_for_nexus');
    });

    it('should return null when no credentials match', async () => {
      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      } as any);

      const match = await NpmAuthService.findMatchingAuth('@unregistered/package');
      expect(match).toBeNull();
    });
  });

  describe('saveNpmAuth & deleteNpmAuth', () => {
    it('should append or update registry entry in MongoDB and broadcast event', async () => {
      const upsertSpy = vi.spyOn(system_config_model, 'findOneAndUpdate').mockResolvedValue({} as any);
      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          key: NPM_AUTH_CONFIG_KEY,
          value: {
            registries: [],
          },
        }),
      } as any);
      vi.spyOn(NpmAuthService, 'syncNpmrc').mockResolvedValue(undefined);

      await NpmAuthService.saveNpmAuth('npm_enterprise_token', 'https://npm.enterprise.corp/', '@myorg');

      expect(upsertSpy).toHaveBeenCalledWith(
        { key: NPM_AUTH_CONFIG_KEY },
        expect.objectContaining({
          key: NPM_AUTH_CONFIG_KEY,
          value: expect.objectContaining({
            registries: expect.arrayContaining([
              expect.objectContaining({
                id: 'scope:@myorg',
                scope: '@myorg',
                registry_url: 'https://npm.enterprise.corp/',
              }),
            ]),
          }),
        }),
        { upsert: true, new: true }
      );
      expect(PluginSyncService.publish).toHaveBeenCalledWith('NPM_AUTH_UPDATED', {});
    });

    it('should delete specific registry by scope or id', async () => {
      const upsertSpy = vi.spyOn(system_config_model, 'findOneAndUpdate').mockResolvedValue({} as any);
      const tokenA = encrypt('tokenA', mockEncryptionKey);
      const tokenB = encrypt('tokenB', mockEncryptionKey);

      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          key: NPM_AUTH_CONFIG_KEY,
          value: {
            registries: [
              {
                id: 'scope:@corp-a',
                scope: '@corp-a',
                registry_url: 'https://npm.corp-a.com/',
                encrypted_token: tokenA,
                updated_at: new Date().toISOString(),
              },
              {
                id: 'scope:@corp-b',
                scope: '@corp-b',
                registry_url: 'https://npm.corp-b.com/',
                encrypted_token: tokenB,
                updated_at: new Date().toISOString(),
              },
            ],
          },
        }),
      } as any);
      vi.spyOn(NpmAuthService, 'syncNpmrc').mockResolvedValue(undefined);

      await NpmAuthService.deleteNpmAuth('@corp-a');

      expect(upsertSpy).toHaveBeenCalledWith(
        { key: NPM_AUTH_CONFIG_KEY },
        expect.objectContaining({
          value: expect.objectContaining({
            registries: [
              expect.objectContaining({
                id: 'scope:@corp-b',
              }),
            ],
          }),
        }),
        { upsert: true, new: true }
      );
      expect(PluginSyncService.publish).toHaveBeenCalledWith('NPM_AUTH_UPDATED', {});
    });
  });

  describe('syncNpmrc', () => {
    it('should write .npmrc with multiple scoped registries and host auth lines', async () => {
      const tokenA = encrypt('token_corp_a', mockEncryptionKey);
      const tokenB = encrypt('token_corp_b', mockEncryptionKey);

      vi.spyOn(system_config_model, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          key: NPM_AUTH_CONFIG_KEY,
          value: {
            registries: [
              {
                id: 'scope:@corp-a',
                scope: '@corp-a',
                registry_url: 'https://npm.corp-a.com/',
                encrypted_token: tokenA,
                updated_at: new Date().toISOString(),
              },
              {
                id: 'scope:@corp-b',
                scope: '@corp-b',
                registry_url: 'https://npm.corp-b.com/',
                encrypted_token: tokenB,
                updated_at: new Date().toISOString(),
              },
            ],
          },
        }),
      } as any);

      await NpmAuthService.syncNpmrc();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        NPMRC_PATH,
        expect.stringContaining('@corp-a:registry=https://npm.corp-a.com/'),
        expect.anything()
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        NPMRC_PATH,
        expect.stringContaining('//npm.corp-a.com/:_authToken=token_corp_a'),
        expect.anything()
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        NPMRC_PATH,
        expect.stringContaining('@corp-b:registry=https://npm.corp-b.com/'),
        expect.anything()
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        NPMRC_PATH,
        expect.stringContaining('//npm.corp-b.com/:_authToken=token_corp_b'),
        expect.anything()
      );
    });
  });
});
