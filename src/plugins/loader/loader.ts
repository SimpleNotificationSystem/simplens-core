/**
 * Plugin Loader
 * 
 * Loads and initializes provider plugins from configuration.
 * Supports dynamic import of npm packages.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';
import { parse as parseYaml } from 'yaml';
import { PluginRegistry, type ChannelConfig } from './registry.js';
import type { SimpleNSProvider, ProviderConfig } from '../interfaces/provider.types.js';

// Plugins directory for user-installed plugins
const PLUGINS_DIR = join(process.cwd(), '.plugins');
const PLUGINS_NODE_MODULES = join(PLUGINS_DIR, 'node_modules');

/**
 * Initialize plugins directory with package.json if needed
 */
function initPluginsDir(): void {
    if (!existsSync(PLUGINS_DIR)) {
        mkdirSync(PLUGINS_DIR, { recursive: true });
    }

    const packageJsonPath = join(PLUGINS_DIR, 'package.json');
    if (!existsSync(packageJsonPath)) {
        const initialPackage = {
            name: 'simplens-plugins',
            version: '1.0.0',
            description: 'User-installed SimpleNS plugins',
            private: true,
            type: 'module',
            dependencies: {}
        };
        writeFileSync(packageJsonPath, JSON.stringify(initialPackage, null, 2));
    }
}

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

    console.log(`[PluginLoader] Auto-installing ${missingPackages.length} missing plugin(s)...`);
    initPluginsDir();

    for (const pkg of missingPackages) {
        console.log(`[PluginLoader] Installing ${pkg}...`);
        try {
            execSync(`npm install ${pkg}`, {
                cwd: PLUGINS_DIR,
                stdio: 'pipe' // Suppress output for cleaner logs
            });
            console.log(`[PluginLoader] ✅ Installed ${pkg}`);
        } catch (err) {
            console.error(`[PluginLoader] ❌ Failed to install ${pkg}:`, err);
            throw new Error(`Failed to auto-install plugin: ${pkg}`);
        }
    }
}

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
 * Find local config file if it exists
 * Checks for simplens.config.yaml/.yml/.json
 */
function findLocalConfig(basePath: string): string | null {
    const dir = basePath.substring(0, basePath.lastIndexOf('/') + 1) || './';
    const localPatterns = [
        'simplens.config.yaml',
        'simplens.config.yml',
        'simplens.config.json'
    ];

    for (const filename of localPatterns) {
        const localPath = dir + filename;
        if (existsSync(localPath)) {
            return localPath;
        }
    }
    return null;
}

/**
 * Load configuration from file
 * Returns null if no config file exists
 */
function loadConfig(configPath: string): SimpleNSConfig | null {
    // Check for local config first (takes precedence)
    const localConfigPath = findLocalConfig(configPath);
    const pathToUse = localConfigPath || configPath;

    if (localConfigPath) {
        console.log(`[PluginLoader] Using local config: ${localConfigPath}`);
    }

    if (!existsSync(pathToUse)) {
        // No config file - this is okay, just means no plugins configured
        console.log(`[PluginLoader] No configuration file found at ${pathToUse}`);
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
 * Resolve environment variables in credentials
 * Supports ${VAR_NAME} syntax
 */
function resolveCredentials(credentials: Record<string, string> | undefined): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const [key, value] of Object.entries(credentials || {})) {
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
 * Helper to instantiate provider from module
 */
function instantiateFromModule(module: Record<string, unknown>, packageName: string): SimpleNSProvider {
    if (module.default) {
        if (typeof module.default === 'function') {
            const DefaultExport = module.default as new () => SimpleNSProvider;
            if (DefaultExport.prototype?.constructor) {
                return new DefaultExport();
            }
            // Factory function
            return (module.default as () => SimpleNSProvider)();
        }
        return module.default as SimpleNSProvider;
    }
    if (module.createProvider) {
        return (module.createProvider as () => SimpleNSProvider)();
    }
    throw new Error(`Package ${packageName} does not export a provider`);
}

/**
 * Resolve the entry file for a package from its package.json
 */
function resolvePackageEntry(packagePath: string): string {
    const pkgJsonPath = join(packagePath, 'package.json');
    if (!existsSync(pkgJsonPath)) {
        return join(packagePath, 'index.js'); // Fallback
    }

    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

    // Resolve entry point: exports > main > index.js
    let entryPoint = 'index.js';
    if (pkg.exports) {
        if (typeof pkg.exports === 'string') {
            entryPoint = pkg.exports;
        } else if (pkg.exports['.']) {
            const dotExport = pkg.exports['.'];
            entryPoint = typeof dotExport === 'string'
                ? dotExport
                : (dotExport.import || dotExport.default || 'index.js');
        }
    } else if (pkg.main) {
        entryPoint = pkg.main;
    }

    return join(packagePath, entryPoint);
}

/**
 * Dynamically import a provider package and instantiate
 * First checks plugins directory, then falls back to core node_modules
 */
async function importAndInstantiateProvider(packageName: string): Promise<SimpleNSProvider> {
    try {
        // First, try to import from plugins directory
        const pluginPath = join(PLUGINS_NODE_MODULES, packageName);
        if (existsSync(pluginPath)) {
            console.log(`[PluginLoader] Loading from plugins directory: ${packageName}`);
            // Resolve the actual entry file from package.json
            const entryFile = resolvePackageEntry(pluginPath);
            // Convert to file:// URL for cross-platform compatibility
            const pluginUrl = pathToFileURL(entryFile).href;
            const module = await import(pluginUrl) as Record<string, unknown>;
            return instantiateFromModule(module, packageName);
        }

        // Fall back to core node_modules (for bundled plugins or testing)
        const module = await import(packageName) as Record<string, unknown>;
        return instantiateFromModule(module, packageName);
    } catch (err) {
        // Handle local path imports
        if (packageName.startsWith('./') || packageName.startsWith('../')) {
            const module = await import(packageName) as Record<string, unknown>;
            return instantiateFromModule(module, packageName);
        }
        throw new Error(`Plugin not found: ${packageName}. Install with: npm run plugin:install ${packageName}`);
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

    // No config file or empty config - just mark as initialized with no providers
    if (!config || !config.providers || config.providers.length === 0) {
        console.warn('[PluginLoader] No providers configured - starting without plugins');
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

    console.log(`[PluginLoader] ✅ Loaded ${PluginRegistry.getProviderIds().length} providers`);
    console.log(`[PluginLoader] 📢 Channels: ${PluginRegistry.getChannels().join(', ')}`);
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
        console.warn(`[PluginLoader] Could not read config for channels: ${err}`);
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
