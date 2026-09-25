/**
 * Plugin Manager Service
 * 
 * Handles npm package installation, version changes, uninstallation,
 * metadata extraction, database records, and Redis pub/sub synchronization.
 */

import Plugin from '@src/database/models/plugin.models.js';
import Provider from '@src/database/models/provider.models.js';
import ChannelRouting from '@src/database/models/channel-routing.models.js';
import { PluginRegistry } from '@src/plugins/loader/registry.js';
import {
  installNpmPackage,
  uninstallNpmPackage,
  extractPackageManifest,
} from '@src/plugins/loader/plugin-fs.js';
import { PluginSyncService } from '@src/plugins/sync/plugin-sync.service.js';
import { ProviderManagerService } from '@src/plugins/services/provider-manager.service.js';
import type { plugin_document, ProviderManifest, install_plugin_payload } from '@src/types/types.js';
import { NpmAuthService, extractScope } from './npm-auth.service.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';

export class PluginManagerService {
  /**
   * Helper to install package, extract manifest, upsert/update Plugin record, and broadcast sync event
   */
  private static async saveAndBroadcastPlugin(
    packageName: string,
    version: string | undefined,
    syncAction: 'PLUGIN_INSTALLED' | 'PLUGIN_VERSION_CHANGED',
    upsert = false
  ): Promise<plugin_document> {
    return await PluginSyncService.runWithLock(async () => {
      try {
        installNpmPackage(packageName, version);

        let manifest: ProviderManifest;
        let authoritativeVersion: string;
        try {
          const extracted = await extractPackageManifest(packageName);
          manifest = extracted.manifest;
          authoritativeVersion = extracted.version;
        } catch (validationErr) {
          logger.warn(`Plugin validation failed for '${packageName}'. Rolling back by uninstalling...`);
          try {
            uninstallNpmPackage(packageName);
          } catch (uninstallErr) {
            logger.error(`Rollback failed for '${packageName}':`, uninstallErr);
          }
          throw validationErr;
        }

        const plugin = await Plugin.findOneAndUpdate(
          { name: packageName },
          {
            name: packageName,
            version: authoritativeVersion,
            status: 'installed',
            manifest,
            error: undefined,
          },
          upsert ? { upsert: true, new: true } : { new: true }
        );

        await PluginSyncService.publish(syncAction, {
          plugin_name: packageName,
          version: authoritativeVersion,
        });

        logger.success(
          `Plugin '${packageName}' ${upsert ? '@' + authoritativeVersion + ' installed' : 'updated to version ' + authoritativeVersion} successfully.`
        );
        return plugin!.toObject() as plugin_document;
      } catch (err) {
        logger.error(`Failed to process plugin '${packageName}':`, err);
        throw err;
      }
    });
  }

  /**
   * Install an npm package, extract its manifest, persist to MongoDB, and broadcast.
   */
  public static async installPlugin(
    packageName: string,
    version?: string,
    auth?: install_plugin_payload['auth']
  ): Promise<plugin_document> {
    const scope = extractScope(packageName);
    if (auth?.token) {
      const targetScope = auth.scope || scope;
      if (auth.save_token !== false) {
        await NpmAuthService.saveNpmAuth(auth.token, auth.registry_url, targetScope);
      } else {
        await NpmAuthService.syncNpmrc({
          scope: targetScope,
          registryUrl: auth.registry_url,
          token: auth.token,
        });
      }
    }

    logger.info(`Installing plugin package '${packageName}' (version: ${version || 'latest'})...`);
    return this.saveAndBroadcastPlugin(packageName, version, 'PLUGIN_INSTALLED', true);
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

    return this.saveAndBroadcastPlugin(packageName, version, 'PLUGIN_VERSION_CHANGED', false);
  }

  /**
   * Uninstall a plugin and remove its dependent routing and provider records.
   */
  public static async uninstallPlugin(packageName: string): Promise<void> {
    logger.info(`Uninstalling plugin '${packageName}'...`);

    const existing = await Plugin.findOne({ name: packageName });
    if (!existing) {
      throw new Error(`Plugin '${packageName}' not found.`);
    }

    await PluginSyncService.runWithLock(async () => {
      try {
        uninstallNpmPackage(packageName);

        const dependentProviders = await Provider.find({ plugin_name: packageName })
          .select({ id: 1 })
          .lean();
        const providerIds = dependentProviders.map((provider) => provider.id);

        if (providerIds.length > 0) {
          const dependentRoutings = await ChannelRouting.find({
            $or: [
              { default_provider_id: { $in: providerIds } },
              { fallback_provider_ids: { $in: providerIds } },
            ],
          }).select({ channel: 1 }).lean();
          const routingChannels = dependentRoutings.map((routing) => routing.channel);

          if (routingChannels.length > 0) {
            await ChannelRouting.deleteMany({ channel: { $in: routingChannels } });
            for (const channel of routingChannels) {
              PluginRegistry.setChannelConfig(channel, { default: '', fallback: [] });
              await PluginSyncService.publish('CHANNEL_ROUTING_UPDATED', { channel });
            }
          }

          await Provider.deleteMany({ plugin_name: packageName });
          ProviderManagerService.clearCachedCredentials(providerIds);
          for (const providerId of providerIds) {
            PluginRegistry.unregister(providerId);
            await PluginSyncService.publish('PROVIDER_DELETED', { provider_id: providerId });
          }
        }

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
    const handleRemoteInstallOrUpdate = async (actionDesc: string, payload: { plugin_name?: string; version?: string }) => {
      const { plugin_name, version } = payload;
      if (!plugin_name) return;
      logger.info(`Sync: ${actionDesc} for '${plugin_name}' (${version || 'latest'})...`);
      await PluginSyncService.runWithLock(async () => {
        try {
          installNpmPackage(plugin_name, version);
        } catch (err) {
          logger.error(`Failed to sync remote ${actionDesc} for '${plugin_name}':`, err);
        }
      });
    };

    PluginSyncService.on('PLUGIN_INSTALLED', async (msg) => {
      await handleRemoteInstallOrUpdate('Installing remote plugin', msg.payload);
    });

    PluginSyncService.on('PLUGIN_VERSION_CHANGED', async (msg) => {
      await handleRemoteInstallOrUpdate('Changing remote plugin version', msg.payload);
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
