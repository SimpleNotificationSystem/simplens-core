/**
 * Unit Tests for PluginManagerService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManagerService } from '../../../src/plugins/services/plugin-manager.service.js';
import Plugin from '../../../src/database/models/plugin.models.js';
import Provider from '../../../src/database/models/provider.models.js';
import ChannelRouting from '../../../src/database/models/channel-routing.models.js';
import { PluginRegistry } from '../../../src/plugins/loader/registry.js';
import * as pluginFs from '../../../src/plugins/loader/plugin-fs.js';
import { PluginSyncService } from '../../../src/plugins/sync/plugin-sync.service.js';

describe('PluginManagerService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(PluginSyncService, 'publish').mockResolvedValue(undefined);
  });

  describe('installPlugin', () => {
    it('should install npm package, extract manifest with package.json version, save to DB, and publish event', async () => {
      const installSpy = vi.spyOn(pluginFs, 'installNpmPackage').mockReturnValue(undefined);
      vi.spyOn(pluginFs, 'extractPackageManifest').mockResolvedValue({
        manifest: {
          name: '@simplens/mock',
          displayName: 'Mock Provider',
          version: '2.1.0',
          channel: 'mock',
          description: 'Mock plugin',
          requiredCredentials: [],
        },
        version: '2.1.0',
      });

      const mockPluginDoc = {
        name: '@simplens/mock',
        version: '2.1.0',
        status: 'installed',
        manifest: {
          name: '@simplens/mock',
          displayName: 'Mock Provider',
          version: '2.1.0',
          channel: 'mock',
          description: 'Mock plugin',
          requiredCredentials: [],
        },
        toObject: () => ({
          name: '@simplens/mock',
          version: '2.1.0',
          status: 'installed',
        }),
      };

      vi.spyOn(Plugin, 'findOneAndUpdate').mockResolvedValue(mockPluginDoc as any);

      const result = await PluginManagerService.installPlugin('@simplens/mock', '2.1.0');

      expect(installSpy).toHaveBeenCalledWith('@simplens/mock', '2.1.0');
      expect(Plugin.findOneAndUpdate).toHaveBeenCalledWith(
        { name: '@simplens/mock' },
        expect.objectContaining({
          name: '@simplens/mock',
          version: '2.1.0',
          status: 'installed',
        }),
        { upsert: true, new: true }
      );
      expect(PluginSyncService.publish).toHaveBeenCalledWith('PLUGIN_INSTALLED', {
        plugin_name: '@simplens/mock',
        version: '2.1.0',
      });
      expect(result.version).toBe('2.1.0');
    });

    it('should roll back by uninstalling if manifest extraction/validation fails', async () => {
      vi.spyOn(pluginFs, 'installNpmPackage').mockReturnValue(undefined);
      const uninstallSpy = vi.spyOn(pluginFs, 'uninstallNpmPackage').mockReturnValue(undefined);
      vi.spyOn(pluginFs, 'extractPackageManifest').mockRejectedValue(
        new Error("Package 'lodash' is not a valid SimpleNS plugin.")
      );

      await expect(
        PluginManagerService.installPlugin('lodash', 'latest')
      ).rejects.toThrow("Package 'lodash' is not a valid SimpleNS plugin.");

      expect(uninstallSpy).toHaveBeenCalledWith('lodash');
    });
  });

  describe('changePluginVersion', () => {
    it('should throw error if plugin is not already installed', async () => {
      vi.spyOn(Plugin, 'findOne').mockResolvedValue(null);

      await expect(
        PluginManagerService.changePluginVersion('@simplens/unknown', '1.2.0')
      ).rejects.toThrow("Plugin '@simplens/unknown' is not installed.");
    });

    it('should install new version and update DB when plugin exists', async () => {
      vi.spyOn(Plugin, 'findOne').mockResolvedValue({ name: '@simplens/mock' } as any);
      vi.spyOn(pluginFs, 'installNpmPackage').mockReturnValue(undefined);
      vi.spyOn(pluginFs, 'extractPackageManifest').mockResolvedValue({
        manifest: {
          name: '@simplens/mock',
          displayName: 'Mock Provider',
          version: '3.0.0',
          channel: 'mock',
          description: 'Mock plugin v3',
          requiredCredentials: [],
        },
        version: '3.0.0',
      });

      const updatedDoc = {
        name: '@simplens/mock',
        version: '3.0.0',
        toObject: () => ({
          name: '@simplens/mock',
          version: '3.0.0',
        }),
      };
      vi.spyOn(Plugin, 'findOneAndUpdate').mockResolvedValue(updatedDoc as any);

      const result = await PluginManagerService.changePluginVersion('@simplens/mock', '3.0.0');

      expect(PluginSyncService.publish).toHaveBeenCalledWith('PLUGIN_VERSION_CHANGED', {
        plugin_name: '@simplens/mock',
        version: '3.0.0',
      });
      expect(result.version).toBe('3.0.0');
    });
  });

  describe('uninstallPlugin', () => {
    it('should remove dependent routings and providers before uninstalling the plugin', async () => {
      vi.spyOn(Plugin, 'findOne').mockResolvedValue({ name: '@simplens/mock' } as any);
      vi.spyOn(Provider, 'find').mockReturnValue({
        select: () => ({
          lean: vi.fn().mockResolvedValue([{ id: 'mock-provider' }]),
        }),
      } as any);
      vi.spyOn(ChannelRouting, 'find').mockReturnValue({
        select: () => ({
          lean: vi.fn().mockResolvedValue([{ channel: 'mock' }]),
        }),
      } as any);
      const routingDeleteSpy = vi.spyOn(ChannelRouting, 'deleteMany').mockResolvedValue({ deletedCount: 1 } as any);
      const providerDeleteSpy = vi.spyOn(Provider, 'deleteMany').mockResolvedValue({ deletedCount: 1 } as any);
      const unregisterSpy = vi.spyOn(PluginRegistry, 'unregister').mockReturnValue(true);
      const uninstallSpy = vi.spyOn(pluginFs, 'uninstallNpmPackage').mockReturnValue(undefined);
      const deleteSpy = vi.spyOn(Plugin, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as any);

      await PluginManagerService.uninstallPlugin('@simplens/mock');

      expect(uninstallSpy).toHaveBeenCalledWith('@simplens/mock');
      expect(routingDeleteSpy).toHaveBeenCalledWith({ channel: { $in: ['mock'] } });
      expect(providerDeleteSpy).toHaveBeenCalledWith({ plugin_name: '@simplens/mock' });
      expect(unregisterSpy).toHaveBeenCalledWith('mock-provider');
      expect(deleteSpy).toHaveBeenCalledWith({ name: '@simplens/mock' });
      expect(PluginSyncService.publish).toHaveBeenCalledWith('CHANNEL_ROUTING_UPDATED', {
        channel: 'mock',
      });
      expect(PluginSyncService.publish).toHaveBeenCalledWith('PROVIDER_DELETED', {
        provider_id: 'mock-provider',
      });
      expect(PluginSyncService.publish).toHaveBeenCalledWith('PLUGIN_UNINSTALLED', {
        plugin_name: '@simplens/mock',
      });
    });

    it('should uninstall and remove the plugin when no providers depend on it', async () => {
      vi.spyOn(Plugin, 'findOne').mockResolvedValue({ name: '@simplens/mock' } as any);
      vi.spyOn(Provider, 'find').mockReturnValue({
        select: () => ({
          lean: vi.fn().mockResolvedValue([]),
        }),
      } as any);
      const uninstallSpy = vi.spyOn(pluginFs, 'uninstallNpmPackage').mockReturnValue(undefined);
      const deleteSpy = vi.spyOn(Plugin, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as any);

      await PluginManagerService.uninstallPlugin('@simplens/mock');

      expect(uninstallSpy).toHaveBeenCalledWith('@simplens/mock');
      expect(deleteSpy).toHaveBeenCalledWith({ name: '@simplens/mock' });
    });
  });
});
