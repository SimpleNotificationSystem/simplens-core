/**
 * Plugin Loader
 * 
 * Loads and initializes provider plugins from configuration.
 * Supports dynamic import of npm packages.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { PluginRegistry, type ChannelConfig } from './registry.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';
import Plugin from '@src/database/models/plugin.models.js';
import Provider from '@src/database/models/provider.models.js';
import ChannelRouting from '@src/database/models/channel-routing.models.js';
import { ProviderManagerService } from '@src/plugins/services/provider-manager.service.js';
import {
    PLUGINS_NODE_MODULES,
    installNpmPackage,
    importAndInstantiateProvider,
    resolveCredentials,
    resolveOptionalConfig,
    findConfigFile,
} from './plugin-fs.js';
import type {
    provider_document,
    ProviderEntry,
    ProviderOptions,
    SimpleNSConfig,
    SimpleNSProvider,
    ProviderConfig,
} from '@src/types/types.js';

/**
 * Install missing plugins from configuration
 * Checks which packages in config are not installed and installs them
 */
async function installMissingPlugins(config: SimpleNSConfig): Promise<void> {
    if (!config.providers || config.providers.length === 0) {
        return;
    }

    const missingPackages: string[] = [];

    for (const entry of config.providers) {
        const pluginPath = join(PLUGINS_NODE_MODULES, entry.package);
        if (!existsSync(pluginPath)) {
            missingPackages.push(entry.package);
        }
    }

    if (missingPackages.length === 0) {
        return;
    }

    logger.info(`Auto-installing ${missingPackages.length} missing plugin(s)...`);

    for (const pkg of missingPackages) {
        installNpmPackage(pkg);
    }
}

/**
 * Load configuration from file
 * Returns null if no config file exists
 */
function loadConfig(configPath: string): SimpleNSConfig | null {
    const pathToUse = findConfigFile(configPath) || configPath;

    if (!existsSync(pathToUse)) {
        // No config file - this is okay, just means no plugins configured
        logger.info(`No configuration file found at ${pathToUse}`);
        return null;
    }

    const content = readFileSync(pathToUse, 'utf-8');

    if (pathToUse.endsWith('.yaml') || pathToUse.endsWith('.yml')) {
        return parseYaml(content) as SimpleNSConfig;
    } else if (pathToUse.endsWith('.json')) {
        return JSON.parse(content) as SimpleNSConfig;
    } else {
        throw new Error(`Unsupported config format. Use .yaml, .yml, or .json`);
    }
}

/**
 * Load a single provider
 */
async function loadProvider(entry: ProviderEntry, options: { initialize?: boolean } = {}): Promise<void> {
    const shouldInitialize = options.initialize !== false; // Default true

    logger.info(`Loading provider: ${entry.id} from ${entry.package}`);

    try {
        // Import and instantiate the provider
        const provider = await importAndInstantiateProvider(entry.package);

        // Resolve credentials
        const credentials = resolveCredentials(entry.credentials);

        // Resolve optional config from env vars
        const resolvedOptionalConfig = resolveOptionalConfig(entry.optionalConfig);

        // Initialize
        const config: ProviderConfig = {
            id: entry.id,
            credentials,
            options: {
                ...entry.options,
                ...resolvedOptionalConfig,  // Merge resolved optional config into options
            },
        };

        if (shouldInitialize) {
            await provider.initialize(config);

            // Health check
            const healthy = await provider.healthCheck();
            if (!healthy) {
                logger.warn(`Provider ${entry.id} health check failed`);
            }
        } else {
            // For metadata-only mode, we might still want to set basic config if the plugin supports it without init?
            // Usually init is where config is stored. 
            // If we don't init, the provider instance is "fresh". 
            // As long as schema methods don't depend on init being called, we are good.
            logger.info(`Skipping initialization for ${entry.id} (metadata mode)`);
        }

        // Register
        const priority = entry.options?.priority || 0;
        PluginRegistry.register(provider, entry.id, priority);

        logger.success(`Loaded provider: ${entry.id}`);
    } catch (err) {
        logger.error(`Failed to load ${entry.package}`, err);
        throw err;
    }
}

/**
 * Load all providers from configuration
 */
