/**
 * Provider Manager Service
 * 
 * Handles CRUD operations for provider instances, envelope encryption of credentials,
 * live connection testing, registry loading, and Redis synchronization.
 */

import Provider from '@src/database/models/provider.models.js';
import Plugin from '@src/database/models/plugin.models.js';
import ChannelRouting from '@src/database/models/channel-routing.models.js';
import {
  encryptCredentials,
  decryptCredentials,
} from '@src/plugins/crypto/keypair-manager.js';
import { importAndInstantiateProvider } from '@src/plugins/loader/plugin-fs.js';
import { PluginRegistry } from '@src/plugins/loader/registry.js';
import { PluginSyncService } from '@src/plugins/sync/plugin-sync.service.js';
import type {
  provider_document,
  ProviderConfig,
  ProviderOptions,
  ProviderResponseDto,
  SimpleNSProvider,
  encrypted_credentials,
} from '@src/types/types.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';

export type { ProviderResponseDto } from '@src/types/types.js';

export class ProviderManagerService {
  private static readonly credentialCacheTtlMs = 5 * 60 * 1000;
  private static readonly credentialCache = new Map<
    string,
    { credentials: Record<string, string>; expiresAt: number }
  >();

  private static getCachedCredentials(id: string): Record<string, string> | undefined {
    const cached = ProviderManagerService.credentialCache.get(id);
    if (!cached || cached.expiresAt <= Date.now()) {
      ProviderManagerService.credentialCache.delete(id);
      return undefined;
    }
    return cached.credentials;
  }

  private static cacheCredentials(id: string, credentials: Record<string, string>): void {
    ProviderManagerService.credentialCache.set(id, {
      credentials,
      expiresAt: Date.now() + ProviderManagerService.credentialCacheTtlMs,
    });
  }

  private static invalidateCredentialCache(id: string): void {
    ProviderManagerService.credentialCache.delete(id);
  }

  public static clearCachedCredentials(providerIds: string[]): void {
    for (const providerId of providerIds) {
      ProviderManagerService.invalidateCredentialCache(providerId);
    }
  }

