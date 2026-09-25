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
import { ChannelRoutingService } from '../../../src/plugins/services/channel-routing.service.js';

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
        enabled: true,
        credentials: { encrypted_data: 'enc123' },
        options: { priority: 5 },
        toObject: () => mockCreated,
      };

      vi.spyOn(Provider, 'create').mockResolvedValue(mockCreated as any);
      vi.spyOn(ChannelRouting, 'findOne').mockResolvedValue(null);
      const setRoutingSpy = vi.spyOn(ChannelRoutingService, 'setChannelRouting').mockResolvedValue({} as any);

      const result = await ProviderManagerService.createProvider({
        id: 'mock-test',
        plugin_name: '@simplens/mock',
        credentials: {},
        options: { priority: 5 },
      });

      expect(keypairManager.encryptCredentials).toHaveBeenCalled();
      expect(Provider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mock-test',
          plugin_name: '@simplens/mock',
          channel: 'mock',
          options: { priority: 5 },
        })
      );
      expect(setRoutingSpy).toHaveBeenCalledWith('mock', {
        default_provider_id: 'mock-test',
        fallback_provider_ids: [],
        partitions: 6,
      });
      expect(PluginSyncService.publish).toHaveBeenCalledWith('PROVIDER_UPSERTED', {
        provider_id: 'mock-test',
      });
      expect(result.credentials_configured).toBe(true);
    });

    it('should not overwrite ChannelRouting if one already exists for the channel', async () => {
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
        id: 'mock-test-2',
        plugin_name: '@simplens/mock',
        channel: 'mock',
        enabled: true,
        credentials: { encrypted_data: 'enc123' },
        options: {},
        toObject: () => mockCreated,
      };

      vi.spyOn(Provider, 'create').mockResolvedValue(mockCreated as any);
      vi.spyOn(ProviderManagerService, 'loadAndRegisterProvider').mockResolvedValue(undefined);
      vi.spyOn(ChannelRouting, 'findOne').mockResolvedValue({
        channel: 'mock',
        default_provider_id: 'existing-provider',
      } as any);
      const setRoutingSpy = vi.spyOn(ChannelRoutingService, 'setChannelRouting');

      await ProviderManagerService.createProvider({
        id: 'mock-test-2',
        plugin_name: '@simplens/mock',
        credentials: {},
      });

      expect(setRoutingSpy).not.toHaveBeenCalled();
    });
  });

  describe('deleteProvider', () => {
    it('should remove the provider from routing and promote the first fallback', async () => {
      vi.spyOn(Provider, 'findOne').mockResolvedValue({ id: 'gmail-prod' } as any);
      vi.spyOn(ChannelRouting, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            channel: 'email',
            default_provider_id: 'gmail-prod',
            fallback_provider_ids: ['smtp-prod', 'backup-prod'],
          },
        ]),
      } as any);
      const updateSpy = vi.spyOn(ChannelRouting, 'updateOne').mockResolvedValue({ acknowledged: true } as any);
      const deleteRoutingSpy = vi.spyOn(ChannelRouting, 'deleteOne').mockResolvedValue({ deletedCount: 0 } as any);
      vi.spyOn(Provider, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as any);
      vi.spyOn(PluginRegistry, 'unregister').mockReturnValue(true);

      await ProviderManagerService.deleteProvider('gmail-prod');

      expect(updateSpy).toHaveBeenCalledWith(
        { channel: 'email' },
        {
          default_provider_id: 'smtp-prod',
          fallback_provider_ids: ['backup-prod'],
        }
      );
      expect(deleteRoutingSpy).not.toHaveBeenCalled();
      expect(PluginSyncService.publish).toHaveBeenCalledWith('CHANNEL_ROUTING_UPDATED', {
        channel: 'email',
      });
    });

    it('should delete the routing when the provider has no fallback replacement', async () => {
      vi.spyOn(Provider, 'findOne').mockResolvedValue({ id: 'mock-unused' } as any);
      vi.spyOn(ChannelRouting, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            channel: 'mock',
            default_provider_id: 'mock-unused',
            fallback_provider_ids: [],
          },
        ]),
      } as any);
      const deleteRoutingSpy = vi.spyOn(ChannelRouting, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as any);
      const deleteSpy = vi.spyOn(Provider, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as any);
      const unregisterSpy = vi.spyOn(PluginRegistry, 'unregister').mockReturnValue(true);

      await ProviderManagerService.deleteProvider('mock-unused');

      expect(deleteRoutingSpy).toHaveBeenCalledWith({ channel: 'mock' });
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

    it('should decrypt stored credentials once and reuse them for blank-credential tests', async () => {
      const mockProviderInstance = {
        initialize: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockResolvedValue(true),
      };
      const decryptSpy = vi.spyOn(keypairManager, 'decryptCredentials').mockResolvedValue({
        EMAIL_USER: 'stored-user',
        EMAIL_PASS: 'stored-pass',
      });

      vi.spyOn(Provider, 'findOne').mockResolvedValue({
        id: 'cached-provider-test',
        plugin_name: '@simplens/mock',
        options: { priority: 2 },
        credentials: { encrypted_data: 'encrypted' },
      } as any);
      vi.spyOn(pluginFs, 'importAndInstantiateProvider').mockResolvedValue(mockProviderInstance as any);

      await ProviderManagerService.testProviderConnection({ provider_id: 'cached-provider-test' });
      await ProviderManagerService.testProviderConnection({ provider_id: 'cached-provider-test' });

      expect(decryptSpy).toHaveBeenCalledTimes(1);
      expect(mockProviderInstance.initialize).toHaveBeenNthCalledWith(1, expect.objectContaining({
        credentials: { EMAIL_USER: 'stored-user', EMAIL_PASS: 'stored-pass' },
      }));
      expect(mockProviderInstance.initialize).toHaveBeenNthCalledWith(2, expect.objectContaining({
        credentials: { EMAIL_USER: 'stored-user', EMAIL_PASS: 'stored-pass' },
      }));
    });
  });
});
