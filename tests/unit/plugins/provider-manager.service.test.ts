/**
 * Unit Tests for ProviderManagerService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderManagerService } from '../../../src/plugins/services/provider-manager.service.js';
import Provider from '../../../src/database/models/provider.models.js';
import Plugin from '../../../src/database/models/plugin.models.js';
import ChannelRouting from '../../../src/database/models/channel-routing.models.js';
import * as keypairManager from '../../../src/plugins/crypto/keypair-manager.js';
import * as pluginFs from '../../../src/plugins/loader/plugin-fs.js';
import { PluginRegistry } from '../../../src/plugins/loader/registry.js';
import { PluginSyncService } from '../../../src/plugins/sync/plugin-sync.service.js';

describe('ProviderManagerService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    PluginRegistry.clear();
    vi.spyOn(PluginSyncService, 'publish').mockResolvedValue(undefined);
  });

  describe('createProvider', () => {
    it('should throw error if provider ID already exists', async () => {
      vi.spyOn(Provider, 'findOne').mockResolvedValue({ id: 'gmail-prod' } as any);

      await expect(
        ProviderManagerService.createProvider({
          id: 'gmail-prod',
          plugin_name: '@simplens/nodemailer-gmail',
          credentials: { EMAIL_USER: 'test@example.com' },
        })
      ).rejects.toThrow("Provider with ID 'gmail-prod' already exists.");
    });

    it('should throw error if plugin is not installed', async () => {
      vi.spyOn(Provider, 'findOne').mockResolvedValue(null);
      vi.spyOn(Plugin, 'findOne').mockResolvedValue(null);

      await expect(
        ProviderManagerService.createProvider({
          id: 'gmail-prod',
          plugin_name: '@simplens/nodemailer-gmail',
          credentials: { EMAIL_USER: 'test@example.com' },
        })
      ).rejects.toThrow("Plugin '@simplens/nodemailer-gmail' is not installed.");
    });

    it('should encrypt credentials, create provider in DB, and broadcast sync event', async () => {
      vi.spyOn(Provider, 'findOne').mockResolvedValue(null);
      vi.spyOn(Plugin, 'findOne').mockResolvedValue({
        name: '@simplens/mock',
        manifest: { channel: 'mock' },
      } as any);

      vi.spyOn(keypairManager, 'encryptCredentials').mockResolvedValue({
        encrypted_data: 'enc123',
        iv: 'iv123',
        auth_tag: 'tag123',
        encrypted_dek: 'dek123',
      });

      const mockCreated = {
        _id: '507f1f77bcf86cd799439011',
        id: 'mock-test',
        plugin_name: '@simplens/mock',
        channel: 'mock',
        priority: 5,
        enabled: true,
        credentials: { encrypted_data: 'enc123' },
        options: {},
        toObject: () => mockCreated,
      };

      vi.spyOn(Provider, 'create').mockResolvedValue(mockCreated as any);
      vi.spyOn(ProviderManagerService, 'loadAndRegisterProvider').mockResolvedValue(undefined);

      const result = await ProviderManagerService.createProvider({
        id: 'mock-test',
        plugin_name: '@simplens/mock',
        credentials: {},
        priority: 5,
      });

      expect(keypairManager.encryptCredentials).toHaveBeenCalled();
      expect(Provider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mock-test',
          plugin_name: '@simplens/mock',
          channel: 'mock',
          priority: 5,
        })
      );
      expect(PluginSyncService.publish).toHaveBeenCalledWith('PROVIDER_UPSERTED', {
        provider_id: 'mock-test',
      });
      expect(result.credentials_configured).toBe(true);
    });
  });

  describe('deleteProvider', () => {
    it('should reject deletion if provider is used in channel routing', async () => {
      vi.spyOn(ChannelRouting, 'findOne').mockResolvedValue({
        channel: 'email',
        default_provider_id: 'gmail-prod',
      } as any);

      await expect(ProviderManagerService.deleteProvider('gmail-prod')).rejects.toThrow(
        "Cannot delete provider 'gmail-prod': it is configured in channel 'email' routing."
      );
    });

    it('should delete from DB and unregister from registry if not in use', async () => {
      vi.spyOn(ChannelRouting, 'findOne').mockResolvedValue(null);
      vi.spyOn(Provider, 'findOne').mockResolvedValue({ id: 'mock-unused' } as any);
      const deleteSpy = vi.spyOn(Provider, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as any);
      const unregisterSpy = vi.spyOn(PluginRegistry, 'unregister').mockReturnValue(true);

      await ProviderManagerService.deleteProvider('mock-unused');

      expect(deleteSpy).toHaveBeenCalledWith({ id: 'mock-unused' });
      expect(unregisterSpy).toHaveBeenCalledWith('mock-unused');
      expect(PluginSyncService.publish).toHaveBeenCalledWith('PROVIDER_DELETED', {
        provider_id: 'mock-unused',
      });
    });
  });

  describe('testProviderConnection', () => {
    it('should return success true when health check passes', async () => {
      const mockProviderInstance = {
        initialize: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(pluginFs, 'importAndInstantiateProvider').mockResolvedValue(mockProviderInstance as any);

      const result = await ProviderManagerService.testProviderConnection({
        plugin_name: '@simplens/mock',
        credentials: {},
      });

      expect(result.success).toBe(true);
      expect(mockProviderInstance.initialize).toHaveBeenCalled();
      expect(mockProviderInstance.healthCheck).toHaveBeenCalled();
    });
  });
});