export async function loadProviders(configPath: string = './simplens.config.yaml', options: { initialize?: boolean } = {}): Promise<void> {
    logger.info(`Loading configuration from: ${configPath}`);

    const config = loadConfig(configPath);

    // No config file or empty config - just mark as initialized with no providers
    if (!config || !config.providers || config.providers.length === 0) {
        logger.warn('No providers configured - starting without plugins');
        PluginRegistry.setInitialized(true);
        return;
    }

    // Auto-install missing plugins from config
    await installMissingPlugins(config);

    // Load each provider
    for (const entry of config.providers) {
        await loadProvider(entry, options);
    }

    // Set channel configuration
    if (config.channels) {
        for (const [channel, channelConfig] of Object.entries(config.channels)) {
            PluginRegistry.setChannelConfig(channel, channelConfig as ChannelConfig);
        }
    }

    PluginRegistry.setInitialized(true);

    logger.success(`Loaded ${PluginRegistry.getProviderIds().length} providers`);
    logger.info(`Channels: ${PluginRegistry.getChannels().join(', ')}`);
}

/**
 * Load providers from environment-based config path
 */
export async function loadProvidersFromEnv(options: { initialize?: boolean } = {}): Promise<void> {
    const configPath = process.env.SIMPLENS_CONFIG_PATH || './simplens.config.yaml';
    await loadProviders(configPath, options);
}

/**
 * Get list of configured channels from config file
 * Used by API server to dynamically create Kafka topics
 */
export function getConfiguredChannels(configPath?: string): string[] {
    const path = configPath || process.env.SIMPLENS_CONFIG_PATH || './simplens.config.yaml';

    try {
        const config = loadConfig(path);
        if (config) {
            return Object.keys(config.channels || {});
        }
    } catch (err) {
        logger.warn(`Could not read config for channels: ${err}`);
    }
    return [];
}

/**
 * Register a provider directly (for programmatic use/testing)
 */
export async function registerProvider(
    provider: SimpleNSProvider,
    id: string,
    credentials: Record<string, string>,
    options?: ProviderOptions
): Promise<void> {
    await provider.initialize({
        id,
        credentials,
        options,
    });

    const priority = options?.priority ?? 0;
    PluginRegistry.register(provider, id, priority);
}

/**
 * Load all providers and channel routings directly from MongoDB
 */
export async function loadProvidersFromDatabase(options: { initialize?: boolean } = {}): Promise<void> {
    const shouldInitialize = options.initialize !== false;
    logger.info('Loading provider plugins from MongoDB...');

    // 1. Ensure all installed plugins exist locally
    try {
        const installedPlugins = await Plugin.find({ status: 'installed' }).lean();
        for (const plugin of installedPlugins) {
            const pluginPath = join(PLUGINS_NODE_MODULES, plugin.name);
            if (!existsSync(pluginPath)) {
                logger.info(`Syncing missing plugin package locally: ${plugin.name}@${plugin.version}`);
                try {
                    installNpmPackage(plugin.name, plugin.version);
                } catch (err) {
                    logger.error(`Failed to install missing package ${plugin.name}:`, err);
                }
            }
        }
    } catch (dbErr) {
        logger.error('Error fetching installed plugins from database:', dbErr);
    }

    // 2. Load all enabled providers
    try {
        const providers = await Provider.find({ enabled: true }).lean();
        logger.info(`Found ${providers.length} enabled provider(s) in MongoDB.`);

        for (const providerDoc of providers) {
            try {
                await ProviderManagerService.loadAndRegisterProvider(
                    providerDoc as unknown as provider_document,
                    shouldInitialize
                );
            } catch (err) {
                logger.error(`Failed to load provider '${providerDoc.id}':`, err);
            }
        }
    } catch (dbErr) {
        logger.error('Error fetching providers from database:', dbErr);
    }

    // 3. Load channel routing
    try {
        const routings = await ChannelRouting.find().lean();
        for (const route of routings) {
            PluginRegistry.setChannelConfig(route.channel, {
                default: route.default_provider_id,
                fallback: route.fallback_provider_ids || [],
            });
        }
    } catch (dbErr) {
        logger.error('Error fetching channel routings from database:', dbErr);
    }

    PluginRegistry.setInitialized(true);
    logger.success(`Loaded ${PluginRegistry.getProviderIds().length} providers from MongoDB.`);
    logger.info(`Configured channels: ${PluginRegistry.getChannels().join(', ')}`);
}

