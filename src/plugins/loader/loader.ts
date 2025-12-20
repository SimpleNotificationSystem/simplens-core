/**
 * Plugin Loader
 * 
 * Loads and initializes provider plugins from configuration.
 * Supports dynamic import of npm packages.
 */

import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { PluginRegistry, type ChannelConfig } from './registry.js';
import type { SimpleNSProvider, ProviderConfig } from '../interfaces/provider.types.js';

/**
 * Provider entry in configuration
 */
interface ProviderEntry {
    /** npm package name (e.g., '@simplens/gmail') */
    package: string;
    /** Unique ID for this provider instance */
    id: string;
    /** Provider credentials */
    credentials: Record<string, string>;
    /** Optional settings */
    options?: {
        priority?: number;
        rateLimit?: {
            maxTokens?: number;
            refillRate?: number;
        };
        [key: string]: unknown;
    };
}

/**
 * SimpleNS configuration file structure
 */
interface SimpleNSConfig {
    /** Provider configurations */
    providers: ProviderEntry[];
    /** Channel to provider mapping */
    channels?: Record<string, {
        default: string;
        fallback?: string;
    }>;
}

/**
 * Load configuration from file
 */
function loadConfig(configPath: string): SimpleNSConfig {
    if (!existsSync(configPath)) {
        throw new Error(`Configuration file not found: ${configPath}`);
    }

    const content = readFileSync(configPath, 'utf-8');

    if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
        return parseYaml(content) as SimpleNSConfig;
    } else if (configPath.endsWith('.json')) {
        return JSON.parse(content) as SimpleNSConfig;
    } else {
        throw new Error(`Unsupported config format. Use .yaml, .yml, or .json`);
    }
}

/**
 * Resolve environment variables in credentials
 * Supports ${VAR_NAME} syntax
 */
function resolveCredentials(credentials: Record<string, string>): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const [key, value] of Object.entries(credentials)) {
        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
            const envVar = value.slice(2, -1);
            const envValue = process.env[envVar];
            if (!envValue) {
                console.warn(`[PluginLoader] Environment variable ${envVar} not set`);
            }
            resolved[key] = envValue || '';
        } else {
            resolved[key] = value;
        }
    }

    return resolved;
}

/**
 * Dynamically import a provider package and instantiate
 */
async function importAndInstantiateProvider(packageName: string): Promise<SimpleNSProvider> {
    try {
        // Try to import as npm package
        const module = await import(packageName);

        // Provider should export default class or createProvider function
        if (module.default) {
            if (typeof module.default === 'function') {
                // Check if it's a class (has prototype) or factory function
                if (module.default.prototype && module.default.prototype.constructor) {
                    return new module.default();
                }
                // It's a factory function
                return module.default();
            }
            // Already an instance
            return module.default;
        }

        if (module.createProvider) {
            return module.createProvider();
        }

        throw new Error(`Package ${packageName} does not export a provider`);
    } catch (err) {
        // If npm import fails, try local path
        if (packageName.startsWith('./') || packageName.startsWith('../')) {
            const module = await import(packageName);
            const provider = module.default || module.createProvider;
            if (typeof provider === 'function') {
                return provider.prototype ? new provider() : provider();
            }
            return provider;
        }
        throw err;
    }
}

/**
 * Load a single provider
 */
async function loadProvider(entry: ProviderEntry, options: { initialize?: boolean } = {}): Promise<void> {
    const shouldInitialize = options.initialize !== false; // Default true

    console.log(`[PluginLoader] Loading provider: ${entry.id} from ${entry.package}`);

    try {
        // Import and instantiate the provider
        const provider = await importAndInstantiateProvider(entry.package);

        // Resolve credentials
        const credentials = resolveCredentials(entry.credentials);

        // Initialize
        const config: ProviderConfig = {
            id: entry.id,
            credentials,
            options: entry.options,
        };

        if (shouldInitialize) {
            await provider.initialize(config);

            // Health check
            const healthy = await provider.healthCheck();
            if (!healthy) {
                console.warn(`[PluginLoader] Provider ${entry.id} health check failed`);
            }
        } else {
            // For metadata-only mode, we might still want to set basic config if the plugin supports it without init?
            // Usually init is where config is stored. 
            // If we don't init, the provider instance is "fresh". 
            // As long as schema methods don't depend on init being called, we are good.
            console.log(`[PluginLoader] ℹ️ Skipping initialization for ${entry.id} (metadata mode)`);
        }

        // Register
        const priority = entry.options?.priority || 0;
        PluginRegistry.register(provider, entry.id, priority);

        console.log(`[PluginLoader] ✅ Loaded provider: ${entry.id}`);
    } catch (err) {
        console.error(`[PluginLoader] ❌ Failed to load ${entry.package}:`, err);
        throw err;
    }
}

/**
 * Load all providers from configuration
 */
export async function loadProviders(configPath: string = './simplens.config.yaml', options: { initialize?: boolean } = {}): Promise<void> {
    console.log(`[PluginLoader] Loading configuration from: ${configPath}`);

    const config = loadConfig(configPath);

    if (!config.providers || config.providers.length === 0) {
        console.warn('[PluginLoader] No providers configured');
        return;
    }

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

    console.log(`[PluginLoader] ✅ Loaded ${PluginRegistry.getProviderIds().length} providers`);
    console.log(`[PluginLoader] 📢 Channels: ${PluginRegistry.getChannels().join(', ')}`);
}

/**
 * Load providers from environment-based config path
 */
export async function loadProvidersFromEnv(options: { initialize?: boolean } = {}): Promise<void> {
    const configPath = process.env.SIMPLENS_CONFIG_PATH || './simplens.config.yaml';
    return loadProviders(configPath, options);
}

/**
 * Get list of configured channels from config file
 * Used by API server to dynamically create Kafka topics
 */
export function getConfiguredChannels(configPath?: string): string[] {
    const path = configPath || process.env.SIMPLENS_CONFIG_PATH || './simplens.config.yaml';

    try {
        const config = loadConfig(path);
        return Object.keys(config.channels || {});
    } catch (err) {
        console.warn(`[PluginLoader] Could not read config for channels: ${err}`);
        return [];
    }
}

/**
 * Register a provider directly (for programmatic use/testing)
 */
export async function registerProvider(
    provider: SimpleNSProvider,
    id: string,
    credentials: Record<string, string>,
    options?: Record<string, unknown>
): Promise<void> {
    await provider.initialize({
        id,
        credentials,
        options,
    });

    const priority = (options?.priority as number) || 0;
    PluginRegistry.register(provider, id, priority);
}
