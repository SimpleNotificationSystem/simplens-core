/**
 * Plugin Manager Service
 * 
 * Handles npm package installation, version changes, uninstallation,
 * metadata extraction, database records, and Redis pub/sub synchronization.
 */

import Plugin from '@src/database/models/plugin.models.js';
import Provider from '@src/database/models/provider.models.js';
import {
  installNpmPackage,
  uninstallNpmPackage,
  extractPackageManifest,
} from '@src/plugins/loader/plugin-fs.js';
import { PluginSyncService } from '@src/plugins/sync/plugin-sync.service.js';
import type { plugin_document } from '@src/types/types.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';

export class PluginManagerService {
  /**
   * Install an npm package, extract its manifest, persist to MongoDB, and broadcast.
   */
  public static async installPlugin(
    packageName: string,
    version?: string
  ): Promise<plugin_document> {
    logger.info(`Installing plugin package '${packageName}' (version: ${version || 'latest'})...`);

    return await PluginSyncService.runWithLock(async () => {
      try {
        installNpmPackage(packageName, version);
        const { manifest, version: authoritativeVersion } = await extractPackageManifest(packageName);

        const plugin = await Plugin.findOneAndUpdate(
          { name: packageName },
          {
            name: packageName,
            version: authoritativeVersion,
            status: 'installed',
            manifest,
            error: undefined,
          },
          { upsert: true, new: true }
        );

        await PluginSyncService.publish('PLUGIN_INSTALLED', {
          plugin_name: packageName,
          version: authoritativeVersion,
        });

        logger.success(`Plugin '${packageName}'@${authoritativeVersion} installed successfully.`);
        return plugin.toObject() as plugin_document;
      } catch (err) {
        logger.error(`Failed to install plugin '${packageName}':`, err);
        throw err;
      }
    });
  }

  /**
   * Change/upgrade/downgrade the version of an already installed plugin.
   */
  public static async changePluginVersion(
    packageName: string,
    version: string
  ): Promise<plugin_document> {
    logger.info(`Changing version of plugin '${packageName}' to '${version}'...`);

    const existing = await Plugin.findOne({ name: packageName });
    if (!existing) {
      throw new Error(`Plugin '${packageName}' is not installed.`);
    }

    return await PluginSyncService.runWithLock(async () => {
      try {
        installNpmPackage(packageName, version);
        const { manifest, version: authoritativeVersion } = await extractPackageManifest(packageName);

        const plugin = await Plugin.findOneAndUpdate(
          { name: packageName },
          {
            version: authoritativeVersion,
            status: 'installed',
            manifest,
            error: undefined,
          },
          { new: true }
        );

        await PluginSyncService.publish('PLUGIN_VERSION_CHANGED', {
          plugin_name: packageName,
          version: authoritativeVersion,
        });

        logger.success(`Plugin '${packageName}' updated to version ${authoritativeVersion}.`);
        return plugin!.toObject() as plugin_document;
      } catch (err) {
        logger.error(`Failed to update plugin '${packageName}' to version '${version}':`, err);
        throw err;
      }
    });
  }

  /**
   * Uninstall a plugin. Rejects if any configured providers depend on it.
   */
  public static async uninstallPlugin(packageName: string): Promise<void> {
    logger.info(`Uninstalling plugin '${packageName}'...`);

    const dependentProvidersCount = await Provider.countDocuments({ plugin_name: packageName });
    if (dependentProvidersCount > 0) {
      throw new Error(
        `Cannot uninstall plugin '${packageName}': ${dependentProvidersCount} provider(s) depend on it. Delete or reassign providers first.`
      );
    }

    const existing = await Plugin.findOne({ name: packageName });
    if (!existing) {
      throw new Error(`Plugin '${packageName}' not found.`);
    }

    await PluginSyncService.runWithLock(async () => {
      try {
        uninstallNpmPackage(packageName);
        await Plugin.deleteOne({ name: packageName });

        await PluginSyncService.publish('PLUGIN_UNINSTALLED', {
          plugin_name: packageName,
        });

        logger.success(`Plugin '${packageName}' uninstalled successfully.`);
      } catch (err) {
        logger.error(`Failed to uninstall plugin '${packageName}':`, err);
        throw err;
      }
    });
  }

  /**
   * List all installed plugins.
   */
  public static async listInstalledPlugins(): Promise<plugin_document[]> {
    return (await Plugin.find().sort({ name: 1 }).lean()) as plugin_document[];
  }

  /**
   * Get a single installed plugin by name.
   */
  public static async getPlugin(name: string): Promise<plugin_document | null> {
    return (await Plugin.findOne({ name }).lean()) as plugin_document | null;
  }

  /**
   * Register remote synchronization handlers with Redis Pub/Sub
   */
  public static registerSyncHandlers(): void {
    PluginSyncService.on('PLUGIN_INSTALLED', async (msg) => {
      const { plugin_name, version } = msg.payload;
      if (!plugin_name) return;
      logger.info(`Sync: Installing remote plugin '${plugin_name}' (${version || 'latest'})...`);
      await PluginSyncService.runWithLock(async () => {
        try {
          installNpmPackage(plugin_name, version);
        } catch (err) {
          logger.error(`Failed to sync remote install of '${plugin_name}':`, err);
        }
      });
    });

    PluginSyncService.on('PLUGIN_VERSION_CHANGED', async (msg) => {
      const { plugin_name, version } = msg.payload;
      if (!plugin_name) return;
      logger.info(`Sync: Changing remote plugin '${plugin_name}' to version '${version}'...`);
      await PluginSyncService.runWithLock(async () => {
        try {
          installNpmPackage(plugin_name, version);
        } catch (err) {
          logger.error(`Failed to sync remote version change of '${plugin_name}':`, err);
        }
      });
    });

    PluginSyncService.on('PLUGIN_UNINSTALLED', async (msg) => {
      const { plugin_name } = msg.payload;
      if (!plugin_name) return;
      logger.info(`Sync: Uninstalling remote plugin '${plugin_name}'...`);
      await PluginSyncService.runWithLock(async () => {
        try {
          uninstallNpmPackage(plugin_name);
        } catch (err) {
          logger.error(`Failed to sync remote uninstall of '${plugin_name}':`, err);
        }
      });
    });
  }
}
