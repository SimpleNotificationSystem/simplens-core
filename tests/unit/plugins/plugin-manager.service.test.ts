/**
 * Unit Tests for PluginManagerService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManagerService } from '../../../src/plugins/services/plugin-manager.service.js';
import Plugin from '../../../src/database/models/plugin.models.js';
import Provider from '../../../src/database/models/provider.models.js';
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
    it('should reject uninstallation if providers depend on the plugin', async () => {
      vi.spyOn(Provider, 'countDocuments').mockResolvedValue(2 as any);

      await expect(PluginManagerService.uninstallPlugin('@simplens/mock')).rejects.toThrow(
        "Cannot uninstall plugin '@simplens/mock': 2 provider(s) depend on it."
      );
    });

    it('should uninstall and remove from DB when no providers depend on it', async () => {
      vi.spyOn(Provider, 'countDocuments').mockResolvedValue(0 as any);
      vi.spyOn(Plugin, 'findOne').mockResolvedValue({ name: '@simplens/mock' } as any);
      const uninstallSpy = vi.spyOn(pluginFs, 'uninstallNpmPackage').mockReturnValue(undefined);
      const deleteSpy = vi.spyOn(Plugin, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as any);

      await PluginManagerService.uninstallPlugin('@simplens/mock');

      expect(uninstallSpy).toHaveBeenCalledWith('@simplens/mock');
      expect(deleteSpy).toHaveBeenCalledWith({ name: '@simplens/mock' });
      expect(PluginSyncService.publish).toHaveBeenCalledWith('PLUGIN_UNINSTALLED', {
        plugin_name: '@simplens/mock',
      });
    });
  });
});
