/**
 * YAML Configuration Migrator
 * 
 * Migrates static simplens.config.yaml into MongoDB on first startup if MongoDB is empty.
 * Resolves env placeholders in credentials, encrypts them using KeyPairManager,
 * ensures npm packages are installed, extracts manifests with package.json versions,
 * converts single fallbacks to array chains, and broadcasts SYSTEM_RELOAD.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import Plugin from '@src/database/models/plugin.models.js';
import Provider from '@src/database/models/provider.models.js';
import ChannelRouting from '@src/database/models/channel-routing.models.js';
import { encryptCredentials } from '@src/plugins/crypto/keypair-manager.js';
import {
  installNpmPackage,
  extractPackageManifest,
  PLUGINS_NODE_MODULES,
  resolveCredentials,
  resolveOptionalConfig,
  findConfigFile,
} from '@src/plugins/loader/plugin-fs.js';
import { PluginSyncService } from '@src/plugins/sync/plugin-sync.service.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';
import type { YamlConfig } from '@src/types/types.js';

export class YamlMigrator {
  /**
   * Check if MongoDB has providers; if empty and config file exists, migrate to MongoDB.
   * Returns true if migration was performed, false otherwise.
   */
  public static async migrateYamlIfNeeded(): Promise<boolean> {
    const providerCount = await Provider.countDocuments();
    if (providerCount > 0) {
      logger.info(
        `Found ${providerCount} provider(s) in MongoDB. Dynamic database configuration active, skipping YAML migration.`
      );
      return false;
    }

    
    const configPath = findConfigFile();
    if (!configPath) {
      logger.info('No simplens.config.yaml found and MongoDB is empty. Standby mode ready.');
      return false;
    }

    logger.info(`MongoDB provider collection is empty. Migrating configuration from ${configPath}...`);

    let rawConfig: YamlConfig;
    try {
      const fileContent = readFileSync(configPath, 'utf-8');
      if (configPath.endsWith('.json')) {
        rawConfig = JSON.parse(fileContent);
      } else {
        rawConfig = parseYaml(fileContent) as YamlConfig;
      }
    } catch (err) {
      logger.error(`Failed to parse configuration file at ${configPath}:`, err);
      return false;
    }

    if (!rawConfig.providers || rawConfig.providers.length === 0) {
      logger.warn('Configuration file contains no providers. Nothing to migrate.');
      return false;
    }

    // 1. Process and install plugins
    const processedPlugins = new Set<string>();

    for (const entry of rawConfig.providers) {
      const packageName = entry.package;
      if (!processedPlugins.has(packageName)) {
        const targetVersion = entry.version || 'latest';
        const installedPath = join(PLUGINS_NODE_MODULES, packageName);

        // If not already in node_modules, install it
        if (!existsSync(installedPath)) {
          logger.info(`Migrating plugin: Installing '${packageName}@${targetVersion}'...`);
          try {
            installNpmPackage(packageName, targetVersion);
          } catch (installErr) {
            logger.error(`Could not install plugin package '${packageName}':`, installErr);
          }
        }

        try {
          const { manifest, version: authoritativeVersion } = await extractPackageManifest(packageName);
          await Plugin.findOneAndUpdate(
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
          processedPlugins.add(packageName);
          logger.success(`Migrated plugin '${packageName}' (version: ${authoritativeVersion})`);
        } catch (manifestErr) {
          logger.error(`Failed to extract manifest for '${packageName}':`, manifestErr);
        }
      }
    }

    // 2. Process and encrypt provider configurations
    for (const entry of rawConfig.providers) {
      const resolvedCreds = resolveCredentials(entry.credentials);
      const resolvedOpts = resolveOptionalConfig(entry.optionalConfig);
      const mergedOptions = {
        ...(entry.options || {}),
        ...resolvedOpts,
      };

      const encryptedCreds = await encryptCredentials(resolvedCreds);

      // Find channel from installed plugin manifest
      const pluginDoc = await Plugin.findOne({ name: entry.package });
      const channel = pluginDoc?.manifest?.channel || 'generic';

      await Provider.findOneAndUpdate(
        { id: entry.id },
        {
          id: entry.id,
          plugin_name: entry.package,
          channel,
          enabled: true,
          credentials: encryptedCreds,
          options: mergedOptions,
        },
        { upsert: true, new: true }
      );

      logger.success(`Migrated provider '${entry.id}' (${channel})`);
    }

    // 3. Process channel routing
    if (rawConfig.channels) {
      for (const [channel, route] of Object.entries(rawConfig.channels)) {
        let fallbackArray: string[] = [];
        if (Array.isArray(route.fallback)) {
          fallbackArray = route.fallback;
        } else if (typeof route.fallback === 'string' && route.fallback.trim().length > 0) {
          fallbackArray = [route.fallback.trim()];
        }

        await ChannelRouting.findOneAndUpdate(
          { channel },
          {
            channel,
            default_provider_id: route.default,
            fallback_provider_ids: fallbackArray,
            partitions: route.partitions || 6,
          },
          { upsert: true, new: true }
        );

        logger.success(
          `Migrated channel routing '${channel}': default=${route.default}, fallbacks=[${fallbackArray.join(', ')}]`
        );
      }
    }

    logger.success('YAML configuration migration completed successfully.');

    // Broadcast SYSTEM_RELOAD event to notify other instances
    await PluginSyncService.publish('SYSTEM_RELOAD', {});
    return true;
  }
}