  /**
   * Create a new provider instance with envelope-encrypted credentials
   */
  public static async createProvider(data: {
    id: string;
    plugin_name: string;
    credentials: Record<string, string>;
    options?: ProviderOptions;
    enabled?: boolean;
  }): Promise<ProviderResponseDto> {
    logger.info(`Creating provider '${data.id}' using plugin '${data.plugin_name}'...`);

    const existing = await Provider.findOne({ id: data.id });
    if (existing) {
      throw new Error(`Provider with ID '${data.id}' already exists.`);
    }

    const plugin = await Plugin.findOne({ name: data.plugin_name });
    if (!plugin) {
      throw new Error(`Plugin '${data.plugin_name}' is not installed.`);
    }

    const encryptedCredentials = await encryptCredentials(data.credentials);

    const providerDoc = await Provider.create({
      id: data.id,
      plugin_name: data.plugin_name,
      channel: plugin.manifest.channel,
      enabled: data.enabled !== false,
      credentials: encryptedCredentials,
      options: data.options || {},
    });

    // If enabled, load into current process registry
    if (providerDoc.enabled) {
      try {
        await ProviderManagerService.loadAndRegisterProvider(providerDoc.toObject() as provider_document);
      } catch (err) {
        logger.warn(`Provider '${data.id}' registered in DB, but failed local initialization:`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await PluginSyncService.publish('PROVIDER_UPSERTED', {
      provider_id: data.id,
    });

    logger.success(`Provider '${data.id}' created successfully.`);

    return {
      _id: providerDoc._id.toString(),
      id: providerDoc.id,
      plugin_name: providerDoc.plugin_name,
      channel: providerDoc.channel,
      enabled: providerDoc.enabled,
      options: providerDoc.options as ProviderOptions | undefined,
      credentials_configured: true,
      created_at: providerDoc.created_at,
      updated_at: providerDoc.updated_at,
    };
  }

  /**
   * Update an existing provider instance
   */
  public static async updateProvider(
    id: string,
    updates: {
      credentials?: Record<string, string>;
      options?: ProviderOptions;
      enabled?: boolean;
    }
  ): Promise<ProviderResponseDto> {
    logger.info(`Updating provider '${id}'...`);

    const providerDoc = await Provider.findOne({ id });
    if (!providerDoc) {
      throw new Error(`Provider '${id}' not found.`);
    }

    if (updates.enabled !== undefined) {
      providerDoc.enabled = updates.enabled;
    }
    if (updates.options !== undefined) {
      providerDoc.options = updates.options;
    }
    if (updates.credentials && Object.keys(updates.credentials).length > 0) {
      providerDoc.credentials = await encryptCredentials(updates.credentials);
      ProviderManagerService.invalidateCredentialCache(id);
    }

    await providerDoc.save();

    if (providerDoc.enabled) {
      try {
        await ProviderManagerService.loadAndRegisterProvider(providerDoc.toObject() as provider_document);
      } catch (err) {
        logger.warn(`Provider '${id}' updated in DB, but failed local reload:`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      PluginRegistry.unregister(id);
    }

    await PluginSyncService.publish('PROVIDER_UPSERTED', {
      provider_id: id,
    });

    logger.success(`Provider '${id}' updated successfully.`);

    return {
      _id: providerDoc._id.toString(),
      id: providerDoc.id,
      plugin_name: providerDoc.plugin_name,
      channel: providerDoc.channel,
      enabled: providerDoc.enabled,
      options: providerDoc.options as Record<string, unknown> | undefined,
      credentials_configured: true,
      created_at: providerDoc.created_at,
      updated_at: providerDoc.updated_at,
    };
  }

  /**
   * Delete a provider instance and remove it from channel routing.
   */
  public static async deleteProvider(id: string): Promise<void> {
    logger.info(`Deleting provider '${id}'...`);

    const providerDoc = await Provider.findOne({ id });
    if (!providerDoc) {
      throw new Error(`Provider '${id}' not found.`);
    }

    const routings = await ChannelRouting.find({
      $or: [{ default_provider_id: id }, { fallback_provider_ids: id }],
    }).lean();

    for (const routing of routings) {
      const remainingFallbacks = (routing.fallback_provider_ids || []).filter(
        (providerId: string) => providerId !== id
      );

      if (routing.default_provider_id === id) {
        const [nextDefault, ...fallbacks] = remainingFallbacks;
        if (nextDefault) {
          await ChannelRouting.updateOne(
            { channel: routing.channel },
            {
              default_provider_id: nextDefault,
              fallback_provider_ids: fallbacks,
            }
          );
        } else {
          await ChannelRouting.deleteOne({ channel: routing.channel });
        }
      } else {
        await ChannelRouting.updateOne(
          { channel: routing.channel },
          { fallback_provider_ids: remainingFallbacks }
        );
      }

      PluginRegistry.setChannelConfig(routing.channel, {
        default: remainingFallbacks[0] || '',
        fallback: remainingFallbacks.slice(1),
      });
      await PluginSyncService.publish('CHANNEL_ROUTING_UPDATED', {
        channel: routing.channel,
      });
    }

    await Provider.deleteOne({ id });
    ProviderManagerService.invalidateCredentialCache(id);
    PluginRegistry.unregister(id);

    await PluginSyncService.publish('PROVIDER_DELETED', {
      provider_id: id,
    });

    logger.success(`Provider '${id}' deleted successfully.`);
  }

  /**
   * List all providers without exposing ciphertext credentials
   */
  public static async listProviders(): Promise<ProviderResponseDto[]> {
    const providers = await Provider.find().sort({ channel: 1, 'options.priority': -1 }).lean();

    return providers.map((p) => ({
      _id: p._id.toString(),
      id: p.id,
      plugin_name: p.plugin_name,
      channel: p.channel,
      enabled: p.enabled,
      options: p.options as ProviderOptions | undefined,
      credentials_configured: !!p.credentials?.encrypted_data,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));
  }

  /**
   * Get single provider by ID
   */
  public static async getProvider(
    id: string,
    includeDecrypted = false
  ): Promise<(ProviderResponseDto & { decrypted_credentials?: Record<string, string> }) | null> {
    const providerDoc = await Provider.findOne({ id }).lean();
    if (!providerDoc) return null;

    let decrypted: Record<string, string> | undefined;
    if (includeDecrypted && providerDoc.credentials) {
      decrypted = await decryptCredentials(providerDoc.credentials);
    }

    return {
      _id: providerDoc._id.toString(),
      id: providerDoc.id,
      plugin_name: providerDoc.plugin_name,
      channel: providerDoc.channel,
      enabled: providerDoc.enabled,
      options: providerDoc.options as ProviderOptions | undefined,
      credentials_configured: !!providerDoc.credentials?.encrypted_data,
      decrypted_credentials: decrypted,
      created_at: providerDoc.created_at,
      updated_at: providerDoc.updated_at,
    };
  }

  /**
   * Helper to retrieve cached credentials or decrypt and cache them
   */
  private static async getOrDecryptCredentials(
    id: string,
    encryptedCredentials?: Record<string, unknown> | null
  ): Promise<Record<string, string>> {
    let credentials = ProviderManagerService.getCachedCredentials(id);
    if (!credentials && encryptedCredentials) {
      credentials = await decryptCredentials(encryptedCredentials as unknown as encrypted_credentials);
      ProviderManagerService.cacheCredentials(id, credentials);
    }
    return credentials || {};
  }

  /**
   * Helper to instantiate and optionally initialize a provider instance
   */
  private static async createAndInitProvider(
    id: string,
    pluginName: string,
    credentials: Record<string, string>,
    options: ProviderOptions,
    initialize = true
  ): Promise<{ providerInstance: SimpleNSProvider; healthy: boolean }> {
    const providerInstance = await importAndInstantiateProvider(pluginName);
    let healthy = true;

    if (initialize) {
      const config: ProviderConfig = {
        id,
        credentials,
        options,
      };
      await providerInstance.initialize(config);
      healthy = await providerInstance.healthCheck();
    }

    return { providerInstance, healthy };
  }

  /**
   * Test live provider connection / credentials
   */
  public static async testProviderConnection(data: {
    provider_id?: string;
    plugin_name?: string;
    credentials?: Record<string, string>;
    options?: ProviderOptions;
  }): Promise<{ success: boolean; message: string }> {
    let pluginName = data.plugin_name;
    let credentials = data.credentials;
    let options: ProviderOptions = data.options || {};

    if (data.provider_id) {
      const existing = await Provider.findOne({ id: data.provider_id });
      if (!existing) {
        throw new Error(`Provider '${data.provider_id}' not found.`);
      }
      pluginName = existing.plugin_name;
      options = { ...(existing.options as ProviderOptions), ...options };
      if (!credentials || Object.keys(credentials).length === 0) {
        credentials = await ProviderManagerService.getOrDecryptCredentials(data.provider_id, existing.credentials);
      }
    }

    if (!pluginName) {
      throw new Error('plugin_name or provider_id is required.');
    }
    if (!credentials) {
      throw new Error('Provider credentials are required.');
    }

    try {
      const { healthy } = await ProviderManagerService.createAndInitProvider(
        data.provider_id || 'test-connection',
        pluginName,
        credentials,
        options,
        true
      );

      if (healthy) {
        return { success: true, message: 'Provider connection and health check succeeded.' };
      } else {
        return { success: false, message: 'Provider health check failed.' };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Connection test error: ${message}` };
    }
  }

  /**
   * Load, decrypt credentials, instantiate and register provider into PluginRegistry
   */
  public static async loadAndRegisterProvider(
    providerDoc: provider_document,
    initialize = true
  ): Promise<void> {
    const credentials = await ProviderManagerService.getOrDecryptCredentials(providerDoc.id, providerDoc.credentials);
    const { providerInstance, healthy } = await ProviderManagerService.createAndInitProvider(
      providerDoc.id,
      providerDoc.plugin_name,
      credentials,
      (providerDoc.options as ProviderOptions) || {},
      initialize
    );

    if (initialize && !healthy) {
      logger.warn(`Provider '${providerDoc.id}' failed health check on initial load.`);
    }

    PluginRegistry.registerOrReplace(
      providerInstance,
      providerDoc.id,
      providerDoc.options?.priority ?? 0
    );
    logger.success(`Registered provider '${providerDoc.id}' in PluginRegistry.`);
  }

  /**
   * Register remote synchronization handlers with Redis Pub/Sub
   */
  public static registerSyncHandlers(): void {
    PluginSyncService.on('PROVIDER_UPSERTED', async (msg) => {
      const { provider_id } = msg.payload;
      if (!provider_id) return;

      logger.info(`Sync: Handling remote PROVIDER_UPSERTED for '${provider_id}'...`);
      const providerDoc = await Provider.findOne({ id: provider_id });

      if (providerDoc && providerDoc.enabled) {
        try {
          await ProviderManagerService.loadAndRegisterProvider(providerDoc.toObject() as provider_document);
        } catch (err) {
          logger.error(`Failed to reload synced provider '${provider_id}':`, err);
        }
      } else {
        PluginRegistry.unregister(provider_id);
      }
    });

    PluginSyncService.on('PROVIDER_DELETED', async (msg) => {
      const { provider_id } = msg.payload;
      if (!provider_id) return;

      logger.info(`Sync: Handling remote PROVIDER_DELETED for '${provider_id}'...`);
      PluginRegistry.unregister(provider_id);
    });
  }
}
